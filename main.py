import hashlib
import json
import os
import re
import secrets
from datetime import date, datetime, timedelta, timezone
from typing import Optional
from urllib.parse import urlencode
from urllib.error import HTTPError, URLError
from urllib.request import urlopen

from fastapi import Body, Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field
from sqlalchemy import ForeignKey, Integer, String, Text, create_engine, inspect, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import ArgumentError
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker
from dotenv import load_dotenv

load_dotenv()


DATABASE_URL_ENV_VARS = ("DATABASE_URL", "POSTGRES_URL_NON_POOLING", "POSTGRES_URL")


def clean_database_url(database_url: str) -> str:
    database_url = database_url.strip().strip("\"'")
    for env_var in DATABASE_URL_ENV_VARS:
        prefix = f"{env_var}="
        if database_url.startswith(prefix):
            return database_url[len(prefix) :].strip().strip("\"'")
    return database_url


def normalize_database_url(database_url: str, allow_sqlite: bool = False) -> str:
    database_url = clean_database_url(database_url)
    if database_url.startswith("postgres://"):
        database_url = database_url.replace("postgres://", "postgresql+psycopg://", 1)
    elif database_url.startswith("postgresql://"):
        database_url = database_url.replace("postgresql://", "postgresql+psycopg://", 1)

    try:
        parsed_url = make_url(database_url)
    except ArgumentError as exc:
        raise RuntimeError(
            "The Postgres connection string is not a valid SQLAlchemy URL. "
            "It should look like postgresql://USER:PASSWORD@HOST:PORT/DATABASE?sslmode=require."
        ) from exc

    backend_name = parsed_url.get_backend_name()
    if backend_name == "sqlite" and allow_sqlite:
        return database_url
    if backend_name != "postgresql":
        raise RuntimeError("Only Postgres database URLs are supported.")
    return database_url


def get_database_url() -> str:
    errors = []
    for env_var in DATABASE_URL_ENV_VARS:
        database_url = os.getenv(env_var)
        if not database_url:
            continue
        try:
            return normalize_database_url(
                database_url,
                allow_sqlite=os.getenv("MEAL_DECIDER_TESTING") == "1",
            )
        except RuntimeError as exc:
            errors.append(f"{env_var}: {exc}")

    if errors:
        raise RuntimeError(
            "No configured database connection string could be used. "
            f"Checked {', '.join(DATABASE_URL_ENV_VARS)}. "
            f"Errors: {'; '.join(errors)}"
        )

    raise RuntimeError(
        "A Postgres connection string is required. Set DATABASE_URL, "
        "POSTGRES_URL_NON_POOLING, or POSTGRES_URL."
    )


DATABASE_URL = get_database_url()
THEMEALDB_RANDOM_URL = "https://www.themealdb.com/api/json/v1/1/random.php"
THEMEALDB_FILTER_URL = "https://www.themealdb.com/api/json/v1/1/filter.php"
THEMEALDB_LOOKUP_URL = "https://www.themealdb.com/api/json/v1/1/lookup.php"
THEMEALDB_SEARCH_URL = "https://www.themealdb.com/api/json/v1/1/search.php"

engine_options = {"pool_pre_ping": True}
if DATABASE_URL.startswith("sqlite"):
    engine_options["connect_args"] = {"check_same_thread": False}

engine = create_engine(DATABASE_URL, **engine_options)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


class Recipe(Base):
    __tablename__ = "recipes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    owner_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(120), index=True, nullable=False)
    time_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    cuisine: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    difficulty: Mapped[str] = mapped_column(String(40), default="easy")
    tags: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ingredients: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    instructions: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    source: Mapped[str] = mapped_column(String(40), default="user")
    source_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    external_id: Mapped[Optional[str]] = mapped_column(String(80), nullable=True, index=True)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)


class AuthToken(Base):
    __tablename__ = "auth_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    token: Mapped[str] = mapped_column(String(128), unique=True, index=True, nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    expires_at: Mapped[str] = mapped_column(String(40), nullable=False)


class MealPlanEntry(Base):
    __tablename__ = "meal_plan_entries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    plan_date: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    recipe_id: Mapped[Optional[int]] = mapped_column(ForeignKey("recipes.id"), nullable=True, index=True)
    custom_message: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)


class UserCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    email: str = Field(..., min_length=3, max_length=255)
    password: str = Field(..., min_length=8, max_length=128)


class UserLogin(BaseModel):
    email: str = Field(..., min_length=3, max_length=255)
    password: str = Field(..., min_length=1, max_length=128)


class UserRead(BaseModel):
    id: int
    name: str
    email: str

    class Config:
        from_attributes = True


class AuthRead(BaseModel):
    token: str
    user: UserRead


class RecipeCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    time_minutes: int = Field(..., ge=0)
    cuisine: str = Field(..., min_length=1, max_length=80)
    difficulty: str = Field(default="easy", max_length=40)
    tags: Optional[str] = None
    ingredients: Optional[str] = None
    instructions: Optional[str] = None


class PhotoMealAnalyzeRequest(BaseModel):
    image_data_url: str = Field(..., min_length=1)


class RecipeUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    time_minutes: Optional[int] = Field(default=None, ge=0)
    cuisine: Optional[str] = Field(default=None, min_length=1, max_length=80)
    difficulty: Optional[str] = Field(default=None, max_length=40)
    tags: Optional[str] = None
    ingredients: Optional[str] = None
    instructions: Optional[str] = None


class RecipeRead(RecipeCreate):
    id: int
    owner_id: Optional[int] = None
    source: str = "user"
    source_url: Optional[str] = None
    external_id: Optional[str] = None

    class Config:
        from_attributes = True


class RecipePreview(RecipeCreate):
    owner_id: Optional[int] = None
    source: str = "themealdb"
    source_url: Optional[str] = None
    external_id: Optional[str] = None

    class Config:
        from_attributes = True


class MealPreference(BaseModel):
    max_time_minutes: int = Field(..., gt=0)
    difficulty: str = Field(default="easy", max_length=40)
    cuisine: Optional[str] = Field(default=None, max_length=80)
    tags: Optional[str] = None


class MealRecommendationRequest(MealPreference):
    count: int = Field(default=1, ge=1, le=5)


class MealRecommendation(BaseModel):
    recipe: RecipeRead
    reasons: list[str]


class MealRecommendations(BaseModel):
    options: list[MealRecommendation]


class RandomMealRequest(BaseModel):
    count: int = Field(default=1, ge=1, le=5)


class ExternalRecipeRequest(BaseModel):
    preferences: Optional[MealPreference] = None
    count: int = Field(default=2, ge=2, le=5)


class ExternalRecipeSave(BaseModel):
    external_id: str = Field(..., min_length=1, max_length=80)


class ExternalMealRecommendation(BaseModel):
    recipe: RecipePreview
    score: float
    reasons: list[str]


class ExternalMealRecommendations(BaseModel):
    options: list[ExternalMealRecommendation]


class MealPlanEntryCreate(BaseModel):
    plan_date: date
    recipe_id: Optional[int] = None
    custom_message: Optional[str] = Field(default=None, max_length=200)


class MealPlanEntryRead(BaseModel):
    id: int
    plan_date: date
    recipe: Optional[RecipeRead] = None
    custom_message: Optional[str] = None


class MealPlanGenerateRequest(BaseModel):
    start_date: date
    days: int = Field(default=14, ge=1, le=14)


class MealPlanRead(BaseModel):
    entries: list[MealPlanEntryRead]


SCORE_WEIGHTS = (0.20, 0.20, 0.30, 0.30)


def meal_score(features: list[float]) -> float:
    return sum(feature * weight for feature, weight in zip(features, SCORE_WEIGHTS))


Base.metadata.create_all(bind=engine)

app = FastAPI(title="Meal Decider API")
security = HTTPBearer()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        *[
            origin.strip()
            for origin in os.getenv("CORS_ALLOWED_ORIGINS", "").split(",")
            if origin.strip()
        ],
    ],
    allow_origin_regex=r"^http://(localhost|127\.0\.0\.1):\d+$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def ensure_schema():
    inspector = inspect(engine)
    if "recipes" in inspector.get_table_names():
        recipe_columns = {column["name"] for column in inspector.get_columns("recipes")}
        with engine.begin() as connection:
            if "owner_id" not in recipe_columns:
                connection.execute(text("ALTER TABLE recipes ADD COLUMN owner_id INTEGER"))
            if "source" not in recipe_columns:
                connection.execute(text("ALTER TABLE recipes ADD COLUMN source VARCHAR(40) DEFAULT 'user'"))
            if "source_url" not in recipe_columns:
                connection.execute(text("ALTER TABLE recipes ADD COLUMN source_url TEXT"))
            if "external_id" not in recipe_columns:
                connection.execute(text("ALTER TABLE recipes ADD COLUMN external_id VARCHAR(80)"))
            if "ingredients" not in recipe_columns:
                connection.execute(text("ALTER TABLE recipes ADD COLUMN ingredients TEXT"))
            if "instructions" not in recipe_columns:
                connection.execute(text("ALTER TABLE recipes ADD COLUMN instructions TEXT"))
            if "equipment" in recipe_columns:
                connection.execute(text("ALTER TABLE recipes DROP COLUMN equipment"))
            if "notes" in recipe_columns:
                connection.execute(text("ALTER TABLE recipes DROP COLUMN notes"))
            if "servings" in recipe_columns and engine.dialect.name == "postgresql":
                connection.execute(text("ALTER TABLE recipes ALTER COLUMN servings SET DEFAULT 0"))
                connection.execute(text("ALTER TABLE recipes ALTER COLUMN servings DROP NOT NULL"))
    MealPlanEntry.__table__.create(bind=engine, checkfirst=True)


ensure_schema()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 120000)
    return f"{salt}${digest.hex()}"


def verify_password(password: str, password_hash: str) -> bool:
    try:
        salt, expected = password_hash.split("$", 1)
    except ValueError:
        return False

    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 120000)
    return secrets.compare_digest(digest.hex(), expected)


def normalize_email(email: str) -> str:
    return email.strip().lower()


def normalize_difficulty(difficulty: Optional[str]) -> str:
    normalized = (difficulty or "easy").strip().lower()
    if normalized == "unknown":
        return "unknown"
    if normalized not in {"easy", "medium", "hard"}:
        return "medium"
    return normalized


def difficulty_level(difficulty: Optional[str]) -> int:
    return {"easy": 1, "medium": 2, "hard": 3, "unknown": 2}[normalize_difficulty(difficulty)]


def split_terms(value: Optional[str]) -> set[str]:
    if not value:
        return set()
    return {term.strip().lower() for term in value.split(",") if term.strip()}


def normalize_token(value: str) -> str:
    token = value.strip().lower()
    if len(token) > 3 and token.endswith("es"):
        return token[:-2]
    if len(token) > 3 and token.endswith("s"):
        return token[:-1]
    return token


STOP_WORDS = {
    "and",
    "are",
    "but",
    "for",
    "like",
    "meal",
    "the",
    "with",
}


def keyword_terms(*values: Optional[str]) -> set[str]:
    terms = set()
    for value in values:
        if not value:
            continue
        for term in re.findall(r"[a-zA-Z][a-zA-Z'-]*", value.lower()):
            normalized = normalize_token(term)
            if len(normalized) >= 3 and normalized not in STOP_WORDS:
                terms.add(normalized)
    return terms


FOOD_CUISINE_HINTS = {
    "burger": {"american"},
    "cheeseburger": {"american"},
    "bbq": {"american"},
    "barbecue": {"american"},
    "steak": {"american", "french"},
    "ribeye": {"american"},
    "brisket": {"american"},
    "pasta": {"italian"},
    "spaghetti": {"italian"},
    "lasagna": {"italian"},
    "ravioli": {"italian"},
    "risotto": {"italian"},
    "pizza": {"italian"},
    "taco": {"mexican"},
    "burrito": {"mexican"},
    "quesadilla": {"mexican"},
    "enchilada": {"mexican"},
    "sushi": {"japanese"},
    "ramen": {"japanese"},
    "teriyaki": {"japanese"},
    "curry": {"indian", "thai"},
    "tikka": {"indian"},
    "masala": {"indian"},
    "pad": {"thai"},
    "pho": {"vietnamese"},
    "gyro": {"greek"},
    "kebab": {"middle eastern", "turkish"},
    "hummus": {"middle eastern"},
}


def cuisine_terms(value: Optional[str]) -> set[str]:
    if not value:
        return set()
    cuisine = value.strip().lower()
    return {cuisine, *keyword_terms(cuisine)}


def infer_cuisine_preferences(preference_terms: set[str]) -> set[str]:
    inferred = set()
    for term in preference_terms:
        inferred.update(FOOD_CUISINE_HINTS.get(term, set()))
    return inferred


def recipe_keyword_terms(recipe: Recipe) -> set[str]:
    return keyword_terms(
        recipe.name,
        recipe.cuisine,
        recipe.tags,
    )


def overlap_ratio(recipe_terms: set[str], requested_terms: set[str]) -> float:
    if not requested_terms:
        return 0.0
    return len(recipe_terms & requested_terms) / len(requested_terms)


def time_within_limit(recipe: Recipe, max_time_minutes: int) -> bool:
    return recipe.time_minutes <= 0 or recipe.time_minutes <= max_time_minutes


def difficulty_within_limit(recipe: Recipe, max_difficulty: str) -> bool:
    return (
        normalize_difficulty(recipe.difficulty) == "unknown"
        or difficulty_level(recipe.difficulty) <= difficulty_level(max_difficulty)
    )


def estimate_difficulty(meal: dict) -> str:
    ingredients = [
        meal.get(f"strIngredient{index}")
        for index in range(1, 21)
        if (meal.get(f"strIngredient{index}") or "").strip()
    ]
    if len(ingredients) <= 7:
        return "easy"
    if len(ingredients) <= 13:
        return "medium"
    return "hard"


def extract_ingredients(meal: dict) -> list[str]:
    ingredients = []
    for index in range(1, 21):
        ingredient = (meal.get(f"strIngredient{index}") or "").strip()
        measure = (meal.get(f"strMeasure{index}") or "").strip()
        if ingredient:
            ingredients.append(f"{measure} {ingredient}".strip())
    return ingredients


def build_external_recipe(meal: dict, current_user: User) -> Recipe:
    ingredients = extract_ingredients(meal)
    source_url = meal.get("strSource") or meal.get("strYoutube") or "https://www.themealdb.com/"
    tags = ", ".join(
        item
        for item in [
            "external",
            meal.get("strCategory"),
            *(meal.get("strTags") or "").split(","),
        ]
        if item and item.strip()
    )
    return Recipe(
        owner_id=current_user.id,
        name=(meal.get("strMeal") or "Imported Recipe").strip()[:120],
        time_minutes=0,
        cuisine=(meal.get("strArea") or "International").strip()[:80],
        difficulty="unknown",
        tags=tags[:1000] if tags else "external",
        ingredients="\n".join(ingredients) or None,
        instructions=(meal.get("strInstructions") or "").strip() or None,
        source="themealdb",
        source_url=source_url,
        external_id=meal.get("idMeal"),
    )


def analyze_meal_photo(image_data_url: str) -> RecipeCreate:
    if not image_data_url.startswith("data:image/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Upload a valid image from your camera or photo library",
        )
    if len(image_data_url) > 3_000_000:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail="Image is too large. Try a smaller photo.",
        )

    try:
        header, image_base64 = image_data_url.split(",", 1)
        media_type = header.removeprefix("data:").split(";", 1)[0]
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Upload a valid image from your camera or photo library",
        ) from exc

    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Photo scanning is not configured. Set ANTHROPIC_API_KEY on the server.",
        )

    try:
        from anthropic import Anthropic

        client = Anthropic(api_key=api_key)
        response = client.messages.create(
            model=os.getenv("ANTHROPIC_VISION_MODEL", "claude-sonnet-4-5"),
            max_tokens=800,
            tools=[
                {
                    "name": "create_recipe_from_photo",
                    "description": "Create a practical saved recipe from a meal photo.",
                    "input_schema": {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {
                            "name": {"type": "string", "minLength": 1, "maxLength": 120},
                            "time_minutes": {"type": "integer", "minimum": 0, "maximum": 480},
                            "cuisine": {"type": "string", "minLength": 1, "maxLength": 80},
                            "difficulty": {"type": "string", "enum": ["easy", "medium", "hard"]},
                            "tags": {"type": "string", "maxLength": 1000},
                            "ingredients": {"type": "string", "maxLength": 4000},
                            "instructions": {"type": "string", "maxLength": 8000},
                        },
                        "required": [
                            "name",
                            "time_minutes",
                            "cuisine",
                            "difficulty",
                            "tags",
                            "ingredients",
                            "instructions",
                        ],
                    },
                }
            ],
            tool_choice={"type": "tool", "name": "create_recipe_from_photo"},
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": media_type,
                                "data": image_base64,
                            },
                        },
                        {
                            "type": "text",
                            "text": (
                                "Analyze this meal photo and return a practical saved recipe. "
                                "Infer the most likely dish name, cuisine, approximate prep/cook "
                                "time in minutes, difficulty, tags, ingredients, and cooking instructions. "
                                "If the photo is unclear, still make the best conservative estimate."
                            ),
                        },
                    ],
                }
            ],
        )
        payload = None
        for block in response.content:
            if getattr(block, "type", None) == "tool_use" and getattr(block, "name", None) == "create_recipe_from_photo":
                payload = block.input
                break
        if not isinstance(payload, dict):
            raise ValueError("Claude did not return recipe details")
    except Exception as exc:
        message = str(exc).strip()
        detail = "Could not scan the meal photo right now"
        if message:
            detail = f"{detail}: {message[:180]}"
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=detail,
        ) from exc

    return RecipeCreate(
        name=payload.get("name", "Scanned meal"),
        time_minutes=payload.get("time_minutes", 0),
        cuisine=payload.get("cuisine", "Unknown"),
        difficulty=normalize_difficulty(payload.get("difficulty")),
        tags=payload.get("tags") or "photo scan",
        ingredients=payload.get("ingredients") or None,
        instructions=payload.get("instructions") or None,
    )


def fetch_external_payload(url: str) -> dict:
    try:
        with urlopen(url, timeout=10) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not fetch a recipe from TheMealDB right now",
        ) from exc
    return payload


def fetch_random_external_meal() -> dict:
    payload = fetch_external_payload(THEMEALDB_RANDOM_URL)

    meals = payload.get("meals") or []
    if not meals:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The external recipe API returned no recipes",
        )
    return meals[0]


def fetch_external_meal_by_id(meal_id: str) -> Optional[dict]:
    payload = fetch_external_payload(f"{THEMEALDB_LOOKUP_URL}?{urlencode({'i': meal_id})}")
    meals = payload.get("meals") or []
    return meals[0] if meals else None


def collect_external_candidates(preferences: MealPreference, limit: int = 24) -> list[dict]:
    requested_keywords = keyword_terms(preferences.cuisine, preferences.tags)
    requested_cuisine = (preferences.cuisine or "").strip().lower()
    cuisine_preferences = cuisine_terms(requested_cuisine) | infer_cuisine_preferences(requested_keywords)
    candidates_by_id = {}

    for cuisine in sorted(cuisine_preferences):
        payload = fetch_external_payload(f"{THEMEALDB_FILTER_URL}?{urlencode({'a': cuisine.title()})}")
        for meal in payload.get("meals") or []:
            meal_id = meal.get("idMeal")
            if meal_id and meal_id not in candidates_by_id:
                details = fetch_external_meal_by_id(meal_id)
                if details:
                    candidates_by_id[meal_id] = details
            if len(candidates_by_id) >= limit:
                break
        if len(candidates_by_id) >= limit:
            break

    for keyword in sorted(requested_keywords):
        payload = fetch_external_payload(f"{THEMEALDB_SEARCH_URL}?{urlencode({'s': keyword})}")
        for meal in payload.get("meals") or []:
            meal_id = meal.get("idMeal")
            if meal_id and meal_id not in candidates_by_id:
                candidates_by_id[meal_id] = meal
            if len(candidates_by_id) >= limit:
                break
        if len(candidates_by_id) >= limit:
            break

    return list(candidates_by_id.values())


def infer_preferences_from_saved_recipes(recipes: list[Recipe]) -> MealPreference:
    if not recipes:
        return MealPreference(max_time_minutes=30, difficulty="easy", cuisine=None, tags=None)

    cuisines: dict[str, int] = {}
    keywords: dict[str, int] = {}
    for recipe in recipes:
        cuisine = (recipe.cuisine or "").strip().lower()
        if cuisine:
            cuisines[cuisine] = cuisines.get(cuisine, 0) + 1
        for term in recipe_keyword_terms(recipe):
            keywords[term] = keywords.get(term, 0) + 1

    top_cuisine = max(cuisines, key=cuisines.get) if cuisines else None
    top_keywords = sorted(keywords, key=keywords.get, reverse=True)[:6]
    known_times = [recipe.time_minutes for recipe in recipes if recipe.time_minutes > 0]
    average_time = round(sum(known_times) / len(known_times)) if known_times else 30

    return MealPreference(
        max_time_minutes=average_time,
        difficulty="medium",
        cuisine=top_cuisine,
        tags=", ".join(top_keywords) if top_keywords else None,
    )


def score_recipe_for_preferences(recipe: Recipe, preferences: MealPreference) -> float:
    requested_cuisine = (preferences.cuisine or "").strip().lower()
    requested_keywords = keyword_terms(preferences.cuisine, preferences.tags)
    inferred_cuisines = infer_cuisine_preferences(requested_keywords)
    cuisine_preferences = cuisine_terms(requested_cuisine) | inferred_cuisines
    recipe_terms = recipe_keyword_terms(recipe)
    recipe_cuisines = cuisine_terms(recipe.cuisine)

    time_fit = 1.0 if time_within_limit(recipe, preferences.max_time_minutes) else 0.0
    difficulty_fit = 1.0 if difficulty_within_limit(recipe, preferences.difficulty) else 0.0
    keyword_fit = overlap_ratio(recipe_terms, requested_keywords)
    if requested_cuisine:
        cuisine_fit = 1.0 if requested_cuisine in recipe_cuisines else 0.0
    elif cuisine_preferences:
        cuisine_fit = overlap_ratio(recipe_cuisines, cuisine_preferences)
    else:
        cuisine_fit = 0.5

    return meal_score([time_fit, difficulty_fit, cuisine_fit, keyword_fit])


def external_recommendation_reasons(recipe: Recipe, preferences: MealPreference) -> list[str]:
    requested_keywords = keyword_terms(preferences.cuisine, preferences.tags)
    requested_cuisine = (preferences.cuisine or "").strip().lower()
    recipe_terms = recipe_keyword_terms(recipe)
    recipe_cuisines = cuisine_terms(recipe.cuisine)
    inferred_cuisines = infer_cuisine_preferences(requested_keywords)
    reasons = []

    if requested_cuisine and requested_cuisine in recipe_cuisines:
        reasons.append(f"matches {preferences.cuisine.strip()} cuisine")
    elif inferred_cuisines and recipe_cuisines & inferred_cuisines:
        reasons.append(f"fits your cuisine direction: {', '.join(sorted(recipe_cuisines & inferred_cuisines))}")
    if requested_keywords and recipe_terms & requested_keywords:
        reasons.append(f"matches keywords: {', '.join(sorted(recipe_terms & requested_keywords))}")
    if 0 < recipe.time_minutes <= preferences.max_time_minutes:
        reasons.append(f"{recipe.time_minutes} minutes is within your max time")
    if normalize_difficulty(recipe.difficulty) != "unknown" and difficulty_within_limit(recipe, preferences.difficulty):
        reasons.append(f"{normalize_difficulty(recipe.difficulty)} is within your max difficulty")

    if not reasons:
        reasons.append("is the closest related external recipe TheMealDB returned")
    return reasons


def choose_external_meals(
    candidates: list[dict],
    preferences: MealPreference,
    current_user: User,
    db: Session,
) -> list[tuple[dict, float, Recipe]]:
    scored_candidates = []
    for meal in candidates:
        external_id = meal.get("idMeal")
        if not external_id:
            continue
        existing_recipe = (
            db.query(Recipe)
            .filter(Recipe.owner_id == current_user.id, Recipe.external_id == external_id)
            .first()
        )
        if existing_recipe is not None:
            continue
        recipe = build_external_recipe(meal, current_user)
        scored_candidates.append((score_recipe_for_preferences(recipe, preferences), meal, recipe))

    scored_candidates.sort(key=lambda candidate: candidate[0], reverse=True)
    return [(meal, score, recipe) for score, meal, recipe in scored_candidates]


def create_auth_token(user: User, db: Session) -> str:
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    db.add(AuthToken(token=token, user_id=user.id, expires_at=expires_at.isoformat()))
    db.commit()
    return token


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    auth_token = db.query(AuthToken).filter(AuthToken.token == credentials.credentials).first()
    if auth_token is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    expires_at = datetime.fromisoformat(auth_token.expires_at)
    if expires_at < datetime.now(timezone.utc):
        db.delete(auth_token)
        db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired")

    user = db.get(User, auth_token.user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


def meal_plan_entry_read(entry: MealPlanEntry, db: Session) -> MealPlanEntryRead:
    recipe = db.get(Recipe, entry.recipe_id) if entry.recipe_id else None
    return MealPlanEntryRead(
        id=entry.id,
        plan_date=date.fromisoformat(entry.plan_date),
        recipe=recipe,
        custom_message=entry.custom_message,
    )


def choose_schedule_recipes(recipes: list[Recipe], count: int) -> list[Recipe]:
    randomizer = secrets.SystemRandom()
    choices = []
    while len(choices) < count:
        batch = recipes.copy()
        randomizer.shuffle(batch)
        choices.extend(batch[: count - len(choices)])
    return choices


@app.get("/")
def health_check():
    return {"status": "ok", "message": "Meal Decider API is running"}


@app.post("/auth/register", response_model=AuthRead, status_code=status.HTTP_201_CREATED)
def register(user_data: UserCreate, db: Session = Depends(get_db)):
    email = normalize_email(user_data.email)
    existing_user = db.query(User).filter(User.email == email).first()
    if existing_user is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email is already registered")

    user = User(
        name=user_data.name.strip(),
        email=email,
        password_hash=hash_password(user_data.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_auth_token(user, db)
    return AuthRead(token=token, user=user)


@app.post("/auth/login", response_model=AuthRead)
def login(login_data: UserLogin, db: Session = Depends(get_db)):
    email = normalize_email(login_data.email)
    user = db.query(User).filter(User.email == email).first()
    if user is None or not verify_password(login_data.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    token = create_auth_token(user, db)
    return AuthRead(token=token, user=user)


@app.get("/auth/me", response_model=UserRead)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@app.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    auth_token = db.query(AuthToken).filter(AuthToken.token == credentials.credentials).first()
    if auth_token is not None:
        db.delete(auth_token)
        db.commit()
    return None


@app.get("/meal-plan", response_model=MealPlanRead)
def get_meal_plan(
    start_date: date,
    days: int = 14,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    days = max(1, min(days, 14))
    end_date = start_date + timedelta(days=days - 1)
    entries = (
        db.query(MealPlanEntry)
        .filter(
            MealPlanEntry.owner_id == current_user.id,
            MealPlanEntry.plan_date >= start_date.isoformat(),
            MealPlanEntry.plan_date <= end_date.isoformat(),
        )
        .order_by(MealPlanEntry.plan_date, MealPlanEntry.id)
        .all()
    )
    return MealPlanRead(entries=[meal_plan_entry_read(entry, db) for entry in entries])


@app.post("/meal-plan", response_model=MealPlanEntryRead, status_code=status.HTTP_201_CREATED)
def add_meal_plan_entry(
    entry_data: MealPlanEntryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    message = (entry_data.custom_message or "").strip() or None
    if bool(entry_data.recipe_id) == bool(message):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Choose one saved recipe or enter one custom message",
        )

    recipe = None
    if entry_data.recipe_id:
        recipe = db.get(Recipe, entry_data.recipe_id)
        if recipe is None or recipe.owner_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recipe not found")

    entry = MealPlanEntry(
        owner_id=current_user.id,
        plan_date=entry_data.plan_date.isoformat(),
        recipe_id=recipe.id if recipe else None,
        custom_message=message,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return meal_plan_entry_read(entry, db)


@app.delete("/meal-plan/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_meal_plan_entry(
    entry_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    entry = db.get(MealPlanEntry, entry_id)
    if entry is None or entry.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meal plan entry not found")
    db.delete(entry)
    db.commit()
    return None


@app.post("/meal-plan/generate-day", response_model=MealPlanEntryRead, status_code=status.HTTP_201_CREATED)
def generate_meal_for_day(
    entry_data: MealPlanEntryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    recipes = db.query(Recipe).filter(Recipe.owner_id == current_user.id).all()
    if not recipes:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Add a recipe before generating meals")
    recipe = secrets.SystemRandom().choice(recipes)
    entry = MealPlanEntry(
        owner_id=current_user.id,
        plan_date=entry_data.plan_date.isoformat(),
        recipe_id=recipe.id,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return meal_plan_entry_read(entry, db)


@app.post("/meal-plan/generate", response_model=MealPlanRead)
def generate_meal_plan(
    request: MealPlanGenerateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    recipes = db.query(Recipe).filter(Recipe.owner_id == current_user.id).all()
    if not recipes:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Add a recipe before generating meals")

    dates = [request.start_date + timedelta(days=offset) for offset in range(request.days)]
    existing_dates = {
        entry.plan_date
        for entry in db.query(MealPlanEntry)
        .filter(
            MealPlanEntry.owner_id == current_user.id,
            MealPlanEntry.plan_date >= dates[0].isoformat(),
            MealPlanEntry.plan_date <= dates[-1].isoformat(),
        )
        .all()
    }
    empty_dates = [plan_date for plan_date in dates if plan_date.isoformat() not in existing_dates]
    for plan_date, recipe in zip(empty_dates, choose_schedule_recipes(recipes, len(empty_dates))):
        db.add(
            MealPlanEntry(
                owner_id=current_user.id,
                plan_date=plan_date.isoformat(),
                recipe_id=recipe.id,
            )
        )
    db.commit()

    entries = (
        db.query(MealPlanEntry)
        .filter(
            MealPlanEntry.owner_id == current_user.id,
            MealPlanEntry.plan_date >= dates[0].isoformat(),
            MealPlanEntry.plan_date <= dates[-1].isoformat(),
        )
        .order_by(MealPlanEntry.plan_date, MealPlanEntry.id)
        .all()
    )
    return MealPlanRead(entries=[meal_plan_entry_read(entry, db) for entry in entries])


@app.get("/recipes", response_model=list[RecipeRead])
def get_recipes(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return (
        db.query(Recipe)
        .filter(Recipe.owner_id == current_user.id)
        .order_by(Recipe.name)
        .all()
    )


@app.post("/recipes/recommend", response_model=MealRecommendations)
def recommend_recipe(
    preferences: MealRecommendationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    recipes = db.query(Recipe).filter(Recipe.owner_id == current_user.id).all()
    if not recipes:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Add at least one recipe before asking for a recommendation",
        )

    requested_cuisine = (preferences.cuisine or "").strip().lower()
    requested_tags = split_terms(preferences.tags)
    requested_keywords = keyword_terms(preferences.cuisine, preferences.tags)
    inferred_cuisines = infer_cuisine_preferences(requested_keywords)
    cuisine_preferences = cuisine_terms(requested_cuisine) | inferred_cuisines

    feature_rows = []
    affinity_rows = []
    reason_rows = []
    matched_recipes = []
    for recipe in recipes:
        if not time_within_limit(recipe, preferences.max_time_minutes):
            continue
        if not difficulty_within_limit(recipe, preferences.difficulty):
            continue

        recipe_tags = split_terms(recipe.tags)
        recipe_terms = recipe_keyword_terms(recipe)
        recipe_cuisines = cuisine_terms(recipe.cuisine)

        time_fit = 1.0
        difficulty_fit = 1.0
        keyword_fit = overlap_ratio(recipe_terms, requested_keywords)

        if requested_cuisine:
            cuisine_fit = 1.0 if requested_cuisine in recipe_cuisines else 0.0
        elif cuisine_preferences:
            cuisine_fit = overlap_ratio(recipe_cuisines, cuisine_preferences)
        else:
            cuisine_fit = 0.5

        tag_fit = max(keyword_fit, len(recipe_tags & requested_tags) / len(requested_tags) if requested_tags else 0.0)

        if cuisine_preferences and cuisine_fit == 0.0 and tag_fit == 0.0:
            cuisine_fit = 0.0
            tag_fit = 0.0

        has_preference_input = bool(requested_cuisine or requested_keywords or cuisine_preferences)
        affinity_rows.append(not has_preference_input or cuisine_fit > 0.0 or tag_fit > 0.0)
        feature_rows.append([time_fit, difficulty_fit, cuisine_fit, tag_fit])
        matched_recipes.append(recipe)

        reasons = []
        if requested_cuisine and cuisine_fit == 1.0:
            reasons.append(f"matches {preferences.cuisine.strip()} cuisine")
        elif inferred_cuisines and cuisine_fit > 0:
            matched_cuisines = sorted(recipe_cuisines & inferred_cuisines)
            reasons.append(f"fits your cuisine direction: {', '.join(matched_cuisines)}")
        if requested_keywords and keyword_fit > 0:
            matched_keywords = sorted(recipe_terms & requested_keywords)
            reasons.append(f"matches keywords: {', '.join(matched_keywords)}")
        if recipe.time_minutes > 0:
            reasons.append(f"{recipe.time_minutes} minutes is within your max time")
        if normalize_difficulty(recipe.difficulty) != "unknown":
            reasons.append(f"{normalize_difficulty(recipe.difficulty)} is within your max difficulty")
        if not reasons:
            reasons.append("fits your max time and difficulty")
        reason_rows.append(reasons)

    if not feature_rows:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No saved recipes fit your max time and difficulty",
        )

    scores = [meal_score(row) for row in feature_rows]
    candidate_indexes = [
        index
        for index, has_affinity in enumerate(affinity_rows)
        if has_affinity or not any(affinity_rows)
    ]
    selected_indexes = []
    randomizer = secrets.SystemRandom()
    while candidate_indexes and len(selected_indexes) < preferences.count:
        weights = [max(scores[index], 0.0) + 0.05 for index in candidate_indexes]
        total_weight = sum(weights)
        pick = randomizer.uniform(0, total_weight)
        running_weight = 0.0
        selected_position = 0
        for position, weight in enumerate(weights):
            running_weight += weight
            if pick <= running_weight:
                selected_position = position
                break
        selected_indexes.append(candidate_indexes.pop(selected_position))

    options = [
        MealRecommendation(recipe=matched_recipes[index], reasons=reason_rows[index])
        for index in selected_indexes
    ]
    return MealRecommendations(options=options)


@app.post("/recipes/random", response_model=MealRecommendations)
def random_recipes(
    request: Optional[RandomMealRequest] = Body(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    request = request or RandomMealRequest()
    recipes = db.query(Recipe).filter(Recipe.owner_id == current_user.id).all()
    if not recipes:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Add at least one recipe before asking for a random pick",
        )

    count = min(request.count, len(recipes))
    selected_recipes = secrets.SystemRandom().sample(recipes, count)
    return MealRecommendations(
        options=[
            MealRecommendation(recipe=recipe, reasons=["was picked completely at random"])
            for recipe in selected_recipes
        ]
    )


@app.post("/recipes/external/random", response_model=ExternalMealRecommendations)
def create_external_recipe(
    request: Optional[ExternalRecipeRequest] = Body(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    request = request or ExternalRecipeRequest()
    saved_recipes = db.query(Recipe).filter(Recipe.owner_id == current_user.id).all()
    effective_preferences = request.preferences or infer_preferences_from_saved_recipes(saved_recipes)

    candidates = collect_external_candidates(effective_preferences)
    choices = choose_external_meals(candidates, effective_preferences, current_user, db)

    if len(choices) < request.count:
        random_candidates = [fetch_random_external_meal() for _ in range(10)]
        seen_ids = {choice[0].get("idMeal") for choice in choices}
        random_choices = [
            choice
            for choice in choose_external_meals(random_candidates, effective_preferences, current_user, db)
            if choice[0].get("idMeal") not in seen_ids
        ]
        choices.extend(random_choices)

    options = [
        ExternalMealRecommendation(
            recipe=recipe,
            score=round(score, 3),
            reasons=external_recommendation_reasons(recipe, effective_preferences),
        )
        for _, score, recipe in choices[: request.count]
    ]

    if options:
        return ExternalMealRecommendations(options=options)

    raise HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail="The external API did not return new matching recipes. Try a different cuisine or keyword.",
    )


@app.post("/recipes/external/save", response_model=RecipeRead, status_code=status.HTTP_201_CREATED)
def save_external_recipe(
    save_data: ExternalRecipeSave,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    existing_recipe = (
        db.query(Recipe)
        .filter(Recipe.owner_id == current_user.id, Recipe.external_id == save_data.external_id)
        .first()
    )
    if existing_recipe is not None:
        return existing_recipe

    meal = fetch_external_meal_by_id(save_data.external_id)
    if meal is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="The external recipe could not be found anymore",
        )

    recipe = build_external_recipe(meal, current_user)
    db.add(recipe)
    db.commit()
    db.refresh(recipe)
    return recipe


@app.get("/recipes/{recipe_id}", response_model=RecipeRead)
def get_recipe(
    recipe_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    recipe = db.get(Recipe, recipe_id)
    if recipe is None or recipe.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Recipe not found",
        )
    return recipe


@app.post("/recipes", response_model=RecipeRead, status_code=status.HTTP_201_CREATED)
def create_recipe(
    recipe_data: RecipeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    recipe = Recipe(**recipe_data.model_dump(), owner_id=current_user.id)
    db.add(recipe)
    db.commit()
    db.refresh(recipe)
    return recipe


@app.post("/recipes/photo/analyze", response_model=RecipeCreate)
def analyze_recipe_photo(
    photo_data: PhotoMealAnalyzeRequest,
    current_user: User = Depends(get_current_user),
):
    return analyze_meal_photo(photo_data.image_data_url)


@app.put("/recipes/{recipe_id}", response_model=RecipeRead)
def update_recipe(
    recipe_id: int,
    recipe_data: RecipeUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    recipe = db.get(Recipe, recipe_id)
    if recipe is None or recipe.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Recipe not found",
        )

    for field, value in recipe_data.model_dump(exclude_unset=True).items():
        setattr(recipe, field, value)

    db.commit()
    db.refresh(recipe)
    return recipe


@app.delete("/recipes/{recipe_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_recipe(
    recipe_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    recipe = db.get(Recipe, recipe_id)
    if recipe is None or recipe.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Recipe not found",
        )

    db.query(MealPlanEntry).filter(
        MealPlanEntry.owner_id == current_user.id,
        MealPlanEntry.recipe_id == recipe.id,
    ).delete()
    db.delete(recipe)
    db.commit()
    return None

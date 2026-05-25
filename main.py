import hashlib
import json
import os
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional
from urllib.parse import urlencode
from urllib.error import HTTPError, URLError
from urllib.request import urlopen

from fastapi import Body, Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field
from sqlalchemy import ForeignKey, Integer, String, Text, create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker


def get_database_url() -> str:
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        if os.getenv("VERCEL"):
            raise RuntimeError("DATABASE_URL must be set to a Postgres connection string on Vercel.")
        database_url = "sqlite:///./meal_decider.db"
    if database_url.startswith("postgres://"):
        return database_url.replace("postgres://", "postgresql+psycopg://", 1)
    if database_url.startswith("postgresql://"):
        return database_url.replace("postgresql://", "postgresql+psycopg://", 1)
    return database_url


DATABASE_URL = get_database_url()
THEMEALDB_RANDOM_URL = "https://www.themealdb.com/api/json/v1/1/random.php"
THEMEALDB_FILTER_URL = "https://www.themealdb.com/api/json/v1/1/filter.php"
THEMEALDB_LOOKUP_URL = "https://www.themealdb.com/api/json/v1/1/lookup.php"
THEMEALDB_SEARCH_URL = "https://www.themealdb.com/api/json/v1/1/search.php"

engine_options = {}
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
    servings: Mapped[int] = mapped_column(Integer, default=1)
    equipment: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    tags: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
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
    servings: int = Field(default=1, ge=0)
    equipment: Optional[str] = None
    tags: Optional[str] = None
    notes: Optional[str] = None


class RecipeUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    time_minutes: Optional[int] = Field(default=None, ge=0)
    cuisine: Optional[str] = Field(default=None, min_length=1, max_length=80)
    difficulty: Optional[str] = Field(default=None, max_length=40)
    servings: Optional[int] = Field(default=None, ge=0)
    equipment: Optional[str] = None
    tags: Optional[str] = None
    notes: Optional[str] = None


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
    servings: int = Field(..., gt=0)
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


SCORE_WEIGHTS = (0.18, 0.12, 0.12, 0.30, 0.28)


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
        recipe.equipment,
        recipe.notes,
    )


def overlap_ratio(recipe_terms: set[str], requested_terms: set[str]) -> float:
    if not requested_terms:
        return 0.0
    return len(recipe_terms & requested_terms) / len(requested_terms)


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
    notes = "Imported from TheMealDB."
    if ingredients:
        notes = f"{notes} Ingredients: {', '.join(ingredients)}."
    if source_url:
        notes = f"{notes} Full recipe: {source_url}"

    return Recipe(
        owner_id=current_user.id,
        name=(meal.get("strMeal") or "Imported Recipe").strip()[:120],
        time_minutes=0,
        cuisine=(meal.get("strArea") or "International").strip()[:80],
        difficulty="unknown",
        servings=0,
        equipment=None,
        tags=tags[:1000] if tags else "external",
        notes=notes,
        source="themealdb",
        source_url=source_url,
        external_id=meal.get("idMeal"),
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
        return MealPreference(max_time_minutes=30, servings=2, difficulty="easy", cuisine=None, tags=None)

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
    known_servings = [recipe.servings for recipe in recipes if recipe.servings > 0]
    average_time = round(sum(known_times) / len(known_times)) if known_times else 30
    average_servings = max(1, round(sum(known_servings) / len(known_servings))) if known_servings else 2

    return MealPreference(
        max_time_minutes=average_time,
        servings=average_servings,
        difficulty="medium",
        cuisine=top_cuisine,
        tags=", ".join(top_keywords) if top_keywords else None,
    )


def score_recipe_for_preferences(recipe: Recipe, preferences: MealPreference) -> float:
    preferred_difficulty = difficulty_level(preferences.difficulty)
    requested_cuisine = (preferences.cuisine or "").strip().lower()
    requested_keywords = keyword_terms(preferences.cuisine, preferences.tags)
    inferred_cuisines = infer_cuisine_preferences(requested_keywords)
    cuisine_preferences = cuisine_terms(requested_cuisine) | inferred_cuisines
    recipe_terms = recipe_keyword_terms(recipe)
    recipe_cuisines = cuisine_terms(recipe.cuisine)

    time_fit = (
        max(0.0, 1.0 - abs(recipe.time_minutes - preferences.max_time_minutes) / preferences.max_time_minutes)
        if recipe.time_minutes > 0
        else 0.5
    )
    serving_fit = (
        max(0.0, 1.0 - abs(recipe.servings - preferences.servings) / preferences.servings)
        if recipe.servings > 0
        else 0.5
    )
    difficulty_fit = 1.0 - (abs(difficulty_level(recipe.difficulty) - preferred_difficulty) / 2.0)
    keyword_fit = overlap_ratio(recipe_terms, requested_keywords)
    if requested_cuisine:
        cuisine_fit = 1.0 if requested_cuisine in recipe_cuisines else 0.0
    elif cuisine_preferences:
        cuisine_fit = overlap_ratio(recipe_cuisines, cuisine_preferences)
    else:
        cuisine_fit = 0.5

    return meal_score([time_fit, serving_fit, difficulty_fit, cuisine_fit, keyword_fit])


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
        reasons.append(f"{recipe.time_minutes} minutes fits your time target")
    if recipe.servings > 0 and recipe.servings == preferences.servings:
        reasons.append(f"serves {recipe.servings}")
    if normalize_difficulty(recipe.difficulty) != "unknown" and normalize_difficulty(recipe.difficulty) == normalize_difficulty(preferences.difficulty):
        reasons.append(f"matches {normalize_difficulty(preferences.difficulty)} difficulty")

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

    preferred_difficulty = difficulty_level(preferences.difficulty)
    requested_cuisine = (preferences.cuisine or "").strip().lower()
    requested_tags = split_terms(preferences.tags)
    requested_keywords = keyword_terms(preferences.cuisine, preferences.tags)
    inferred_cuisines = infer_cuisine_preferences(requested_keywords)
    cuisine_preferences = cuisine_terms(requested_cuisine) | inferred_cuisines

    feature_rows = []
    affinity_rows = []
    reason_rows = []
    for recipe in recipes:
        recipe_difficulty = difficulty_level(recipe.difficulty)
        recipe_tags = split_terms(recipe.tags)
        recipe_terms = recipe_keyword_terms(recipe)
        recipe_cuisines = cuisine_terms(recipe.cuisine)

        time_fit = (
            max(0.0, 1.0 - abs(recipe.time_minutes - preferences.max_time_minutes) / preferences.max_time_minutes)
            if recipe.time_minutes > 0
            else 0.5
        )
        serving_fit = (
            max(0.0, 1.0 - abs(recipe.servings - preferences.servings) / preferences.servings)
            if recipe.servings > 0
            else 0.5
        )
        difficulty_fit = 1.0 - (abs(recipe_difficulty - preferred_difficulty) / 2.0)
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
        feature_rows.append([time_fit, serving_fit, difficulty_fit, cuisine_fit, tag_fit])

        reasons = []
        if requested_cuisine and cuisine_fit == 1.0:
            reasons.append(f"matches {preferences.cuisine.strip()} cuisine")
        elif inferred_cuisines and cuisine_fit > 0:
            matched_cuisines = sorted(recipe_cuisines & inferred_cuisines)
            reasons.append(f"fits your cuisine direction: {', '.join(matched_cuisines)}")
        if requested_keywords and keyword_fit > 0:
            matched_keywords = sorted(recipe_terms & requested_keywords)
            reasons.append(f"matches keywords: {', '.join(matched_keywords)}")
        if recipe.time_minutes > 0 and time_fit >= 0.75:
            reasons.append(f"{recipe.time_minutes} minutes fits the {preferences.max_time_minutes}-minute target")
        if recipe.servings > 0 and serving_fit >= 0.75:
            reasons.append(f"serves {recipe.servings}, close to your target of {preferences.servings}")
        if normalize_difficulty(recipe.difficulty) != "unknown" and difficulty_fit == 1.0:
            reasons.append(f"matches {normalize_difficulty(preferences.difficulty)} difficulty")
        if not reasons:
            reasons.append("is the closest match in your saved recipes")
        reason_rows.append(reasons)

    scores = [meal_score(row) for row in feature_rows]
    if any(affinity_rows):
        scores = [score if has_affinity else -1.0 for score, has_affinity in zip(scores, affinity_rows)]
    ranked_indexes = sorted(range(len(scores)), key=lambda index: scores[index], reverse=True)

    options = [
        MealRecommendation(recipe=recipes[index], reasons=reason_rows[index])
        for index in ranked_indexes[: preferences.count]
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

    db.delete(recipe)
    db.commit()
    return None

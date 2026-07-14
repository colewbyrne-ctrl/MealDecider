"""Unit tests for the pure scoring/recommendation helpers in main.py.

These functions drive `/recipes/recommend` and the external-recipe scoring. They
take plain values (and detached ORM instances) and need no database, so they are
exercised directly here rather than through the HTTP layer.
"""

import pytest


def recipe(app_module, **overrides):
    """Build a detached Recipe instance for scoring (never added to a session)."""
    fields = {
        "name": "Test Dish",
        "cuisine": "Italian",
        "time_minutes": 30,
        "difficulty": "easy",
        "tags": None,
    }
    fields.update(overrides)
    return app_module.Recipe(**fields)


# --- meal_score ------------------------------------------------------------

def test_meal_score_applies_weights_in_time_difficulty_cuisine_keyword_order(app_module):
    # SCORE_WEIGHTS = (0.20, 0.20, 0.30, 0.30)
    assert app_module.meal_score([1, 1, 1, 1]) == pytest.approx(1.0)
    assert app_module.meal_score([0, 0, 0, 0]) == pytest.approx(0.0)
    assert app_module.meal_score([1, 0, 0, 0]) == pytest.approx(0.20)
    assert app_module.meal_score([0, 0, 1, 0]) == pytest.approx(0.30)
    # Cuisine + keyword together outweigh time + difficulty together.
    assert app_module.meal_score([0, 0, 1, 1]) > app_module.meal_score([1, 1, 0, 0])


# --- difficulty handling ---------------------------------------------------

def test_normalize_difficulty_maps_and_defaults(app_module):
    assert app_module.normalize_difficulty("EASY") == "easy"
    assert app_module.normalize_difficulty("  Hard ") == "hard"
    assert app_module.normalize_difficulty(None) == "easy"
    assert app_module.normalize_difficulty("unknown") == "unknown"
    # Anything unrecognized collapses to medium.
    assert app_module.normalize_difficulty("nightmare") == "medium"


def test_difficulty_level_is_ordered(app_module):
    assert (
        app_module.difficulty_level("easy")
        < app_module.difficulty_level("medium")
        < app_module.difficulty_level("hard")
    )
    assert app_module.difficulty_level("unknown") == app_module.difficulty_level("medium")


def test_difficulty_within_limit(app_module):
    hard = recipe(app_module, difficulty="hard")
    easy = recipe(app_module, difficulty="easy")
    unknown = recipe(app_module, difficulty="unknown")
    assert not app_module.difficulty_within_limit(hard, "easy")
    assert app_module.difficulty_within_limit(easy, "hard")
    # Unknown difficulty is always allowed through the filter.
    assert app_module.difficulty_within_limit(unknown, "easy")


# --- time handling ---------------------------------------------------------

def test_time_within_limit_treats_zero_as_unknown(app_module):
    assert app_module.time_within_limit(recipe(app_module, time_minutes=30), 30)
    assert not app_module.time_within_limit(recipe(app_module, time_minutes=40), 30)
    # 0 minutes means "unknown" and is never filtered out on time.
    assert app_module.time_within_limit(recipe(app_module, time_minutes=0), 5)


# --- keyword extraction ----------------------------------------------------

def test_keyword_terms_strips_stopwords_short_words_and_stems_plurals(app_module):
    terms = app_module.keyword_terms("Spicy Beef Tacos with the Salsa")
    assert "taco" in terms          # "tacos" -> "taco"
    assert "spicy" in terms
    assert "salsa" in terms
    assert "with" not in terms      # stop word
    assert "the" not in terms       # stop word


def test_normalize_token_singularizes(app_module):
    assert app_module.normalize_token("tacos") == "taco"
    assert app_module.normalize_token("dishes") == "dish"
    assert app_module.normalize_token("rice") == "rice"


def test_overlap_ratio(app_module):
    assert app_module.overlap_ratio({"a", "b"}, {"a", "b"}) == pytest.approx(1.0)
    assert app_module.overlap_ratio({"a"}, {"a", "b"}) == pytest.approx(0.5)
    assert app_module.overlap_ratio({"x"}, {"a", "b"}) == pytest.approx(0.0)
    # Empty request set is defined as no overlap (avoids div-by-zero).
    assert app_module.overlap_ratio({"a"}, set()) == pytest.approx(0.0)


# --- cuisine inference -----------------------------------------------------

def test_infer_cuisine_preferences_from_food_hints(app_module):
    assert app_module.infer_cuisine_preferences({"taco"}) == {"mexican"}
    assert app_module.infer_cuisine_preferences({"pasta"}) == {"italian"}
    # Ambiguous dishes fan out to multiple cuisines.
    assert app_module.infer_cuisine_preferences({"curry"}) == {"indian", "thai"}
    assert app_module.infer_cuisine_preferences({"nonsense"}) == set()


# --- external meal helpers -------------------------------------------------

def test_estimate_difficulty_buckets_by_ingredient_count(app_module):
    def meal_with(n):
        return {f"strIngredient{i}": f"ing{i}" for i in range(1, n + 1)}

    assert app_module.estimate_difficulty(meal_with(5)) == "easy"
    assert app_module.estimate_difficulty(meal_with(10)) == "medium"
    assert app_module.estimate_difficulty(meal_with(16)) == "hard"


def test_extract_ingredients_joins_measure_and_name(app_module):
    meal = {
        "strIngredient1": "Chicken",
        "strMeasure1": "200g",
        "strIngredient2": "Rice",
        "strMeasure2": "",
        "strIngredient3": "  ",
        "strMeasure3": "1 cup",
    }
    assert app_module.extract_ingredients(meal) == ["200g Chicken", "Rice"]


# --- the core scoring function --------------------------------------------

def test_score_recipe_for_preferences_perfect_match_scores_one(app_module):
    pref = app_module.MealPreference(
        max_time_minutes=45, difficulty="medium", cuisine="Italian", tags="pasta"
    )
    match = recipe(
        app_module,
        name="Spaghetti Bolognese",
        cuisine="Italian",
        time_minutes=30,
        difficulty="easy",
        tags="pasta, dinner",
    )
    assert app_module.score_recipe_for_preferences(match, pref) == pytest.approx(1.0)


def test_score_recipe_for_preferences_ranks_matching_above_unrelated(app_module):
    pref = app_module.MealPreference(
        max_time_minutes=45, difficulty="medium", cuisine="Italian", tags="pasta"
    )
    match = recipe(app_module, name="Pasta Primavera", cuisine="Italian", tags="pasta")
    other = recipe(app_module, name="Beef Tacos", cuisine="Mexican", tags="quick")
    assert app_module.score_recipe_for_preferences(match, pref) > (
        app_module.score_recipe_for_preferences(other, pref)
    )


# --- preference inference from a saved collection --------------------------

def test_infer_preferences_picks_dominant_cuisine_and_average_time(app_module):
    recipes = [
        recipe(app_module, cuisine="Italian", time_minutes=30),
        recipe(app_module, cuisine="Italian", time_minutes=50),
        recipe(app_module, cuisine="Mexican", time_minutes=20),
    ]
    pref = app_module.infer_preferences_from_saved_recipes(recipes)
    assert pref.cuisine == "italian"
    assert pref.max_time_minutes == 33  # round((30 + 50 + 20) / 3)


def test_infer_preferences_falls_back_to_defaults_when_empty(app_module):
    pref = app_module.infer_preferences_from_saved_recipes([])
    assert pref.cuisine is None
    assert pref.max_time_minutes == 30
    assert pref.difficulty == "easy"

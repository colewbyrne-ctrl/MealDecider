from fastapi.testclient import TestClient


def test_register_login_me_and_logout_flow(app_module):
    client = TestClient(app_module.app)

    register_response = client.post(
        "/auth/register",
        json={"name": "Cole", "email": "Cole@Example.com", "password": "correct horse"},
    )
    assert register_response.status_code == 201
    register_body = register_response.json()
    assert register_body["token"]
    assert register_body["user"]["email"] == "cole@example.com"

    duplicate_response = client.post(
        "/auth/register",
        json={"name": "Cole", "email": "cole@example.com", "password": "correct horse"},
    )
    assert duplicate_response.status_code == 409

    bad_login_response = client.post(
        "/auth/login",
        json={"email": "cole@example.com", "password": "wrong password"},
    )
    assert bad_login_response.status_code == 401

    login_response = client.post(
        "/auth/login",
        json={"email": "COLE@example.com", "password": "correct horse"},
    )
    assert login_response.status_code == 200
    login_body = login_response.json()
    token = login_body["token"]
    assert token
    assert login_body["user"]["name"] == "Cole"

    me_response = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_response.status_code == 200
    assert me_response.json()["email"] == "cole@example.com"

    logout_response = client.post("/auth/logout", headers={"Authorization": f"Bearer {token}"})
    assert logout_response.status_code == 204

    logged_out_response = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert logged_out_response.status_code == 401


def test_recommendations_use_time_and_difficulty_as_maximums(app_module):
    client = TestClient(app_module.app)

    register_response = client.post(
        "/auth/register",
        json={"name": "Cole", "email": "threshold@example.com", "password": "correct horse"},
    )
    token = register_response.json()["token"]
    headers = {"Authorization": f"Bearer {token}"}

    recipes = [
        {"name": "Quick Pasta", "time_minutes": 20, "cuisine": "Italian", "difficulty": "easy"},
        {"name": "Slow Roast", "time_minutes": 90, "cuisine": "American", "difficulty": "easy"},
        {"name": "Fast Project", "time_minutes": 25, "cuisine": "French", "difficulty": "hard"},
    ]
    for recipe in recipes:
        response = client.post("/recipes", json=recipe, headers=headers)
        assert response.status_code == 201

    response = client.post(
        "/recipes/recommend",
        json={"max_time_minutes": 30, "difficulty": "medium", "count": 5},
        headers=headers,
    )

    assert response.status_code == 200
    names = [option["recipe"]["name"] for option in response.json()["options"]]
    assert names == ["Quick Pasta"]


def test_created_recipe_is_returned_for_user_profile(app_module):
    client = TestClient(app_module.app)

    register_response = client.post(
        "/auth/register",
        json={"name": "Cole", "email": "profile-recipes@example.com", "password": "correct horse"},
    )
    token = register_response.json()["token"]
    headers = {"Authorization": f"Bearer {token}"}

    create_response = client.post(
        "/recipes",
        json={"name": "Profile Pasta", "time_minutes": 20, "cuisine": "Italian", "difficulty": "easy"},
        headers=headers,
    )
    assert create_response.status_code == 201
    created_recipe = create_response.json()
    assert created_recipe["owner_id"] == register_response.json()["user"]["id"]

    list_response = client.get("/recipes", headers=headers)
    assert list_response.status_code == 200
    assert [recipe["name"] for recipe in list_response.json()] == ["Profile Pasta"]


def test_recipe_stores_ingredients_and_instructions_without_legacy_fields(app_module):
    client = TestClient(app_module.app)
    register_response = client.post(
        "/auth/register",
        json={"name": "Cole", "email": "recipe-content@example.com", "password": "correct horse"},
    )
    headers = {"Authorization": f"Bearer {register_response.json()['token']}"}

    response = client.post(
        "/recipes",
        json={
            "name": "Tomato Pasta",
            "time_minutes": 20,
            "cuisine": "Italian",
            "difficulty": "easy",
            "ingredients": "pasta\ntomatoes",
            "instructions": "Boil pasta.\nAdd tomatoes.",
            "equipment": "legacy pot",
            "notes": "legacy note",
        },
        headers=headers,
    )

    assert response.status_code == 201
    recipe = response.json()
    assert recipe["ingredients"] == "pasta\ntomatoes"
    assert recipe["instructions"] == "Boil pasta.\nAdd tomatoes."
    assert "equipment" not in recipe
    assert "notes" not in recipe


def test_ingredients_and_instructions_are_not_recommendation_keywords(app_module):
    recipe = app_module.Recipe(
        name="Weeknight Bowl",
        time_minutes=20,
        cuisine="Any",
        difficulty="easy",
        tags="quick",
        ingredients="dragonfruit",
        instructions="Serve with saffron.",
    )

    terms = app_module.recipe_keyword_terms(recipe)

    assert "weeknight" in terms
    assert "quick" in terms
    assert "dragonfruit" not in terms
    assert "saffron" not in terms


def test_create_recipe_handles_legacy_servings_column(app_module):
    client = TestClient(app_module.app)

    with app_module.engine.begin() as connection:
        connection.execute(app_module.text("ALTER TABLE recipes ADD COLUMN servings INTEGER NOT NULL DEFAULT 1"))

    register_response = client.post(
        "/auth/register",
        json={"name": "Cole", "email": "legacy-servings@example.com", "password": "correct horse"},
    )
    token = register_response.json()["token"]

    response = client.post(
        "/recipes",
        json={"name": "Legacy Pasta", "time_minutes": 20, "cuisine": "Italian", "difficulty": "easy"},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 201


def test_recommendations_return_requested_unique_recipe_count(app_module):
    client = TestClient(app_module.app)

    register_response = client.post(
        "/auth/register",
        json={"name": "Cole", "email": "unique@example.com", "password": "correct horse"},
    )
    token = register_response.json()["token"]
    headers = {"Authorization": f"Bearer {token}"}

    for name in ["Tacos", "Pasta", "Soup"]:
        response = client.post(
            "/recipes",
            json={"name": name, "time_minutes": 20, "cuisine": "Any", "difficulty": "easy"},
            headers=headers,
        )
        assert response.status_code == 201

    response = client.post(
        "/recipes/recommend",
        json={"max_time_minutes": 30, "difficulty": "easy", "count": 3},
        headers=headers,
    )

    assert response.status_code == 200
    names = [option["recipe"]["name"] for option in response.json()["options"]]
    assert len(names) == 3
    assert len(set(names)) == 3


def test_meal_plan_supports_multiple_recipes_and_custom_messages_per_day(app_module):
    client = TestClient(app_module.app)
    register_response = client.post(
        "/auth/register",
        json={"name": "Cole", "email": "calendar@example.com", "password": "correct horse"},
    )
    headers = {"Authorization": f"Bearer {register_response.json()['token']}"}
    recipe_response = client.post(
        "/recipes",
        json={"name": "Tacos", "time_minutes": 20, "cuisine": "Mexican", "difficulty": "easy"},
        headers=headers,
    )
    recipe_id = recipe_response.json()["id"]

    recipe_entry = client.post(
        "/meal-plan",
        json={"plan_date": "2026-06-08", "recipe_id": recipe_id},
        headers=headers,
    )
    message_entry = client.post(
        "/meal-plan",
        json={"plan_date": "2026-06-08", "custom_message": "Leftovers"},
        headers=headers,
    )
    plan = client.get("/meal-plan?start_date=2026-06-08&days=14", headers=headers)

    assert recipe_entry.status_code == 201
    assert message_entry.status_code == 201
    assert plan.status_code == 200
    entries = plan.json()["entries"]
    assert entries[0]["recipe"]["name"] == "Tacos"
    assert entries[1]["custom_message"] == "Leftovers"


def test_full_meal_plan_generation_only_fills_empty_days(app_module):
    client = TestClient(app_module.app)
    register_response = client.post(
        "/auth/register",
        json={"name": "Cole", "email": "generated-calendar@example.com", "password": "correct horse"},
    )
    headers = {"Authorization": f"Bearer {register_response.json()['token']}"}
    for name in ["Tacos", "Pasta"]:
        client.post(
            "/recipes",
            json={"name": name, "time_minutes": 20, "cuisine": "Any", "difficulty": "easy"},
            headers=headers,
        )
    client.post(
        "/meal-plan",
        json={"plan_date": "2026-06-08", "custom_message": "Leftovers"},
        headers=headers,
    )

    response = client.post(
        "/meal-plan/generate",
        json={"start_date": "2026-06-08", "days": 14},
        headers=headers,
    )

    assert response.status_code == 200
    entries = response.json()["entries"]
    assert len(entries) == 14
    first_day_entries = [entry for entry in entries if entry["plan_date"] == "2026-06-08"]
    assert first_day_entries == [
        {
            "id": first_day_entries[0]["id"],
            "plan_date": "2026-06-08",
            "recipe": None,
            "custom_message": "Leftovers",
        }
    ]


def test_photo_analysis_reports_missing_configuration(app_module, monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    client = TestClient(app_module.app)

    register_response = client.post(
        "/auth/register",
        json={"name": "Cole", "email": "photo@example.com", "password": "correct horse"},
    )
    token = register_response.json()["token"]

    response = client.post(
        "/recipes/photo/analyze",
        json={"image_data_url": "data:image/png;base64,abc123"},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 503
    assert "ANTHROPIC_API_KEY" in response.json()["detail"]


def test_photo_analysis_rejects_large_images(app_module, monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
    client = TestClient(app_module.app)

    register_response = client.post(
        "/auth/register",
        json={"name": "Cole", "email": "large-photo@example.com", "password": "correct horse"},
    )
    token = register_response.json()["token"]

    response = client.post(
        "/recipes/photo/analyze",
        json={"image_data_url": f"data:image/jpeg;base64,{'a' * 3_000_001}"},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 413

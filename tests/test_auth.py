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

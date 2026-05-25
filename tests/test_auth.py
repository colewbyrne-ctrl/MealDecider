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

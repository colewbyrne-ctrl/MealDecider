// Central API client: base URL resolution, a fetch wrapper with consistent error
// handling, and named endpoint helpers. Every network call in the app goes
// through here so auth headers and error parsing stay in one place.

export const API_URL =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD ? "/api" : "http://127.0.0.1:8000");

export async function request(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, options);
  if (!response.ok) {
    let detail = "Request failed";
    try {
      const body = await response.json();
      if (Array.isArray(body.detail)) {
        detail = body.detail
          .map((item) => item.msg || item.message || "Invalid field")
          .join(", ");
      } else {
        detail = body.detail || detail;
      }
    } catch {
      detail = response.statusText;
    }
    throw new Error(detail);
  }
  if (response.status === 204) {
    return null;
  }
  return response.json();
}

function jsonHeaders(token) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

// --- Auth ------------------------------------------------------------------

export function login(payload) {
  return request("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function register(payload) {
  return request("/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function logout(token) {
  return request("/auth/logout", { method: "POST", headers: jsonHeaders(token) });
}

// --- Recipes ---------------------------------------------------------------

export function getRecipes(token) {
  return request("/recipes", { headers: jsonHeaders(token) });
}

export function saveRecipe(token, payload, editingId) {
  return request(editingId ? `/recipes/${editingId}` : "/recipes", {
    method: editingId ? "PUT" : "POST",
    headers: jsonHeaders(token),
    body: JSON.stringify(payload),
  });
}

export function deleteRecipe(token, recipeId) {
  return request(`/recipes/${recipeId}`, { method: "DELETE", headers: jsonHeaders(token) });
}

export function recommendRecipes(token, payload) {
  return request("/recipes/recommend", {
    method: "POST",
    headers: jsonHeaders(token),
    body: JSON.stringify(payload),
  });
}

export function randomRecipes(token, count) {
  return request("/recipes/random", {
    method: "POST",
    headers: jsonHeaders(token),
    body: JSON.stringify({ count }),
  });
}

export function analyzeRecipePhoto(token, imageDataUrl) {
  return request("/recipes/photo/analyze", {
    method: "POST",
    headers: jsonHeaders(token),
    body: JSON.stringify({ image_data_url: imageDataUrl }),
  });
}

export function generateExternalRecipe(token, preferences, count) {
  return request("/recipes/external/random", {
    method: "POST",
    headers: jsonHeaders(token),
    body: JSON.stringify({ preferences, count }),
  });
}

export function saveExternalRecipe(token, externalId) {
  return request("/recipes/external/save", {
    method: "POST",
    headers: jsonHeaders(token),
    body: JSON.stringify({ external_id: externalId }),
  });
}

// --- Meal plan -------------------------------------------------------------

export function getMealPlan(token, startDate, days = 14) {
  return request(`/meal-plan?start_date=${startDate}&days=${days}`, {
    headers: jsonHeaders(token),
  });
}

export function addMealPlanEntry(token, payload) {
  return request("/meal-plan", {
    method: "POST",
    headers: jsonHeaders(token),
    body: JSON.stringify(payload),
  });
}

export function deleteMealPlanEntry(token, entryId) {
  return request(`/meal-plan/${entryId}`, { method: "DELETE", headers: jsonHeaders(token) });
}

export function generateMealForDay(token, planDate) {
  return request("/meal-plan/generate-day", {
    method: "POST",
    headers: jsonHeaders(token),
    body: JSON.stringify({ plan_date: planDate }),
  });
}

export function generateMealPlan(token, startDate, days = 14) {
  return request("/meal-plan/generate", {
    method: "POST",
    headers: jsonHeaders(token),
    body: JSON.stringify({ start_date: startDate, days }),
  });
}

export function clearMealPlan(token, startDate, days = 14) {
  return request(`/meal-plan?start_date=${startDate}&days=${days}`, {
    method: "DELETE",
    headers: jsonHeaders(token),
  });
}

// Central API client: base URL resolution, a fetch wrapper with consistent error
// handling, and named endpoint helpers. Every network call in the app goes
// through here so auth headers and error parsing stay in one place.

import type {
  AuthResponse,
  ExternalRecommendation,
  MealPlanEntry,
  MealPreference,
  Recipe,
  RecipeForm,
  Recommendation,
} from "../types";

export const API_URL =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD ? "/api" : "http://127.0.0.1:8000");

type FieldError = { msg?: string; message?: string };

// Resolves to the parsed JSON body, or null for a 204 No Content response.
// Endpoint helpers below narrow the return type to what each route actually
// sends (a body for data routes, void for no-content routes).
export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, options);
  if (!response.ok) {
    let detail = "Request failed";
    try {
      const body = (await response.json()) as { detail?: string | FieldError[] };
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
    return null as T;
  }
  return (await response.json()) as T;
}

function jsonHeaders(token: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

type Credentials = { email: string; password: string; name?: string };

type RecipePayload = Omit<RecipeForm, "time_minutes" | "tags" | "ingredients" | "instructions"> & {
  time_minutes: number;
  tags: string | null;
  ingredients: string | null;
  instructions: string | null;
};

type MealPlanEntryPayload = {
  plan_date: string;
  recipe_id?: number;
  custom_message?: string;
};

// --- Auth ------------------------------------------------------------------

export function login(payload: Credentials): Promise<AuthResponse> {
  return request<AuthResponse>("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function register(payload: Credentials): Promise<AuthResponse> {
  return request<AuthResponse>("/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function logout(token: string): Promise<void> {
  return request<void>("/auth/logout", { method: "POST", headers: jsonHeaders(token) });
}

// --- Recipes ---------------------------------------------------------------

export function getRecipes(token: string): Promise<Recipe[]> {
  return request<Recipe[]>("/recipes", { headers: jsonHeaders(token) });
}

export function saveRecipe(
  token: string,
  payload: RecipePayload,
  editingId: number | null,
): Promise<Recipe> {
  return request<Recipe>(editingId ? `/recipes/${editingId}` : "/recipes", {
    method: editingId ? "PUT" : "POST",
    headers: jsonHeaders(token),
    body: JSON.stringify(payload),
  });
}

export function deleteRecipe(token: string, recipeId: number): Promise<void> {
  return request<void>(`/recipes/${recipeId}`, { method: "DELETE", headers: jsonHeaders(token) });
}

export function recommendRecipes(
  token: string,
  payload: MealPreference & { count: number },
): Promise<{ options: Recommendation[] }> {
  return request<{ options: Recommendation[] }>("/recipes/recommend", {
    method: "POST",
    headers: jsonHeaders(token),
    body: JSON.stringify(payload),
  });
}

export function randomRecipes(
  token: string,
  count: number,
): Promise<{ options: Recommendation[] }> {
  return request<{ options: Recommendation[] }>("/recipes/random", {
    method: "POST",
    headers: jsonHeaders(token),
    body: JSON.stringify({ count }),
  });
}

export function analyzeRecipePhoto(token: string, imageDataUrl: string): Promise<Partial<Recipe>> {
  return request<Partial<Recipe>>("/recipes/photo/analyze", {
    method: "POST",
    headers: jsonHeaders(token),
    body: JSON.stringify({ image_data_url: imageDataUrl }),
  });
}

export function generateExternalRecipe(
  token: string,
  preferences: MealPreference | null,
  count: number,
): Promise<{ options: ExternalRecommendation[] }> {
  return request<{ options: ExternalRecommendation[] }>("/recipes/external/random", {
    method: "POST",
    headers: jsonHeaders(token),
    body: JSON.stringify({ preferences, count }),
  });
}

export function saveExternalRecipe(token: string, externalId: string): Promise<Recipe> {
  return request<Recipe>("/recipes/external/save", {
    method: "POST",
    headers: jsonHeaders(token),
    body: JSON.stringify({ external_id: externalId }),
  });
}

// --- Meal plan -------------------------------------------------------------

export function getMealPlan(
  token: string,
  startDate: string,
  days = 14,
): Promise<{ entries: MealPlanEntry[] }> {
  return request<{ entries: MealPlanEntry[] }>(
    `/meal-plan?start_date=${startDate}&days=${days}`,
    { headers: jsonHeaders(token) },
  );
}

export function addMealPlanEntry(
  token: string,
  payload: MealPlanEntryPayload,
): Promise<MealPlanEntry> {
  return request<MealPlanEntry>("/meal-plan", {
    method: "POST",
    headers: jsonHeaders(token),
    body: JSON.stringify(payload),
  });
}

export function deleteMealPlanEntry(token: string, entryId: number): Promise<void> {
  return request<void>(`/meal-plan/${entryId}`, {
    method: "DELETE",
    headers: jsonHeaders(token),
  });
}

export function generateMealForDay(token: string, planDate: string): Promise<MealPlanEntry> {
  return request<MealPlanEntry>("/meal-plan/generate-day", {
    method: "POST",
    headers: jsonHeaders(token),
    body: JSON.stringify({ plan_date: planDate }),
  });
}

export function generateMealPlan(
  token: string,
  startDate: string,
  days = 14,
): Promise<{ entries: MealPlanEntry[] }> {
  return request<{ entries: MealPlanEntry[] }>("/meal-plan/generate", {
    method: "POST",
    headers: jsonHeaders(token),
    body: JSON.stringify({ start_date: startDate, days }),
  });
}

export function clearMealPlan(
  token: string,
  startDate: string,
  days = 14,
): Promise<{ deleted_count: number }> {
  return request<{ deleted_count: number }>(
    `/meal-plan?start_date=${startDate}&days=${days}`,
    { method: "DELETE", headers: jsonHeaders(token) },
  );
}

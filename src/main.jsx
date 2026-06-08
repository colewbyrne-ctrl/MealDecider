import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const API_URL =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD ? "/api" : "http://127.0.0.1:8000");
const blankRecipe = {
  name: "",
  time_minutes: 30,
  cuisine: "",
  difficulty: "easy",
  tags: "",
  ingredients: "",
  instructions: "",
};
const blankQuiz = {
  max_time_minutes: 30,
  difficulty: "easy",
  cuisine: "",
  tags: "",
  saved_count: 1,
};
const measurementUnits = new Set([
  "bag",
  "bags",
  "bottle",
  "bottles",
  "box",
  "boxes",
  "bunch",
  "bunches",
  "can",
  "cans",
  "clove",
  "cloves",
  "cup",
  "cups",
  "g",
  "gallon",
  "gallons",
  "gram",
  "grams",
  "kg",
  "lb",
  "lbs",
  "liter",
  "liters",
  "ml",
  "ounce",
  "ounces",
  "oz",
  "package",
  "packages",
  "packet",
  "packets",
  "pinch",
  "pinches",
  "pint",
  "pints",
  "pound",
  "pounds",
  "quart",
  "quarts",
  "slice",
  "slices",
  "sprig",
  "sprigs",
  "tablespoon",
  "tablespoons",
  "tbsp",
  "teaspoon",
  "teaspoons",
  "tsp",
]);

function parseAmountToken(token) {
  const normalized = token.trim().replace(",", ".");
  if (!normalized) {
    return null;
  }
  if (/^\d+(\.\d+)?$/.test(normalized)) {
    return Number(normalized);
  }
  const fractionMatch = normalized.match(/^(\d+)\/(\d+)$/);
  if (fractionMatch) {
    const denominator = Number(fractionMatch[2]);
    return denominator ? Number(fractionMatch[1]) / denominator : null;
  }
  const mixedFractionMatch = normalized.match(/^(\d+)-(\d+)\/(\d+)$/);
  if (mixedFractionMatch) {
    const denominator = Number(mixedFractionMatch[3]);
    return denominator
      ? Number(mixedFractionMatch[1]) + Number(mixedFractionMatch[2]) / denominator
      : null;
  }
  return null;
}

function formatAmount(amount) {
  if (amount === null || amount === undefined) {
    return "";
  }
  const rounded = Math.round(amount * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function normalizeIngredientName(value) {
  return value
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/^[\s,.;:-]+|[\s,.;:-]+$/g, "")
    .replace(/\s+/g, " ");
}

function parseIngredientLine(line) {
  const cleaned = line.replace(/^[-*]\s*/, "").trim();
  if (!cleaned) {
    return null;
  }

  const tokens = cleaned.split(/\s+/);
  let amount = parseAmountToken(tokens[0]);
  let cursor = 0;
  if (amount !== null) {
    cursor = 1;
    const secondAmount = parseAmountToken(tokens[1] || "");
    if (secondAmount !== null) {
      amount += secondAmount;
      cursor = 2;
    }
  }

  let unit = "";
  if (amount !== null && measurementUnits.has((tokens[cursor] || "").toLowerCase().replace(/\.$/, ""))) {
    unit = tokens[cursor].toLowerCase().replace(/\.$/, "");
    cursor += 1;
  }

  const name = normalizeIngredientName(tokens.slice(cursor).join(" ") || cleaned);
  if (!name) {
    return null;
  }

  return {
    amount,
    displayName: name,
    key: `${name}|${unit}`,
    unit,
  };
}

function parseRecipeIngredients(recipe) {
  return (recipe.ingredients || "")
    .split(/\r?\n|,/)
    .map(parseIngredientLine)
    .filter(Boolean);
}

function toLocalDateString(date) {
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 10);
}

function buildCalendarDays() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return Array.from({ length: 14 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return {
      date: toLocalDateString(day),
      label: day.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" }),
    };
  });
}

function readStoredUser() {
  try {
    const saved = localStorage.getItem("meal_user");
    return saved ? JSON.parse(saved) : null;
  } catch {
    localStorage.removeItem("meal_user");
    return null;
  }
}

function App() {
  const [page, setPage] = useState("manage");
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState({ name: "", email: "", password: "" });
  const [token, setToken] = useState(() => localStorage.getItem("meal_token") || "");
  const [user, setUser] = useState(readStoredUser);
  const [recipes, setRecipes] = useState([]);
  const [recipeForm, setRecipeForm] = useState(blankRecipe);
  const [editingId, setEditingId] = useState(null);
  const [selectedRecipeId, setSelectedRecipeId] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [quizForm, setQuizForm] = useState(blankQuiz);
  const [recommendations, setRecommendations] = useState([]);
  const [externalRecommendations, setExternalRecommendations] = useState([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [photoPreview, setPhotoPreview] = useState("");
  const [mealPlanEntries, setMealPlanEntries] = useState([]);
  const [calendarInputs, setCalendarInputs] = useState({});
  const [shoppingEntryIds, setShoppingEntryIds] = useState([]);
  const [checkedShoppingItems, setCheckedShoppingItems] = useState({});
  const calendarDays = useMemo(buildCalendarDays, []);

  const authHeaders = useMemo(
    () => ({
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    }),
    [token],
  );

  const filteredRecipes = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) {
      return recipes;
    }

    return recipes.filter((recipe) =>
      [
        recipe.name,
        recipe.cuisine,
        recipe.difficulty,
        recipe.tags,
        recipe.ingredients,
        recipe.instructions,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [recipes, searchTerm]);

  const selectedRecipe = useMemo(
    () => recipes.find((recipe) => recipe.id === selectedRecipeId) || null,
    [recipes, selectedRecipeId],
  );
  const calendarRecipeEntries = useMemo(
    () => mealPlanEntries.filter((entry) => entry.recipe),
    [mealPlanEntries],
  );
  const selectedShoppingEntries = useMemo(
    () => calendarRecipeEntries.filter((entry) => shoppingEntryIds.includes(entry.id)),
    [calendarRecipeEntries, shoppingEntryIds],
  );
  const shoppingItems = useMemo(() => {
    const itemMap = new Map();
    selectedShoppingEntries.forEach((entry) => {
      parseRecipeIngredients(entry.recipe).forEach((ingredient) => {
        const existing = itemMap.get(ingredient.key);
        if (!existing) {
          itemMap.set(ingredient.key, {
            ...ingredient,
            amount: ingredient.amount,
            recipeNames: new Set([entry.recipe.name]),
          });
          return;
        }
        if (existing.amount !== null && ingredient.amount !== null) {
          existing.amount += ingredient.amount;
        } else {
          existing.amount = null;
        }
        existing.recipeNames.add(entry.recipe.name);
      });
    });

    return Array.from(itemMap.values())
      .map((item) => ({
        ...item,
        recipeNames: Array.from(item.recipeNames).sort((left, right) => left.localeCompare(right)),
      }))
      .sort((left, right) => left.displayName.localeCompare(right.displayName));
  }, [selectedShoppingEntries]);

  useEffect(() => {
    if (token) {
      loadRecipes();
      loadMealPlan();
    }
  }, [token]);

  useEffect(() => {
    if (selectedRecipeId && !selectedRecipe) {
      setSelectedRecipeId(null);
    }
  }, [selectedRecipe, selectedRecipeId]);

  useEffect(() => {
    const availableIds = new Set(calendarRecipeEntries.map((entry) => entry.id));
    setShoppingEntryIds((entryIds) => entryIds.filter((entryId) => availableIds.has(entryId)));
  }, [calendarRecipeEntries]);

  useEffect(() => {
    const availableKeys = new Set(shoppingItems.map((item) => item.key));
    setCheckedShoppingItems((current) =>
      Object.fromEntries(Object.entries(current).filter(([key]) => availableKeys.has(key))),
    );
  }, [shoppingItems]);

  async function request(path, options = {}) {
    const response = await fetch(`${API_URL}${path}`, options);
    if (!response.ok) {
      let detail = "Request failed";
      try {
        const body = await response.json();
        if (Array.isArray(body.detail)) {
          detail = body.detail.map((item) => item.msg || item.message || "Invalid field").join(", ");
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

  async function handleAuth(event) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const path = authMode === "login" ? "/auth/login" : "/auth/register";
      const payload =
        authMode === "login"
          ? { email: authForm.email, password: authForm.password }
          : authForm;
      const data = await request(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      localStorage.setItem("meal_token", data.token);
      localStorage.setItem("meal_user", JSON.stringify(data.user));
      setToken(data.token);
      setUser(data.user);
      setPage("recipes");
      setMessage(`Signed in as ${data.user.name}.`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadRecipes() {
    try {
      const data = await request("/recipes", { headers: authHeaders });
      setRecipes(data);
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function loadMealPlan() {
    try {
      const data = await request(`/meal-plan?start_date=${calendarDays[0].date}&days=14`, {
        headers: authHeaders,
      });
      setMealPlanEntries(data.entries || []);
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function saveRecipe(event) {
    event.preventDefault();
    setMessage("");

    const recipeName = recipeForm.name.trim();
    const cuisine = recipeForm.cuisine.trim();
    const timeMinutes = Number(recipeForm.time_minutes);
    if (!recipeName || !cuisine || Number.isNaN(timeMinutes) || timeMinutes < 0) {
      setMessage("Add a recipe name, cuisine, and valid time before saving.");
      return;
    }

    const payload = {
      ...recipeForm,
      name: recipeName,
      cuisine,
      time_minutes: timeMinutes,
      tags: recipeForm.tags.trim() || null,
      ingredients: recipeForm.ingredients.trim() || null,
      instructions: recipeForm.instructions.trim() || null,
    };

    setLoading(true);
    try {
      const savedRecipe = await request(editingId ? `/recipes/${editingId}` : "/recipes", {
        method: editingId ? "PUT" : "POST",
        headers: authHeaders,
        body: JSON.stringify(payload),
      });
      setRecipeForm(blankRecipe);
      setEditingId(null);
      setRecipes((currentRecipes) => {
        const existingIndex = currentRecipes.findIndex((recipe) => recipe.id === savedRecipe.id);
        if (existingIndex === -1) {
          return [...currentRecipes, savedRecipe].sort((left, right) =>
            left.name.localeCompare(right.name),
          );
        }
        return currentRecipes.map((recipe) =>
          recipe.id === savedRecipe.id ? savedRecipe : recipe,
        );
      });
      setSelectedRecipeId(savedRecipe.id);
      setMessage(editingId ? "Recipe updated." : "Recipe added.");
      setPage("recipes");
      await loadRecipes();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function deleteRecipe(recipeId) {
    setLoading(true);
    setMessage("");

    try {
      await request(`/recipes/${recipeId}`, {
        method: "DELETE",
        headers: authHeaders,
      });
      await loadRecipes();
      if (editingId === recipeId) {
        setEditingId(null);
        setRecipeForm(blankRecipe);
      }
      if (selectedRecipeId === recipeId) {
        setSelectedRecipeId(null);
      }
      if (recommendations.some((option) => option.recipe.id === recipeId)) {
        setRecommendations((options) => options.filter((option) => option.recipe.id !== recipeId));
      }
      setMessage("Recipe removed.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  function editRecipe(recipe) {
    setEditingId(recipe.id);
    setRecipeForm({
      name: recipe.name,
      time_minutes: recipe.time_minutes,
      cuisine: recipe.cuisine,
      difficulty: recipe.difficulty,
      tags: recipe.tags || "",
      ingredients: recipe.ingredients || "",
      instructions: recipe.instructions || "",
    });
    setPage("manage");
  }

  async function decideMeal(event) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    setRecommendations([]);
    setExternalRecommendations([]);

    const payload = {
      ...quizForm,
      max_time_minutes: Number(quizForm.max_time_minutes),
      count: Number(quizForm.saved_count),
      cuisine: quizForm.cuisine.trim() || null,
      tags: quizForm.tags.trim() || null,
    };

    try {
      const data = await request("/recipes/recommend", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify(payload),
      });
      setRecommendations(data.options || []);
      if (data.options?.[0]) {
        setSelectedRecipeId(data.options[0].recipe.id);
      }
      const count = (data.options || []).length;
      setMessage(`Found ${count} saved recipe option${count === 1 ? "" : "s"}.`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function pickRandomSavedRecipe() {
    setLoading(true);
    setMessage("");
    setRecommendations([]);
    setExternalRecommendations([]);

    try {
      const data = await request("/recipes/random", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ count: Number(quizForm.saved_count) }),
      });
      setRecommendations(data.options || []);
      if (data.options?.[0]) {
        setSelectedRecipeId(data.options[0].recipe.id);
      }
      const count = (data.options || []).length;
      setMessage(`Picked ${count} saved recipe option${count === 1 ? "" : "s"}.`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function generateExternalRecipe() {
    setLoading(true);
    setMessage("");
    setExternalRecommendations([]);
    setRecommendations([]);

    const preferencePayload = {
      ...quizForm,
      max_time_minutes: Number(quizForm.max_time_minutes),
      cuisine: quizForm.cuisine.trim() || null,
      tags: quizForm.tags.trim() || null,
    };
    const hasFoodDirection = Boolean(preferencePayload.cuisine || preferencePayload.tags);

    try {
      const data = await request("/recipes/external/random", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          preferences: hasFoodDirection ? preferencePayload : null,
          count: 2,
        }),
      });
      setExternalRecommendations(data.options || []);
      setPage("decider");
      setMessage(`Found ${(data.options || []).length} new recipe options.`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  function readPhotoFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Could not read the selected photo"));
      reader.readAsDataURL(file);
    });
  }

  function loadPhoto(dataUrl) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Could not prepare the selected photo"));
      image.src = dataUrl;
    });
  }

  async function preparePhotoForScan(file) {
    const originalDataUrl = await readPhotoFile(file);
    const image = await loadPhoto(originalDataUrl);
    const maxDimension = 1280;
    const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", 0.82);
  }

  async function analyzeRecipePhoto(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    setLoading(true);
    setMessage("Scanning photo...");

    try {
      const imageDataUrl = await preparePhotoForScan(file);
      setPhotoPreview(imageDataUrl);
      const recipe = await request("/recipes/photo/analyze", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ image_data_url: imageDataUrl }),
      });
      if (!recipe?.name || !recipe?.cuisine) {
        throw new Error("The photo scanner did not return enough recipe details");
      }
      setRecipeForm({
        name: recipe.name || "",
        time_minutes: recipe.time_minutes || 30,
        cuisine: recipe.cuisine || "",
        difficulty: recipe.difficulty || "easy",
        tags: recipe.tags || "",
        ingredients: recipe.ingredients || "",
        instructions: recipe.instructions || "",
      });
      setEditingId(null);
      setPage("manage");
      setMessage("Photo scanned. Review the recipe before saving.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function saveExternalRecommendation(option) {
    if (!option?.recipe.external_id) {
      setMessage("This external recipe cannot be saved.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const recipe = await request("/recipes/external/save", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ external_id: option.recipe.external_id }),
      });
      await loadRecipes();
      setExternalRecommendations((options) =>
        options.filter((currentOption) => currentOption.recipe.external_id !== option.recipe.external_id),
      );
      setSelectedRecipeId(recipe.id);
      setPage("recipes");
      setMessage(`${recipe.name} was added to your recipes.`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  function updateCalendarInput(planDate, field, value) {
    setCalendarInputs((current) => ({
      ...current,
      [planDate]: { recipeId: "", message: "", ...current[planDate], [field]: value },
    }));
  }

  async function addRecipeToDay(planDate) {
    const recipeId = Number(calendarInputs[planDate]?.recipeId);
    if (!recipeId) {
      setMessage("Choose a recipe to add.");
      return;
    }
    await addMealPlanEntry({ plan_date: planDate, recipe_id: recipeId });
  }

  async function addMessageToDay(planDate) {
    const customMessage = calendarInputs[planDate]?.message?.trim();
    if (!customMessage) {
      setMessage("Enter a custom message to add.");
      return;
    }
    await addMealPlanEntry({ plan_date: planDate, custom_message: customMessage });
  }

  async function addMealPlanEntry(payload) {
    setLoading(true);
    setMessage("");
    try {
      const entry = await request("/meal-plan", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify(payload),
      });
      setMealPlanEntries((entries) => [...entries, entry]);
      setCalendarInputs((current) => ({ ...current, [payload.plan_date]: { recipeId: "", message: "" } }));
      setMessage("Meal added to the calendar.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function removeMealPlanEntry(entryId) {
    setLoading(true);
    setMessage("");
    try {
      await request(`/meal-plan/${entryId}`, { method: "DELETE", headers: authHeaders });
      setMealPlanEntries((entries) => entries.filter((entry) => entry.id !== entryId));
      setShoppingEntryIds((entryIds) => entryIds.filter((currentId) => currentId !== entryId));
      setMessage("Calendar entry removed.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function generateMealForDay(planDate) {
    setLoading(true);
    setMessage("");
    try {
      const entry = await request("/meal-plan/generate-day", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ plan_date: planDate }),
      });
      setMealPlanEntries((entries) => [...entries, entry]);
      setMessage(`${entry.recipe.name} was added to the calendar.`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function generateFullMealPlan() {
    setLoading(true);
    setMessage("");
    try {
      const data = await request("/meal-plan/generate", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ start_date: calendarDays[0].date, days: 14 }),
      });
      setMealPlanEntries(data.entries || []);
      setMessage("Empty days in the two-week schedule have been filled.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  function addCalendarEntryToShoppingList(entry) {
    if (!entry.recipe) {
      return;
    }
    setShoppingEntryIds((entryIds) =>
      entryIds.includes(entry.id) ? entryIds : [...entryIds, entry.id],
    );
    setPage("shopping");
    setMessage(`${entry.recipe.name} was added to the shopping list.`);
  }

  function removeCalendarEntryFromShoppingList(entryId) {
    setShoppingEntryIds((entryIds) => entryIds.filter((currentId) => currentId !== entryId));
  }

  function addAllCalendarRecipesToShoppingList() {
    const entryIds = calendarRecipeEntries.map((entry) => entry.id);
    setShoppingEntryIds(entryIds);
    setPage("shopping");
    setMessage(
      entryIds.length
        ? `${entryIds.length} calendar recipe${entryIds.length === 1 ? "" : "s"} added to the shopping list.`
        : "Add recipes to the calendar before building a shopping list.",
    );
  }

  function toggleShoppingItem(itemKey) {
    setCheckedShoppingItems((current) => ({ ...current, [itemKey]: !current[itemKey] }));
  }

  async function logout() {
    try {
      if (token) {
        await request("/auth/logout", {
          method: "POST",
          headers: authHeaders,
        });
      }
    } catch {
      // Local logout should still complete if the server token is already gone.
    }
    localStorage.removeItem("meal_token");
    localStorage.removeItem("meal_user");
    setToken("");
    setUser(null);
    setRecipes([]);
    setSelectedRecipeId(null);
    setExternalRecommendations([]);
    setRecommendations([]);
    setMealPlanEntries([]);
    setShoppingEntryIds([]);
    setCheckedShoppingItems({});
    setPage("manage");
    setMessage("Signed out.");
  }

  function formatTime(minutes) {
    return minutes > 0 ? `${minutes} min` : "Unknown";
  }

  function formatDifficulty(difficulty) {
    return difficulty && difficulty !== "unknown" ? difficulty : "Unknown";
  }

  function renderRecipeSummary(recipe) {
    return (
      <dl>
        <div>
          <dt>Cuisine</dt>
          <dd>{recipe.cuisine}</dd>
        </div>
        <div>
          <dt>Time</dt>
          <dd>{formatTime(recipe.time_minutes)}</dd>
        </div>
        <div>
          <dt>Level</dt>
          <dd>{formatDifficulty(recipe.difficulty)}</dd>
        </div>
      </dl>
    );
  }

  function renderRecipeContent(recipe) {
    return (
      <>
        {recipe.ingredients && (
          <section className="recipe-content">
            <h4>Ingredients</h4>
            <p>{recipe.ingredients}</p>
          </section>
        )}
        {recipe.instructions && (
          <section className="recipe-content">
            <h4>Instructions</h4>
            <p>{recipe.instructions}</p>
          </section>
        )}
      </>
    );
  }

  function renderManagePage() {
    return (
      <div className="content-grid">
        <form className="recipe-form" onSubmit={saveRecipe} noValidate>
          <h3>{editingId ? "Edit Recipe" : "Add Recipe"}</h3>
          <div className="form-grid">
            <label>
              Recipe name
              <input
                value={recipeForm.name}
                onChange={(event) => setRecipeForm({ ...recipeForm, name: event.target.value })}
                required
              />
            </label>
            <label>
              Cuisine
              <input
                value={recipeForm.cuisine}
                onChange={(event) => setRecipeForm({ ...recipeForm, cuisine: event.target.value })}
                required
              />
            </label>
            <label>
              Time
              <input
                type="number"
                min="0"
                value={recipeForm.time_minutes}
                onChange={(event) =>
                  setRecipeForm({ ...recipeForm, time_minutes: event.target.value })
                }
                required
              />
            </label>
            <label>
              Difficulty
              <select
                value={recipeForm.difficulty}
                onChange={(event) =>
                  setRecipeForm({ ...recipeForm, difficulty: event.target.value })
                }
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </label>
            <label>
              Tags
              <input
                value={recipeForm.tags}
                onChange={(event) => setRecipeForm({ ...recipeForm, tags: event.target.value })}
                placeholder="weekday, pasta"
              />
            </label>
          </div>
          <label>
            Ingredients
            <textarea
              rows="6"
              value={recipeForm.ingredients}
              onChange={(event) => setRecipeForm({ ...recipeForm, ingredients: event.target.value })}
              placeholder="Add one ingredient per line"
            />
          </label>
          <label>
            Instructions
            <textarea
              rows="8"
              value={recipeForm.instructions}
              onChange={(event) => setRecipeForm({ ...recipeForm, instructions: event.target.value })}
              placeholder="Describe how to prepare the recipe"
            />
          </label>
          <div className="actions">
            <button type="submit" className="primary" disabled={loading}>
              {editingId ? "Save changes" : "Add recipe"}
            </button>
            {editingId && (
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setEditingId(null);
                  setRecipeForm(blankRecipe);
                }}
              >
                Cancel
              </button>
            )}
          </div>
        </form>

        <div className="side-stack">
          <div className="side-panel">
            <h3>Photo import</h3>
            <p>Use your camera or photo library to draft a recipe automatically.</p>
            <div className="photo-actions">
              <label className="photo-import">
                <span>{loading ? "Scanning..." : "Use camera"}</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={analyzeRecipePhoto}
                  disabled={loading}
                />
              </label>
              <label className="photo-import secondary-photo">
                <span>Choose photo</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={analyzeRecipePhoto}
                  disabled={loading}
                />
              </label>
            </div>
            {photoPreview && (
              <img className="photo-preview" src={photoPreview} alt="Meal selected for scanning" />
            )}
          </div>

          <div className="side-panel">
            <h3>Saved recipes</h3>
            <p>{recipes.length} recipes are available for search and meal decisions.</p>
            <button className="primary" onClick={generateExternalRecipe} disabled={loading}>
              {loading ? "Generating..." : "Find new recipe"}
            </button>
            <button className="secondary" onClick={() => setPage("recipes")}>
              Open recipe list
            </button>
          </div>
        </div>
      </div>
    );
  }

  function renderRecipesPage() {
    return (
      <div className="recipe-browser">
        <div className="search-bar">
          <label>
            Search recipes
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Name, cuisine, tag, ingredient..."
            />
          </label>
        </div>

        <div className="browser-grid">
          <div className="recipe-list">
            {filteredRecipes.length === 0 ? (
              <div className="empty-state">
                <h3>No recipes found</h3>
                <p>Add a recipe or adjust your search.</p>
              </div>
            ) : (
              filteredRecipes.map((recipe) => (
                <button
                  className={`recipe-row ${selectedRecipeId === recipe.id ? "selected" : ""}`}
                  key={recipe.id}
                  onClick={() => setSelectedRecipeId(recipe.id)}
                >
                  <span>
                    <strong>{recipe.name}</strong>
                    <small>
                      {recipe.source === "themealdb"
                        ? `${recipe.cuisine} - External`
                        : recipe.cuisine}
                    </small>
                  </span>
                  <span>{formatTime(recipe.time_minutes)}</span>
                </button>
              ))
            )}
          </div>

          {selectedRecipe ? (
            <article className="recipe-card featured">
              <div>
                <p className="eyebrow">{selectedRecipe.cuisine}</p>
                <h3>{selectedRecipe.name}</h3>
                {selectedRecipe.source === "themealdb" && (
                  <span className="source-badge">Imported from TheMealDB</span>
                )}
              </div>
              {renderRecipeSummary(selectedRecipe)}
              {selectedRecipe.tags && (
                <p className="recipe-meta">
                  <strong>Tags:</strong> {selectedRecipe.tags}
                </p>
              )}
              {renderRecipeContent(selectedRecipe)}
              {selectedRecipe.source_url && (
                <a className="source-link" href={selectedRecipe.source_url} target="_blank" rel="noreferrer">
                  Open original recipe
                </a>
              )}
              <div className="actions">
                <button className="secondary" onClick={() => editRecipe(selectedRecipe)}>
                  Edit
                </button>
                <button className="danger" onClick={() => deleteRecipe(selectedRecipe.id)}>
                  Delete
                </button>
              </div>
            </article>
          ) : (
            <div className="empty-state">
              <h3>Select a recipe</h3>
              <p>Click any recipe in the list to see details.</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  function renderCalendarPage() {
    return (
      <div className="calendar-page">
        <div className="calendar-toolbar">
          <div>
            <h3>Next two weeks</h3>
            <p>Plan one or more meals per day, or add reminders such as Leftovers.</p>
          </div>
          <div className="toolbar-actions">
            <button
              className="secondary"
              onClick={addAllCalendarRecipesToShoppingList}
              disabled={calendarRecipeEntries.length === 0}
            >
              Add all to shopping list
            </button>
            <button
              className="primary"
              onClick={generateFullMealPlan}
              disabled={loading || recipes.length === 0}
            >
              {loading ? "Generating..." : "Generate full schedule"}
            </button>
          </div>
        </div>

        <div className="calendar-grid">
          {calendarDays.map((day) => {
            const entries = mealPlanEntries.filter((entry) => entry.plan_date === day.date);
            const inputs = calendarInputs[day.date] || { recipeId: "", message: "" };
            return (
              <article className="calendar-day" key={day.date}>
                <header>
                  <h3>{day.label}</h3>
                  <small>{day.date}</small>
                </header>

                <div className="day-entries">
                  {entries.length > 0 ? (
                    entries.map((entry) => (
                      <div className="day-entry" key={entry.id}>
                        <span>{entry.recipe?.name || entry.custom_message}</span>
                        <div className="entry-actions">
                          {entry.recipe && (
                            <button
                              className="remove-entry"
                              onClick={() => addCalendarEntryToShoppingList(entry)}
                              disabled={loading || shoppingEntryIds.includes(entry.id)}
                            >
                              {shoppingEntryIds.includes(entry.id) ? "Added" : "Shop"}
                            </button>
                          )}
                          <button
                            className="remove-entry"
                            onClick={() => removeMealPlanEntry(entry.id)}
                            disabled={loading}
                            aria-label={`Remove ${entry.recipe?.name || entry.custom_message}`}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="day-empty">Nothing planned yet.</p>
                  )}
                </div>

                <div className="day-controls">
                  <select
                    value={inputs.recipeId}
                    onChange={(event) => updateCalendarInput(day.date, "recipeId", event.target.value)}
                    aria-label={`Recipe for ${day.label}`}
                  >
                    <option value="">Choose saved recipe</option>
                    {recipes.map((recipe) => (
                      <option value={recipe.id} key={recipe.id}>
                        {recipe.name}
                      </option>
                    ))}
                  </select>
                  <button
                    className="secondary"
                    onClick={() => addRecipeToDay(day.date)}
                    disabled={loading || recipes.length === 0}
                  >
                    Add recipe
                  </button>
                  <input
                    value={inputs.message}
                    onChange={(event) => updateCalendarInput(day.date, "message", event.target.value)}
                    placeholder="Custom message, e.g. Leftovers"
                    aria-label={`Custom message for ${day.label}`}
                  />
                  <button
                    className="secondary"
                    onClick={() => addMessageToDay(day.date)}
                    disabled={loading}
                  >
                    Add message
                  </button>
                  <button
                    className="primary"
                    onClick={() => generateMealForDay(day.date)}
                    disabled={loading || recipes.length === 0}
                  >
                    Generate recipe
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    );
  }

  function renderShoppingPage() {
    return (
      <div className="shopping-page">
        <div className="shopping-layout">
          <section className="shopping-panel">
            <div className="shopping-heading">
              <div>
                <h3>Calendar recipes</h3>
                <p>{selectedShoppingEntries.length} selected for this list.</p>
              </div>
              <button
                className="secondary"
                onClick={addAllCalendarRecipesToShoppingList}
                disabled={calendarRecipeEntries.length === 0}
              >
                Add all
              </button>
            </div>

            {calendarRecipeEntries.length === 0 ? (
              <div className="empty-state">
                <h3>No calendar recipes</h3>
                <p>Add recipes to the meal calendar, then build your shopping list here.</p>
              </div>
            ) : (
              <div className="shopping-recipe-list">
                {calendarRecipeEntries.map((entry) => {
                  const selected = shoppingEntryIds.includes(entry.id);
                  return (
                    <label className="shopping-recipe-option" key={entry.id}>
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() =>
                          selected
                            ? removeCalendarEntryFromShoppingList(entry.id)
                            : addCalendarEntryToShoppingList(entry)
                        }
                      />
                      <span>
                        <strong>{entry.recipe.name}</strong>
                        <small>{entry.plan_date}</small>
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </section>

          <section className="shopping-panel">
            <div className="shopping-heading">
              <div>
                <h3>Shopping list</h3>
                <p>{shoppingItems.length} tallied item{shoppingItems.length === 1 ? "" : "s"}.</p>
              </div>
            </div>

            {shoppingItems.length === 0 ? (
              <div className="empty-state">
                <h3>No ingredients yet</h3>
                <p>Select calendar recipes to combine their ingredients.</p>
              </div>
            ) : (
              <div className="shopping-items">
                {shoppingItems.map((item) => {
                  const checked = Boolean(checkedShoppingItems[item.key]);
                  const amountText = [formatAmount(item.amount), item.unit].filter(Boolean).join(" ");
                  return (
                    <label className={`shopping-item ${checked ? "checked" : ""}`} key={item.key}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleShoppingItem(item.key)}
                      />
                      <span>
                        <strong>
                          {amountText ? `${amountText} ` : ""}
                          {item.displayName}
                        </strong>
                        <small>{item.recipeNames.join(", ")}</small>
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    );
  }

  function renderDeciderPage() {
    return (
      <div className="content-grid">
        <form className="recipe-form" onSubmit={decideMeal}>
          <h3>Meal Quiz</h3>
          <div className="form-grid">
            <label>
              Max time
              <input
                type="number"
                min="1"
                value={quizForm.max_time_minutes}
                onChange={(event) =>
                  setQuizForm({ ...quizForm, max_time_minutes: event.target.value })
                }
                required
              />
            </label>
            <label>
              Max difficulty
              <select
                value={quizForm.difficulty}
                onChange={(event) => setQuizForm({ ...quizForm, difficulty: event.target.value })}
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </label>
            <label>
              Cuisine
              <input
                value={quizForm.cuisine}
                onChange={(event) => setQuizForm({ ...quizForm, cuisine: event.target.value })}
                placeholder="Optional"
              />
            </label>
            <label>
              Saved options
              <input
                type="number"
                min="1"
                max="5"
                value={quizForm.saved_count}
                onChange={(event) => setQuizForm({ ...quizForm, saved_count: event.target.value })}
                required
              />
            </label>
          </div>
          <label>
            Tags
            <input
              value={quizForm.tags}
              onChange={(event) => setQuizForm({ ...quizForm, tags: event.target.value })}
              placeholder="Optional: quick, spicy"
            />
          </label>
          <div className="actions">
            <button className="primary" disabled={loading || recipes.length === 0}>
              {loading ? "Thinking..." : "Pick saved meal"}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={pickRandomSavedRecipe}
              disabled={loading || recipes.length === 0}
            >
              Pure random
            </button>
            <button
              type="button"
              className="secondary"
              onClick={generateExternalRecipe}
              disabled={loading}
            >
              Find new recipe
            </button>
          </div>
        </form>

        {externalRecommendations.length > 0 ? (
          <div className="recipe-list">
            {externalRecommendations.map((option) => (
              <article className="recipe-card featured" key={option.recipe.external_id}>
                <p className="eyebrow">New Recipe Option</p>
                <h3>{option.recipe.name}</h3>
                {renderRecipeSummary(option.recipe)}
                {renderRecipeContent(option.recipe)}
                <p className="score-line">Match score: {Math.round(option.score * 100)}%</p>
                <ul className="reason-list">
                  {option.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
                <div className="actions">
                  <button
                    className="primary"
                    onClick={() => saveExternalRecommendation(option)}
                    disabled={loading}
                  >
                    Add to my recipes
                  </button>
                  {option.recipe.source_url && (
                    <a
                      className="secondary button-link"
                      href={option.recipe.source_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open original
                    </a>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : recommendations.length > 0 ? (
          <div className="recipe-list">
            {recommendations.map((option) => (
              <article className="recipe-card featured" key={option.recipe.id}>
                <p className="eyebrow">Saved Recipe Option</p>
                <h3>{option.recipe.name}</h3>
                {renderRecipeSummary(option.recipe)}
                <ul className="reason-list">
                  {option.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
                <button
                  className="secondary"
                  onClick={() => {
                    setSelectedRecipeId(option.recipe.id);
                    setPage("recipes");
                  }}
                >
                  View recipe
                </button>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <h3>No pick yet</h3>
            <p>Set your constraints to rank saved recipes or find a new option.</p>
          </div>
        )}
      </div>
    );
  }

  const pageTitles = {
    manage: ["Recipe Manager", editingId ? "Edit recipe" : "Add recipe"],
    recipes: ["Library", "Recipes"],
    calendar: ["Meal Plan", "Two-week calendar"],
    shopping: ["Shopping", "Grocery list"],
    decider: ["Decision", "Pick dinner"],
  };

  return (
    <main className="app-shell">
      <section className="sidebar">
        <div>
          <p className="eyebrow">Meal Decider</p>
          <h1>Dinner, organized.</h1>
          <p className="subtle">Manage recipes, compare options, and pick what fits tonight.</p>
        </div>

        {user ? (
          <>
            <nav className="app-nav" aria-label="App pages">
              <button className={page === "manage" ? "active" : ""} onClick={() => setPage("manage")}>
                Manage
              </button>
              <button className={page === "recipes" ? "active" : ""} onClick={() => setPage("recipes")}>
                Recipes
              </button>
              <button className={page === "calendar" ? "active" : ""} onClick={() => setPage("calendar")}>
                Calendar
              </button>
              <button className={page === "shopping" ? "active" : ""} onClick={() => setPage("shopping")}>
                Shopping
              </button>
              <button className={page === "decider" ? "active" : ""} onClick={() => setPage("decider")}>
                Decide
              </button>
            </nav>
            <div className="account-box">
              <span className="label">Signed in</span>
              <strong>{user.name}</strong>
              <small>{user.email}</small>
              <button className="secondary" onClick={logout} disabled={loading}>
                Sign out
              </button>
            </div>
          </>
        ) : (
          <form className="auth-form" onSubmit={handleAuth}>
            <div className="segmented">
              <button
                type="button"
                className={authMode === "login" ? "active" : ""}
                onClick={() => setAuthMode("login")}
              >
                Login
              </button>
              <button
                type="button"
                className={authMode === "register" ? "active" : ""}
                onClick={() => setAuthMode("register")}
              >
                Register
              </button>
            </div>

            {authMode === "register" && (
              <label>
                Name
                <input
                  value={authForm.name}
                  onChange={(event) => setAuthForm({ ...authForm, name: event.target.value })}
                  required
                />
              </label>
            )}

            <label>
              Email
              <input
                type="email"
                value={authForm.email}
                onChange={(event) => setAuthForm({ ...authForm, email: event.target.value })}
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={authForm.password}
                onChange={(event) => setAuthForm({ ...authForm, password: event.target.value })}
                minLength={authMode === "register" ? 8 : 1}
                required
              />
            </label>

            <button className="primary" disabled={loading}>
              {loading ? "Working..." : authMode === "login" ? "Sign in" : "Create account"}
            </button>
          </form>
        )}

        {message && <p className="status-line">{message}</p>}
      </section>

      <section className="workspace">
        <header className="workspace-header">
          <div>
            <p className="eyebrow">{pageTitles[page][0]}</p>
            <h2>{pageTitles[page][1]}</h2>
          </div>
          <span className="count">{recipes.length} recipes</span>
        </header>

        {user ? (
          <>
            {page === "manage" && renderManagePage()}
            {page === "recipes" && renderRecipesPage()}
            {page === "calendar" && renderCalendarPage()}
            {page === "shopping" && renderShoppingPage()}
            {page === "decider" && renderDeciderPage()}
          </>
        ) : (
          <div className="signed-out-panel">
            <h3>Sign in required</h3>
            <p>Sign in to manage your recipe library and meal recommendations.</p>
          </div>
        )}
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // The app still works as a normal website if service worker registration fails.
    });
  });
}

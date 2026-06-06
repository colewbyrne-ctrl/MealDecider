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

  useEffect(() => {
    if (token) {
      loadRecipes();
    }
  }, [token]);

  useEffect(() => {
    if (selectedRecipeId && !selectedRecipe) {
      setSelectedRecipeId(null);
    }
  }, [selectedRecipe, selectedRecipeId]);

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

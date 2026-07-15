import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";

import * as api from "./api/client";
import { Sidebar } from "./components/Sidebar";
import { useAuth } from "./hooks/useAuth";
import { buildCalendarDays } from "./lib/calendar";
import { blankQuiz, blankRecipe } from "./lib/constants";
import { matchRecipesByIngredients } from "./lib/ingredientMatch";
import { preparePhotoForScan } from "./lib/photo";
import { buildShoppingItems } from "./lib/shopping";
import { CalendarPage } from "./pages/CalendarPage";
import { DeciderPage } from "./pages/DeciderPage";
import { ManageRecipes } from "./pages/ManageRecipes";
import { RecipesLibrary } from "./pages/RecipesLibrary";
import { ShoppingPage } from "./pages/ShoppingPage";
import type {
  AuthForm,
  AuthMode,
  CalendarInput,
  ExternalRecommendation,
  MealPlanEntry,
  MealPreference,
  Page,
  Recipe,
  RecipeCalendarEntry,
  RecipeForm,
  Recommendation,
} from "./types";

const pageTitles: Record<Page, [string, string]> = {
  manage: ["Recipe Manager", "Add recipe"],
  recipes: ["Library", "Recipes"],
  calendar: ["Meal Plan", "Two-week calendar"],
  shopping: ["Shopping", "Grocery list"],
  decider: ["Decision", "Pick dinner"],
};

export default function App() {
  const { token, user, saveSession, clearAuth } = useAuth();
  const [page, setPage] = useState<Page>("manage");
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authForm, setAuthForm] = useState<AuthForm>({ name: "", email: "", password: "" });
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [recipeForm, setRecipeForm] = useState<RecipeForm>(blankRecipe);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [selectedRecipeId, setSelectedRecipeId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [quizForm, setQuizForm] = useState(blankQuiz);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [externalRecommendations, setExternalRecommendations] = useState<ExternalRecommendation[]>(
    [],
  );
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [photoPreview, setPhotoPreview] = useState("");
  const [mealPlanEntries, setMealPlanEntries] = useState<MealPlanEntry[]>([]);
  const [calendarInputs, setCalendarInputs] = useState<Record<string, CalendarInput>>({});
  const [shoppingEntryIds, setShoppingEntryIds] = useState<number[]>([]);
  const [checkedShoppingItems, setCheckedShoppingItems] = useState<Record<string, boolean>>({});
  const calendarDays = useMemo(buildCalendarDays, []);

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
  const calendarRecipeEntries = useMemo<RecipeCalendarEntry[]>(
    () => mealPlanEntries.filter((entry): entry is RecipeCalendarEntry => entry.recipe !== null),
    [mealPlanEntries],
  );
  const selectedShoppingEntries = useMemo(
    () => calendarRecipeEntries.filter((entry) => shoppingEntryIds.includes(entry.id)),
    [calendarRecipeEntries, shoppingEntryIds],
  );
  const shoppingItems = useMemo(
    () => buildShoppingItems(selectedShoppingEntries),
    [selectedShoppingEntries],
  );

  useEffect(() => {
    if (token) {
      loadRecipes();
      loadMealPlan();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  async function handleAuth(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const payload =
        authMode === "login"
          ? { email: authForm.email, password: authForm.password }
          : authForm;
      const data = authMode === "login" ? await api.login(payload) : await api.register(payload);
      saveSession(data);
      setPage("recipes");
      setMessage(`Signed in as ${data.user.name}.`);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function loadRecipes() {
    try {
      const data = await api.getRecipes(token);
      setRecipes(data);
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }

  async function loadMealPlan() {
    try {
      const data = await api.getMealPlan(token, calendarDays[0].date, 14);
      setMealPlanEntries(data.entries || []);
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }

  async function saveRecipe(event: FormEvent) {
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
      name: recipeName,
      cuisine,
      difficulty: recipeForm.difficulty,
      time_minutes: timeMinutes,
      tags: recipeForm.tags.trim() || null,
      ingredients: recipeForm.ingredients.trim() || null,
      instructions: recipeForm.instructions.trim() || null,
    };

    setLoading(true);
    try {
      const savedRecipe = await api.saveRecipe(token, payload, editingId);
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
      setMessage(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function deleteRecipe(recipeId: number) {
    setLoading(true);
    setMessage("");

    try {
      await api.deleteRecipe(token, recipeId);
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
      setMessage(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  function editRecipe(recipe: Recipe) {
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

  function cancelEdit() {
    setEditingId(null);
    setRecipeForm(blankRecipe);
  }

  async function decideMeal(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    setRecommendations([]);
    setExternalRecommendations([]);

    const payload = {
      max_time_minutes: Number(quizForm.max_time_minutes),
      difficulty: quizForm.difficulty,
      count: Number(quizForm.saved_count),
      cuisine: quizForm.cuisine.trim() || null,
      tags: quizForm.tags.trim() || null,
    };

    try {
      const data = await api.recommendRecipes(token, payload);
      setRecommendations(data.options || []);
      if (data.options?.[0]) {
        setSelectedRecipeId(data.options[0].recipe.id);
      }
      const count = (data.options || []).length;
      setMessage(`Found ${count} saved recipe option${count === 1 ? "" : "s"}.`);
    } catch (error) {
      setMessage(errorMessage(error));
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
      const data = await api.randomRecipes(token, Number(quizForm.saved_count));
      setRecommendations(data.options || []);
      if (data.options?.[0]) {
        setSelectedRecipeId(data.options[0].recipe.id);
      }
      const count = (data.options || []).length;
      setMessage(`Picked ${count} saved recipe option${count === 1 ? "" : "s"}.`);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  function findMealsFromIngredients() {
    setMessage("");
    setExternalRecommendations([]);
    setRecommendations([]);

    const { hasInput, options, canMakeCount } = matchRecipesByIngredients(
      recipes,
      quizForm.available_ingredients,
      Number(quizForm.saved_count),
    );

    if (!hasInput) {
      setMessage("Add at least one main ingredient you have on hand.");
      return;
    }

    setRecommendations(options);
    if (options[0]) {
      setSelectedRecipeId(options[0].recipe.id);
    }
    setMessage(
      options.length
        ? canMakeCount
          ? `Found ${options.length} saved recipe${options.length === 1 ? "" : "s"} you can make.`
          : `No exact matches, but found ${options.length} close saved recipe${
              options.length === 1 ? "" : "s"
            }.`
        : "No saved recipes matched those ingredients.",
    );
  }

  async function generateExternalRecipe() {
    setLoading(true);
    setMessage("");
    setExternalRecommendations([]);
    setRecommendations([]);

    const preferencePayload: MealPreference = {
      max_time_minutes: Number(quizForm.max_time_minutes),
      difficulty: quizForm.difficulty,
      cuisine: quizForm.cuisine.trim() || null,
      tags: quizForm.tags.trim() || null,
    };
    const hasFoodDirection = Boolean(preferencePayload.cuisine || preferencePayload.tags);

    try {
      const data = await api.generateExternalRecipe(
        token,
        hasFoodDirection ? preferencePayload : null,
        2,
      );
      setExternalRecommendations(data.options || []);
      setPage("decider");
      setMessage(`Found ${(data.options || []).length} new recipe options.`);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function analyzeRecipePhoto(event: ChangeEvent<HTMLInputElement>) {
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
      const recipe = await api.analyzeRecipePhoto(token, imageDataUrl);
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
      setMessage(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function saveExternalRecommendation(option: ExternalRecommendation) {
    if (!option?.recipe.external_id) {
      setMessage("This external recipe cannot be saved.");
      return;
    }
    const externalId = option.recipe.external_id;

    setLoading(true);
    setMessage("");

    try {
      const recipe = await api.saveExternalRecipe(token, externalId);
      await loadRecipes();
      setExternalRecommendations((options) =>
        options.filter((currentOption) => currentOption.recipe.external_id !== externalId),
      );
      setSelectedRecipeId(recipe.id);
      setPage("recipes");
      setMessage(`${recipe.name} was added to your recipes.`);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  function updateCalendarInput(planDate: string, field: keyof CalendarInput, value: string) {
    setCalendarInputs((current) => {
      const existing = current[planDate] ?? { recipeId: "", message: "" };
      return { ...current, [planDate]: { ...existing, [field]: value } };
    });
  }

  async function addMealPlanEntry(payload: {
    plan_date: string;
    recipe_id?: number;
    custom_message?: string;
  }) {
    setLoading(true);
    setMessage("");
    try {
      const entry = await api.addMealPlanEntry(token, payload);
      setMealPlanEntries((entries) => [...entries, entry]);
      setCalendarInputs((current) => ({
        ...current,
        [payload.plan_date]: { recipeId: "", message: "" },
      }));
      setMessage("Meal added to the calendar.");
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function addRecipeToDay(planDate: string) {
    const recipeId = Number(calendarInputs[planDate]?.recipeId);
    if (!recipeId) {
      setMessage("Choose a recipe to add.");
      return;
    }
    await addMealPlanEntry({ plan_date: planDate, recipe_id: recipeId });
  }

  async function addMessageToDay(planDate: string) {
    const customMessage = calendarInputs[planDate]?.message?.trim();
    if (!customMessage) {
      setMessage("Enter a custom message to add.");
      return;
    }
    await addMealPlanEntry({ plan_date: planDate, custom_message: customMessage });
  }

  async function removeMealPlanEntry(entryId: number) {
    setLoading(true);
    setMessage("");
    try {
      await api.deleteMealPlanEntry(token, entryId);
      setMealPlanEntries((entries) => entries.filter((entry) => entry.id !== entryId));
      setShoppingEntryIds((entryIds) => entryIds.filter((currentId) => currentId !== entryId));
      setMessage("Calendar entry removed.");
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function generateMealForDay(planDate: string) {
    setLoading(true);
    setMessage("");
    try {
      const entry = await api.generateMealForDay(token, planDate);
      setMealPlanEntries((entries) => [...entries, entry]);
      setMessage(`${entry.recipe?.name ?? "A recipe"} was added to the calendar.`);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function generateFullMealPlan() {
    setLoading(true);
    setMessage("");
    try {
      const data = await api.generateMealPlan(token, calendarDays[0].date, 14);
      setMealPlanEntries(data.entries || []);
      setMessage("Empty days in the two-week schedule have been filled.");
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function clearMealPlan() {
    if (mealPlanEntries.length === 0) {
      setMessage("The calendar is already empty.");
      return;
    }
    if (!window.confirm("Clear every entry from the visible two-week calendar?")) {
      return;
    }

    setLoading(true);
    setMessage("");
    try {
      const data = await api.clearMealPlan(token, calendarDays[0].date, 14);
      const deletedIds = new Set(mealPlanEntries.map((entry) => entry.id));
      setMealPlanEntries([]);
      setShoppingEntryIds((entryIds) => entryIds.filter((entryId) => !deletedIds.has(entryId)));
      setCheckedShoppingItems({});
      setMessage(
        data.deleted_count
          ? `${data.deleted_count} calendar entr${data.deleted_count === 1 ? "y" : "ies"} cleared.`
          : "The calendar is already empty.",
      );
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  function addCalendarEntryToShoppingList(entry: MealPlanEntry) {
    if (!entry.recipe) {
      return;
    }
    const recipe = entry.recipe;
    setShoppingEntryIds((entryIds) =>
      entryIds.includes(entry.id) ? entryIds : [...entryIds, entry.id],
    );
    setPage("shopping");
    setMessage(`${recipe.name} was added to the shopping list.`);
  }

  function removeCalendarEntryFromShoppingList(entryId: number) {
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

  function deselectAllShoppingRecipes() {
    setShoppingEntryIds([]);
    setCheckedShoppingItems({});
    setMessage("Shopping list selections cleared.");
  }

  function toggleShoppingItem(itemKey: string) {
    setCheckedShoppingItems((current) => ({ ...current, [itemKey]: !current[itemKey] }));
  }

  function viewRecipe(recipeId: number) {
    setSelectedRecipeId(recipeId);
    setPage("recipes");
  }

  async function logout() {
    try {
      if (token) {
        await api.logout(token);
      }
    } catch {
      // Local logout should still complete if the server token is already gone.
    }
    clearAuth();
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

  const headerTitle = pageTitles[page];
  const managePrimary = editingId ? "Edit recipe" : "Add recipe";

  return (
    <main className="app-shell">
      <Sidebar
        user={user}
        page={page}
        setPage={setPage}
        onLogout={logout}
        loading={loading}
        message={message}
        authMode={authMode}
        setAuthMode={setAuthMode}
        authForm={authForm}
        setAuthForm={setAuthForm}
        onAuthSubmit={handleAuth}
      />

      <section className="workspace">
        <header className="workspace-header">
          <div>
            <p className="eyebrow">{headerTitle[0]}</p>
            <h2>{page === "manage" ? managePrimary : headerTitle[1]}</h2>
          </div>
          <span className="count">{recipes.length} recipes</span>
        </header>

        {user ? (
          <>
            {page === "manage" && (
              <ManageRecipes
                recipeForm={recipeForm}
                setRecipeForm={setRecipeForm}
                editingId={editingId}
                loading={loading}
                photoPreview={photoPreview}
                recipesCount={recipes.length}
                onSubmit={saveRecipe}
                onCancelEdit={cancelEdit}
                onAnalyzePhoto={analyzeRecipePhoto}
                onFindNewRecipe={generateExternalRecipe}
                onOpenRecipeList={() => setPage("recipes")}
              />
            )}
            {page === "recipes" && (
              <RecipesLibrary
                searchTerm={searchTerm}
                setSearchTerm={setSearchTerm}
                filteredRecipes={filteredRecipes}
                selectedRecipeId={selectedRecipeId}
                setSelectedRecipeId={setSelectedRecipeId}
                selectedRecipe={selectedRecipe}
                onEdit={editRecipe}
                onDelete={deleteRecipe}
              />
            )}
            {page === "calendar" && (
              <CalendarPage
                calendarDays={calendarDays}
                mealPlanEntries={mealPlanEntries}
                calendarInputs={calendarInputs}
                recipes={recipes}
                loading={loading}
                shoppingEntryIds={shoppingEntryIds}
                calendarRecipeEntries={calendarRecipeEntries}
                updateCalendarInput={updateCalendarInput}
                onAddRecipeToDay={addRecipeToDay}
                onAddMessageToDay={addMessageToDay}
                onGenerateMealForDay={generateMealForDay}
                onRemoveEntry={removeMealPlanEntry}
                onAddEntryToShopping={addCalendarEntryToShoppingList}
                onAddAllToShopping={addAllCalendarRecipesToShoppingList}
                onGenerateFull={generateFullMealPlan}
                onClear={clearMealPlan}
              />
            )}
            {page === "shopping" && (
              <ShoppingPage
                calendarRecipeEntries={calendarRecipeEntries}
                shoppingEntryIds={shoppingEntryIds}
                selectedShoppingEntries={selectedShoppingEntries}
                shoppingItems={shoppingItems}
                checkedShoppingItems={checkedShoppingItems}
                onAdd={addCalendarEntryToShoppingList}
                onRemove={removeCalendarEntryFromShoppingList}
                onAddAll={addAllCalendarRecipesToShoppingList}
                onDeselectAll={deselectAllShoppingRecipes}
                onToggleItem={toggleShoppingItem}
              />
            )}
            {page === "decider" && (
              <DeciderPage
                quizForm={quizForm}
                setQuizForm={setQuizForm}
                loading={loading}
                recipes={recipes}
                externalRecommendations={externalRecommendations}
                recommendations={recommendations}
                onDecide={decideMeal}
                onFindFromIngredients={findMealsFromIngredients}
                onPickRandom={pickRandomSavedRecipe}
                onGenerateExternal={generateExternalRecipe}
                onSaveExternal={saveExternalRecommendation}
                onViewRecipe={viewRecipe}
              />
            )}
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong";
}

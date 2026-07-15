// Shared domain types for the Meal Decider frontend. These mirror the FastAPI
// response schemas in main.py and the shapes the UI state machine works with.

export type Difficulty = "easy" | "medium" | "hard" | "unknown";

export type Recipe = {
  id: number;
  owner_id?: number | null;
  name: string;
  time_minutes: number;
  cuisine: string;
  difficulty: Difficulty;
  tags: string | null;
  ingredients: string | null;
  instructions: string | null;
  source: string;
  source_url: string | null;
  external_id: string | null;
};

// External (TheMealDB) previews have the same fields as a saved recipe but no id
// until they are imported.
export type RecipePreview = Omit<Recipe, "id">;

// Anything that can be rendered by the recipe detail components.
export type DisplayRecipe = Recipe | RecipePreview;

export type User = {
  id: number;
  name: string;
  email: string;
};

export type AuthResponse = {
  token: string;
  user: User;
};

export type Recommendation = {
  recipe: Recipe;
  reasons: string[];
};

export type ExternalRecommendation = {
  recipe: RecipePreview;
  score: number;
  reasons: string[];
};

export type MealPlanEntry = {
  id: number;
  plan_date: string;
  recipe: Recipe | null;
  custom_message: string | null;
};

// A calendar entry known to carry a recipe (the shopping list only works with
// these). App narrows to this via a type-guard filter.
export type RecipeCalendarEntry = MealPlanEntry & { recipe: Recipe };

export type ParsedIngredient = {
  amount: number | null;
  displayName: string;
  key: string;
  unit: string;
};

export type ShoppingItem = ParsedIngredient & {
  recipeNames: string[];
};

export type MealPreference = {
  max_time_minutes: number;
  difficulty: string;
  cuisine: string | null;
  tags: string | null;
};

// --- UI state shapes -------------------------------------------------------

export type Page = "manage" | "recipes" | "calendar" | "shopping" | "decider";

export type AuthMode = "login" | "register";

export type AuthForm = {
  name: string;
  email: string;
  password: string;
};

// Numeric fields are held as string | number because the controlled number
// inputs surface raw strings while editing.
export type RecipeForm = {
  name: string;
  time_minutes: number | string;
  cuisine: string;
  difficulty: Difficulty;
  tags: string;
  ingredients: string;
  instructions: string;
};

export type QuizForm = {
  max_time_minutes: number | string;
  difficulty: Difficulty;
  cuisine: string;
  tags: string;
  saved_count: number | string;
  available_ingredients: string;
};

export type CalendarDay = {
  date: string;
  label: string;
};

export type CalendarInput = {
  recipeId: string;
  message: string;
};

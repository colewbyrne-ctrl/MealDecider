// Blank form templates used to initialize and reset the recipe and quiz forms.

import type { QuizForm, RecipeForm } from "../types";

export const blankRecipe: RecipeForm = {
  name: "",
  time_minutes: 30,
  cuisine: "",
  difficulty: "easy",
  tags: "",
  ingredients: "",
  instructions: "",
};

export const blankQuiz: QuizForm = {
  max_time_minutes: 30,
  difficulty: "easy",
  cuisine: "",
  tags: "",
  saved_count: 1,
  available_ingredients: "",
};

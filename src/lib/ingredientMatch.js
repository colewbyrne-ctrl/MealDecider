// Client-side "what can I cook with these ingredients?" matcher.
// Pure: takes the saved recipes, the free-text ingredient input, and how many
// options to return, and produces ranked recommendations plus the counts the
// caller needs to phrase a status message.

import {
  getCoreRecipeIngredients,
  ingredientsMatch,
  splitIngredientInput,
} from "./ingredients.js";

export function matchRecipesByIngredients(recipes, availableInput, count) {
  const availableIngredients = splitIngredientInput(availableInput);
  if (availableIngredients.length === 0) {
    return { hasInput: false, options: [], canMakeCount: 0 };
  }

  const scoredRecipes = recipes
    .map((recipe) => {
      const coreIngredients = getCoreRecipeIngredients(recipe);
      if (coreIngredients.length === 0) {
        return null;
      }

      const matchedIngredients = coreIngredients.filter((ingredient) =>
        availableIngredients.some((availableIngredient) =>
          ingredientsMatch(availableIngredient, ingredient),
        ),
      );
      const missingIngredients = coreIngredients.filter(
        (ingredient) => !matchedIngredients.includes(ingredient),
      );
      const matchRatio = matchedIngredients.length / coreIngredients.length;

      return {
        recipe,
        matchedIngredients,
        missingIngredients,
        matchRatio,
        canMake: missingIngredients.length === 0,
      };
    })
    .filter(Boolean)
    .filter((match) => match.matchedIngredients.length > 0)
    .sort((left, right) => {
      if (left.canMake !== right.canMake) {
        return left.canMake ? -1 : 1;
      }
      if (right.matchRatio !== left.matchRatio) {
        return right.matchRatio - left.matchRatio;
      }
      return left.missingIngredients.length - right.missingIngredients.length;
    });

  const canMakeRecipes = scoredRecipes.filter((match) => match.canMake);
  const optionsSource = canMakeRecipes.length ? canMakeRecipes : scoredRecipes;
  const options = optionsSource.slice(0, count).map((match) => {
    const reasons = [`matches what you have: ${match.matchedIngredients.join(", ")}`];
    if (match.canMake) {
      reasons.push("only needs pantry basics beyond your ingredient list");
    } else {
      reasons.push(`closest match; still missing: ${match.missingIngredients.join(", ")}`);
    }
    return { recipe: match.recipe, reasons };
  });

  return { hasInput: true, options, canMakeCount: canMakeRecipes.length };
}

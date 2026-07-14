// Aggregates the ingredients of the selected calendar recipes into a single
// deduplicated, quantity-summed shopping list. Pure and unit-testable.

import { parseRecipeIngredients } from "./ingredients.js";

export function buildShoppingItems(entries) {
  const itemMap = new Map();

  entries.forEach((entry) => {
    if (!entry.recipe) {
      return;
    }
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
      recipeNames: Array.from(item.recipeNames).sort((left, right) =>
        left.localeCompare(right),
      ),
    }))
    .sort((left, right) => left.displayName.localeCompare(right.displayName));
}

// Aggregates the ingredients of the selected calendar recipes into a single
// deduplicated, quantity-summed shopping list. Pure and unit-testable.

import type { MealPlanEntry, ParsedIngredient, ShoppingItem } from "../types";
import { parseRecipeIngredients } from "./ingredients";

type ShoppingAccumulator = ParsedIngredient & { recipeNames: Set<string> };

export function buildShoppingItems(entries: MealPlanEntry[]): ShoppingItem[] {
  const itemMap = new Map<string, ShoppingAccumulator>();

  entries.forEach((entry) => {
    const recipe = entry.recipe;
    if (!recipe) {
      return;
    }
    parseRecipeIngredients(recipe).forEach((ingredient) => {
      const existing = itemMap.get(ingredient.key);
      if (!existing) {
        itemMap.set(ingredient.key, {
          ...ingredient,
          amount: ingredient.amount,
          recipeNames: new Set([recipe.name]),
        });
        return;
      }
      if (existing.amount !== null && ingredient.amount !== null) {
        existing.amount += ingredient.amount;
      } else {
        existing.amount = null;
      }
      existing.recipeNames.add(recipe.name);
    });
  });

  return Array.from(itemMap.values())
    .map((item) => ({
      ...item,
      recipeNames: Array.from(item.recipeNames).sort((left, right) => left.localeCompare(right)),
    }))
    .sort((left, right) => left.displayName.localeCompare(right.displayName));
}

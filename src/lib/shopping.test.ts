import { describe, it, expect } from "vitest";
import { buildShoppingItems } from "./shopping";
import type { MealPlanEntry, Recipe } from "../types";

function makeRecipe(name: string, ingredients: string): Recipe {
  return {
    id: 1,
    name,
    time_minutes: 30,
    cuisine: "Any",
    difficulty: "easy",
    tags: null,
    ingredients,
    instructions: null,
    source: "user",
    source_url: null,
    external_id: null,
  };
}

function makeEntry(id: number, recipe: Recipe | null): MealPlanEntry {
  return { id, plan_date: "2026-07-14", recipe, custom_message: null };
}

const entries: MealPlanEntry[] = [
  makeEntry(1, makeRecipe("Stew", "2 cups flour\n1 lb chicken")),
  makeEntry(2, makeRecipe("Pie", "1 cup flour\ncarrots")),
  makeEntry(3, null), // custom-message day, no recipe
];

describe("buildShoppingItems", () => {
  const items = buildShoppingItems(entries);

  it("ignores entries that have no recipe", () => {
    // 3 distinct items: flour, chicken, carrots (entry 3 contributes nothing)
    expect(items).toHaveLength(3);
  });

  it("sums quantities for the same ingredient+unit across recipes", () => {
    const flour = items.find((item) => item.key === "flour|cup");
    expect(flour?.amount).toBe(3); // 2 cups + 1 cup
    expect(flour?.recipeNames).toEqual(["Pie", "Stew"]); // sorted
  });

  it("keeps amount null when an ingredient has no parseable quantity", () => {
    const carrots = items.find((item) => item.displayName === "carrots");
    expect(carrots?.amount).toBeNull();
    expect(carrots?.recipeNames).toEqual(["Pie"]);
  });

  it("returns items sorted by display name", () => {
    expect(items.map((item) => item.displayName)).toEqual(["carrots", "chicken", "flour"]);
  });

  it("returns an empty list when nothing is selected", () => {
    expect(buildShoppingItems([])).toEqual([]);
  });
});

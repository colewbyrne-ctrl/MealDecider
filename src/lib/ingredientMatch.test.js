import { describe, it, expect } from "vitest";
import { matchRecipesByIngredients } from "./ingredientMatch.js";

const recipes = [
  { id: 1, name: "Chicken and Rice", ingredients: "1 lb chicken\n2 cups rice\nsalt" },
  { id: 2, name: "Chicken Broccoli Bake", ingredients: "1 lb chicken\nbroccoli\ncheese" },
  { id: 3, name: "Beef Tacos", ingredients: "1 lb beef\ntortillas\nlettuce" },
];

describe("matchRecipesByIngredients", () => {
  it("reports no input when only pantry staples are given", () => {
    const result = matchRecipesByIngredients(recipes, "salt, water", 5);
    expect(result.hasInput).toBe(false);
    expect(result.options).toEqual([]);
  });

  it("ranks fully-makeable recipes first", () => {
    const result = matchRecipesByIngredients(recipes, "chicken, rice", 5);
    expect(result.options[0].recipe.id).toBe(1); // needs only chicken+rice (+pantry salt)
    expect(result.canMakeCount).toBe(1);
  });

  it("includes a can-make reason for fully matched recipes", () => {
    const result = matchRecipesByIngredients(recipes, "chicken, rice", 5);
    expect(result.options[0].reasons.some((r) => r.includes("only needs pantry basics"))).toBe(
      true,
    );
  });

  it("falls back to closest matches when nothing is fully makeable", () => {
    const result = matchRecipesByIngredients(recipes, "chicken", 5);
    expect(result.canMakeCount).toBe(0);
    expect(result.options.length).toBeGreaterThan(0);
    expect(result.options[0].reasons.some((r) => r.includes("still missing"))).toBe(true);
  });

  it("excludes recipes that share no ingredients", () => {
    const result = matchRecipesByIngredients(recipes, "chicken, rice", 5);
    expect(result.options.some((o) => o.recipe.id === 3)).toBe(false); // Beef Tacos
  });

  it("respects the requested option count", () => {
    const result = matchRecipesByIngredients(recipes, "chicken", 1);
    expect(result.options).toHaveLength(1);
  });
});

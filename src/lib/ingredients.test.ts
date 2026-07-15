import { describe, it, expect } from "vitest";
import {
  formatAmount,
  getCoreRecipeIngredients,
  ingredientsMatch,
  isPantryIngredient,
  normalizeIngredientForMatch,
  parseAmountToken,
  parseIngredientLine,
  parseRecipeIngredients,
  singularizeIngredient,
  splitIngredientInput,
} from "./ingredients";

describe("parseAmountToken", () => {
  it("parses integers, decimals, and comma decimals", () => {
    expect(parseAmountToken("2")).toBe(2);
    expect(parseAmountToken("1.5")).toBe(1.5);
    expect(parseAmountToken("1,5")).toBe(1.5);
  });

  it("parses simple and mixed fractions", () => {
    expect(parseAmountToken("1/2")).toBe(0.5);
    expect(parseAmountToken("1-1/2")).toBe(1.5);
  });

  it("returns null for non-amounts and divide-by-zero", () => {
    expect(parseAmountToken("chicken")).toBeNull();
    expect(parseAmountToken("1/0")).toBeNull();
    expect(parseAmountToken("")).toBeNull();
  });
});

describe("formatAmount", () => {
  it("renders empty for null/undefined and rounds to two decimals", () => {
    expect(formatAmount(null)).toBe("");
    expect(formatAmount(undefined)).toBe("");
    expect(formatAmount(2)).toBe("2");
    expect(formatAmount(1.333333)).toBe("1.33");
  });
});

describe("singularizeIngredient", () => {
  it("handles -ies, -oes, and trailing -s", () => {
    expect(singularizeIngredient("berries")).toBe("berry");
    expect(singularizeIngredient("tomatoes")).toBe("tomato");
    expect(singularizeIngredient("eggs")).toBe("egg");
  });

  it("leaves -ss words and short (<=3 char) words alone", () => {
    expect(singularizeIngredient("glass")).toBe("glass");
    expect(singularizeIngredient("gas")).toBe("gas");
  });
});

describe("normalizeIngredientForMatch", () => {
  it("strips prep words and singularizes", () => {
    expect(normalizeIngredientForMatch("2 large diced Onions")).toBe("2 onion");
    expect(normalizeIngredientForMatch("Freshly Chopped Tomatoes")).toBe("tomato");
  });
});

describe("isPantryIngredient", () => {
  it("treats seasonings and staples as pantry items", () => {
    expect(isPantryIngredient("salt")).toBe(true);
    expect(isPantryIngredient("olive oil")).toBe(true);
    expect(isPantryIngredient("black pepper")).toBe(true);
  });

  it("treats real ingredients as non-pantry", () => {
    expect(isPantryIngredient("chicken")).toBe(false);
    expect(isPantryIngredient("broccoli")).toBe(false);
  });
});

describe("ingredientsMatch", () => {
  it("matches on equality or substring in either direction", () => {
    expect(ingredientsMatch("chicken", "chicken")).toBe(true);
    expect(ingredientsMatch("chicken breast", "chicken")).toBe(true);
    expect(ingredientsMatch("chicken", "chicken thigh")).toBe(true);
    expect(ingredientsMatch("beef", "chicken")).toBe(false);
  });
});

describe("splitIngredientInput", () => {
  it("splits on newlines/commas and drops pantry staples", () => {
    expect(splitIngredientInput("Chicken, rice\nsalt, olive oil")).toEqual(["chicken", "rice"]);
  });
});

describe("parseIngredientLine", () => {
  it("parses amount, unit alias, and name", () => {
    expect(parseIngredientLine("2 cups flour")).toEqual({
      amount: 2,
      unit: "cup",
      displayName: "flour",
      key: "flour|cup",
    });
  });

  it("parses compact units like 200g", () => {
    const parsed = parseIngredientLine("200g chicken");
    expect(parsed?.amount).toBe(200);
    expect(parsed?.unit).toBe("g");
    expect(parsed?.displayName).toBe("chicken");
  });

  it("handles bullet prefixes and missing amounts", () => {
    const parsed = parseIngredientLine("- Salt to taste");
    expect(parsed?.amount).toBeNull();
    expect(parsed?.displayName).toBe("salt to taste");
  });

  it("returns null for blank lines", () => {
    expect(parseIngredientLine("   ")).toBeNull();
  });
});

describe("parseRecipeIngredients / getCoreRecipeIngredients", () => {
  const recipe = { ingredients: "2 cups flour\n1 lb chicken\nsalt\nbroccoli" };

  it("parses every non-empty ingredient line", () => {
    expect(parseRecipeIngredients(recipe)).toHaveLength(4);
  });

  it("returns only non-pantry core ingredients, deduplicated", () => {
    const core = getCoreRecipeIngredients(recipe);
    expect(core).toContain("chicken");
    expect(core).toContain("broccoli");
    expect(core).not.toContain("salt");
    expect(core).not.toContain("flour"); // flour is a pantry staple
  });
});

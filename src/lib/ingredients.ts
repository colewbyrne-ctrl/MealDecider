// Ingredient parsing, normalization, and pantry/measurement vocabulary.
// Pure functions with no React or DOM dependencies, so they are unit-testable
// on their own and shared by the ingredient finder and the shopping list.

import type { ParsedIngredient } from "../types";

export const pantryIngredients = new Set<string>([
  "baking powder",
  "baking soda",
  "bay leaf",
  "bay leaves",
  "black pepper",
  "butter",
  "cayenne",
  "chili powder",
  "cinnamon",
  "cooking spray",
  "cumin",
  "flour",
  "garlic powder",
  "honey",
  "hot sauce",
  "ketchup",
  "mayonnaise",
  "mustard",
  "oil",
  "olive oil",
  "onion powder",
  "oregano",
  "paprika",
  "parsley",
  "pepper",
  "red pepper flakes",
  "salt",
  "soy sauce",
  "sugar",
  "thyme",
  "vegetable oil",
  "vinegar",
  "water",
]);

export const ingredientWordsToIgnore = new Set<string>([
  "and",
  "chopped",
  "crushed",
  "diced",
  "drained",
  "fresh",
  "freshly",
  "grated",
  "ground",
  "large",
  "medium",
  "minced",
  "optional",
  "peeled",
  "raw",
  "shredded",
  "sliced",
  "small",
  "to",
  "taste",
]);

export const measurementUnits = new Set<string>([
  "bag",
  "bags",
  "bottle",
  "bottles",
  "box",
  "boxes",
  "bunch",
  "bunches",
  "can",
  "cans",
  "clove",
  "cloves",
  "cup",
  "cups",
  "g",
  "gallon",
  "gallons",
  "gram",
  "grams",
  "kg",
  "lb",
  "lbs",
  "liter",
  "liters",
  "ml",
  "ounce",
  "ounces",
  "oz",
  "package",
  "packages",
  "packet",
  "packets",
  "pinch",
  "pinches",
  "pint",
  "pints",
  "pound",
  "pounds",
  "quart",
  "quarts",
  "slice",
  "slices",
  "sprig",
  "sprigs",
  "tablespoon",
  "tablespoons",
  "tbsp",
  "teaspoon",
  "teaspoons",
  "tsp",
]);

export const unitAliases: Record<string, string> = {
  bag: "bag",
  bags: "bag",
  bottle: "bottle",
  bottles: "bottle",
  box: "box",
  boxes: "box",
  bunch: "bunch",
  bunches: "bunch",
  can: "can",
  cans: "can",
  clove: "clove",
  cloves: "clove",
  cup: "cup",
  cups: "cup",
  g: "g",
  gallon: "gallon",
  gallons: "gallon",
  gram: "g",
  grams: "g",
  kg: "kg",
  lb: "lb",
  lbs: "lb",
  liter: "liter",
  liters: "liter",
  ml: "ml",
  ounce: "oz",
  ounces: "oz",
  oz: "oz",
  package: "package",
  packages: "package",
  packet: "packet",
  packets: "packet",
  pinch: "pinch",
  pinches: "pinch",
  pint: "pint",
  pints: "pint",
  pound: "lb",
  pounds: "lb",
  quart: "quart",
  quarts: "quart",
  slice: "slice",
  slices: "slice",
  sprig: "sprig",
  sprigs: "sprig",
  tablespoon: "tbsp",
  tablespoons: "tbsp",
  tbsp: "tbsp",
  teaspoon: "tsp",
  teaspoons: "tsp",
  tsp: "tsp",
};

export function parseAmountToken(token: string): number | null {
  const normalized = token.trim().replace(",", ".");
  if (!normalized) {
    return null;
  }
  if (/^\d+(\.\d+)?$/.test(normalized)) {
    return Number(normalized);
  }
  const fractionMatch = normalized.match(/^(\d+)\/(\d+)$/);
  if (fractionMatch) {
    const denominator = Number(fractionMatch[2]);
    return denominator ? Number(fractionMatch[1]) / denominator : null;
  }
  const mixedFractionMatch = normalized.match(/^(\d+)-(\d+)\/(\d+)$/);
  if (mixedFractionMatch) {
    const denominator = Number(mixedFractionMatch[3]);
    return denominator
      ? Number(mixedFractionMatch[1]) + Number(mixedFractionMatch[2]) / denominator
      : null;
  }
  return null;
}

export function formatAmount(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) {
    return "";
  }
  const rounded = Math.round(amount * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

export function normalizeIngredientName(value: string): string {
  return value
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/['"]/g, "")
    .replace(/^[\s,.;:-]+|[\s,.;:-]+$/g, "")
    .replace(/\s+/g, " ");
}

export function singularizeIngredient(value: string): string {
  if (value.endsWith("ies") && value.length > 4) {
    return `${value.slice(0, -3)}y`;
  }
  if (value.endsWith("oes") && value.length > 4) {
    return value.slice(0, -2);
  }
  if (value.endsWith("s") && !value.endsWith("ss") && value.length > 3) {
    return value.slice(0, -1);
  }
  return value;
}

export function normalizeIngredientForMatch(value: string): string {
  return normalizeIngredientName(value)
    .split(/\s+/)
    .filter((word) => word && !ingredientWordsToIgnore.has(word))
    .map(singularizeIngredient)
    .join(" ");
}

export function isPantryIngredient(value: string): boolean {
  const ingredient = normalizeIngredientForMatch(value);
  if (!ingredient) {
    return true;
  }
  if (pantryIngredients.has(ingredient)) {
    return true;
  }
  return ingredient
    .split(/\s+/)
    .every((word) => pantryIngredients.has(word) || ingredientWordsToIgnore.has(word));
}

export function ingredientsMatch(availableIngredient: string, recipeIngredient: string): boolean {
  return (
    availableIngredient === recipeIngredient ||
    availableIngredient.includes(recipeIngredient) ||
    recipeIngredient.includes(availableIngredient)
  );
}

export function splitIngredientInput(value: string): string[] {
  return value
    .split(/\r?\n|,/)
    .map(normalizeIngredientForMatch)
    .filter((ingredient) => ingredient && !isPantryIngredient(ingredient));
}

export function normalizeMeasurementUnit(value: string): string {
  const unit = value.toLowerCase().replace(/\.$/, "");
  return unitAliases[unit] || unit;
}

export function parseIngredientLine(line: string): ParsedIngredient | null {
  const cleaned = line.replace(/^[-*]\s*/, "").trim();
  if (!cleaned) {
    return null;
  }

  const tokens = cleaned.split(/\s+/);
  let amount = parseAmountToken(tokens[0]);
  let cursor = 0;
  let compactUnit = "";
  if (amount === null) {
    const compactMatch = tokens[0].match(/^(\d+(?:[.,]\d+)?)([a-zA-Z]+)$/);
    if (compactMatch && measurementUnits.has(compactMatch[2].toLowerCase())) {
      amount = parseAmountToken(compactMatch[1]);
      compactUnit = compactMatch[2];
    }
  }
  if (amount !== null) {
    cursor = 1;
    const secondAmount = parseAmountToken(tokens[1] || "");
    if (secondAmount !== null) {
      amount += secondAmount;
      cursor = 2;
    }
  }

  let unit = "";
  if (compactUnit) {
    unit = normalizeMeasurementUnit(compactUnit);
  } else if (
    amount !== null &&
    measurementUnits.has((tokens[cursor] || "").toLowerCase().replace(/\.$/, ""))
  ) {
    unit = normalizeMeasurementUnit(tokens[cursor]);
    cursor += 1;
  }

  const name = normalizeIngredientName(tokens.slice(cursor).join(" ") || cleaned);
  if (!name) {
    return null;
  }

  return {
    amount,
    displayName: name,
    key: `${name}|${unit}`,
    unit,
  };
}

export function parseRecipeIngredients(recipe: { ingredients: string | null }): ParsedIngredient[] {
  return (recipe.ingredients || "")
    .split(/\r?\n|,/)
    .map(parseIngredientLine)
    .filter((ingredient): ingredient is ParsedIngredient => ingredient !== null);
}

export function getCoreRecipeIngredients(recipe: { ingredients: string | null }): string[] {
  return Array.from(
    new Set(
      parseRecipeIngredients(recipe)
        .map((ingredient) => normalizeIngredientForMatch(ingredient.displayName))
        .filter((ingredient) => ingredient && !isPantryIngredient(ingredient)),
    ),
  );
}

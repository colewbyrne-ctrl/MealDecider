import { formatDifficulty, formatTime } from "../lib/format.js";

export function RecipeSummary({ recipe }) {
  return (
    <dl>
      <div>
        <dt>Cuisine</dt>
        <dd>{recipe.cuisine}</dd>
      </div>
      <div>
        <dt>Time</dt>
        <dd>{formatTime(recipe.time_minutes)}</dd>
      </div>
      <div>
        <dt>Level</dt>
        <dd>{formatDifficulty(recipe.difficulty)}</dd>
      </div>
    </dl>
  );
}

export function RecipeContent({ recipe }) {
  return (
    <>
      {recipe.ingredients && (
        <section className="recipe-content">
          <h4>Ingredients</h4>
          <p>{recipe.ingredients}</p>
        </section>
      )}
      {recipe.instructions && (
        <section className="recipe-content">
          <h4>Instructions</h4>
          <p>{recipe.instructions}</p>
        </section>
      )}
    </>
  );
}

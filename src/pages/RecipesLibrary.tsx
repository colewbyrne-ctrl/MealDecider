import type { Recipe } from "../types";
import { RecipeContent, RecipeSummary } from "../components/RecipeDetails";
import { formatTime } from "../lib/format";

type RecipesLibraryProps = {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  filteredRecipes: Recipe[];
  selectedRecipeId: number | null;
  setSelectedRecipeId: (id: number) => void;
  selectedRecipe: Recipe | null;
  onEdit: (recipe: Recipe) => void;
  onDelete: (id: number) => void;
};

export function RecipesLibrary({
  searchTerm,
  setSearchTerm,
  filteredRecipes,
  selectedRecipeId,
  setSelectedRecipeId,
  selectedRecipe,
  onEdit,
  onDelete,
}: RecipesLibraryProps) {
  return (
    <div className="recipe-browser">
      <div className="search-bar">
        <label>
          Search recipes
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Name, cuisine, tag, ingredient..."
          />
        </label>
      </div>

      <div className="browser-grid">
        <div className="recipe-list">
          {filteredRecipes.length === 0 ? (
            <div className="empty-state">
              <h3>No recipes found</h3>
              <p>Add a recipe or adjust your search.</p>
            </div>
          ) : (
            filteredRecipes.map((recipe) => (
              <button
                className={`recipe-row ${selectedRecipeId === recipe.id ? "selected" : ""}`}
                key={recipe.id}
                onClick={() => setSelectedRecipeId(recipe.id)}
              >
                <span>
                  <strong>{recipe.name}</strong>
                  <small>
                    {recipe.source === "themealdb" ? `${recipe.cuisine} - External` : recipe.cuisine}
                  </small>
                </span>
                <span>{formatTime(recipe.time_minutes)}</span>
              </button>
            ))
          )}
        </div>

        {selectedRecipe ? (
          <article className="recipe-card featured">
            <div>
              <p className="eyebrow">{selectedRecipe.cuisine}</p>
              <h3>{selectedRecipe.name}</h3>
              {selectedRecipe.source === "themealdb" && (
                <span className="source-badge">Imported from TheMealDB</span>
              )}
            </div>
            <RecipeSummary recipe={selectedRecipe} />
            {selectedRecipe.tags && (
              <p className="recipe-meta">
                <strong>Tags:</strong> {selectedRecipe.tags}
              </p>
            )}
            <RecipeContent recipe={selectedRecipe} />
            {selectedRecipe.source_url && (
              <a
                className="source-link"
                href={selectedRecipe.source_url}
                target="_blank"
                rel="noreferrer"
              >
                Open original recipe
              </a>
            )}
            <div className="actions">
              <button className="secondary" onClick={() => onEdit(selectedRecipe)}>
                Edit
              </button>
              <button className="danger" onClick={() => onDelete(selectedRecipe.id)}>
                Delete
              </button>
            </div>
          </article>
        ) : (
          <div className="empty-state">
            <h3>Select a recipe</h3>
            <p>Click any recipe in the list to see details.</p>
          </div>
        )}
      </div>
    </div>
  );
}

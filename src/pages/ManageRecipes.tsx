import type { ChangeEvent, FormEvent } from "react";

import type { Difficulty, RecipeForm } from "../types";

type ManageRecipesProps = {
  recipeForm: RecipeForm;
  setRecipeForm: (form: RecipeForm) => void;
  editingId: number | null;
  loading: boolean;
  photoPreview: string;
  recipesCount: number;
  onSubmit: (event: FormEvent) => void;
  onCancelEdit: () => void;
  onAnalyzePhoto: (event: ChangeEvent<HTMLInputElement>) => void;
  onFindNewRecipe: () => void;
  onOpenRecipeList: () => void;
};

export function ManageRecipes({
  recipeForm,
  setRecipeForm,
  editingId,
  loading,
  photoPreview,
  recipesCount,
  onSubmit,
  onCancelEdit,
  onAnalyzePhoto,
  onFindNewRecipe,
  onOpenRecipeList,
}: ManageRecipesProps) {
  return (
    <div className="content-grid">
      <form className="recipe-form" onSubmit={onSubmit} noValidate>
        <h3>{editingId ? "Edit Recipe" : "Add Recipe"}</h3>
        <div className="form-grid">
          <label>
            Recipe name
            <input
              value={recipeForm.name}
              onChange={(event) => setRecipeForm({ ...recipeForm, name: event.target.value })}
              required
            />
          </label>
          <label>
            Cuisine
            <input
              value={recipeForm.cuisine}
              onChange={(event) => setRecipeForm({ ...recipeForm, cuisine: event.target.value })}
              required
            />
          </label>
          <label>
            Time
            <input
              type="number"
              min="0"
              value={recipeForm.time_minutes}
              onChange={(event) =>
                setRecipeForm({ ...recipeForm, time_minutes: event.target.value })
              }
              required
            />
          </label>
          <label>
            Difficulty
            <select
              value={recipeForm.difficulty}
              onChange={(event) =>
                setRecipeForm({ ...recipeForm, difficulty: event.target.value as Difficulty })
              }
            >
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </label>
          <label>
            Tags
            <input
              value={recipeForm.tags}
              onChange={(event) => setRecipeForm({ ...recipeForm, tags: event.target.value })}
              placeholder="weekday, pasta"
            />
          </label>
        </div>
        <label>
          Ingredients
          <textarea
            rows={6}
            value={recipeForm.ingredients}
            onChange={(event) => setRecipeForm({ ...recipeForm, ingredients: event.target.value })}
            placeholder="Add one ingredient per line"
          />
        </label>
        <label>
          Instructions
          <textarea
            rows={8}
            value={recipeForm.instructions}
            onChange={(event) =>
              setRecipeForm({ ...recipeForm, instructions: event.target.value })
            }
            placeholder="Describe how to prepare the recipe"
          />
        </label>
        <div className="actions">
          <button type="submit" className="primary" disabled={loading}>
            {editingId ? "Save changes" : "Add recipe"}
          </button>
          {editingId && (
            <button type="button" className="secondary" onClick={onCancelEdit}>
              Cancel
            </button>
          )}
        </div>
      </form>

      <div className="side-stack">
        <div className="side-panel">
          <h3>Photo import</h3>
          <p>Use your camera or photo library to draft a recipe automatically.</p>
          <div className="photo-actions">
            <label className="photo-import">
              <span>{loading ? "Scanning..." : "Use camera"}</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={onAnalyzePhoto}
                disabled={loading}
              />
            </label>
            <label className="photo-import secondary-photo">
              <span>Choose photo</span>
              <input type="file" accept="image/*" onChange={onAnalyzePhoto} disabled={loading} />
            </label>
          </div>
          {photoPreview && (
            <img className="photo-preview" src={photoPreview} alt="Meal selected for scanning" />
          )}
        </div>

        <div className="side-panel">
          <h3>Saved recipes</h3>
          <p>{recipesCount} recipes are available for search and meal decisions.</p>
          <button className="primary" onClick={onFindNewRecipe} disabled={loading}>
            {loading ? "Generating..." : "Find new recipe"}
          </button>
          <button className="secondary" onClick={onOpenRecipeList}>
            Open recipe list
          </button>
        </div>
      </div>
    </div>
  );
}

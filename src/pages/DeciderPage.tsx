import type { FormEvent } from "react";

import type {
  Difficulty,
  ExternalRecommendation,
  QuizForm,
  Recipe,
  Recommendation,
} from "../types";
import { RecipeContent, RecipeSummary } from "../components/RecipeDetails";

type DeciderPageProps = {
  quizForm: QuizForm;
  setQuizForm: (form: QuizForm) => void;
  loading: boolean;
  recipes: Recipe[];
  externalRecommendations: ExternalRecommendation[];
  recommendations: Recommendation[];
  onDecide: (event: FormEvent) => void;
  onFindFromIngredients: () => void;
  onPickRandom: () => void;
  onGenerateExternal: () => void;
  onSaveExternal: (option: ExternalRecommendation) => void;
  onViewRecipe: (id: number) => void;
};

export function DeciderPage({
  quizForm,
  setQuizForm,
  loading,
  recipes,
  externalRecommendations,
  recommendations,
  onDecide,
  onFindFromIngredients,
  onPickRandom,
  onGenerateExternal,
  onSaveExternal,
  onViewRecipe,
}: DeciderPageProps) {
  return (
    <div className="content-grid">
      <form className="recipe-form" onSubmit={onDecide}>
        <h3>Meal Quiz</h3>
        <div className="form-grid">
          <label>
            Max time
            <input
              type="number"
              min="1"
              value={quizForm.max_time_minutes}
              onChange={(event) =>
                setQuizForm({ ...quizForm, max_time_minutes: event.target.value })
              }
              required
            />
          </label>
          <label>
            Max difficulty
            <select
              value={quizForm.difficulty}
              onChange={(event) =>
                setQuizForm({ ...quizForm, difficulty: event.target.value as Difficulty })
              }
            >
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </label>
          <label>
            Cuisine
            <input
              value={quizForm.cuisine}
              onChange={(event) => setQuizForm({ ...quizForm, cuisine: event.target.value })}
              placeholder="Optional"
            />
          </label>
          <label>
            Saved options
            <input
              type="number"
              min="1"
              max="5"
              value={quizForm.saved_count}
              onChange={(event) => setQuizForm({ ...quizForm, saved_count: event.target.value })}
              required
            />
          </label>
        </div>
        <label>
          Tags
          <input
            value={quizForm.tags}
            onChange={(event) => setQuizForm({ ...quizForm, tags: event.target.value })}
            placeholder="Optional: quick, spicy"
          />
        </label>
        <label>
          Main ingredients on hand
          <textarea
            rows={5}
            value={quizForm.available_ingredients}
            onChange={(event) =>
              setQuizForm({ ...quizForm, available_ingredients: event.target.value })
            }
            placeholder="Chicken, rice, broccoli"
          />
        </label>
        <div className="actions">
          <button className="primary" disabled={loading || recipes.length === 0}>
            {loading ? "Thinking..." : "Pick saved meal"}
          </button>
          <button
            type="button"
            className="secondary"
            onClick={onFindFromIngredients}
            disabled={loading || recipes.length === 0}
          >
            Find from ingredients
          </button>
          <button
            type="button"
            className="secondary"
            onClick={onPickRandom}
            disabled={loading || recipes.length === 0}
          >
            Pure random
          </button>
          <button
            type="button"
            className="secondary"
            onClick={onGenerateExternal}
            disabled={loading}
          >
            Find new recipe
          </button>
        </div>
      </form>

      {externalRecommendations.length > 0 ? (
        <div className="recipe-list">
          {externalRecommendations.map((option) => (
            <article className="recipe-card featured" key={option.recipe.external_id}>
              <p className="eyebrow">New Recipe Option</p>
              <h3>{option.recipe.name}</h3>
              <RecipeSummary recipe={option.recipe} />
              <RecipeContent recipe={option.recipe} />
              <p className="score-line">Match score: {Math.round(option.score * 100)}%</p>
              <ul className="reason-list">
                {option.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
              <div className="actions">
                <button
                  className="primary"
                  onClick={() => onSaveExternal(option)}
                  disabled={loading}
                >
                  Add to my recipes
                </button>
                {option.recipe.source_url && (
                  <a
                    className="secondary button-link"
                    href={option.recipe.source_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open original
                  </a>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : recommendations.length > 0 ? (
        <div className="recipe-list">
          {recommendations.map((option) => (
            <article className="recipe-card featured" key={option.recipe.id}>
              <p className="eyebrow">Saved Recipe Option</p>
              <h3>{option.recipe.name}</h3>
              <RecipeSummary recipe={option.recipe} />
              <ul className="reason-list">
                {option.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
              <button className="secondary" onClick={() => onViewRecipe(option.recipe.id)}>
                View recipe
              </button>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <h3>No pick yet</h3>
          <p>Set your constraints to rank saved recipes or find a new option.</p>
        </div>
      )}
    </div>
  );
}

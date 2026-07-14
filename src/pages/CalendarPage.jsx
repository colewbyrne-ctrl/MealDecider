export function CalendarPage({
  calendarDays,
  mealPlanEntries,
  calendarInputs,
  recipes,
  loading,
  shoppingEntryIds,
  calendarRecipeEntries,
  updateCalendarInput,
  onAddRecipeToDay,
  onAddMessageToDay,
  onGenerateMealForDay,
  onRemoveEntry,
  onAddEntryToShopping,
  onAddAllToShopping,
  onGenerateFull,
  onClear,
}) {
  return (
    <div className="calendar-page">
      <div className="calendar-toolbar">
        <div>
          <h3>Next two weeks</h3>
          <p>Plan one or more meals per day, or add reminders such as Leftovers.</p>
        </div>
        <div className="toolbar-actions">
          <button
            className="secondary"
            onClick={onAddAllToShopping}
            disabled={calendarRecipeEntries.length === 0}
          >
            Add all to shopping list
          </button>
          <button
            className="primary"
            onClick={onGenerateFull}
            disabled={loading || recipes.length === 0}
          >
            {loading ? "Generating..." : "Generate full schedule"}
          </button>
          <button
            className="danger"
            onClick={onClear}
            disabled={loading || mealPlanEntries.length === 0}
          >
            Clear calendar
          </button>
        </div>
      </div>

      <div className="calendar-grid">
        {calendarDays.map((day) => {
          const entries = mealPlanEntries.filter((entry) => entry.plan_date === day.date);
          const inputs = calendarInputs[day.date] || { recipeId: "", message: "" };
          return (
            <article className="calendar-day" key={day.date}>
              <header>
                <h3>{day.label}</h3>
                <small>{day.date}</small>
              </header>

              <div className="day-entries">
                {entries.length > 0 ? (
                  entries.map((entry) => (
                    <div className="day-entry" key={entry.id}>
                      <span>{entry.recipe?.name || entry.custom_message}</span>
                      <div className="entry-actions">
                        {entry.recipe && (
                          <button
                            className="remove-entry"
                            onClick={() => onAddEntryToShopping(entry)}
                            disabled={loading || shoppingEntryIds.includes(entry.id)}
                          >
                            {shoppingEntryIds.includes(entry.id) ? "Added" : "Shop"}
                          </button>
                        )}
                        <button
                          className="remove-entry"
                          onClick={() => onRemoveEntry(entry.id)}
                          disabled={loading}
                          aria-label={`Remove ${entry.recipe?.name || entry.custom_message}`}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="day-empty">Nothing planned yet.</p>
                )}
              </div>

              <div className="day-controls">
                <select
                  value={inputs.recipeId}
                  onChange={(event) => updateCalendarInput(day.date, "recipeId", event.target.value)}
                  aria-label={`Recipe for ${day.label}`}
                >
                  <option value="">Choose saved recipe</option>
                  {recipes.map((recipe) => (
                    <option value={recipe.id} key={recipe.id}>
                      {recipe.name}
                    </option>
                  ))}
                </select>
                <button
                  className="secondary"
                  onClick={() => onAddRecipeToDay(day.date)}
                  disabled={loading || recipes.length === 0}
                >
                  Add recipe
                </button>
                <input
                  value={inputs.message}
                  onChange={(event) => updateCalendarInput(day.date, "message", event.target.value)}
                  placeholder="Custom message, e.g. Leftovers"
                  aria-label={`Custom message for ${day.label}`}
                />
                <button
                  className="secondary"
                  onClick={() => onAddMessageToDay(day.date)}
                  disabled={loading}
                >
                  Add message
                </button>
                <button
                  className="primary"
                  onClick={() => onGenerateMealForDay(day.date)}
                  disabled={loading || recipes.length === 0}
                >
                  Generate recipe
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

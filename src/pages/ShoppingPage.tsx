import type { MealPlanEntry, RecipeCalendarEntry, ShoppingItem } from "../types";
import { formatAmount } from "../lib/ingredients";

type ShoppingPageProps = {
  calendarRecipeEntries: RecipeCalendarEntry[];
  shoppingEntryIds: number[];
  selectedShoppingEntries: RecipeCalendarEntry[];
  shoppingItems: ShoppingItem[];
  checkedShoppingItems: Record<string, boolean>;
  onAdd: (entry: MealPlanEntry) => void;
  onRemove: (entryId: number) => void;
  onAddAll: () => void;
  onDeselectAll: () => void;
  onToggleItem: (itemKey: string) => void;
};

export function ShoppingPage({
  calendarRecipeEntries,
  shoppingEntryIds,
  selectedShoppingEntries,
  shoppingItems,
  checkedShoppingItems,
  onAdd,
  onRemove,
  onAddAll,
  onDeselectAll,
  onToggleItem,
}: ShoppingPageProps) {
  return (
    <div className="shopping-page">
      <div className="shopping-layout">
        <section className="shopping-panel">
          <div className="shopping-heading">
            <div>
              <h3>Calendar recipes</h3>
              <p>{selectedShoppingEntries.length} selected for this list.</p>
            </div>
            <div className="shopping-heading-actions">
              <button
                className="secondary"
                onClick={onAddAll}
                disabled={calendarRecipeEntries.length === 0}
              >
                Add all
              </button>
              <button
                className="secondary"
                onClick={onDeselectAll}
                disabled={shoppingEntryIds.length === 0}
              >
                Deselect all
              </button>
            </div>
          </div>

          {calendarRecipeEntries.length === 0 ? (
            <div className="empty-state">
              <h3>No calendar recipes</h3>
              <p>Add recipes to the meal calendar, then build your shopping list here.</p>
            </div>
          ) : (
            <div className="shopping-recipe-list">
              {calendarRecipeEntries.map((entry) => {
                const selected = shoppingEntryIds.includes(entry.id);
                return (
                  <label className="shopping-recipe-option" key={entry.id}>
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => (selected ? onRemove(entry.id) : onAdd(entry))}
                    />
                    <span>
                      <strong>{entry.recipe.name}</strong>
                      <small>{entry.plan_date}</small>
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </section>

        <section className="shopping-panel">
          <div className="shopping-heading">
            <div>
              <h3>Shopping list</h3>
              <p>
                {shoppingItems.length} tallied item{shoppingItems.length === 1 ? "" : "s"}.
              </p>
            </div>
          </div>

          {shoppingItems.length === 0 ? (
            <div className="empty-state">
              <h3>No ingredients yet</h3>
              <p>Select calendar recipes to combine their ingredients.</p>
            </div>
          ) : (
            <div className="shopping-items">
              {shoppingItems.map((item) => {
                const checked = Boolean(checkedShoppingItems[item.key]);
                const amountText = [formatAmount(item.amount), item.unit].filter(Boolean).join(" ");
                return (
                  <label className={`shopping-item ${checked ? "checked" : ""}`} key={item.key}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggleItem(item.key)}
                    />
                    <span>
                      <strong>
                        {amountText ? `${amountText} ` : ""}
                        {item.displayName}
                      </strong>
                      <small>{item.recipeNames.join(", ")}</small>
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

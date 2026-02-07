/**
 * Cooking Dada - Main Entry Point
 *
 * A personal cooking assistant app that helps track:
 * - Ingredient inventory (stocks)
 * - Recipes and their availability based on current stock
 */
import { loadRecipes, setRecipes } from "./recipes.js";
import { loadStocks } from "./stocks.js";
import { populateIngredientList, displayStocksInfos, displayRecipes, setupStockDialog, setupRecipeDialog, setupGroceryDialog, } from "./ui.js";
// Initialize the application
async function init() {
    const recipes = await loadRecipes();
    setRecipes(recipes);
    const stocks = await loadStocks();
    console.log("App initialized:", { recipes: recipes.length, stocks: stocks.length });
}
// Start the app when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
    init().then(() => {
        console.log("Init complete");
        // Populate UI
        populateIngredientList();
        displayStocksInfos();
        displayRecipes();
        // Setup dialogs
        setupStockDialog();
        setupRecipeDialog();
        setupGroceryDialog();
    });
});

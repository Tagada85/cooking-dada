import { UnitType, parseUnit } from "./units.js";
const RECIPES_STORAGE_KEY = "recipes";
// In-memory recipe store
let recipes = [];
// Get current recipes
export function getRecipes() {
    return recipes;
}
// Set recipes (used by init)
export function setRecipes(newRecipes) {
    recipes = newRecipes;
}
// Parse raw recipe data to typed Recipe
function parseRawRecipes(rawRecipes) {
    return rawRecipes.map(recipe => ({
        name: recipe.name,
        numberPeople: recipe.numberPeople,
        ingredients: recipe.ingredients.map(ing => {
            const parsedUnit = parseUnit(ing.unit);
            if (!parsedUnit) {
                console.warn(`Unknown unit "${ing.unit}" for ingredient "${ing.name}" in recipe "${recipe.name}". Defaulting to UNIT.`);
            }
            return {
                name: ing.name,
                quantity: ing.quantity,
                unit: parsedUnit ?? UnitType.UNIT,
            };
        }),
    }));
}
// Fetch default recipes from JSON file
async function fetchDefaultRecipes() {
    const res = await fetch("recettes.json");
    if (!res.ok)
        throw new Error("Failed to load default recipes");
    return res.json();
}
// Load recipes: from localStorage if exists, otherwise seed from JSON
export async function loadRecipes() {
    const stored = localStorage.getItem(RECIPES_STORAGE_KEY);
    if (stored) {
        try {
            const rawRecipes = JSON.parse(stored);
            return parseRawRecipes(rawRecipes);
        }
        catch (e) {
            console.error("Failed to parse recipes from localStorage:", e);
        }
    }
    // First load or corrupted data: seed from JSON
    console.log("Seeding recipes from default JSON...");
    const defaultRecipes = await fetchDefaultRecipes();
    localStorage.setItem(RECIPES_STORAGE_KEY, JSON.stringify(defaultRecipes));
    return parseRawRecipes(defaultRecipes);
}
// Save recipes to localStorage
export function saveRecipes() {
    const raw = recipes.map(r => ({
        name: r.name,
        numberPeople: r.numberPeople,
        ingredients: r.ingredients.map(ing => ({
            name: ing.name,
            quantity: ing.quantity,
            unit: ing.unit,
        })),
    }));
    localStorage.setItem(RECIPES_STORAGE_KEY, JSON.stringify(raw));
}
// Add a new recipe
export function addRecipe(recipe) {
    recipes.push(recipe);
    saveRecipes();
}
// Update an existing recipe by index
export function updateRecipe(index, recipe) {
    if (index >= 0 && index < recipes.length) {
        recipes[index] = recipe;
        saveRecipes();
    }
}
// Delete a recipe by index
export function deleteRecipe(index) {
    if (index >= 0 && index < recipes.length) {
        recipes.splice(index, 1);
        saveRecipes();
    }
}

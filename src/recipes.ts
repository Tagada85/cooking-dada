import { UnitType, parseUnit } from "./units.js";
import { Recipe, RawRecipe } from "./types.js";

const RECIPES_STORAGE_KEY = "recipes";

// In-memory recipe store
let recipes: Recipe[] = [];

// Get current recipes
export function getRecipes(): Recipe[] {
  return recipes;
}

// Set recipes (used by init)
export function setRecipes(newRecipes: Recipe[]): void {
  recipes = newRecipes;
}

// Parse raw recipe data to typed Recipe
function parseRawRecipes(rawRecipes: RawRecipe[]): Recipe[] {
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
async function fetchDefaultRecipes(): Promise<RawRecipe[]> {
  const res = await fetch("recettes.json");
  if (!res.ok) throw new Error("Failed to load default recipes");
  return res.json();
}

// Load recipes: from localStorage if exists, otherwise seed from JSON
export async function loadRecipes(): Promise<Recipe[]> {
  const stored = localStorage.getItem(RECIPES_STORAGE_KEY);

  if (stored) {
    try {
      const rawRecipes: RawRecipe[] = JSON.parse(stored);
      return parseRawRecipes(rawRecipes);
    } catch (e) {
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
export function saveRecipes(): void {
  const raw: RawRecipe[] = recipes.map(r => ({
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
export function addRecipe(recipe: Recipe): void {
  recipes.push(recipe);
  saveRecipes();
}

// Update an existing recipe by index
export function updateRecipe(index: number, recipe: Recipe): void {
  if (index >= 0 && index < recipes.length) {
    recipes[index] = recipe;
    saveRecipes();
  }
}

// Delete a recipe by index
export function deleteRecipe(index: number): void {
  if (index >= 0 && index < recipes.length) {
    recipes.splice(index, 1);
    saveRecipes();
  }
}

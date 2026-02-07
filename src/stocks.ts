import { UnitType, parseUnit, toBaseUnit, formatQuantity, BASE_UNITS, getUnitDimension } from "./units.js";
import { Stock, Ingredient, Recipe } from "./types.js";

const STOCKS_STORAGE_KEY = "stocks";

// Load stocks from localStorage
export async function loadStocks(): Promise<Stock[]> {
  const raw = localStorage.getItem(STOCKS_STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return parsed.map((item: { name: string; quantity: number; unit: string }) => {
      const parsedUnit = parseUnit(item.unit);
      if (!parsedUnit) {
        console.warn(`Unknown unit "${item.unit}" for stock "${item.name}". Defaulting to UNIT.`);
      }
      return {
        name: item.name,
        quantity: item.quantity,
        unit: parsedUnit ?? UnitType.UNIT,
      };
    });
  } catch (e) {
    console.error("Failed to parse stocks from localStorage:", e);
    return [];
  }
}

// Save stocks to localStorage
export function saveStocks(stocks: Stock[]): void {
  localStorage.setItem(STOCKS_STORAGE_KEY, JSON.stringify(stocks));
}

// Add a single ingredient to stock (internal function)
function addSingleIngredientToStock(
  ingredient: Ingredient,
  actualStocks: Stock[]
): { success: boolean; error?: string } {
  const stockIndex = actualStocks.findIndex(
    (stock: Stock) => stock.name.toLowerCase() === ingredient.name.toLowerCase()
  );

  const normalized = toBaseUnit(ingredient.quantity, ingredient.unit);
  const baseUnit = BASE_UNITS[normalized.dimension];

  if (stockIndex !== -1) {
    const existingStock = actualStocks[stockIndex];
    const existingDimension = getUnitDimension(existingStock.unit);

    if (existingDimension !== normalized.dimension) {
      return {
        success: false,
        error: `${ingredient.name}: impossible d'ajouter ${formatQuantity(ingredient.quantity, ingredient.unit)} à un stock en ${formatQuantity(existingStock.quantity, existingStock.unit)}`
      };
    }

    const existingNormalized = toBaseUnit(existingStock.quantity, existingStock.unit);
    actualStocks[stockIndex] = {
      name: existingStock.name,
      quantity: existingNormalized.quantity + normalized.quantity,
      unit: baseUnit,
    };
  } else {
    actualStocks.push({
      name: ingredient.name,
      quantity: normalized.quantity,
      unit: baseUnit,
    });
  }

  return { success: true };
}

// Add multiple ingredients to stock (batch)
export async function addMultipleToStock(ingredients: Ingredient[]): Promise<string[]> {
  const actualStocks: Stock[] = await loadStocks();
  const errors: string[] = [];

  for (const ingredient of ingredients) {
    if (!ingredient.name.trim() || ingredient.quantity <= 0) {
      continue;
    }
    const result = addSingleIngredientToStock(ingredient, actualStocks);
    if (!result.success && result.error) {
      errors.push(result.error);
    }
  }

  saveStocks(actualStocks);
  return errors;
}

// Cook a recipe: deduct ingredients from stock
export async function cookRecipe(recipe: Recipe): Promise<{ success: boolean; deducted: string[]; missing: string[] }> {
  const actualStocks: Stock[] = await loadStocks();
  const deducted: string[] = [];
  const missing: string[] = [];

  for (const ingredient of recipe.ingredients) {
    const stockIndex = actualStocks.findIndex(
      (stock: Stock) => stock.name.toLowerCase() === ingredient.name.toLowerCase()
    );

    if (stockIndex === -1) {
      missing.push(`${ingredient.name} (pas en stock)`);
      continue;
    }

    const stock = actualStocks[stockIndex];
    const stockDimension = getUnitDimension(stock.unit);
    const ingredientNormalized = toBaseUnit(ingredient.quantity, ingredient.unit);

    if (stockDimension !== ingredientNormalized.dimension) {
      missing.push(`${ingredient.name} (unité incompatible)`);
      continue;
    }

    const stockNormalized = toBaseUnit(stock.quantity, stock.unit);
    const remaining = stockNormalized.quantity - ingredientNormalized.quantity;

    if (remaining < 0) {
      const hadQuantity = formatQuantity(stock.quantity, stock.unit);
      const neededQuantity = formatQuantity(ingredient.quantity, ingredient.unit);
      missing.push(`${ingredient.name} (avait ${hadQuantity}, besoin ${neededQuantity})`);
      actualStocks.splice(stockIndex, 1);
      deducted.push(`${ingredient.name}: ${hadQuantity} utilisé (stock épuisé)`);
    } else if (remaining === 0) {
      actualStocks.splice(stockIndex, 1);
      deducted.push(`${formatQuantity(ingredient.quantity, ingredient.unit)} ${ingredient.name}`);
    } else {
      actualStocks[stockIndex] = {
        name: stock.name,
        quantity: remaining,
        unit: BASE_UNITS[ingredientNormalized.dimension],
      };
      deducted.push(`${formatQuantity(ingredient.quantity, ingredient.unit)} ${ingredient.name}`);
    }
  }

  saveStocks(actualStocks);
  return { success: missing.length === 0, deducted, missing };
}

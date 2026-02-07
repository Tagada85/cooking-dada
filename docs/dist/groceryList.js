import { toBaseUnit, getUnitDimension, BASE_UNITS } from "./units.js";
import { loadStocks } from "./stocks.js";
const GROCERY_STORAGE_KEY = "groceryList";
// ===== Storage =====
export function getGroceryList() {
    const stored = localStorage.getItem(GROCERY_STORAGE_KEY);
    if (!stored)
        return [];
    return JSON.parse(stored);
}
export function saveGroceryList(list) {
    localStorage.setItem(GROCERY_STORAGE_KEY, JSON.stringify(list));
}
export function clearGroceryList() {
    localStorage.removeItem(GROCERY_STORAGE_KEY);
}
// ===== Add Missing Ingredients from Recipe =====
export async function addRecipeToGroceryList(ingredients) {
    const stocks = await loadStocks();
    const currentList = getGroceryList();
    const added = [];
    const skipped = [];
    for (const ingredient of ingredients) {
        // Find matching stock
        const stock = stocks.find((s) => s.name.toLowerCase() === ingredient.name.toLowerCase());
        // Normalize ingredient to base unit
        const ingredientNormalized = toBaseUnit(ingredient.quantity, ingredient.unit);
        const dimension = ingredientNormalized.dimension;
        const baseUnit = BASE_UNITS[dimension];
        let neededQuantity;
        if (!stock) {
            // Ingredient completely missing from stock
            neededQuantity = ingredientNormalized.quantity;
        }
        else {
            // Check if units are compatible
            const stockDimension = getUnitDimension(stock.unit);
            if (stockDimension !== dimension) {
                // Incompatible units, treat as completely missing
                neededQuantity = ingredientNormalized.quantity;
            }
            else {
                // Calculate difference
                const stockNormalized = toBaseUnit(stock.quantity, stock.unit);
                const difference = ingredientNormalized.quantity - stockNormalized.quantity;
                if (difference <= 0) {
                    // Have enough in stock, skip
                    skipped.push(ingredient.name);
                    continue;
                }
                neededQuantity = difference;
            }
        }
        // Add to grocery list (merge with existing if present)
        addItemToGroceryList(currentList, {
            name: ingredient.name,
            quantity: neededQuantity,
            unit: baseUnit,
            checked: false,
        });
        added.push({
            name: ingredient.name,
            quantity: neededQuantity,
            unit: baseUnit,
            checked: false,
        });
    }
    saveGroceryList(currentList);
    return { added, skipped };
}
// ===== Helper: Add/Merge Item =====
function addItemToGroceryList(list, item) {
    const existingIndex = list.findIndex((i) => i.name.toLowerCase() === item.name.toLowerCase());
    if (existingIndex !== -1) {
        // Merge quantities (assume same unit since we normalize to base units)
        const existing = list[existingIndex];
        const existingDimension = getUnitDimension(existing.unit);
        const newDimension = getUnitDimension(item.unit);
        if (existingDimension === newDimension) {
            // Same dimension, add quantities
            const existingNormalized = toBaseUnit(existing.quantity, existing.unit);
            const newNormalized = toBaseUnit(item.quantity, item.unit);
            list[existingIndex] = {
                name: existing.name,
                quantity: existingNormalized.quantity + newNormalized.quantity,
                unit: BASE_UNITS[existingDimension],
                checked: existing.checked, // Preserve checked state
            };
        }
        else {
            // Different dimensions (shouldn't happen, but add as new item)
            list.push(item);
        }
    }
    else {
        // New item
        list.push(item);
    }
}
// ===== Remove Item =====
export function removeFromGroceryList(index) {
    const list = getGroceryList();
    if (index >= 0 && index < list.length) {
        list.splice(index, 1);
        saveGroceryList(list);
    }
}
// ===== Toggle Checked State =====
export function toggleGroceryItemChecked(index) {
    const list = getGroceryList();
    if (index >= 0 && index < list.length) {
        list[index].checked = !list[index].checked;
        saveGroceryList(list);
    }
}
// ===== Update Item Quantity =====
export function updateGroceryItemQuantity(index, newQuantity) {
    const list = getGroceryList();
    if (index >= 0 && index < list.length && newQuantity > 0) {
        list[index].quantity = newQuantity;
        saveGroceryList(list);
    }
}
// ===== Get Checked Items =====
export function getCheckedItems() {
    return getGroceryList().filter(item => item.checked);
}
// ===== Remove Checked Items (keep unchecked) =====
export function removeCheckedItems() {
    const list = getGroceryList().filter(item => !item.checked);
    saveGroceryList(list);
}

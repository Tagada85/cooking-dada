/**
 * Unit conversion and normalization utilities
 *
 * All quantities are normalized to base units internally:
 * - Mass: grams (GRAM)
 * - Volume: milliliters (ML)
 * - Count: units (UNIT)
 */
export var UnitType;
(function (UnitType) {
    UnitType["KILO"] = "KILO";
    UnitType["GRAM"] = "GRAM";
    UnitType["LITRE"] = "LITRE";
    UnitType["ML"] = "ML";
    UnitType["UNIT"] = "UNIT";
})(UnitType || (UnitType = {}));
// Base units for each dimension
export const BASE_UNITS = {
    MASS: UnitType.GRAM,
    VOLUME: UnitType.ML,
    COUNT: UnitType.UNIT,
};
// Unit definitions with conversion factors
const UNIT_DEFINITIONS = {
    [UnitType.GRAM]: { type: UnitType.GRAM, dimension: "MASS", toBase: 1 },
    [UnitType.KILO]: { type: UnitType.KILO, dimension: "MASS", toBase: 1000 },
    [UnitType.ML]: { type: UnitType.ML, dimension: "VOLUME", toBase: 1 },
    [UnitType.LITRE]: { type: UnitType.LITRE, dimension: "VOLUME", toBase: 1000 },
    [UnitType.UNIT]: { type: UnitType.UNIT, dimension: "COUNT", toBase: 1 },
};
// Map of all recognized unit strings to their canonical UnitType
// This handles variations from JSON, user input, etc.
const UNIT_ALIASES = {
    // Mass - grams
    gram: UnitType.GRAM,
    grams: UnitType.GRAM,
    gramme: UnitType.GRAM,
    grammes: UnitType.GRAM,
    g: UnitType.GRAM,
    GRAM: UnitType.GRAM,
    GRAMME: UnitType.GRAM,
    // Mass - kilos
    kilo: UnitType.KILO,
    kilos: UnitType.KILO,
    kilogram: UnitType.KILO,
    kilograms: UnitType.KILO,
    kilogramme: UnitType.KILO,
    kilogrammes: UnitType.KILO,
    kg: UnitType.KILO,
    KILO: UnitType.KILO,
    // Volume - milliliters
    ml: UnitType.ML,
    ML: UnitType.ML,
    milliliter: UnitType.ML,
    milliliters: UnitType.ML,
    millilitre: UnitType.ML,
    millilitres: UnitType.ML,
    MILLILITRE: UnitType.ML,
    // Volume - liters
    litre: UnitType.LITRE,
    litres: UnitType.LITRE,
    liter: UnitType.LITRE,
    liters: UnitType.LITRE,
    l: UnitType.LITRE,
    L: UnitType.LITRE,
    LITRE: UnitType.LITRE,
    // Count
    unit: UnitType.UNIT,
    units: UnitType.UNIT,
    unité: UnitType.UNIT,
    unités: UnitType.UNIT,
    piece: UnitType.UNIT,
    pieces: UnitType.UNIT,
    pièce: UnitType.UNIT,
    pièces: UnitType.UNIT,
    UNIT: UnitType.UNIT,
};
/**
 * Parse a unit string (from JSON or user input) to canonical UnitType
 * Returns null if the unit is not recognized
 */
export function parseUnit(unitString) {
    const trimmed = unitString.trim();
    return UNIT_ALIASES[trimmed] ?? null;
}
/**
 * Get the dimension of a unit type
 */
export function getUnitDimension(unit) {
    return UNIT_DEFINITIONS[unit].dimension;
}
/**
 * Check if two units are compatible (same dimension)
 */
export function areUnitsCompatible(unit1, unit2) {
    return getUnitDimension(unit1) === getUnitDimension(unit2);
}
/**
 * Convert a quantity to its base unit (grams, ml, or count)
 */
export function toBaseUnit(quantity, unit) {
    const definition = UNIT_DEFINITIONS[unit];
    const baseUnit = BASE_UNITS[definition.dimension];
    return {
        quantity: quantity * definition.toBase,
        unit: baseUnit,
        dimension: definition.dimension,
    };
}
/**
 * Compare two quantities, handling unit conversion
 * Returns:
 *  - positive if qty1 > qty2
 *  - negative if qty1 < qty2
 *  - 0 if equal
 *  - null if units are incompatible (different dimensions)
 */
export function compareQuantities(qty1, unit1, qty2, unit2) {
    if (!areUnitsCompatible(unit1, unit2)) {
        return null;
    }
    const base1 = toBaseUnit(qty1, unit1);
    const base2 = toBaseUnit(qty2, unit2);
    return base1.quantity - base2.quantity;
}
/**
 * Check if quantity1 >= quantity2, handling unit conversion
 * Returns false if units are incompatible
 */
export function hasEnough(stockQty, stockUnit, neededQty, neededUnit) {
    const comparison = compareQuantities(stockQty, stockUnit, neededQty, neededUnit);
    return comparison !== null && comparison >= 0;
}
/**
 * Format a quantity with its unit for display
 */
export function formatQuantity(quantity, unit) {
    const displayNames = {
        [UnitType.GRAM]: "g",
        [UnitType.KILO]: "kg",
        [UnitType.ML]: "ml",
        [UnitType.LITRE]: "L",
        [UnitType.UNIT]: "unité(s)",
    };
    // Round to 2 decimal places for display
    const rounded = Math.round(quantity * 100) / 100;
    return `${rounded} ${displayNames[unit]}`;
}

import { UnitType } from "./units.js";

export type Ingredient = {
  name: string;
  quantity: number;
  unit: UnitType;
};

export type Recipe = {
  name: string;
  numberPeople: number;
  ingredients: Ingredient[];
};

export type Stock = {
  name: string;
  quantity: number;
  unit: UnitType;
};

// Raw types for JSON/localStorage parsing
export type RawIngredient = {
  name: string;
  quantity: number;
  unit: string;
};

export type RawRecipe = {
  name: string;
  numberPeople: number;
  ingredients: RawIngredient[];
};

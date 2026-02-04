/*
Modèle de données:

J'ai 1 kilo de riz
J'ai 3 pâtes feuilletés
J'ai 2 kilos de farine de blé
J'ai 12 oeufs


Modèle stocks

{"name": "Riz basmati", "quantity": "1", "unit": "kilo"}

Modèle Recettes

{
"name": "Risotto Champignons",
"nbrePersonnes": 6,
"ingredients": [
{name: "riz rond",  "quantity": 1, "unit": "kilo"},
{name: "vin blanc", "quantity": "0.25", "unit": "litre"}
}
}

Modèle equivalence pour les trucs approximatifs


ex:
{"unit": "cuillère à soupe", "eq": {"quantity":"5", "unit": "grammes"}}

 */

export enum UnitType {
  KILO="Kilo",
  UNIT="Unité",
  LITRE="Litre",
  GRAMME="Gramme",
  TABLESPOON="Cuillère à soupe",
  COFFEESPOON="Cuillère à café"
}

export type Stock = {name: string; quantity: number, unit: UnitType};

const updateStocks = (stock: Stock) => {
  const stocks = JSON.parse(<string>localStorage.getItem("stocks")) || [];
  const index = stocks.findIndex((s: Stock) => s.name === stock.name);
  if(index !== -1 ) {
    stocks[index] = stock;
    localStorage.setItem("stocks", JSON.stringify(stocks));
  } else {
    stocks.push(stock);
  }
}

async function loadRecipes() {
  const res = await fetch("/recettes.json");
  if (!res.ok) throw new Error("Failed to load recipes");
  return res.json();
}



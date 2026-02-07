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
export var UnitType;
(function (UnitType) {
    UnitType["KILO"] = "Kilo";
    UnitType["UNIT"] = "Unit\u00E9";
    UnitType["LITRE"] = "Litre";
    UnitType["GRAMME"] = "Gramme";
    UnitType["TABLESPOON"] = "Cuill\u00E8re \u00E0 soupe";
    UnitType["COFFEESPOON"] = "Cuill\u00E8re \u00E0 caf\u00E9";
})(UnitType || (UnitType = {}));
const updateStocks = (stock) => {
    const stocks = JSON.parse(localStorage.getItem("stocks")) || [];
    const index = stocks.findIndex((s) => s.name === stock.name);
    if (index !== -1) {
        stocks[index] = stock;
        localStorage.setItem("stocks", JSON.stringify(stocks));
    }
    else {
        stocks.push(stock);
    }
};
async function loadRecipes() {
    const res = await fetch("/recettes.json");
    if (!res.ok)
        throw new Error("Failed to load recipes");
    return res.json();
}

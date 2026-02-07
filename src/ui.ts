import { UnitType, hasEnough, formatQuantity } from "./units.js";
import { Stock, Ingredient, Recipe } from "./types.js";
import { loadStocks, addMultipleToStock, cookRecipe } from "./stocks.js";
import { getRecipes, addRecipe, updateRecipe, deleteRecipe } from "./recipes.js";

// ===== Ingredient List Autocomplete =====

export async function populateIngredientList(): Promise<void> {
  const datalist = document.getElementById("ingredients-list") as HTMLDataListElement;
  if (!datalist) return;

  datalist.innerHTML = "";
  const stocks = await loadStocks();

  for (const stock of stocks) {
    const option = document.createElement("option");
    option.value = stock.name;
    datalist.appendChild(option);
  }
}

// ===== Stock Display =====

export async function displayStocksInfos(): Promise<void> {
  const container = document.getElementById("stocksInfosContainer") as HTMLDivElement;
  const stocks: Stock[] = await loadStocks();
  container.innerHTML = "";

  if (stocks.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>Ton inventaire est vide. Ajoute des ingrédients pour commencer !</p>
      </div>
    `;
    return;
  }

  for (const stock of stocks) {
    const item = document.createElement("div");
    item.className = "stock-item";
    item.innerHTML = `
      <span class="stock-name">${stock.name}</span>
      <span class="stock-quantity">${formatQuantity(stock.quantity, stock.unit)}</span>
    `;
    container.appendChild(item);
  }
}

// ===== Recipe Display =====

function computeRecipeAvailability(recipe: Recipe, stocks: Stock[]): boolean {
  return recipe.ingredients.every(ingredient => {
    const correspondingStock = stocks.find(
      stock => stock.name.toLowerCase() === ingredient.name.toLowerCase()
    );
    if (!correspondingStock) return false;

    return hasEnough(
      correspondingStock.quantity,
      correspondingStock.unit,
      ingredient.quantity,
      ingredient.unit
    );
  });
}

async function handleCookRecipe(recipeIndex: number): Promise<void> {
  const recipes = getRecipes();
  const recipe = recipes[recipeIndex];
  if (!recipe) return;

  const confirmMsg = `Cuisiner "${recipe.name}" pour ${recipe.numberPeople} personnes ?\n\nLes ingrédients seront déduits de ton stock.`;
  if (!confirm(confirmMsg)) return;

  const result = await cookRecipe(recipe);

  let message = `✅ "${recipe.name}" cuisiné !\n\n`;

  if (result.deducted.length > 0) {
    message += `Ingrédients utilisés:\n${result.deducted.map(d => `  • ${d}`).join('\n')}`;
  }

  if (result.missing.length > 0) {
    message += `\n\n⚠️ Ingrédients manquants ou insuffisants:\n${result.missing.map(m => `  • ${m}`).join('\n')}`;
  }

  alert(message);

  populateIngredientList();
  displayStocksInfos();
  displayRecipes();
}

export async function displayRecipes(): Promise<void> {
  const container = document.getElementById("recipesContainer") as HTMLDivElement;
  container.innerHTML = "";
  const stocks = await loadStocks();
  const recipes = getRecipes();

  if (recipes.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>Aucune recette disponible. Ajoute ta première recette !</p>
      </div>
    `;
    return;
  }

  recipes.forEach((recipe, index) => {
    const isAvailable = computeRecipeAvailability(recipe, stocks);
    const statusClass = isAvailable ? "recipe-available" : "recipe-unavailable";
    const statusText = isAvailable ? "Prêt !" : "Manque";

    const ingredientsList = recipe.ingredients
      .map(ing => `${formatQuantity(ing.quantity, ing.unit)} ${ing.name}`)
      .join(" • ");

    const card = document.createElement("article");
    card.className = `recipe-card ${statusClass}`;
    card.dataset.recipeIndex = String(index);
    card.innerHTML = `
      <span class="status-badge">${statusText}</span>
      <div class="card-content">
        <h3>${recipe.name}</h3>
        <div class="recipe-meta">
          <span class="meta-item">👥 ${recipe.numberPeople} pers.</span>
        </div>
        <div class="ingredients-label">Ingrédients</div>
        <p class="ingredients-list">${ingredientsList}</p>
        <div class="recipe-actions">
          <button class="btn-cook-recipe ${isAvailable ? '' : 'btn-cook-warning'}" data-index="${index}" title="${isAvailable ? 'Cuisiner' : 'Cuisiner (ingrédients manquants)'}">
            🍳 Cuisiner
          </button>
          <button class="btn-edit-recipe" data-index="${index}" title="Modifier">✏️</button>
          <button class="btn-delete-recipe" data-index="${index}" title="Supprimer">🗑️</button>
        </div>
      </div>
    `;

    // Event listeners
    const cookBtn = card.querySelector(".btn-cook-recipe") as HTMLButtonElement;
    const editBtn = card.querySelector(".btn-edit-recipe") as HTMLButtonElement;
    const deleteBtn = card.querySelector(".btn-delete-recipe") as HTMLButtonElement;

    cookBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      handleCookRecipe(index);
    });

    editBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openRecipeDialog(index);
    });

    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (confirm(`Supprimer la recette "${recipe.name}" ?`)) {
        deleteRecipe(index);
        displayRecipes();
      }
    });

    container.appendChild(card);
  });
}

// ===== Stock Dialog =====

let stockRowCounter = 0;

function createStockRow(): HTMLDivElement {
  const row = document.createElement("div");
  row.className = "stock-row";
  row.dataset.rowId = String(stockRowCounter++);

  row.innerHTML = `
    <input type="text" class="row-name" placeholder="Ingrédient..." list="ingredients-list" required />
    <input type="number" class="row-qty" placeholder="Qté" step="0.01" min="0" required />
    <select class="row-unit">
      <option value="GRAM">g</option>
      <option value="KILO">kg</option>
      <option value="LITRE">L</option>
      <option value="ML">ml</option>
      <option value="UNIT">unité</option>
    </select>
    <button type="button" class="btn-remove-row" title="Supprimer">×</button>
  `;

  const removeBtn = row.querySelector(".btn-remove-row") as HTMLButtonElement;
  removeBtn.addEventListener("click", () => {
    row.remove();
    updateStockRemoveButtons();
  });

  return row;
}

function updateStockRemoveButtons(): void {
  const rows = document.querySelectorAll("#stock-rows .stock-row");
  const removeButtons = document.querySelectorAll("#stock-rows .btn-remove-row") as NodeListOf<HTMLButtonElement>;
  removeButtons.forEach(btn => {
    btn.disabled = rows.length <= 1;
  });
}

function initStockRows(): void {
  const container = document.getElementById("stock-rows") as HTMLDivElement;
  container.innerHTML = "";
  stockRowCounter = 0;

  const header = document.createElement("div");
  header.className = "stock-row-header";
  header.innerHTML = `
    <span>Ingrédient</span>
    <span>Quantité</span>
    <span>Unité</span>
    <span></span>
  `;
  container.appendChild(header);
  container.appendChild(createStockRow());
  updateStockRemoveButtons();
}

function collectStockRows(): Ingredient[] {
  const rows = document.querySelectorAll("#stock-rows .stock-row");
  const ingredients: Ingredient[] = [];

  rows.forEach(row => {
    const name = (row.querySelector(".row-name") as HTMLInputElement).value.trim();
    const quantity = parseFloat((row.querySelector(".row-qty") as HTMLInputElement).value) || 0;
    const unit = (row.querySelector(".row-unit") as HTMLSelectElement).value as UnitType;

    if (name && quantity > 0) {
      ingredients.push({ name, quantity, unit });
    }
  });

  return ingredients;
}

export function setupStockDialog(): void {
  const dialog = document.getElementById("stockDialog") as HTMLDialogElement;
  const addRowBtn = document.getElementById("addRowBtn") as HTMLButtonElement;
  const submitBtn = document.getElementById("submitStocks") as HTMLButtonElement;
  const cancelBtn = document.getElementById("cancelStock") as HTMLButtonElement;
  const stockUpdateBtn = document.getElementById("stockUpdate") as HTMLButtonElement;

  stockUpdateBtn.addEventListener("click", () => {
    initStockRows();
    dialog.showModal();
    document.body.classList.add("dialog-open");
    const firstInput = dialog.querySelector(".row-name") as HTMLInputElement;
    if (firstInput) firstInput.focus();
  });

  dialog.addEventListener("close", () => {
    document.body.classList.remove("dialog-open");
  });

  addRowBtn.addEventListener("click", () => {
    const container = document.getElementById("stock-rows") as HTMLDivElement;
    const newRow = createStockRow();
    container.appendChild(newRow);
    updateStockRemoveButtons();
    (newRow.querySelector(".row-name") as HTMLInputElement).focus();
  });

  submitBtn.addEventListener("click", async () => {
    const ingredients = collectStockRows();

    if (ingredients.length === 0) {
      alert("Ajoute au moins un ingrédient avec un nom et une quantité.");
      return;
    }

    const errors = await addMultipleToStock(ingredients);
    if (errors.length > 0) {
      alert(`Certains ingrédients n'ont pas pu être ajoutés:\n\n${errors.join('\n')}`);
    }

    populateIngredientList();
    displayStocksInfos();
    displayRecipes();
    dialog.close();
  });

  cancelBtn.addEventListener("click", () => {
    dialog.close();
  });

  dialog.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT") {
        e.preventDefault();
        addRowBtn.click();
      }
    }
  });
}

// ===== Recipe Dialog =====

let recipeRowCounter = 0;
let editingRecipeIndex: number | null = null;

function createRecipeIngredientRow(ingredient?: Ingredient): HTMLDivElement {
  const row = document.createElement("div");
  row.className = "stock-row";
  row.dataset.rowId = String(recipeRowCounter++);

  row.innerHTML = `
    <input type="text" class="row-name" placeholder="Ingrédient..." value="${ingredient?.name || ''}" required />
    <input type="number" class="row-qty" placeholder="Qté" step="0.01" min="0" value="${ingredient?.quantity || ''}" required />
    <select class="row-unit">
      <option value="GRAM" ${ingredient?.unit === UnitType.GRAM ? 'selected' : ''}>g</option>
      <option value="KILO" ${ingredient?.unit === UnitType.KILO ? 'selected' : ''}>kg</option>
      <option value="LITRE" ${ingredient?.unit === UnitType.LITRE ? 'selected' : ''}>L</option>
      <option value="ML" ${ingredient?.unit === UnitType.ML ? 'selected' : ''}>ml</option>
      <option value="UNIT" ${ingredient?.unit === UnitType.UNIT ? 'selected' : ''}>unité</option>
    </select>
    <button type="button" class="btn-remove-row" title="Supprimer">×</button>
  `;

  const removeBtn = row.querySelector(".btn-remove-row") as HTMLButtonElement;
  removeBtn.addEventListener("click", () => {
    row.remove();
    updateRecipeRemoveButtons();
  });

  return row;
}

function updateRecipeRemoveButtons(): void {
  const rows = document.querySelectorAll("#recipe-ingredient-rows .stock-row");
  const removeButtons = document.querySelectorAll("#recipe-ingredient-rows .btn-remove-row") as NodeListOf<HTMLButtonElement>;
  removeButtons.forEach(btn => {
    btn.disabled = rows.length <= 1;
  });
}

function initRecipeForm(recipe?: Recipe): void {
  const container = document.getElementById("recipe-ingredient-rows") as HTMLDivElement;
  const nameInput = document.getElementById("recipe-name") as HTMLInputElement;
  const peopleInput = document.getElementById("recipe-people") as HTMLInputElement;
  const dialogTitle = document.getElementById("recipe-dialog-title") as HTMLHeadingElement;

  container.innerHTML = "";
  recipeRowCounter = 0;

  const header = document.createElement("div");
  header.className = "stock-row-header";
  header.innerHTML = `
    <span>Ingrédient</span>
    <span>Quantité</span>
    <span>Unité</span>
    <span></span>
  `;
  container.appendChild(header);

  if (recipe) {
    dialogTitle.textContent = "Modifier la recette";
    nameInput.value = recipe.name;
    peopleInput.value = String(recipe.numberPeople);
    recipe.ingredients.forEach(ing => {
      container.appendChild(createRecipeIngredientRow(ing));
    });
  } else {
    dialogTitle.textContent = "Nouvelle recette";
    nameInput.value = "";
    peopleInput.value = "4";
    container.appendChild(createRecipeIngredientRow());
  }

  updateRecipeRemoveButtons();
}

function collectRecipeData(): Recipe | null {
  const nameInput = document.getElementById("recipe-name") as HTMLInputElement;
  const peopleInput = document.getElementById("recipe-people") as HTMLInputElement;
  const rows = document.querySelectorAll("#recipe-ingredient-rows .stock-row");

  const name = nameInput.value.trim();
  const numberPeople = parseInt(peopleInput.value) || 4;

  if (!name) {
    alert("Le nom de la recette est requis.");
    nameInput.focus();
    return null;
  }

  const ingredients: Ingredient[] = [];
  rows.forEach(row => {
    const ingName = (row.querySelector(".row-name") as HTMLInputElement).value.trim();
    const quantity = parseFloat((row.querySelector(".row-qty") as HTMLInputElement).value) || 0;
    const unit = (row.querySelector(".row-unit") as HTMLSelectElement).value as UnitType;

    if (ingName && quantity > 0) {
      ingredients.push({ name: ingName, quantity, unit });
    }
  });

  if (ingredients.length === 0) {
    alert("Ajoute au moins un ingrédient.");
    return null;
  }

  return { name, numberPeople, ingredients };
}

function openRecipeDialog(recipeIndex?: number): void {
  const dialog = document.getElementById("recipeDialog") as HTMLDialogElement;
  const recipes = getRecipes();

  if (recipeIndex !== undefined && recipeIndex >= 0 && recipeIndex < recipes.length) {
    editingRecipeIndex = recipeIndex;
    initRecipeForm(recipes[recipeIndex]);
  } else {
    editingRecipeIndex = null;
    initRecipeForm();
  }

  dialog.showModal();
  document.body.classList.add("dialog-open");
  (document.getElementById("recipe-name") as HTMLInputElement).focus();
}

export function setupRecipeDialog(): void {
  const dialog = document.getElementById("recipeDialog") as HTMLDialogElement;
  const addIngredientBtn = document.getElementById("addRecipeIngredientBtn") as HTMLButtonElement;
  const submitBtn = document.getElementById("submitRecipe") as HTMLButtonElement;
  const cancelBtn = document.getElementById("cancelRecipe") as HTMLButtonElement;
  const addRecipeBtn = document.getElementById("addRecipe") as HTMLButtonElement;

  addRecipeBtn.addEventListener("click", () => {
    openRecipeDialog();
  });

  addIngredientBtn.addEventListener("click", () => {
    const container = document.getElementById("recipe-ingredient-rows") as HTMLDivElement;
    const newRow = createRecipeIngredientRow();
    container.appendChild(newRow);
    updateRecipeRemoveButtons();
    (newRow.querySelector(".row-name") as HTMLInputElement).focus();
  });

  submitBtn.addEventListener("click", () => {
    const recipeData = collectRecipeData();
    if (!recipeData) return;

    if (editingRecipeIndex !== null) {
      updateRecipe(editingRecipeIndex, recipeData);
    } else {
      addRecipe(recipeData);
    }

    displayRecipes();
    dialog.close();
  });

  cancelBtn.addEventListener("click", () => {
    dialog.close();
  });

  dialog.addEventListener("close", () => {
    document.body.classList.remove("dialog-open");
  });

  dialog.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      const target = e.target as HTMLElement;
      if (target.classList.contains("row-name") || target.classList.contains("row-qty")) {
        e.preventDefault();
        addIngredientBtn.click();
      }
    }
  });
}

import { UnitType, hasEnough, formatQuantity } from "./units.js";
import { Stock, Ingredient, Recipe } from "./types.js";
import { loadStocks, addMultipleToStock, cookRecipe } from "./stocks.js";
import { getRecipes, addRecipe, updateRecipe, deleteRecipe, getAllTags } from "./recipes.js";
import { 
  addRecipeToGroceryList, 
  getGroceryList, 
  removeFromGroceryList, 
  clearGroceryList,
  toggleGroceryItemChecked,
  updateGroceryItemQuantity,
  getCheckedItems,
  removeCheckedItems,
  GroceryItem
} from "./groceryList.js";
import { importRecipeFromUrl } from "./recipeImport.js";

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

// Track scaled portions per recipe index (key: recipe index, value: scaled number of people)
const scaledPortions: Map<number, number> = new Map();

function getScaledPortions(recipeIndex: number, basePortions: number): number {
  return scaledPortions.get(recipeIndex) ?? basePortions;
}

function setScaledPortions(recipeIndex: number, portions: number): void {
  scaledPortions.set(recipeIndex, portions);
}

function scaleIngredients(ingredients: Ingredient[], basePeople: number, scaledPeople: number): Ingredient[] {
  const scale = scaledPeople / basePeople;
  return ingredients.map(ing => ({
    ...ing,
    quantity: ing.quantity * scale
  }));
}

function computeRecipeAvailability(recipe: Recipe, stocks: Stock[], scaledPeople?: number): boolean {
  const ingredients = scaledPeople 
    ? scaleIngredients(recipe.ingredients, recipe.numberPeople, scaledPeople)
    : recipe.ingredients;
    
  return ingredients.every(ingredient => {
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

  const scaledPeople = getScaledPortions(recipeIndex, recipe.numberPeople);
  const scaledIngredients = scaleIngredients(recipe.ingredients, recipe.numberPeople, scaledPeople);
  
  const confirmMsg = `Cuisiner "${recipe.name}" pour ${scaledPeople} personnes ?\n\nLes ingrédients seront déduits de ton stock.`;
  if (!confirm(confirmMsg)) return;

  // Create a scaled version of the recipe for cooking
  const scaledRecipe: Recipe = { ...recipe, numberPeople: scaledPeople, ingredients: scaledIngredients };
  const result = await cookRecipe(scaledRecipe);

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

async function handleAddToGroceryList(recipe: Recipe, recipeIndex: number): Promise<void> {
  const scaledPeople = getScaledPortions(recipeIndex, recipe.numberPeople);
  const scaledIngredients = scaleIngredients(recipe.ingredients, recipe.numberPeople, scaledPeople);
  
  const result = await addRecipeToGroceryList(scaledIngredients);

  if (result.added.length === 0) {
    alert(`✅ Tu as déjà tous les ingrédients pour "${recipe.name}" (${scaledPeople} pers.) !`);
    return;
  }

  let message = `🛒 Ajouté à la liste de courses pour "${recipe.name}" (${scaledPeople} pers.) :\n\n`;
  message += result.added.map(item => `  • ${formatQuantity(item.quantity, item.unit)} ${item.name}`).join('\n');

  if (result.skipped.length > 0) {
    message += `\n\n✅ Déjà en stock :\n`;
    message += result.skipped.map(name => `  • ${name}`).join('\n');
  }

  alert(message);
}

export type RecipeFilter = "all" | "available" | "unavailable";

export async function displayRecipes(
  searchTerm: string = "",
  filter: RecipeFilter = "all",
  tagFilter: string = ""
): Promise<void> {
  const container = document.getElementById("recipesContainer") as HTMLDivElement;
  container.innerHTML = "";
  const stocks = await loadStocks();
  const allRecipes = getRecipes();

  if (allRecipes.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>Aucune recette disponible. Ajoute ta première recette !</p>
      </div>
    `;
    return;
  }

  // Filter recipes based on search term, availability filter, and tag filter
  const filteredRecipes = allRecipes
    .map((recipe, index) => {
      const scaledPeople = getScaledPortions(index, recipe.numberPeople);
      const isAvailable = computeRecipeAvailability(recipe, stocks, scaledPeople);
      return { recipe, index, isAvailable, scaledPeople };
    })
    .filter(({ recipe, isAvailable }) => {
      // Search filter: match recipe name (case-insensitive)
      const matchesSearch = searchTerm === "" || 
        recipe.name.toLowerCase().includes(searchTerm.toLowerCase());
      
      // Availability filter
      const matchesFilter = 
        filter === "all" ||
        (filter === "available" && isAvailable) ||
        (filter === "unavailable" && !isAvailable);
      
      // Tag filter
      const matchesTag = tagFilter === "" || recipe.tags.includes(tagFilter);
      
      return matchesSearch && matchesFilter && matchesTag;
    });

  if (filteredRecipes.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>Aucune recette ne correspond à ta recherche.</p>
      </div>
    `;
    return;
  }

  filteredRecipes.forEach(({ recipe, index, isAvailable, scaledPeople }) => {
    const statusClass = isAvailable ? "recipe-available" : "recipe-unavailable";
    const statusText = isAvailable ? "Prêt !" : "Manque";

    // Use scaled ingredients for display
    const scaledIngredients = scaleIngredients(recipe.ingredients, recipe.numberPeople, scaledPeople);
    const ingredientsList = scaledIngredients
      .map(ing => `${formatQuantity(ing.quantity, ing.unit)} ${ing.name}`)
      .join(" • ");

    const tagsHtml = recipe.tags.length > 0 
      ? `<div class="recipe-tags">${recipe.tags.map(tag => `<span class="recipe-tag">${tag}</span>`).join('')}</div>`
      : '';

    const card = document.createElement("article");
    card.className = `recipe-card ${statusClass}`;
    card.dataset.recipeIndex = String(index);
    card.innerHTML = `
      <span class="status-badge">${statusText}</span>
      <div class="card-content">
        <h3>${recipe.name}</h3>
        <div class="recipe-meta">
          <div class="portion-control">
            <button class="btn-portion btn-portion-minus" data-index="${index}" title="Moins de portions">−</button>
            <span class="portion-count">👥 <span class="portion-number">${scaledPeople}</span> pers.</span>
            <button class="btn-portion btn-portion-plus" data-index="${index}" title="Plus de portions">+</button>
          </div>
        </div>
        ${tagsHtml}
        <div class="ingredients-label">Ingrédients</div>
        <p class="ingredients-list">${ingredientsList}</p>
        <div class="recipe-actions">
          <button class="btn-cook-recipe ${isAvailable ? '' : 'btn-cook-warning'}" data-index="${index}" title="${isAvailable ? 'Cuisiner' : 'Cuisiner (ingrédients manquants)'}">
            🍳 Cuisiner
          </button>
          <button class="btn-add-grocery" data-index="${index}" title="Ajouter à la liste de courses">🛒</button>
          <button class="btn-edit-recipe" data-index="${index}" title="Modifier">✏️</button>
          <button class="btn-delete-recipe" data-index="${index}" title="Supprimer">🗑️</button>
        </div>
      </div>
    `;

    // Event listeners
    const cookBtn = card.querySelector(".btn-cook-recipe") as HTMLButtonElement;
    const groceryBtn = card.querySelector(".btn-add-grocery") as HTMLButtonElement;
    const editBtn = card.querySelector(".btn-edit-recipe") as HTMLButtonElement;
    const deleteBtn = card.querySelector(".btn-delete-recipe") as HTMLButtonElement;
    const minusBtn = card.querySelector(".btn-portion-minus") as HTMLButtonElement;
    const plusBtn = card.querySelector(".btn-portion-plus") as HTMLButtonElement;

    // Portion scaling buttons
    minusBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const currentPeople = getScaledPortions(index, recipe.numberPeople);
      if (currentPeople > 1) {
        setScaledPortions(index, currentPeople - 1);
        displayRecipes(currentSearchTerm, currentFilter, currentTagFilter);
      }
    });

    plusBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const currentPeople = getScaledPortions(index, recipe.numberPeople);
      setScaledPortions(index, currentPeople + 1);
      displayRecipes(currentSearchTerm, currentFilter, currentTagFilter);
    });

    cookBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      handleCookRecipe(index);
    });

    groceryBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await handleAddToGroceryList(recipe, index);
    });

    editBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openRecipeDialog(index);
    });

    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (confirm(`Supprimer la recette "${recipe.name}" ?`)) {
        deleteRecipe(index);
        // Refresh tag filter options (tag may have been removed)
        populateTagFilter();
        displayRecipes(currentSearchTerm, currentFilter, currentTagFilter);
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

// ===== Recipe Tags =====

let selectedTags: string[] = [];

function renderSelectedTags(): void {
  const container = document.getElementById("selected-tags") as HTMLDivElement;
  if (selectedTags.length === 0) {
    container.innerHTML = '<span class="no-tags">Aucun tag sélectionné</span>';
    return;
  }
  container.innerHTML = selectedTags.map(tag => 
    `<span class="selected-tag">${tag}<button type="button" class="remove-tag" data-tag="${tag}">×</button></span>`
  ).join('');
  
  // Add remove listeners
  container.querySelectorAll(".remove-tag").forEach(btn => {
    btn.addEventListener("click", () => {
      const tag = (btn as HTMLButtonElement).dataset.tag!;
      removeTag(tag);
    });
  });
}

function addTag(tag: string): void {
  const normalizedTag = tag.trim().toLowerCase();
  if (normalizedTag && !selectedTags.includes(normalizedTag)) {
    selectedTags.push(normalizedTag);
    renderSelectedTags();
    updatePresetChips();
  }
}

function removeTag(tag: string): void {
  selectedTags = selectedTags.filter(t => t !== tag);
  renderSelectedTags();
  updatePresetChips();
}

function updatePresetChips(): void {
  const chips = document.querySelectorAll(".preset-tags .tag-chip");
  chips.forEach(chip => {
    const tag = (chip as HTMLButtonElement).dataset.tag!;
    if (selectedTags.includes(tag)) {
      chip.classList.add("active");
    } else {
      chip.classList.remove("active");
    }
  });
}

function resetTags(tags: string[] = []): void {
  selectedTags = [...tags];
  renderSelectedTags();
  updatePresetChips();
}

function initRecipeForm(recipe?: Partial<Recipe>, customTitle?: string): void {
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
    dialogTitle.textContent = customTitle || "Modifier la recette";
    nameInput.value = recipe.name || "";
    peopleInput.value = String(recipe.numberPeople || 4);
    if (recipe.ingredients && recipe.ingredients.length > 0) {
      recipe.ingredients.forEach(ing => {
        container.appendChild(createRecipeIngredientRow(ing));
      });
    } else {
      container.appendChild(createRecipeIngredientRow());
    }
    resetTags(recipe.tags || []);
  } else {
    dialogTitle.textContent = "Nouvelle recette";
    nameInput.value = "";
    peopleInput.value = "4";
    container.appendChild(createRecipeIngredientRow());
    resetTags([]);
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

  return { name, numberPeople, ingredients, tags: [...selectedTags] };
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

function openRecipeDialogWithImport(importedRecipe: Partial<Recipe>): void {
  const dialog = document.getElementById("recipeDialog") as HTMLDialogElement;
  
  editingRecipeIndex = null; // This is a new recipe
  initRecipeForm(importedRecipe, "Recette importée");

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
  const customTagInput = document.getElementById("custom-tag") as HTMLInputElement;
  const addCustomTagBtn = document.getElementById("addCustomTag") as HTMLButtonElement;
  const presetChips = document.querySelectorAll(".preset-tags .tag-chip");

  addRecipeBtn.addEventListener("click", () => {
    openRecipeDialog();
  });

  // Preset tag chips
  presetChips.forEach(chip => {
    chip.addEventListener("click", () => {
      const tag = (chip as HTMLButtonElement).dataset.tag!;
      if (selectedTags.includes(tag)) {
        removeTag(tag);
      } else {
        addTag(tag);
      }
    });
  });

  // Custom tag input
  addCustomTagBtn.addEventListener("click", () => {
    const tag = customTagInput.value.trim();
    if (tag) {
      addTag(tag);
      customTagInput.value = "";
    }
  });

  customTagInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addCustomTagBtn.click();
    }
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

    // Refresh tag filter options (new tags may have been added)
    populateTagFilter();
    displayRecipes(currentSearchTerm, currentFilter, currentTagFilter);
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

// ===== Grocery List Dialog =====

function getUnitLabel(unit: UnitType): string {
  switch (unit) {
    case UnitType.GRAM: return "g";
    case UnitType.KILO: return "kg";
    case UnitType.LITRE: return "L";
    case UnitType.ML: return "ml";
    case UnitType.UNIT: return "";
    default: return "";
  }
}

function displayGroceryList(): void {
  const container = document.getElementById("grocery-items") as HTMLDivElement;
  const list = getGroceryList();

  if (list.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>Ta liste de courses est vide.</p>
        <p class="empty-hint">Clique sur 🛒 sur une recette pour ajouter les ingrédients manquants.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = list.map((item, index) => `
    <div class="grocery-item ${item.checked ? 'grocery-item-checked' : ''}" data-index="${index}">
      <label class="grocery-checkbox-label">
        <input type="checkbox" class="grocery-checkbox" data-index="${index}" ${item.checked ? 'checked' : ''}>
        <span class="grocery-item-name">${item.name}</span>
      </label>
      <div class="grocery-item-qty-group">
        <input type="number" class="grocery-qty-input" data-index="${index}" value="${item.quantity}" min="1" step="any">
        <span class="grocery-unit-label">${getUnitLabel(item.unit)}</span>
      </div>
      <button class="btn-remove-grocery" data-index="${index}" title="Retirer">✕</button>
    </div>
  `).join('');

  // Add event listeners for checkboxes
  container.querySelectorAll(".grocery-checkbox").forEach((checkbox) => {
    checkbox.addEventListener("change", (e) => {
      const index = parseInt((e.target as HTMLInputElement).dataset.index || "0");
      toggleGroceryItemChecked(index);
      displayGroceryList();
    });
  });

  // Add event listeners for quantity inputs
  container.querySelectorAll(".grocery-qty-input").forEach((input) => {
    input.addEventListener("change", (e) => {
      const index = parseInt((e.target as HTMLInputElement).dataset.index || "0");
      const newQty = parseFloat((e.target as HTMLInputElement).value);
      if (newQty > 0) {
        updateGroceryItemQuantity(index, newQty);
      }
    });
  });

  // Add event listeners for remove buttons
  container.querySelectorAll(".btn-remove-grocery").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const index = parseInt((e.target as HTMLButtonElement).dataset.index || "0");
      removeFromGroceryList(index);
      displayGroceryList();
    });
  });
}

export function setupGroceryDialog(): void {
  const dialog = document.getElementById("groceryDialog") as HTMLDialogElement;
  const openBtn = document.getElementById("openGroceryList") as HTMLButtonElement;
  const closeBtn = document.getElementById("closeGroceryList") as HTMLButtonElement;
  const clearBtn = document.getElementById("clearGroceryList") as HTMLButtonElement;
  const finishBtn = document.getElementById("finishShopping") as HTMLButtonElement;

  openBtn.addEventListener("click", () => {
    displayGroceryList();
    document.body.classList.add("dialog-open");
    dialog.showModal();
  });

  closeBtn.addEventListener("click", () => {
    dialog.close();
  });

  clearBtn.addEventListener("click", () => {
    if (getGroceryList().length === 0) return;
    if (confirm("Vider toute la liste de courses ?")) {
      clearGroceryList();
      displayGroceryList();
    }
  });

  finishBtn.addEventListener("click", async () => {
    const checkedItems = getCheckedItems();
    
    if (checkedItems.length === 0) {
      alert("Aucun article coché !\n\nCoche les articles que tu as achetés.");
      return;
    }

    // Build confirmation message
    let confirmMsg = "Ajouter au stock ?\n\n";
    confirmMsg += checkedItems.map(item => `  • ${formatQuantity(item.quantity, item.unit)} ${item.name}`).join('\n');
    
    if (!confirm(confirmMsg)) return;

    // Add checked items to stock
    const itemsToAdd = checkedItems.map(item => ({
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
    }));

    const errors = await addMultipleToStock(itemsToAdd);

    if (errors.length > 0) {
      alert(`⚠️ Certains articles n'ont pas pu être ajoutés:\n${errors.join('\n')}`);
    }

    // Remove checked items from grocery list
    removeCheckedItems();

    // Refresh displays
    displayGroceryList();
    displayStocksInfos();
    displayRecipes();
    populateIngredientList();

    // Show success message
    const remaining = getGroceryList().length;
    let successMsg = `✅ ${checkedItems.length} article(s) ajouté(s) au stock !`;
    if (remaining > 0) {
      successMsg += `\n\n${remaining} article(s) restant(s) dans ta liste.`;
    }
    alert(successMsg);
  });

  dialog.addEventListener("close", () => {
    document.body.classList.remove("dialog-open");
  });
}

// ===== Recipe Filters =====

let currentSearchTerm = "";
let currentFilter: RecipeFilter = "all";
let currentTagFilter = "";

// Populate tag filter dropdown with all available tags
function populateTagFilter(): void {
  const select = document.getElementById("tagFilter") as HTMLSelectElement;
  const tags = getAllTags();
  
  // Preserve current selection if possible
  const currentValue = select.value;
  
  // Clear existing options except the first one
  while (select.options.length > 1) {
    select.remove(1);
  }
  
  // Add tag options
  tags.forEach(tag => {
    const option = document.createElement("option");
    option.value = tag;
    option.textContent = tag;
    select.appendChild(option);
  });
  
  // Restore selection if it still exists
  if (tags.includes(currentValue)) {
    select.value = currentValue;
  } else {
    select.value = "";
    currentTagFilter = "";
  }
}

// Simple debounce function
function debounce<T extends (...args: unknown[]) => void>(fn: T, delay: number): T {
  let timeoutId: ReturnType<typeof setTimeout>;
  return ((...args: unknown[]) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  }) as T;
}

export function setupRecipeFilters(): void {
  const searchInput = document.getElementById("recipeSearch") as HTMLInputElement;
  const filterButtons = document.querySelectorAll(".filter-btn");
  const tagSelect = document.getElementById("tagFilter") as HTMLSelectElement;

  // Initialize tag filter options
  populateTagFilter();

  // Debounced search handler
  const handleSearch = debounce(() => {
    currentSearchTerm = searchInput.value;
    displayRecipes(currentSearchTerm, currentFilter, currentTagFilter);
  }, 300);

  // Search input listener
  searchInput.addEventListener("input", handleSearch);

  // Filter button listeners
  filterButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      // Update active state
      filterButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      
      // Update filter and refresh
      currentFilter = (btn as HTMLButtonElement).dataset.filter as RecipeFilter;
      displayRecipes(currentSearchTerm, currentFilter, currentTagFilter);
    });
  });

  // Tag filter listener
  tagSelect.addEventListener("change", () => {
    currentTagFilter = tagSelect.value;
    displayRecipes(currentSearchTerm, currentFilter, currentTagFilter);
  });
}

// ===== Import Recipe Dialog =====

export function setupImportDialog(): void {
  const dialog = document.getElementById("importDialog") as HTMLDialogElement;
  const urlInput = document.getElementById("import-url") as HTMLInputElement;
  const submitBtn = document.getElementById("submitImport") as HTMLButtonElement;
  const cancelBtn = document.getElementById("cancelImport") as HTMLButtonElement;
  const importBtn = document.getElementById("importRecipe") as HTMLButtonElement;
  const statusDiv = document.getElementById("import-status") as HTMLDivElement;
  const btnText = submitBtn.querySelector(".import-btn-text") as HTMLSpanElement;
  const btnLoading = submitBtn.querySelector(".import-btn-loading") as HTMLSpanElement;

  function setLoading(loading: boolean): void {
    submitBtn.disabled = loading;
    btnText.hidden = loading;
    btnLoading.hidden = !loading;
  }

  function showStatus(message: string, isError: boolean): void {
    statusDiv.textContent = message;
    statusDiv.className = `import-status ${isError ? 'import-error' : 'import-success'}`;
  }

  function clearStatus(): void {
    statusDiv.textContent = "";
    statusDiv.className = "import-status";
  }

  function resetDialog(): void {
    urlInput.value = "";
    clearStatus();
    setLoading(false);
  }

  importBtn.addEventListener("click", () => {
    resetDialog();
    dialog.showModal();
    document.body.classList.add("dialog-open");
    urlInput.focus();
  });

  cancelBtn.addEventListener("click", () => {
    dialog.close();
  });

  dialog.addEventListener("close", () => {
    document.body.classList.remove("dialog-open");
  });

  submitBtn.addEventListener("click", async () => {
    const url = urlInput.value.trim();
    if (!url) {
      showStatus("Veuillez entrer une URL", true);
      return;
    }

    setLoading(true);
    clearStatus();

    const result = await importRecipeFromUrl(url);

    setLoading(false);

    if (!result.success) {
      showStatus(result.error, true);
      return;
    }

    // Show warnings if any
    if (result.warnings.length > 0) {
      console.warn("Import warnings:", result.warnings);
    }

    // Close import dialog and open recipe dialog with imported data
    dialog.close();
    openRecipeDialogWithImport(result.recipe);
  });

  // Handle Enter key in URL input
  urlInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submitBtn.click();
    }
  });
}

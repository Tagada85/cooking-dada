import { UnitType, hasEnough, formatQuantity } from "./units.js";
import { loadStocks, addMultipleToStock, cookRecipe } from "./stocks.js";
import { getRecipes, addRecipe, updateRecipe, deleteRecipe, getAllTags } from "./recipes.js";
import { addRecipeToGroceryList, getGroceryList, removeFromGroceryList, clearGroceryList, toggleGroceryItemChecked, updateGroceryItemQuantity, getCheckedItems, removeCheckedItems } from "./groceryList.js";
import { importRecipeFromUrl } from "./recipeImport.js";
// ===== Ingredient List Autocomplete =====
export async function populateIngredientList() {
    const datalist = document.getElementById("ingredients-list");
    if (!datalist)
        return;
    datalist.innerHTML = "";
    const stocks = await loadStocks();
    for (const stock of stocks) {
        const option = document.createElement("option");
        option.value = stock.name;
        datalist.appendChild(option);
    }
}
// ===== Stock Display =====
export async function displayStocksInfos() {
    const container = document.getElementById("stocksInfosContainer");
    const stocks = await loadStocks();
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
const scaledPortions = new Map();
function getScaledPortions(recipeIndex, basePortions) {
    return scaledPortions.get(recipeIndex) ?? basePortions;
}
function setScaledPortions(recipeIndex, portions) {
    scaledPortions.set(recipeIndex, portions);
}
function scaleIngredients(ingredients, basePeople, scaledPeople) {
    const scale = scaledPeople / basePeople;
    return ingredients.map(ing => ({
        ...ing,
        quantity: ing.quantity * scale
    }));
}
function computeRecipeAvailability(recipe, stocks, scaledPeople) {
    const ingredients = scaledPeople
        ? scaleIngredients(recipe.ingredients, recipe.numberPeople, scaledPeople)
        : recipe.ingredients;
    return ingredients.every(ingredient => {
        const correspondingStock = stocks.find(stock => stock.name.toLowerCase() === ingredient.name.toLowerCase());
        if (!correspondingStock)
            return false;
        return hasEnough(correspondingStock.quantity, correspondingStock.unit, ingredient.quantity, ingredient.unit);
    });
}
async function handleCookRecipe(recipeIndex) {
    const recipes = getRecipes();
    const recipe = recipes[recipeIndex];
    if (!recipe)
        return;
    const scaledPeople = getScaledPortions(recipeIndex, recipe.numberPeople);
    const scaledIngredients = scaleIngredients(recipe.ingredients, recipe.numberPeople, scaledPeople);
    const confirmMsg = `Cuisiner "${recipe.name}" pour ${scaledPeople} personnes ?\n\nLes ingrédients seront déduits de ton stock.`;
    if (!confirm(confirmMsg))
        return;
    // Create a scaled version of the recipe for cooking
    const scaledRecipe = { ...recipe, numberPeople: scaledPeople, ingredients: scaledIngredients };
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
async function handleAddToGroceryList(recipe, recipeIndex) {
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
export async function displayRecipes(searchTerm = "", filter = "all", tagFilter = "") {
    const container = document.getElementById("recipesContainer");
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
        const matchesFilter = filter === "all" ||
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
        const cookBtn = card.querySelector(".btn-cook-recipe");
        const groceryBtn = card.querySelector(".btn-add-grocery");
        const editBtn = card.querySelector(".btn-edit-recipe");
        const deleteBtn = card.querySelector(".btn-delete-recipe");
        const minusBtn = card.querySelector(".btn-portion-minus");
        const plusBtn = card.querySelector(".btn-portion-plus");
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
function createStockRow() {
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
    const removeBtn = row.querySelector(".btn-remove-row");
    removeBtn.addEventListener("click", () => {
        row.remove();
        updateStockRemoveButtons();
    });
    return row;
}
function updateStockRemoveButtons() {
    const rows = document.querySelectorAll("#stock-rows .stock-row");
    const removeButtons = document.querySelectorAll("#stock-rows .btn-remove-row");
    removeButtons.forEach(btn => {
        btn.disabled = rows.length <= 1;
    });
}
function initStockRows() {
    const container = document.getElementById("stock-rows");
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
function collectStockRows() {
    const rows = document.querySelectorAll("#stock-rows .stock-row");
    const ingredients = [];
    rows.forEach(row => {
        const name = row.querySelector(".row-name").value.trim();
        const quantity = parseFloat(row.querySelector(".row-qty").value) || 0;
        const unit = row.querySelector(".row-unit").value;
        if (name && quantity > 0) {
            ingredients.push({ name, quantity, unit });
        }
    });
    return ingredients;
}
export function setupStockDialog() {
    const dialog = document.getElementById("stockDialog");
    const addRowBtn = document.getElementById("addRowBtn");
    const submitBtn = document.getElementById("submitStocks");
    const cancelBtn = document.getElementById("cancelStock");
    const stockUpdateBtn = document.getElementById("stockUpdate");
    stockUpdateBtn.addEventListener("click", () => {
        initStockRows();
        dialog.showModal();
        document.body.classList.add("dialog-open");
        const firstInput = dialog.querySelector(".row-name");
        if (firstInput)
            firstInput.focus();
    });
    dialog.addEventListener("close", () => {
        document.body.classList.remove("dialog-open");
    });
    addRowBtn.addEventListener("click", () => {
        const container = document.getElementById("stock-rows");
        const newRow = createStockRow();
        container.appendChild(newRow);
        updateStockRemoveButtons();
        newRow.querySelector(".row-name").focus();
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
            const target = e.target;
            if (target.tagName === "INPUT") {
                e.preventDefault();
                addRowBtn.click();
            }
        }
    });
}
// ===== Recipe Dialog =====
let recipeRowCounter = 0;
let editingRecipeIndex = null;
function createRecipeIngredientRow(ingredient) {
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
    const removeBtn = row.querySelector(".btn-remove-row");
    removeBtn.addEventListener("click", () => {
        row.remove();
        updateRecipeRemoveButtons();
    });
    return row;
}
function updateRecipeRemoveButtons() {
    const rows = document.querySelectorAll("#recipe-ingredient-rows .stock-row");
    const removeButtons = document.querySelectorAll("#recipe-ingredient-rows .btn-remove-row");
    removeButtons.forEach(btn => {
        btn.disabled = rows.length <= 1;
    });
}
// ===== Recipe Tags =====
let selectedTags = [];
function renderSelectedTags() {
    const container = document.getElementById("selected-tags");
    if (selectedTags.length === 0) {
        container.innerHTML = '<span class="no-tags">Aucun tag sélectionné</span>';
        return;
    }
    container.innerHTML = selectedTags.map(tag => `<span class="selected-tag">${tag}<button type="button" class="remove-tag" data-tag="${tag}">×</button></span>`).join('');
    // Add remove listeners
    container.querySelectorAll(".remove-tag").forEach(btn => {
        btn.addEventListener("click", () => {
            const tag = btn.dataset.tag;
            removeTag(tag);
        });
    });
}
function addTag(tag) {
    const normalizedTag = tag.trim().toLowerCase();
    if (normalizedTag && !selectedTags.includes(normalizedTag)) {
        selectedTags.push(normalizedTag);
        renderSelectedTags();
        updatePresetChips();
    }
}
function removeTag(tag) {
    selectedTags = selectedTags.filter(t => t !== tag);
    renderSelectedTags();
    updatePresetChips();
}
function updatePresetChips() {
    const chips = document.querySelectorAll(".preset-tags .tag-chip");
    chips.forEach(chip => {
        const tag = chip.dataset.tag;
        if (selectedTags.includes(tag)) {
            chip.classList.add("active");
        }
        else {
            chip.classList.remove("active");
        }
    });
}
function resetTags(tags = []) {
    selectedTags = [...tags];
    renderSelectedTags();
    updatePresetChips();
}
function initRecipeForm(recipe, customTitle) {
    const container = document.getElementById("recipe-ingredient-rows");
    const nameInput = document.getElementById("recipe-name");
    const peopleInput = document.getElementById("recipe-people");
    const dialogTitle = document.getElementById("recipe-dialog-title");
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
        }
        else {
            container.appendChild(createRecipeIngredientRow());
        }
        resetTags(recipe.tags || []);
    }
    else {
        dialogTitle.textContent = "Nouvelle recette";
        nameInput.value = "";
        peopleInput.value = "4";
        container.appendChild(createRecipeIngredientRow());
        resetTags([]);
    }
    updateRecipeRemoveButtons();
}
function collectRecipeData() {
    const nameInput = document.getElementById("recipe-name");
    const peopleInput = document.getElementById("recipe-people");
    const rows = document.querySelectorAll("#recipe-ingredient-rows .stock-row");
    const name = nameInput.value.trim();
    const numberPeople = parseInt(peopleInput.value) || 4;
    if (!name) {
        alert("Le nom de la recette est requis.");
        nameInput.focus();
        return null;
    }
    const ingredients = [];
    rows.forEach(row => {
        const ingName = row.querySelector(".row-name").value.trim();
        const quantity = parseFloat(row.querySelector(".row-qty").value) || 0;
        const unit = row.querySelector(".row-unit").value;
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
function openRecipeDialog(recipeIndex) {
    const dialog = document.getElementById("recipeDialog");
    const recipes = getRecipes();
    if (recipeIndex !== undefined && recipeIndex >= 0 && recipeIndex < recipes.length) {
        editingRecipeIndex = recipeIndex;
        initRecipeForm(recipes[recipeIndex]);
    }
    else {
        editingRecipeIndex = null;
        initRecipeForm();
    }
    dialog.showModal();
    document.body.classList.add("dialog-open");
    document.getElementById("recipe-name").focus();
}
function openRecipeDialogWithImport(importedRecipe) {
    const dialog = document.getElementById("recipeDialog");
    editingRecipeIndex = null; // This is a new recipe
    initRecipeForm(importedRecipe, "Recette importée");
    dialog.showModal();
    document.body.classList.add("dialog-open");
    document.getElementById("recipe-name").focus();
}
export function setupRecipeDialog() {
    const dialog = document.getElementById("recipeDialog");
    const addIngredientBtn = document.getElementById("addRecipeIngredientBtn");
    const submitBtn = document.getElementById("submitRecipe");
    const cancelBtn = document.getElementById("cancelRecipe");
    const addRecipeBtn = document.getElementById("addRecipe");
    const customTagInput = document.getElementById("custom-tag");
    const addCustomTagBtn = document.getElementById("addCustomTag");
    const presetChips = document.querySelectorAll(".preset-tags .tag-chip");
    addRecipeBtn.addEventListener("click", () => {
        openRecipeDialog();
    });
    // Preset tag chips
    presetChips.forEach(chip => {
        chip.addEventListener("click", () => {
            const tag = chip.dataset.tag;
            if (selectedTags.includes(tag)) {
                removeTag(tag);
            }
            else {
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
        const container = document.getElementById("recipe-ingredient-rows");
        const newRow = createRecipeIngredientRow();
        container.appendChild(newRow);
        updateRecipeRemoveButtons();
        newRow.querySelector(".row-name").focus();
    });
    submitBtn.addEventListener("click", () => {
        const recipeData = collectRecipeData();
        if (!recipeData)
            return;
        if (editingRecipeIndex !== null) {
            updateRecipe(editingRecipeIndex, recipeData);
        }
        else {
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
            const target = e.target;
            if (target.classList.contains("row-name") || target.classList.contains("row-qty")) {
                e.preventDefault();
                addIngredientBtn.click();
            }
        }
    });
}
// ===== Grocery List Dialog =====
function getUnitLabel(unit) {
    switch (unit) {
        case UnitType.GRAM: return "g";
        case UnitType.KILO: return "kg";
        case UnitType.LITRE: return "L";
        case UnitType.ML: return "ml";
        case UnitType.UNIT: return "";
        default: return "";
    }
}
function displayGroceryList() {
    const container = document.getElementById("grocery-items");
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
            const index = parseInt(e.target.dataset.index || "0");
            toggleGroceryItemChecked(index);
            displayGroceryList();
        });
    });
    // Add event listeners for quantity inputs
    container.querySelectorAll(".grocery-qty-input").forEach((input) => {
        input.addEventListener("change", (e) => {
            const index = parseInt(e.target.dataset.index || "0");
            const newQty = parseFloat(e.target.value);
            if (newQty > 0) {
                updateGroceryItemQuantity(index, newQty);
            }
        });
    });
    // Add event listeners for remove buttons
    container.querySelectorAll(".btn-remove-grocery").forEach((btn) => {
        btn.addEventListener("click", (e) => {
            const index = parseInt(e.target.dataset.index || "0");
            removeFromGroceryList(index);
            displayGroceryList();
        });
    });
}
export function setupGroceryDialog() {
    const dialog = document.getElementById("groceryDialog");
    const openBtn = document.getElementById("openGroceryList");
    const closeBtn = document.getElementById("closeGroceryList");
    const clearBtn = document.getElementById("clearGroceryList");
    const finishBtn = document.getElementById("finishShopping");
    openBtn.addEventListener("click", () => {
        displayGroceryList();
        document.body.classList.add("dialog-open");
        dialog.showModal();
    });
    closeBtn.addEventListener("click", () => {
        dialog.close();
    });
    clearBtn.addEventListener("click", () => {
        if (getGroceryList().length === 0)
            return;
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
        if (!confirm(confirmMsg))
            return;
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
let currentFilter = "all";
let currentTagFilter = "";
// Populate tag filter dropdown with all available tags
function populateTagFilter() {
    const select = document.getElementById("tagFilter");
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
    }
    else {
        select.value = "";
        currentTagFilter = "";
    }
}
// Simple debounce function
function debounce(fn, delay) {
    let timeoutId;
    return ((...args) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn(...args), delay);
    });
}
export function setupRecipeFilters() {
    const searchInput = document.getElementById("recipeSearch");
    const filterButtons = document.querySelectorAll(".filter-btn");
    const tagSelect = document.getElementById("tagFilter");
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
            currentFilter = btn.dataset.filter;
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
export function setupImportDialog() {
    const dialog = document.getElementById("importDialog");
    const urlInput = document.getElementById("import-url");
    const submitBtn = document.getElementById("submitImport");
    const cancelBtn = document.getElementById("cancelImport");
    const importBtn = document.getElementById("importRecipe");
    const statusDiv = document.getElementById("import-status");
    const btnText = submitBtn.querySelector(".import-btn-text");
    const btnLoading = submitBtn.querySelector(".import-btn-loading");
    function setLoading(loading) {
        submitBtn.disabled = loading;
        btnText.hidden = loading;
        btnLoading.hidden = !loading;
    }
    function showStatus(message, isError) {
        statusDiv.textContent = message;
        statusDiv.className = `import-status ${isError ? 'import-error' : 'import-success'}`;
    }
    function clearStatus() {
        statusDiv.textContent = "";
        statusDiv.className = "import-status";
    }
    function resetDialog() {
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

import { UnitType, hasEnough, formatQuantity } from "./units.js";
import { loadStocks, addMultipleToStock, cookRecipe } from "./stocks.js";
import { getRecipes, addRecipe, updateRecipe, deleteRecipe } from "./recipes.js";
import { addRecipeToGroceryList, getGroceryList, removeFromGroceryList, clearGroceryList, toggleGroceryItemChecked, updateGroceryItemQuantity, getCheckedItems, removeCheckedItems } from "./groceryList.js";
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
function computeRecipeAvailability(recipe, stocks) {
    return recipe.ingredients.every(ingredient => {
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
    const confirmMsg = `Cuisiner "${recipe.name}" pour ${recipe.numberPeople} personnes ?\n\nLes ingrédients seront déduits de ton stock.`;
    if (!confirm(confirmMsg))
        return;
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
async function handleAddToGroceryList(recipe) {
    const result = await addRecipeToGroceryList(recipe.ingredients);
    if (result.added.length === 0) {
        alert(`✅ Tu as déjà tous les ingrédients pour "${recipe.name}" !`);
        return;
    }
    let message = `🛒 Ajouté à la liste de courses pour "${recipe.name}" :\n\n`;
    message += result.added.map(item => `  • ${formatQuantity(item.quantity, item.unit)} ${item.name}`).join('\n');
    if (result.skipped.length > 0) {
        message += `\n\n✅ Déjà en stock :\n`;
        message += result.skipped.map(name => `  • ${name}`).join('\n');
    }
    alert(message);
}
export async function displayRecipes() {
    const container = document.getElementById("recipesContainer");
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
        cookBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            handleCookRecipe(index);
        });
        groceryBtn.addEventListener("click", async (e) => {
            e.stopPropagation();
            await handleAddToGroceryList(recipe);
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
function initRecipeForm(recipe) {
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
        dialogTitle.textContent = "Modifier la recette";
        nameInput.value = recipe.name;
        peopleInput.value = String(recipe.numberPeople);
        recipe.ingredients.forEach(ing => {
            container.appendChild(createRecipeIngredientRow(ing));
        });
    }
    else {
        dialogTitle.textContent = "Nouvelle recette";
        nameInput.value = "";
        peopleInput.value = "4";
        container.appendChild(createRecipeIngredientRow());
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
    return { name, numberPeople, ingredients };
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
export function setupRecipeDialog() {
    const dialog = document.getElementById("recipeDialog");
    const addIngredientBtn = document.getElementById("addRecipeIngredientBtn");
    const submitBtn = document.getElementById("submitRecipe");
    const cancelBtn = document.getElementById("cancelRecipe");
    const addRecipeBtn = document.getElementById("addRecipe");
    addRecipeBtn.addEventListener("click", () => {
        openRecipeDialog();
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

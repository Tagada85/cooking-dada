import { UnitType, parseUnit } from "./units.js";
import { Ingredient, Recipe } from "./types.js";

// CORS proxy options (fallback chain)
// Each proxy has a different response format
type ProxyConfig = {
  buildUrl: (url: string) => string;
  extractContent: (response: Response) => Promise<string>;
};

const CORS_PROXIES: ProxyConfig[] = [
  {
    // allorigins returns JSON with { contents: "..." }
    buildUrl: (url: string) => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
    extractContent: async (response: Response) => {
      const data = await response.json();
      return data.contents;
    },
  },
  {
    // corsproxy.io returns raw HTML
    buildUrl: (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    extractContent: async (response: Response) => {
      return response.text();
    },
  },
  {
    // api.codetabs.com returns JSON with { contents: "..." }
    buildUrl: (url: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
    extractContent: async (response: Response) => {
      return response.text();
    },
  },
];

export type ImportResult = 
  | { success: true; recipe: Partial<Recipe>; warnings: string[] }
  | { success: false; error: string };

// ===== Fetch via CORS Proxy =====

async function fetchWithProxy(url: string): Promise<string> {
  const errors: string[] = [];
  
  for (const proxy of CORS_PROXIES) {
    try {
      const proxyUrl = proxy.buildUrl(url);
      console.log(`Trying proxy: ${proxyUrl.split('?')[0]}...`);
      
      const response = await fetch(proxyUrl);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const content = await proxy.extractContent(response);
      
      // Validate we got actual HTML content
      if (!content || typeof content !== 'string' || !content.includes('<')) {
        throw new Error('Invalid HTML response');
      }
      
      console.log(`Proxy succeeded, got ${content.length} bytes`);
      return content;
    } catch (e) {
      const errorMsg = (e as Error).message;
      errors.push(errorMsg);
      console.warn(`Proxy failed: ${errorMsg}`);
    }
  }
  
  throw new Error(`Tous les proxies ont échoué. Vérifie que l'URL est accessible.`);
}

// ===== Extract JSON-LD from HTML =====

interface SchemaRecipe {
  "@type": string | string[];
  name?: string;
  recipeYield?: string | string[];
  recipeIngredient?: string[];
  ingredients?: string[]; // Some sites use this instead
}

function extractJsonLd(html: string): SchemaRecipe | null {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
  
  for (const script of scripts) {
    try {
      const data = JSON.parse(script.textContent || "");
      
      // Handle array of schemas
      const schemas = Array.isArray(data) ? data : [data];
      
      for (const schema of schemas) {
        // Check for Recipe type
        const type = schema["@type"];
        const isRecipe = type === "Recipe" || 
          (Array.isArray(type) && type.includes("Recipe"));
        
        if (isRecipe) {
          return schema as SchemaRecipe;
        }
        
        // Check for @graph (some sites nest recipes inside)
        if (schema["@graph"]) {
          for (const item of schema["@graph"]) {
            const itemType = item["@type"];
            if (itemType === "Recipe" || 
              (Array.isArray(itemType) && itemType.includes("Recipe"))) {
              return item as SchemaRecipe;
            }
          }
        }
      }
    } catch (e) {
      console.warn("Failed to parse JSON-LD:", e);
    }
  }
  
  return null;
}

// ===== Parse French Ingredient Strings =====

// Unit pattern with optional quantity multiplier
// Some units need quantity conversion (e.g., 1 tbsp = 15ml)
type UnitPatternDef = {
  pattern: RegExp;
  unit: UnitType;
  multiplier?: number; // Multiply quantity by this (for unit conversion)
};

// Common French unit mappings
const FRENCH_UNIT_PATTERNS: UnitPatternDef[] = [
  // Weight
  { pattern: /\bkg\b/i, unit: UnitType.KILO },
  { pattern: /\bkilos?\b/i, unit: UnitType.KILO },
  { pattern: /\bkilogrammes?\b/i, unit: UnitType.KILO },
  { pattern: /\bg\b/i, unit: UnitType.GRAM },
  { pattern: /\bgr\b/i, unit: UnitType.GRAM },
  { pattern: /\bgrammes?\b/i, unit: UnitType.GRAM },
  
  // Volume
  { pattern: /\bl\b/i, unit: UnitType.LITRE },
  { pattern: /\blitres?\b/i, unit: UnitType.LITRE },
  { pattern: /\bml\b/i, unit: UnitType.ML },
  { pattern: /\bmillilitres?\b/i, unit: UnitType.ML },
  { pattern: /\bcl\b/i, unit: UnitType.ML, multiplier: 10 }, // 1cl = 10ml
  { pattern: /\bcentilitres?\b/i, unit: UnitType.ML, multiplier: 10 },
  
  // Spoons (convert to ML)
  { pattern: /\bcuill[eè]res?\s+[àa]\s+soupe\b/i, unit: UnitType.ML, multiplier: 15 }, // 1 tbsp ≈ 15ml
  { pattern: /\bc\.\s*[àa]\s*s\.?\b/i, unit: UnitType.ML, multiplier: 15 },
  { pattern: /\bcas\b/i, unit: UnitType.ML, multiplier: 15 },
  { pattern: /\bcuill[eè]res?\s+[àa]\s+caf[ée]\b/i, unit: UnitType.ML, multiplier: 5 }, // 1 tsp ≈ 5ml
  { pattern: /\bc\.\s*[àa]\s*c\.?\b/i, unit: UnitType.ML, multiplier: 5 },
  { pattern: /\bcac\b/i, unit: UnitType.ML, multiplier: 5 },
  
  // Cups/glasses (approximate to ml)
  { pattern: /\bverres?\b/i, unit: UnitType.ML, multiplier: 200 }, // ~200ml
  { pattern: /\btasses?\b/i, unit: UnitType.ML, multiplier: 250 }, // ~250ml
];

// Pattern to extract quantity from start of string
const QUANTITY_PATTERN = /^([\d.,/½¼¾⅓⅔]+(?:\s*(?:à|ou|-)\s*[\d.,/½¼¾⅓⅔]+)?)\s*/;

// Convert fraction characters to numbers
function parseFraction(str: string): number {
  const fractionMap: Record<string, number> = {
    "½": 0.5,
    "¼": 0.25,
    "¾": 0.75,
    "⅓": 0.333,
    "⅔": 0.666,
  };
  
  // Replace fraction characters
  let normalized = str;
  for (const [frac, value] of Object.entries(fractionMap)) {
    normalized = normalized.replace(frac, String(value));
  }
  
  // Handle "1/2" style fractions
  const slashFraction = normalized.match(/(\d+)\s*\/\s*(\d+)/);
  if (slashFraction) {
    return parseFloat(slashFraction[1]) / parseFloat(slashFraction[2]);
  }
  
  // Handle ranges like "2-3" or "2 à 3" - take the first number
  const rangeMatch = normalized.match(/([\d.,]+)/);
  if (rangeMatch) {
    return parseFloat(rangeMatch[1].replace(",", "."));
  }
  
  return parseFloat(normalized.replace(",", ".")) || 1;
}

export function parseIngredientString(raw: string): Ingredient {
  let text = raw.trim();
  let quantity = 1;
  let unit = UnitType.UNIT;
  let multiplier = 1;
  
  // Extract quantity
  const qtyMatch = text.match(QUANTITY_PATTERN);
  if (qtyMatch) {
    quantity = parseFraction(qtyMatch[1]);
    text = text.slice(qtyMatch[0].length);
  }
  
  // Extract unit
  for (const unitDef of FRENCH_UNIT_PATTERNS) {
    if (unitDef.pattern.test(text)) {
      unit = unitDef.unit;
      multiplier = unitDef.multiplier || 1;
      text = text.replace(unitDef.pattern, " ");
      break;
    }
  }
  
  // Apply multiplier (e.g., 2 tbsp → 30ml)
  quantity = quantity * multiplier;
  
  // Clean up the ingredient name
  let name = text
    .replace(/^de\s+/i, "") // Remove leading "de"
    .replace(/^d[''][a-z]/i, (m) => m.slice(2)) // Remove "d'" 
    .replace(/^l[''][a-z]/i, (m) => m.slice(2)) // Remove "l'"
    .replace(/\s+/g, " ") // Normalize spaces
    .trim();
  
  // Capitalize first letter
  if (name.length > 0) {
    name = name.charAt(0).toUpperCase() + name.slice(1);
  }
  
  // Handle edge case: no name extracted
  if (!name) {
    name = raw.trim();
    quantity = 1;
    unit = UnitType.UNIT;
  }
  
  return { name, quantity, unit };
}

// ===== Parse Recipe Yield (number of people) =====

function parseRecipeYield(yield_: string | string[] | undefined): number {
  if (!yield_) return 4; // Default
  
  const yieldStr = Array.isArray(yield_) ? yield_[0] : yield_;
  
  // Look for a number
  const match = yieldStr.match(/(\d+)/);
  if (match) {
    return parseInt(match[1], 10);
  }
  
  return 4;
}

// ===== Main Import Function =====

export async function importRecipeFromUrl(url: string): Promise<ImportResult> {
  const warnings: string[] = [];
  
  // Validate URL
  try {
    new URL(url);
  } catch {
    return { success: false, error: "URL invalide" };
  }
  
  // Fetch the page
  let html: string;
  try {
    html = await fetchWithProxy(url);
  } catch (e) {
    return { 
      success: false, 
      error: `Impossible de récupérer la page: ${(e as Error).message}` 
    };
  }
  
  // Extract JSON-LD
  const schema = extractJsonLd(html);
  if (!schema) {
    return { 
      success: false, 
      error: "Aucune donnée de recette trouvée sur cette page. Le site n'utilise peut-être pas le format Schema.org." 
    };
  }
  
  // Parse recipe data
  const name = schema.name || "Recette importée";
  const numberPeople = parseRecipeYield(schema.recipeYield);
  
  // Parse ingredients
  const rawIngredients = schema.recipeIngredient || schema.ingredients || [];
  if (rawIngredients.length === 0) {
    warnings.push("Aucun ingrédient trouvé dans les données");
  }
  
  const ingredients: Ingredient[] = [];
  for (const raw of rawIngredients) {
    try {
      const parsed = parseIngredientString(raw);
      ingredients.push(parsed);
    } catch (e) {
      warnings.push(`Impossible de parser: "${raw}"`);
      // Add as-is with default values
      ingredients.push({ name: raw, quantity: 1, unit: UnitType.UNIT });
    }
  }
  
  return {
    success: true,
    recipe: {
      name,
      numberPeople,
      ingredients,
      tags: [],
    },
    warnings,
  };
}

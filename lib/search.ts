/**
 * VENDOSMITH Global Marketplace Search & Normalization Engine
 * Handles query expansion, stemming, category mapping, punctuation normalization,
 * and strict Flipkart-style discount calculations.
 */

export interface NormalizedSearchQuery {
  raw: string;
  normalized: string;
  phrases: string[];
  tokens: string[];
}

export interface FlipkartDiscountCalculation {
  hasDiscount: boolean;
  isValidDiscount: boolean;
  discountPercent: number;
  savingsAmount: number;
  finalPrice: number;
  originalPrice: number;
  badgeLabel: string;
}

/**
 * Calculates Flipkart-style discount strictly based on database prices:
 * Savings = Original Price - Selling Price
 * Discount % = round((Savings / Original Price) * 100)
 * Only valid if Original Price > 0 and Original Price > Selling Price.
 * Never shows negative or >100% discount.
 */
export function calculateFlipkartDiscount(
  rawOriginalPrice?: number | string | null,
  rawSellingPrice?: number | string | null
): FlipkartDiscountCalculation {
  const original = Number(rawOriginalPrice);
  const selling = rawSellingPrice !== null && rawSellingPrice !== undefined ? Number(rawSellingPrice) : null;

  const validOriginal = !isNaN(original) && original > 0;
  const validSelling = selling !== null && !isNaN(selling) && selling > 0;

  if (!validOriginal) {
    const fallbackPrice = validSelling ? selling : 0;
    return {
      hasDiscount: false,
      isValidDiscount: false,
      discountPercent: 0,
      savingsAmount: 0,
      finalPrice: fallbackPrice,
      originalPrice: fallbackPrice,
      badgeLabel: "",
    };
  }

  if (!validSelling || selling >= original) {
    return {
      hasDiscount: false,
      isValidDiscount: false,
      discountPercent: 0,
      savingsAmount: 0,
      finalPrice: original,
      originalPrice: original,
      badgeLabel: "",
    };
  }

  const savings = Math.max(0, original - selling);
  const percent = Math.min(100, Math.max(1, Math.round((savings / original) * 100)));

  return {
    hasDiscount: true,
    isValidDiscount: true,
    discountPercent: percent,
    savingsAmount: savings,
    finalPrice: selling,
    originalPrice: original,
    badgeLabel: `↓ ${percent}% OFF`,
  };
}

/**
 * Normalizes user queries safely:
 * - Trims whitespace
 * - Handles case insensitivity
 * - Expands hyphens ("t-shirt" <-> "t shirt" <-> "tshirt")
 * - Handles apostrophes ("men's" <-> "mens" <-> "men")
 * - Expands singular/plural forms ("shirts" -> "shirt", "accessories" -> "accessory")
 */
export function normalizeSearchQuery(rawQuery?: string | null): NormalizedSearchQuery {
  if (!rawQuery || !rawQuery.trim()) {
    return { raw: "", normalized: "", phrases: [], tokens: [] };
  }

  const raw = rawQuery.trim();
  const normalized = raw.toLowerCase().replace(/['’"]/g, "");

  const phrases = new Set<string>();
  phrases.add(raw.toLowerCase());
  phrases.add(normalized);

  // Hyphen expansions
  if (raw.includes("-")) {
    phrases.add(raw.toLowerCase().replace(/-/g, " "));
    phrases.add(raw.toLowerCase().replace(/-/g, ""));
  }

  // T-Shirt and apparel special compound expansions
  if (
    normalized.includes("t-shirt") ||
    normalized.includes("tshirt") ||
    normalized.includes("t shirt")
  ) {
    phrases.add("t-shirt");
    phrases.add("t shirt");
    phrases.add("tshirt");
    phrases.add("t-shirts");
    phrases.add("t shirts");
    phrases.add("tshirts");
  }

  // Common footwear & apparel compound expansions
  if (normalized.includes("sneaker") || normalized.includes("shoe")) {
    phrases.add("sneakers");
    phrases.add("sneaker");
    phrases.add("shoes");
    phrases.add("shoe");
  }

  // Tokenize individual words
  const words = normalized
    .replace(/[^a-z0-9]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2);

  const tokens = new Set<string>();
  words.forEach((w) => {
    tokens.add(w);
    // De-pluralization
    if (w.endsWith("ies") && w.length > 4) {
      tokens.add(w.slice(0, -3) + "y"); // accessories -> accessory
    } else if (w.endsWith("es") && w.length > 4) {
      tokens.add(w.slice(0, -2)); // watches -> watch, dresses -> dress
    } else if (w.endsWith("s") && !w.endsWith("ss") && w.length > 3) {
      tokens.add(w.slice(0, -1)); // shirts -> shirt, shoes -> shoe
    }
  });

  return {
    raw,
    normalized,
    phrases: Array.from(phrases).filter((p) => p.trim().length > 0),
    tokens: Array.from(tokens).filter((t) => t.trim().length > 0),
  };
}

/**
 * Builds PostgREST-compatible OR filter query string for Supabase `.or(...)`
 * Searches across: title, description, and matching category IDs.
 */
export function buildProductSearchFilter(
  rawQuery?: string | null,
  categories?: Array<{ id: string; name: string; slug?: string }>
): { orFilter: string | null; matchedCategoryIds: string[] } {
  if (!rawQuery || !rawQuery.trim()) {
    return { orFilter: null, matchedCategoryIds: [] };
  }

  const { phrases, tokens } = normalizeSearchQuery(rawQuery);
  const matchedCategoryIds: string[] = [];

  // Match category names or slugs
  if (categories && categories.length > 0) {
    categories.forEach((cat) => {
      const catName = cat.name.toLowerCase();
      const catSlug = (cat.slug || "").toLowerCase();
      for (const phrase of phrases) {
        if (catName.includes(phrase) || phrase.includes(catName) || catSlug.includes(phrase)) {
          matchedCategoryIds.push(cat.id);
          break;
        }
      }
    });
  }

  const orParts: string[] = [];

  // 1. Title matches on all phrases
  phrases.forEach((ph) => {
    orParts.push(`title.ilike.%${ph}%`);
  });

  // 2. Title matches on individual stemmed tokens (length >= 3)
  tokens.forEach((tok) => {
    if (tok.length >= 3) {
      orParts.push(`title.ilike.%${tok}%`);
    }
  });

  // 3. Category ID matches
  if (matchedCategoryIds.length > 0) {
    orParts.push(`category_id.in.(${matchedCategoryIds.join(",")})`);
  }

  // 4. Description matches on multi-word phrases or longer tokens (>= 4 chars)
  phrases.forEach((ph) => {
    if (ph.length >= 4) {
      orParts.push(`description.ilike.%${ph}%`);
    }
  });

  // Limit to 25 or clauses to stay well within PostgREST URL length limits
  const orFilter = orParts.slice(0, 25).join(",");
  return { orFilter, matchedCategoryIds };
}

/**
 * Client-side relevance scoring function to sort and rank products cleanly
 */
export function rankSearchResults<T extends { title: string; description?: string | null; category_id?: string | null }>(
  items: T[],
  rawQuery?: string | null,
  categoryInput: string[] | Array<{ id: string }> = []
): T[] {
  if (!rawQuery || !rawQuery.trim() || items.length === 0) return items;

  const matchedCategoryIds: string[] = Array.isArray(categoryInput)
    ? categoryInput.map((c) => (typeof c === "string" ? c : c.id))
    : [];

  const { normalized, phrases, tokens } = normalizeSearchQuery(rawQuery);

  return [...items].sort((a, b) => {
    const aTitle = a.title.toLowerCase();
    const bTitle = b.title.toLowerCase();

    const scoreItem = (title: string, desc: string | null | undefined, catId: string | null | undefined) => {
      let score = 0;
      if (title === normalized) score += 100;
      if (title.startsWith(normalized)) score += 50;

      for (const ph of phrases) {
        if (title.includes(ph)) score += 35;
      }
      for (const tok of tokens) {
        if (title.includes(tok)) score += 15;
      }
      if (catId && matchedCategoryIds.includes(catId)) {
        score += 25;
      }
      if (desc) {
        const dLower = desc.toLowerCase();
        for (const ph of phrases) {
          if (ph.length >= 4 && dLower.includes(ph)) score += 10;
        }
      }
      return score;
    };

    const aScore = scoreItem(aTitle, a.description, a.category_id);
    const bScore = scoreItem(bTitle, b.description, b.category_id);

    return bScore - aScore;
  });
}

import { SupabaseClient } from "@supabase/supabase-js";

export interface MerchandisedProduct {
  id: string;
  title: string;
  slug: string;
  category_id: string;
  price: number;
  sale_price: number | null;
  stock_quantity: number;
  status: string;
  created_at: string;
  store_id: string;
  product_images?: { image_url: string }[];
  categories?: { id: string; name: string; slug: string };
  merchandisingScore?: number;
}

export interface SectionMerchandisingRule {
  ranking_mode?: "auto" | "discount" | "trending" | "rating" | "newest";
  max_products?: number;
  min_discount?: number;
  min_stock?: number;
  featured_product_ids?: string[];
}

interface ProductSignals {
  discountPct: number; // 0 to 100
  stockScore: number; // 0 to 10
  salesCount: number; // sum of quantities sold
  recencyScore: number; // 0 to 10
  ratingAvg: number; // 1 to 5
  wishlistCount: number; // integer count
}

/**
 * Batched retrieval of real ranking signals from Supabase:
 * order_items (sales), reviews (ratings), wishlist (interest).
 */
export async function fetchMerchandisingSignals(
  supabase: SupabaseClient,
  productIds: string[]
): Promise<Record<string, ProductSignals>> {
  const signalMap: Record<string, ProductSignals> = {};

  if (productIds.length === 0) return signalMap;

  // 1. Fetch order_items sales count
  const { data: orderItems } = await supabase
    .from("order_items")
    .select("product_id, quantity")
    .in("product_id", productIds);

  // 2. Fetch reviews ratings
  const { data: reviews } = await supabase
    .from("reviews")
    .select("product_id, rating")
    .in("product_id", productIds);

  // 3. Fetch wishlist counts
  const { data: wishlists } = await supabase
    .from("wishlist")
    .select("product_id")
    .in("product_id", productIds);

  // Aggregate signals per product
  productIds.forEach((pid) => {
    // Sales
    const prodItems = orderItems?.filter((oi) => oi.product_id === pid) || [];
    const salesCount = prodItems.reduce((acc, curr) => acc + (curr.quantity || 1), 0);

    // Reviews
    const prodReviews = reviews?.filter((r) => r.product_id === pid) || [];
    const ratingSum = prodReviews.reduce((acc, curr) => acc + (curr.rating || 5), 0);
    const ratingAvg = prodReviews.length > 0 ? ratingSum / prodReviews.length : 4.5; // fallback default high rating for unreviewed new products

    // Wishlist
    const wishlistCount = wishlists?.filter((w) => w.product_id === pid).length || 0;

    signalMap[pid] = {
      discountPct: 0,
      stockScore: 0,
      salesCount,
      recencyScore: 5,
      ratingAvg,
      wishlistCount
    };
  });

  return signalMap;
}

/**
 * Normalizes signals and calculates dynamic score per section rule.
 */
function calculateProductScore(
  product: MerchandisedProduct,
  signals: ProductSignals,
  sectionType: "deals" | "trending" | "top_selection" | "category"
): number {
  // A. Discount %
  const discountPct =
    product.price > 0 && product.sale_price && product.sale_price < product.price
      ? ((product.price - product.sale_price) / product.price) * 100
      : 0;

  // B. Stock score
  const stockScore = product.stock_quantity > 0 ? 10 : 0;

  // C. Recency score (days since creation)
  const createdDate = new Date(product.created_at).getTime();
  const daysOld = Math.max(1, (Date.now() - createdDate) / (1000 * 60 * 60 * 24));
  const recencyScore = Math.max(1, 10 - Math.min(9, daysOld / 7)); // 10 score for past 7 days, decays smoothly

  // D. Sales score (capped at 10)
  const salesScore = Math.min(10, signals.salesCount);

  // E. Rating score (normalized 0 to 10)
  const ratingScore = (signals.ratingAvg / 5) * 10;

  // F. Wishlist score (capped at 10)
  const wishlistScore = Math.min(10, signals.wishlistCount);

  let score = 0;

  switch (sectionType) {
    case "deals":
      // Discount (40%), Stock (20%), Sales (20%), Rating (10%), Recency (10%)
      score =
        discountPct * 0.4 +
        stockScore * 2.0 +
        salesScore * 2.0 +
        ratingScore * 1.0 +
        recencyScore * 1.0;
      break;

    case "trending":
      // Sales (40%), Recency (25%), Wishlist (15%), Rating (10%), Stock (10%)
      score =
        salesScore * 4.0 +
        recencyScore * 2.5 +
        wishlistScore * 1.5 +
        ratingScore * 1.0 +
        stockScore * 1.0;
      break;

    case "top_selection":
      // Rating (35%), Sales (25%), Discount (15%), Stock (15%), Recency (10%)
      score =
        ratingScore * 3.5 +
        salesScore * 2.5 +
        (discountPct / 10) * 1.5 +
        stockScore * 1.5 +
        recencyScore * 1.0;
      break;

    case "category":
    default:
      // Sales (30%), Rating (25%), Discount (15%), Stock (15%), Recency (15%)
      score =
        salesScore * 3.0 +
        ratingScore * 2.5 +
        (discountPct / 10) * 1.5 +
        stockScore * 1.5 +
        recencyScore * 1.5;
      break;
  }

  return Math.round(score * 100) / 100;
}

/**
 * Ranks products for a section incorporating Admin Overrides (featured_product_ids)
 */
export function rankProducts(
  products: MerchandisedProduct[],
  signalsMap: Record<string, ProductSignals>,
  sectionType: "deals" | "trending" | "top_selection" | "category",
  rule: SectionMerchandisingRule = {}
): MerchandisedProduct[] {
  let filtered = [...products];

  // Min Stock filter if rule specified
  if (rule.min_stock && rule.min_stock > 0) {
    filtered = filtered.filter((p) => p.stock_quantity >= (rule.min_stock || 0));
  }

  // Min Discount filter if rule specified
  if (rule.min_discount && rule.min_discount > 0) {
    filtered = filtered.filter((p) => {
      if (!p.sale_price || p.sale_price >= p.price) return false;
      const discountPct = ((p.price - p.sale_price) / p.price) * 100;
      return discountPct >= (rule.min_discount || 0);
    });
  }

  // Calculate scores
  const scoredProducts = filtered.map((p) => {
    const signals = signalsMap[p.id] || {
      discountPct: 0,
      stockScore: 0,
      salesCount: 0,
      recencyScore: 5,
      ratingAvg: 4.5,
      wishlistCount: 0
    };
    const score = calculateProductScore(p, signals, sectionType);
    return { ...p, merchandisingScore: score };
  });

  // Sort by score descending
  scoredProducts.sort((a, b) => (b.merchandisingScore || 0) - (a.merchandisingScore || 0));

  // Handle Admin Featured/Pinned Products Override
  const featuredIds = rule.featured_product_ids || [];
  if (featuredIds.length > 0) {
    const pinned: MerchandisedProduct[] = [];
    const remaining: MerchandisedProduct[] = [];

    // Separate pinned products matching featuredIds
    featuredIds.forEach((fid) => {
      const found = scoredProducts.find((p) => p.id === fid);
      if (found) pinned.push(found);
    });

    // Remaining non-pinned products
    scoredProducts.forEach((p) => {
      if (!featuredIds.includes(p.id)) remaining.push(p);
    });

    const combined = [...pinned, ...remaining];
    const maxItems = rule.max_products || 10;
    return combined.slice(0, maxItems);
  }

  const maxItems = rule.max_products || 10;
  return scoredProducts.slice(0, maxItems);
}

export interface RecentlyViewedProduct {
  id: string;
  title: string;
  slug?: string;
  price: number;
  sale_price?: number | null;
  image_url?: string;
  category_name?: string;
  viewed_at: number;
}

const STORAGE_KEY = "vendosmith_recently_viewed";
const MAX_RECENT_ITEMS = 12;

export function getRecentlyViewed(): RecentlyViewedProduct[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => Boolean(item && item.id && item.title));
  } catch (err) {
    console.warn("Failed to load recently viewed products:", err);
    return [];
  }
}

export function addRecentlyViewed(product: {
  id: string;
  title: string;
  slug?: string;
  price: number;
  sale_price?: number | null;
  image_url?: string;
  category_name?: string;
}): void {
  if (typeof window === "undefined" || !product.id) return;
  try {
    const current = getRecentlyViewed();
    // Filter out if already present (to bump to top)
    const filtered = current.filter((item) => item.id !== product.id);

    const newItem: RecentlyViewedProduct = {
      id: product.id,
      title: product.title,
      slug: product.slug || product.id,
      price: product.price,
      sale_price: product.sale_price,
      image_url: product.image_url || "/placeholder.jpg",
      category_name: product.category_name,
      viewed_at: Date.now(),
    };

    const updated = [newItem, ...filtered].slice(0, MAX_RECENT_ITEMS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn("Failed to save recently viewed product:", err);
  }
}

export function clearRecentlyViewed(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.warn("Failed to clear recently viewed products:", err);
  }
}

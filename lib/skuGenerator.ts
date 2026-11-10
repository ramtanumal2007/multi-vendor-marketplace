import { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_SITE_NAME } from "./siteConfig";

export function generateUniqueCode(length = 6): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function cleanCodeSegment(text: string, fallback = "GENERIC", maxLen = 6): string {
  if (!text) return fallback;
  const clean = text
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, maxLen);
  return clean || fallback;
}

export function generateMarketplaceSKU(params: {
  storeName?: string;
  categoryName?: string;
}): string {
  const storeCode = cleanCodeSegment(params.storeName || "", DEFAULT_SITE_NAME, 6);
  const categoryCode = cleanCodeSegment(params.categoryName || "", "PROD", 6);
  const uniqueCode = generateUniqueCode(6);
  return `${storeCode}-${categoryCode}-${uniqueCode}`;
}

export function getSKUPreview(params: {
  storeName?: string;
  categoryName?: string;
}): string {
  const storeCode = cleanCodeSegment(params.storeName || "", DEFAULT_SITE_NAME, 6);
  const categoryCode = cleanCodeSegment(params.categoryName || "", "PROD", 6);
  return `${storeCode}-${categoryCode}-XXXXXX`;
}

export function normalizeSKU(sku?: string | null): string {
  if (!sku) return "";
  return sku.trim().toUpperCase();
}

export async function checkSKUExists(
  supabase: SupabaseClient,
  sku: string,
  excludeProductId?: string
): Promise<boolean> {
  const normalized = normalizeSKU(sku);
  if (!normalized) return false;

  let query = supabase.from("products").select("id").eq("sku", normalized);
  if (excludeProductId) {
    query = query.neq("id", excludeProductId);
  }

  const { data, error } = await query;
  if (error) {
    console.error("SKU lookup error:", error);
    return false;
  }
  return !!(data && data.length > 0);
}

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient, type SupabaseClient } from "@/lib/supabase";
import { evaluateProductReturnPolicy } from "@/lib/return-policy";

export const dynamic = "force-dynamic";

function getSupabaseAdmin() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

interface ProductRecord {
  id: string;
  title: string;
  price: number;
  sale_price?: number | null;
  sku?: string | null;
  slug?: string | null;
  category_id?: string | null;
  store_id?: string | null;
  stock_quantity?: number | null;
  track_inventory?: boolean | null;
  allow_backorders?: boolean | null;
  tags?: string[] | null;
  return_allowed?: boolean | null;
  return_window_days?: number | null;
  replacement_allowed?: boolean | null;
  replacement_window_days?: number | null;
  replacement_selectable?: boolean | null;
  product_images?: Array<{ image_url: string }>;
  categories?: { id?: string; name?: string; slug?: string; parent_id?: string | null } | null;
  stores?: { id?: string; name?: string; city?: string } | null;
}

async function fetchCandidateProducts(
  supabaseAdmin: SupabaseClient,
  options: {
    categoryId?: string | null;
    excludeProductId?: string | null;
    searchQuery?: string | null;
  }
): Promise<ProductRecord[]> {
  let query = supabaseAdmin
    .from("products")
    .select(`
      id,
      title,
      price,
      sale_price,
      sku,
      slug,
      category_id,
      store_id,
      stock_quantity,
      track_inventory,
      allow_backorders,
      tags,
      product_images (image_url),
      categories (id, name, slug, parent_id),
      stores (id, name, city)
    `)
    .eq("status", "active")
    .order("price", { ascending: true })
    .limit(100);

  if (options.excludeProductId) {
    query = query.neq("id", options.excludeProductId);
  }

  if (options.categoryId) {
    query = query.eq("category_id", options.categoryId);
  }

  if (options.searchQuery) {
    query = query.ilike("title", `%${options.searchQuery}%`);
  }

  const { data, error } = await query;
  if (error || !data) return [];

  // Filter to ensure replacement options are in stock and replacement-selectable
  return (data as ProductRecord[]).filter((p) => {
    // Inventory check: if inventory tracking is active and backorders disallowed, stock must be > 0
    if (p.track_inventory && !p.allow_backorders && (p.stock_quantity ?? 0) <= 0) {
      return false;
    }

    const cat = p.categories;
    const policy = evaluateProductReturnPolicy({
      categoryId: p.category_id,
      categorySlug: cat?.slug,
      categoryName: cat?.name,
      sku: p.sku,
      tags: p.tags,
      return_allowed: p.return_allowed,
      return_window_days: p.return_window_days,
      replacement_allowed: p.replacement_allowed,
      replacement_window_days: p.replacement_window_days,
      replacement_selectable: p.replacement_selectable,
    });

    // Check candidate replacement product eligibility: must be selectable as a replacement!
    // Note: candidate's own return window is NOT used here.
    return policy.isReplacementSelectable;
  });
}

/**
 * GET /api/products/replacement-options
 * Fetches eligible replacement products for customer replacement workflow.
 * 1. Default page size = 10 products (First load max 10; pagination via Load More).
 * 2. If search query (q) is provided, searches globally across all eligible catalog products.
 * 3. If no search query, prioritizes products within original category.
 * 4. If original category has 0 alternatives, automatically falls back to broader eligible catalog.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const categoryId = searchParams.get("categoryId");
    const excludeProductId = searchParams.get("excludeProductId");
    const queryStr = searchParams.get("q")?.trim();
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.max(1, parseInt(searchParams.get("limit") || "10", 10));

    const supabaseAdmin = getSupabaseAdmin();

    // 1. If explicit search query is provided, search globally across the entire eligible catalog
    if (queryStr) {
      const allResults = await fetchCandidateProducts(supabaseAdmin, {
        excludeProductId,
        searchQuery: queryStr,
      });

      const offset = (page - 1) * limit;
      const paginated = allResults.slice(offset, offset + limit);
      const hasMore = allResults.length > offset + limit;

      return NextResponse.json({
        success: true,
        products: paginated,
        page,
        limit,
        totalCount: allResults.length,
        hasMore,
        source: "search",
      });
    }

    // 2. Initial view without search query: try category-specific products first if categoryId is provided
    let allProducts: ProductRecord[] = [];
    let isFallback = false;
    if (categoryId) {
      allProducts = await fetchCandidateProducts(supabaseAdmin, {
        categoryId,
        excludeProductId,
      });
    }

    // 3. Fallback: If category has 0 eligible alternatives (or no categoryId provided),
    // automatically fall back to the broader eligible catalog so customers are never stranded
    if (allProducts.length === 0) {
      isFallback = true;
      allProducts = await fetchCandidateProducts(supabaseAdmin, {
        excludeProductId,
      });
    }

    const offset = (page - 1) * limit;
    const paginated = allProducts.slice(offset, offset + limit);
    const hasMore = allProducts.length > offset + limit;

    return NextResponse.json({
      success: true,
      products: paginated,
      page,
      limit,
      totalCount: allProducts.length,
      hasMore,
      source: isFallback ? "fallback" : "category",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error.";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

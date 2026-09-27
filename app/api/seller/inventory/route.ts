import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { checkRateLimit } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  try {
    const cookieStore = cookies();
    const authSupabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
        },
      }
    );

    // 1. Authenticate user
    const {
      data: { user },
      error: userErr,
    } = await authSupabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Verify approved seller profile
    const { data: sellerProfile } = await authSupabase
      .from("seller_profiles")
      .select("verification_status")
      .eq("id", user.id)
      .maybeSingle();

    if (sellerProfile?.verification_status !== "approved") {
      return NextResponse.json(
        { error: "Forbidden: Approved seller status required" },
        { status: 403 }
      );
    }

    // 3. Verify seller store
    const { data: store } = await authSupabase
      .from("stores")
      .select("id")
      .eq("seller_id", user.id)
      .maybeSingle();

    if (!store?.id) {
      return NextResponse.json(
        { error: "Store not found for seller" },
        { status: 404 }
      );
    }

    // 4. Rate limiting: 60 updates per minute per seller
    const rateLimitRes = checkRateLimit(`seller-inv:${user.id}`, {
      maxRequests: 60,
      windowMs: 60 * 1000,
    });

    if (!rateLimitRes.success) {
      return NextResponse.json(
        {
          error: "Rate limit exceeded. Maximum 60 inventory adjustments per minute allowed.",
        },
        {
          status: 429,
          headers: {
            "Retry-After": Math.ceil((rateLimitRes.resetAt - Date.now()) / 1000).toString(),
            "X-RateLimit-Limit": rateLimitRes.limit.toString(),
            "X-RateLimit-Remaining": "0",
          },
        }
      );
    }

    const body = await req.json();
    const { productId, newStock } = body;

    // 5. Input validation hardening
    if (!productId || typeof productId !== "string" || productId.trim() === "") {
      return NextResponse.json(
        { error: "Invalid product ID: A valid product identifier is required." },
        { status: 400 }
      );
    }

    if (
      typeof newStock !== "number" ||
      !Number.isFinite(newStock) ||
      !Number.isInteger(newStock) ||
      newStock < 0 ||
      newStock > 1000000
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid stock quantity: Stock must be a non-negative whole integer between 0 and 1,000,000.",
        },
        { status: 400 }
      );
    }

    // 4. Verify product ownership: product must belong strictly to this store
    const { data: existingProduct, error: prodErr } = await authSupabase
      .from("products")
      .select("id, store_id, title, stock_quantity, status")
      .eq("id", productId)
      .eq("store_id", store.id)
      .maybeSingle();

    if (prodErr || !existingProduct) {
      return NextResponse.json(
        { error: "Product not found or not owned by your store" },
        { status: 404 }
      );
    }

    // 5. Update stock_quantity using service client to preserve active status
    // and avoid triggering downgrade_active_product_on_edit
    const adminSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: updatedProduct, error: updateErr } = await adminSupabase
      .from("products")
      .update({
        stock_quantity: Math.floor(newStock),
        updated_at: new Date().toISOString(),
      })
      .eq("id", productId)
      .eq("store_id", store.id)
      .select("id, stock_quantity, updated_at")
      .single();

    if (updateErr) {
      return NextResponse.json(
        { error: updateErr.message || "Failed to update stock" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      productId,
      newStock: updatedProduct.stock_quantity,
      updated_at: updatedProduct.updated_at,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

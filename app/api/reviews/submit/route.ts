import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient, createAdminClient, createAnonClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

async function getAuthUser(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.replace("Bearer ", "").trim();
    const supabaseAnon = createAnonClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data: { user } } = await supabaseAnon.auth.getUser(token);
    if (user) return user;
  }

  try {
    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {}
          },
        },
      }
    );
    const { data: { user } } = await supabase.auth.getUser();
    return user || null;
  } catch {
    return null;
  }
}

/**
 * POST /api/reviews/submit
 * Authoritative verified purchase review submission endpoint.
 * Strictly verifies user purchased the product and order has been delivered.
 */
export async function POST(req: Request) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json(
        { success: false, message: "Authentication required. Please sign in to submit a review." },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { productId, rating, title, body: reviewText, imageUrl } = body;

    // 1. Input Validation
    if (!productId || typeof productId !== "string") {
      return NextResponse.json(
        { success: false, message: "Valid productId is required." },
        { status: 400 }
      );
    }

    const numRating = Number(rating);
    if (!Number.isInteger(numRating) || numRating < 1 || numRating > 5) {
      return NextResponse.json(
        { success: false, message: "Rating must be an integer between 1 and 5." },
        { status: 400 }
      );
    }

    if (!reviewText || typeof reviewText !== "string" || reviewText.trim().length < 3) {
      return NextResponse.json(
        { success: false, message: "Please provide a review of at least 3 characters." },
        { status: 400 }
      );
    }

    const cleanTitle = typeof title === "string" ? title.trim().slice(0, 150) : "";
    const cleanBody = reviewText.trim().slice(0, 3000);
    const cleanImageUrl = typeof imageUrl === "string" && imageUrl.trim().startsWith("http") ? imageUrl.trim() : null;

    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 2. Authoritative Verification: Product existence
    const { data: prodData } = await supabaseAdmin
      .from("products")
      .select("id, title")
      .eq("id", productId)
      .single();

    if (!prodData) {
      return NextResponse.json(
        { success: false, message: "Product not found." },
        { status: 404 }
      );
    }

    // 3. Authoritative Verification: Customer must have purchased this product in a delivered order
    const { data: deliveredOrderItems, error: orderErr } = await supabaseAdmin
      .from("order_items")
      .select("id, order_id, orders!inner(id, user_id, fulfillment_status, internal_status)")
      .eq("product_id", productId)
      .eq("orders.user_id", user.id);

    if (orderErr) {
      console.error("Order verification error:", orderErr);
      return NextResponse.json(
        { success: false, message: "Failed to verify purchase history." },
        { status: 500 }
      );
    }

    const eligibleItem = (deliveredOrderItems || []).find((row) => {
      const ord = row.orders as unknown as { fulfillment_status?: string; internal_status?: string };
      const fStatus = ord?.fulfillment_status?.toLowerCase();
      const iStatus = ord?.internal_status?.toLowerCase();
      return fStatus === "delivered" || iStatus === "delivered";
    });

    if (!eligibleItem) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Verified Purchase Required: Only customers who have purchased and received this product can submit a review.",
        },
        { status: 403 }
      );
    }

    const verifiedOrderId = eligibleItem.order_id;

    // 4. One Review Rule: Check if customer already submitted a review for this product
    const { data: existingReview } = await supabaseAdmin
      .from("reviews")
      .select("id")
      .eq("product_id", productId)
      .eq("user_id", user.id)
      .maybeSingle();

    let resultReviewId = "";
    let isUpdated = false;

    if (existingReview) {
      // UPDATE existing review
      const { data: updated, error: updateErr } = await supabaseAdmin
        .from("reviews")
        .update({
          rating: numRating,
          title: cleanTitle || null,
          body: cleanBody,
          image_url: cleanImageUrl,
          order_id: verifiedOrderId,
          is_verified: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingReview.id)
        .select()
        .single();

      if (updateErr) {
        console.error("Error updating review:", updateErr);
        return NextResponse.json(
          { success: false, message: "Failed to update your review." },
          { status: 500 }
        );
      }

      resultReviewId = updated.id;
      isUpdated = true;
    } else {
      // INSERT new review
      const insertPayload: Record<string, unknown> = {
        product_id: productId,
        user_id: user.id,
        rating: numRating,
        title: cleanTitle || null,
        body: cleanBody,
        image_url: cleanImageUrl,
        order_id: verifiedOrderId,
        is_verified: true,
      };

      const { data: inserted, error: insertErr } = await supabaseAdmin
        .from("reviews")
        .insert(insertPayload)
        .select()
        .single();

      if (insertErr) {
        // Fallback in case order_id or image_url columns are missing from pending migration
        if (insertErr.message?.includes("column") || insertErr.code === "42703") {
          delete insertPayload.order_id;
          delete insertPayload.image_url;
          const { data: retryData, error: retryErr } = await supabaseAdmin
            .from("reviews")
            .insert(insertPayload)
            .select()
            .single();

          if (retryErr) {
            console.error("Error inserting review retry:", retryErr);
            return NextResponse.json(
              { success: false, message: "Failed to submit review." },
              { status: 500 }
            );
          }
          resultReviewId = retryData.id;
        } else {
          console.error("Error inserting review:", insertErr);
          return NextResponse.json(
            { success: false, message: "Failed to submit review." },
            { status: 500 }
          );
        }
      } else {
        resultReviewId = inserted.id;
      }
    }

    // 5. Authoritative recalculation of product average rating & review count
    const { data: allReviews } = await supabaseAdmin
      .from("reviews")
      .select("rating")
      .eq("product_id", productId);

    if (allReviews && allReviews.length > 0) {
      const avg = Number((allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length).toFixed(2));
      const count = allReviews.length;

      // Update product rating and reviews_count if columns exist
      try {
        await supabaseAdmin
          .from("products")
          .update({
            rating: avg,
            reviews_count: count,
          })
          .eq("id", productId);
      } catch {
        // Ignore if columns do not exist
      }
    }

    return NextResponse.json({
      success: true,
      message: isUpdated ? "Your review has been updated!" : "Your verified review has been published!",
      reviewId: resultReviewId,
      isUpdated,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error.";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient, createAdminClient, createAnonClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

interface ReviewRow {
  id: string;
  product_id: string;
  user_id: string;
  order_id?: string | null;
  rating: number;
  title: string | null;
  body: string | null;
  image_url?: string | null;
  is_verified: boolean;
  created_at: string;
  updated_at?: string | null;
}

interface ProfileRow {
  id: string;
  full_name: string | null;
}

function maskAuthorName(name: string | null | undefined): string {
  if (!name || !name.trim()) return "Verified Buyer";
  const parts = name.trim().split(" ");
  if (parts.length === 1) {
    const first = parts[0];
    if (first.length <= 2) return `${first}***`;
    return `${first.slice(0, 3)}***`;
  }
  const first = parts[0];
  const lastInitial = parts[parts.length - 1][0] || "";
  return `${first} ${lastInitial}.`;
}

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
 * GET /api/reviews?productId={id}
 * Fetches all verified public reviews, rating statistics, and purchase eligibility of the current visitor.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const productId = searchParams.get("productId");

    if (!productId) {
      return NextResponse.json(
        { success: false, message: "productId is required." },
        { status: 400 }
      );
    }

    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 1. Fetch public reviews for product
    const { data: reviewsData, error: reviewsErr } = await supabaseAdmin
      .from("reviews")
      .select("*")
      .eq("product_id", productId)
      .order("created_at", { ascending: false });

    if (reviewsErr) {
      console.error("Error fetching reviews:", reviewsErr);
      return NextResponse.json(
        { success: false, message: "Failed to load product reviews." },
        { status: 500 }
      );
    }

    const reviewsList: ReviewRow[] = reviewsData || [];

    // 2. Load profiles for author display names
    const userIds = Array.from(new Set(reviewsList.map((r) => r.user_id).filter(Boolean)));
    const profileMap = new Map<string, string>();

    if (userIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);

      ((profiles as ProfileRow[]) || []).forEach((p) => {
        if (p.full_name) profileMap.set(p.id, p.full_name);
      });
    }

    // 3. Format public review objects
    const formattedReviews = reviewsList.map((r) => {
      const rawName = profileMap.get(r.user_id) || "Verified Buyer";
      return {
        id: r.id,
        productId: r.product_id,
        userId: r.user_id,
        rating: r.rating,
        title: r.title,
        body: r.body,
        imageUrl: r.image_url || null,
        isVerified: Boolean(r.is_verified),
        createdAt: r.created_at,
        updatedAt: r.updated_at || null,
        authorName: maskAuthorName(rawName),
        authorFullName: rawName,
      };
    });

    // 4. Calculate real statistics from database
    const totalReviews = formattedReviews.length;
    const averageRating =
      totalReviews > 0
        ? Number((formattedReviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews).toFixed(1))
        : null;

    const distribution = [5, 4, 3, 2, 1].map((star) => {
      const count = formattedReviews.filter((r) => r.rating === star).length;
      const percentage = totalReviews > 0 ? Math.round((count / totalReviews) * 100) : 0;
      return { star, count, percentage };
    });

    // 5. Authoritative Eligibility Check for current user
    const user = await getAuthUser(req);
    let isEligible = false;
    let eligibleOrderId: string | null = null;
    let userReview: (typeof formattedReviews)[0] | null = null;

    if (user) {
      // Find user review if already submitted
      const existing = formattedReviews.find((r) => r.userId === user.id);
      if (existing) {
        userReview = existing;
      }

      // Check if user has an order containing this product that is delivered
      const { data: deliveredOrders } = await supabaseAdmin
        .from("order_items")
        .select("id, order_id, orders!inner(id, user_id, fulfillment_status, internal_status)")
        .eq("product_id", productId)
        .eq("orders.user_id", user.id);

      if (deliveredOrders && deliveredOrders.length > 0) {
        // Filter for delivered state in fulfillment_status or internal_status
        const deliveredMatch = deliveredOrders.find((row) => {
          const ord = row.orders as unknown as { fulfillment_status?: string; internal_status?: string };
          const fStatus = ord?.fulfillment_status?.toLowerCase();
          const iStatus = ord?.internal_status?.toLowerCase();
          return fStatus === "delivered" || iStatus === "delivered";
        });

        if (deliveredMatch) {
          isEligible = true;
          eligibleOrderId = deliveredMatch.order_id;
        }
      }
    }

    return NextResponse.json({
      success: true,
      productId,
      totalReviews,
      averageRating,
      distribution,
      reviews: formattedReviews,
      currentUser: user ? { id: user.id, email: user.email } : null,
      isEligible,
      eligibleOrderId,
      userReview,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error.";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

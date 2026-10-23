import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient, createAdminClient, createAnonClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

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
 * POST /api/reviews/upload
 * Authoritative upload endpoint for verified customer review images.
 */
export async function POST(req: Request) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json(
        { success: false, message: "Authentication required to upload review photos." },
        { status: 401 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const productId = formData.get("productId") as string | null;

    if (!productId || typeof productId !== "string") {
      return NextResponse.json(
        { success: false, message: "productId is required." },
        { status: 400 }
      );
    }

    if (!file) {
      return NextResponse.json(
        { success: false, message: "Please select an image file to upload." },
        { status: 400 }
      );
    }

    // 1. File Type and Size Validation
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { success: false, message: "Invalid image format. Only JPEG, PNG, and WebP are allowed." },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, message: "File size exceeds the 5MB maximum limit." },
        { status: 400 }
      );
    }

    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 2. Authoritative Verification: Customer must have purchased this product in a delivered order
    const { data: deliveredOrderItems } = await supabaseAdmin
      .from("order_items")
      .select("id, orders!inner(user_id, fulfillment_status, internal_status)")
      .eq("product_id", productId)
      .eq("orders.user_id", user.id);

    const isVerifiedPurchaser = (deliveredOrderItems || []).some((row) => {
      const ord = row.orders as unknown as { fulfillment_status?: string; internal_status?: string };
      const fStatus = ord?.fulfillment_status?.toLowerCase();
      const iStatus = ord?.internal_status?.toLowerCase();
      return fStatus === "delivered" || iStatus === "delivered";
    });

    if (!isVerifiedPurchaser) {
      return NextResponse.json(
        {
          success: false,
          message: "Only verified purchasers with a delivered order can upload review media.",
        },
        { status: 403 }
      );
    }

    // 3. Upload File to Storage Bucket
    const fileExt = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const safePath = `reviews/${productId}/${user.id}_${Date.now()}.${fileExt}`;

    const buffer = Buffer.from(await file.arrayBuffer());

    // Try review-images bucket first
    let uploadRes = await supabaseAdmin.storage
      .from("review-images")
      .upload(safePath, buffer, {
        contentType: file.type,
        upsert: true,
      });

    let bucketName = "review-images";

    if (uploadRes.error) {
      // Fallback to product-images if review-images bucket is not yet provisioned
      console.warn("review-images bucket upload notice:", uploadRes.error.message);
      bucketName = "product-images";
      uploadRes = await supabaseAdmin.storage
        .from(bucketName)
        .upload(safePath, buffer, {
          contentType: file.type,
          upsert: true,
        });

      if (uploadRes.error) {
        console.error("Storage upload error:", uploadRes.error);
        return NextResponse.json(
          { success: false, message: "Failed to upload image. Please try again." },
          { status: 500 }
        );
      }
    }

    const { data: publicData } = supabaseAdmin.storage
      .from(bucketName)
      .getPublicUrl(safePath);

    return NextResponse.json({
      success: true,
      url: publicData.publicUrl,
      bucket: bucketName,
      path: safePath,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error.";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

export async function POST(req: Request) {
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
            } catch {
              // Ignore in route handlers
            }
          },
        },
      }
    );

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, message: "Unauthorized. Please log in." },
        { status: 401 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, message: "No file provided for upload." },
        { status: 400 }
      );
    }

    // 1. Validate File MIME Type
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid file type. Only JPEG, PNG, and WebP images are allowed.",
        },
        { status: 400 }
      );
    }

    // 2. Validate File Size
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        {
          success: false,
          message: "File exceeds 5MB limit. Please upload a smaller image.",
        },
        { status: 400 }
      );
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 3. Ensure approved seller
    const { data: profile } = await supabaseAdmin
      .from("seller_profiles")
      .select("id, verification_status")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile || profile.verification_status !== "approved") {
      return NextResponse.json(
        { success: false, message: "Only approved sellers can upload payment QR codes." },
        { status: 403 }
      );
    }

    // 4. Generate safe unique filename
    const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const filePath = `seller/${user.id}/payment/qr_${Date.now()}.${extension}`;
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 5. Upload to private bucket 'seller-payment-docs' (with fallback to 'product-images' if migration pending)
    let targetBucket = "seller-payment-docs";
    let isPrivate = true;

    let { error: uploadErr } = await supabaseAdmin.storage
      .from(targetBucket)
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (
      uploadErr &&
      (uploadErr.message?.includes("Bucket not found") ||
        (typeof uploadErr === "object" && "statusCode" in uploadErr && (uploadErr as { statusCode?: string }).statusCode === "404"))
    ) {
      targetBucket = "product-images";
      isPrivate = false;
      const fallbackUpload = await supabaseAdmin.storage
        .from(targetBucket)
        .upload(filePath, buffer, {
          contentType: file.type,
          upsert: true,
        });
      uploadErr = fallbackUpload.error;
    }

    if (uploadErr) {
      console.error("Storage upload error:", uploadErr);
      return NextResponse.json(
        { success: false, message: uploadErr.message || "Failed to upload QR code image." },
        { status: 500 }
      );
    }

    // 6. Generate short-lived preview URL (300 seconds = 5 minutes)
    let previewUrl = "";
    let dbStorageValue = filePath;

    if (isPrivate) {
      const { data: signedData, error: signedErr } = await supabaseAdmin.storage
        .from(targetBucket)
        .createSignedUrl(filePath, 300); // 5-minute short-lived signed URL
      if (signedErr || !signedData?.signedUrl) {
        throw new Error("Failed to generate secure signed URL for QR image");
      }
      previewUrl = signedData.signedUrl;
      dbStorageValue = filePath;
    } else {
      const { data: publicUrlData } = supabaseAdmin.storage
        .from(targetBucket)
        .getPublicUrl(filePath);
      previewUrl = publicUrlData.publicUrl;
      dbStorageValue = publicUrlData.publicUrl;
    }

    // 7. Update seller profile
    const { error: updateErr } = await supabaseAdmin
      .from("seller_profiles")
      .update({
        upi_qr_url: dbStorageValue,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (updateErr) {
      console.error("Profile update error with QR URL:", updateErr);
      return NextResponse.json(
        { success: false, message: "QR uploaded but failed to update seller profile." },
        { status: 500 }
      );
    }

    // 8. Audit log
    try {
      await supabaseAdmin.from("finance_audit_logs").insert({
        actor_id: user.id,
        action_type: "SELLER_UPI_QR_UPLOADED",
        target_entity: "seller_profiles",
        target_id: user.id,
        new_values: {
          file_path: filePath,
          file_size: file.size,
          mime_type: file.type,
        },
        notes: "Seller uploaded new UPI QR code image",
      });
    } catch {
      // Non-fatal
    }

    return NextResponse.json({
      success: true,
      message: "UPI QR code uploaded successfully.",
      qrUrl: previewUrl,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("Upload QR code error:", err);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

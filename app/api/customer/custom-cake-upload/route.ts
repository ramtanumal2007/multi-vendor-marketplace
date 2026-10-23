import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient, createAdminClient } from "@/lib/supabase";
import { validateStorageFile, generateSafeFileName } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * POST /api/customer/custom-cake-upload
 * Securely uploads private customer cake reference images to custom-cake-references bucket.
 */
export async function POST(req: NextRequest) {
  try {
    const cookieStore = cookies();
    const supabaseUser = createServerClient(
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
    } = await supabaseUser.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, message: "Please log in to upload cake reference images." },
        { status: 401 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, message: "No image file provided." },
        { status: 400 }
      );
    }

    // Validate MIME type and size
    const validation = validateStorageFile(
      { name: file.name, size: file.size, type: file.type },
      "custom-cake-references"
    );

    if (!validation.valid) {
      return NextResponse.json(
        { success: false, message: validation.error || "Invalid file format or size." },
        { status: 400 }
      );
    }

    const safeFileName = generateSafeFileName(file.name, "cake_ref");
    const filePath = `custom-cakes/${user.id}/${safeFileName}`;

    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Convert file to array buffer for upload
    const fileBuffer = await file.arrayBuffer();

    const { error: uploadError } = await supabaseAdmin.storage
      .from("custom-cake-references")
      .upload(filePath, fileBuffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError.message);
      return NextResponse.json(
        { success: false, message: "Failed to upload image. Please try again." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      filePath,
      fileName: file.name,
      fileSize: file.size,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("Custom cake upload error:", message);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

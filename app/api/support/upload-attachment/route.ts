import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { validateStorageFile, generateSafeFileName } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * POST /api/support/upload-attachment
 * Securely uploads support attachments into private bucket 'support-attachments'
 */
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
        { success: false, message: "Unauthorized. Please sign in to attach files." },
        { status: 401 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, message: "No attachment file provided." },
        { status: 400 }
      );
    }

    // 1. Server-side MIME & Size Validation
    const validation = validateStorageFile(
      { name: file.name, size: file.size, type: file.type },
      "support-attachments"
    );

    if (!validation.valid) {
      return NextResponse.json(
        { success: false, message: validation.error },
        { status: 400 }
      );
    }

    // 2. Path-safe UUID filename scoped to user
    const safeName = generateSafeFileName(file.name, "att");
    const filePath = `user/${user.id}/tickets/${safeName}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 3. Upload to private bucket
    const { error: uploadError } = await supabaseAdmin.storage
      .from("support-attachments")
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("Support attachment upload error:", uploadError.message);
      return NextResponse.json(
        { success: false, message: "Failed to securely store attachment." },
        { status: 500 }
      );
    }

    // 4. Generate immediate 300s signed URL for preview
    const { data: signedData } = await supabaseAdmin.storage
      .from("support-attachments")
      .createSignedUrl(filePath, 300);

    return NextResponse.json({
      success: true,
      filePath,
      previewUrl: signedData?.signedUrl || null,
      fileName: file.name,
      fileSize: file.size,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("Support attachment route exception:", message);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

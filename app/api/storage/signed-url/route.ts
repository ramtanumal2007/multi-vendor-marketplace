import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import {
  PRIVATE_BUCKETS,
  PUBLIC_BUCKETS,
  isLegacyExternalUrl,
  PrivateBucket,
  PublicBucket,
} from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * GET /api/storage/signed-url?bucket=...&path=...
 * Generates short-lived (300s) signed URLs for private assets with strict ownership checks.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const bucket = searchParams.get("bucket");
    const filePath = searchParams.get("path");

    if (!bucket || !filePath) {
      return NextResponse.json(
        { success: false, message: "Both 'bucket' and 'path' query parameters are required." },
        { status: 400 }
      );
    }

    // Preserve external legacy URLs (e.g. Unsplash, external CDN)
    if (isLegacyExternalUrl(filePath)) {
      return NextResponse.json({
        success: true,
        signedUrl: filePath,
        expiresIn: null,
      });
    }

    // Initialize authenticated client
    const cookieStore = cookies();
    const supabaseUserClient = createServerClient(
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
    } = await supabaseUserClient.auth.getUser();

    // Public bucket shortcut
    if (PUBLIC_BUCKETS.has(bucket as PublicBucket)) {
      const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${bucket}/${filePath.replace(/^\/+/, "")}`;
      return NextResponse.json({
        success: true,
        signedUrl: publicUrl,
        expiresIn: null,
      });
    }

    // All private buckets require authentication
    if (authError || !user) {
      return NextResponse.json(
        { success: false, message: "Authentication required to access private storage assets." },
        { status: 401 }
      );
    }

    if (!PRIVATE_BUCKETS.has(bucket as PrivateBucket)) {
      return NextResponse.json(
        { success: false, message: `Unrecognized private bucket: "${bucket}"` },
        { status: 400 }
      );
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Check if requester is Admin
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    const isAdmin = profile?.role === "admin";

    // Strict Authorization check if not Admin
    if (!isAdmin) {
      const cleanPath = filePath.replace(/^\/+/, "");
      const segments = cleanPath.split("/");

      // Pattern 1: Folder starts with user's UUID or namespace/user.id
      const isDirectOwner =
        segments[0] === user.id ||
        (["user", "seller", "customer", "tickets", "returns"].includes(segments[0]) &&
          segments[1] === user.id);

      if (!isDirectOwner) {
        // Pattern 2: Database record verification for support tickets
        if (bucket === "support-attachments") {
          const { data: ticket } = await supabaseAdmin
            .from("support_tickets")
            .select("id")
            .eq("user_id", user.id)
            .or(`attachment_url.eq.${filePath},attachment_url.eq.${cleanPath}`)
            .maybeSingle();

          if (!ticket) {
            // Check ticket messages
            const { data: message } = await supabaseAdmin
              .from("support_ticket_messages")
              .select("id, support_tickets!inner(user_id)")
              .eq("support_tickets.user_id", user.id)
              .or(`attachment_url.eq.${filePath},attachment_url.eq.${cleanPath}`)
              .maybeSingle();

            if (!message) {
              return NextResponse.json(
                { success: false, message: "Unauthorized: You do not have access to this support attachment." },
                { status: 403 }
              );
            }
          }
        } else if (bucket === "seller-kyc-docs" || bucket === "seller-payment-docs") {
          // Seller must be the direct owner of the folder
          return NextResponse.json(
            { success: false, message: "Unauthorized: You do not have access to this seller document." },
            { status: 403 }
          );
        } else if (bucket === "order-invoices") {
          // Check order ownership
          const { data: order } = await supabaseAdmin
            .from("orders")
            .select("id, user_id")
            .eq("user_id", user.id)
            .maybeSingle();

          if (!order) {
            return NextResponse.json(
              { success: false, message: "Unauthorized: You do not have access to this order invoice." },
              { status: 403 }
            );
          }
        } else {
          return NextResponse.json(
            { success: false, message: "Unauthorized: You do not have access to this private asset." },
            { status: 403 }
          );
        }
      }
    }

    // Generate short-lived signed URL (300 seconds = 5 minutes)
    const { data: signedData, error: signErr } = await supabaseAdmin.storage
      .from(bucket)
      .createSignedUrl(filePath, 300);

    if (signErr || !signedData?.signedUrl) {
      console.error(`Error generating signed URL for ${bucket}:`, signErr?.message);
      return NextResponse.json(
        { success: false, message: "Failed to generate secure signed URL for requested file." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      signedUrl: signedData.signedUrl,
      expiresIn: 300,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("Storage signed-url route error:", message);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

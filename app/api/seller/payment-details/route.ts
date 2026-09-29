import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

/**
 * GET /api/seller/payment-details
 * Fetches the seller's UPI receiving credentials (UPI ID, QR URL).
 */
export async function GET() {
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
        { success: false, message: "Unauthorized." },
        { status: 401 }
      );
    }

    const { data: profile, error: profErr } = await supabase
      .from("seller_profiles")
      .select("id, upi_id, upi_qr_url")
      .eq("id", user.id)
      .maybeSingle();

    if (profErr) {
      return NextResponse.json(
        { success: false, message: profErr.message },
        { status: 500 }
      );
    }

    let previewQrUrl: string | null = profile?.upi_qr_url || null;
    if (previewQrUrl) {
      try {
        const supabaseAdmin = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        );
        if (!previewQrUrl.startsWith("http")) {
          const { data: signedData } = await supabaseAdmin.storage
            .from("seller-payment-docs")
            .createSignedUrl(previewQrUrl, 300);
          if (signedData?.signedUrl) {
            previewQrUrl = signedData.signedUrl;
          }
        } else if (previewQrUrl.includes("seller-payment-docs")) {
          const path = previewQrUrl.split("seller-payment-docs/")[1]?.split("?")[0];
          if (path) {
            const { data: signedData } = await supabaseAdmin.storage
              .from("seller-payment-docs")
              .createSignedUrl(path, 300);
            if (signedData?.signedUrl) {
              previewQrUrl = signedData.signedUrl;
            }
          }
        }
      } catch {
        // Fallback to stored value if signing fails
      }
    }

    return NextResponse.json({
      success: true,
      upiId: profile?.upi_id || null,
      upiQrUrl: previewQrUrl,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

/**
 * POST /api/seller/payment-details
 * Updates or removes the seller's UPI ID and/or UPI QR image URL.
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
        { success: false, message: "Unauthorized." },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { upiId, upiQrUrl, removeQr } = body;

    // Validate UPI ID format if provided
    let cleanUpiId: string | null = null;
    if (typeof upiId === "string" && upiId.trim().length > 0) {
      const trimmed = upiId.trim();
      const upiRegex = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;
      if (!upiRegex.test(trimmed)) {
        return NextResponse.json(
          {
            success: false,
            message:
              "Invalid UPI ID format. Expected format: username@bank (e.g. storename@okaxis).",
          },
          { status: 400 }
        );
      }
      cleanUpiId = trimmed;
    } else if (upiId === "" || upiId === null) {
      cleanUpiId = null;
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get current profile
    const { data: currentProfile } = await supabaseAdmin
      .from("seller_profiles")
      .select("upi_id, upi_qr_url")
      .eq("id", user.id)
      .maybeSingle();

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (upiId !== undefined) {
      updatePayload.upi_id = cleanUpiId;
    }

    if (removeQr) {
      updatePayload.upi_qr_url = null;
    } else if (typeof upiQrUrl === "string" && upiQrUrl.trim().length > 0) {
      updatePayload.upi_qr_url = upiQrUrl.trim();
    }

    const { error: updateErr } = await supabaseAdmin
      .from("seller_profiles")
      .update(updatePayload)
      .eq("id", user.id);

    if (updateErr) {
      console.error("Error updating seller UPI details:", updateErr);
      return NextResponse.json(
        { success: false, message: updateErr.message || "Failed to update UPI payment details." },
        { status: 500 }
      );
    }

    // Audit log
    try {
      await supabaseAdmin.from("finance_audit_logs").insert({
        actor_id: user.id,
        action_type: "SELLER_UPI_DETAILS_UPDATED",
        target_entity: "seller_profiles",
        target_id: user.id,
        old_values: {
          upi_id: currentProfile?.upi_id || null,
          has_qr: Boolean(currentProfile?.upi_qr_url),
        },
        new_values: {
          upi_id: cleanUpiId,
          has_qr: Boolean(updatePayload.upi_qr_url ?? currentProfile?.upi_qr_url),
        },
        notes: "Seller updated UPI payment receiving credentials",
      });
    } catch {
      // Non-fatal
    }

    return NextResponse.json({
      success: true,
      message: "UPI payment details updated successfully.",
      upiId: updatePayload.upi_id !== undefined ? updatePayload.upi_id : currentProfile?.upi_id,
      upiQrUrl:
        updatePayload.upi_qr_url !== undefined
          ? updatePayload.upi_qr_url
          : currentProfile?.upi_qr_url,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createSupabaseAdminClient(url, key);
}

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

    // 1. Authenticate Seller
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized: Please sign in." },
        { status: 401 }
      );
    }

    // 2. Parse & Validate Form Data
    const body = await req.json();
    const {
      business_name,
      contact_name,
      phone,
      business_email,
      business_type,
    } = body;

    if (!business_name?.trim()) {
      return NextResponse.json(
        { success: false, error: "Business name is required." },
        { status: 400 }
      );
    }

    if (!contact_name?.trim()) {
      return NextResponse.json(
        { success: false, error: "Contact name is required." },
        { status: 400 }
      );
    }

    if (!business_email?.trim()) {
      return NextResponse.json(
        { success: false, error: "Business email is required." },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    // 3. Fetch current seller profile
    const { data: profile, error: fetchErr } = await supabaseAdmin
      .from("seller_profiles")
      .select("id, verification_status")
      .eq("id", user.id)
      .maybeSingle();

    if (fetchErr || !profile) {
      return NextResponse.json(
        { success: false, error: "Seller application not found." },
        { status: 404 }
      );
    }

    // Must be in correction_required, pending, or rejected to resubmit
    const allowedStatuses = ["correction_required", "pending", "under_review", "rejected"];
    if (!allowedStatuses.includes(profile.verification_status)) {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot resubmit application with current status "${profile.verification_status}".`,
        },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();

    // 4. Update seller profile safely
    const fullUpdates = {
      business_name: business_name.trim(),
      contact_name: contact_name.trim(),
      phone: phone?.trim() || null,
      business_email: business_email.trim(),
      business_type: business_type || "individual",
      verification_status: "under_review",
      resubmitted_at: now,
      updated_at: now,
    };

    const { error: updateErr } = await supabaseAdmin
      .from("seller_profiles")
      .update(fullUpdates)
      .eq("id", user.id);

    if (updateErr && (updateErr.code === "42703" || updateErr.message?.includes("does not exist"))) {
      // Retry without resubmitted_at if column not present yet
      const { error: retryErr } = await supabaseAdmin
        .from("seller_profiles")
        .update({
          business_name: business_name.trim(),
          contact_name: contact_name.trim(),
          phone: phone?.trim() || null,
          business_email: business_email.trim(),
          business_type: business_type || "individual",
          verification_status: "under_review",
          updated_at: now,
        })
        .eq("id", user.id);
      if (retryErr) throw retryErr;
    } else if (updateErr) {
      throw updateErr;
    }

    // 5. Synchronize store
    await supabaseAdmin
      .from("stores")
      .update({
        name: business_name.trim(),
        phone: phone?.trim() || null,
        email: business_email.trim(),
        status: "under_review",
        updated_at: now,
      })
      .eq("seller_id", user.id);

    // 6. Record event history safely
    const { error: eventErr } = await supabaseAdmin.from("seller_application_events").insert({
      seller_id: user.id,
      event_type: "resubmitted",
      previous_status: profile.verification_status,
      new_status: "under_review",
      actor_id: user.id,
      admin_comment: "Seller updated application details and resubmitted for review.",
    });

    if (eventErr) {
      await supabaseAdmin.from("seller_application_events").insert({
        seller_id: user.id,
        event_type: "resubmitted",
        admin_comment: "Seller updated application details and resubmitted for review.",
      });
    }

    // 7. Send notification
    await supabaseAdmin.from("seller_notifications").insert({
      seller_id: user.id,
      title: "Application Resubmitted Successfully",
      message: "Your updated seller application has been received and is now Under Review.",
      type: "system",
      priority: "medium",
      link_url: "/seller/application-tracking",
    });

    return NextResponse.json({
      success: true,
      message: "Application resubmitted successfully. It is now Under Review.",
    });
  } catch (err: unknown) {
    console.error("[SellerResubmit Error]:", err);
    const technicalMessage =
      err instanceof Error
        ? err.message
        : typeof err === "object" && err !== null && "message" in err
        ? String((err as { message: unknown }).message)
        : "Failed to resubmit application.";

    return NextResponse.json(
      { success: false, error: technicalMessage },
      { status: 500 }
    );
  }
}

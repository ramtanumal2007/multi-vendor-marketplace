import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient, createAdminClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * GET /api/customer/custom-cakes
 * Retrieves all custom cake requests submitted by the logged-in customer.
 */
export async function GET() {
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
        { success: false, message: "Authentication required." },
        { status: 401 }
      );
    }

    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: requests, error } = await supabaseAdmin
      .from("custom_cake_requests")
      .select("*, stores(id, name)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      // If table not yet created in schema cache
      return NextResponse.json({
        success: true,
        requests: [],
        notice: "Custom cake system active. No requests yet.",
      });
    }

    return NextResponse.json({
      success: true,
      requests: requests || [],
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

/**
 * POST /api/customer/custom-cakes
 * Creates a new custom cake request with validation.
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
        { success: false, message: "Please sign in to submit a custom cake request." },
        { status: 401 }
      );
    }

    const body = await req.json();

    const {
      cake_type,
      flavor,
      weight,
      servings,
      theme_description,
      message_on_cake,
      preferred_delivery_date,
      preferred_delivery_time,
      budget_max,
      budget_min,
      reference_images = [],
      contact_name,
      contact_phone,
      delivery_address,
      dietary_notes,
      additional_instructions,
    } = body;

    // Strict Validations
    if (!cake_type || !cake_type.trim()) {
      return NextResponse.json({ success: false, message: "Cake type is required." }, { status: 400 });
    }
    if (!flavor || !flavor.trim()) {
      return NextResponse.json({ success: false, message: "Cake flavor is required." }, { status: 400 });
    }
    if (!weight || !weight.trim()) {
      return NextResponse.json({ success: false, message: "Cake weight/size is required." }, { status: 400 });
    }
    if (!theme_description || !theme_description.trim()) {
      return NextResponse.json(
        { success: false, message: "Please provide a design or theme description for your cake." },
        { status: 400 }
      );
    }
    if (!preferred_delivery_date) {
      return NextResponse.json(
        { success: false, message: "Preferred delivery date is required." },
        { status: 400 }
      );
    }
    if (!preferred_delivery_time) {
      return NextResponse.json(
        { success: false, message: "Preferred delivery time window is required." },
        { status: 400 }
      );
    }

    // Budget is STRICTLY REQUIRED
    const numBudget = Number(budget_max);
    if (!budget_max || isNaN(numBudget) || numBudget <= 0) {
      return NextResponse.json(
        { success: false, message: "Budget is required and must be greater than ₹0." },
        { status: 400 }
      );
    }

    if (!contact_name || !contact_name.trim()) {
      return NextResponse.json({ success: false, message: "Contact name is required." }, { status: 400 });
    }
    if (!contact_phone || !contact_phone.trim()) {
      return NextResponse.json({ success: false, message: "Contact phone is required." }, { status: 400 });
    }
    if (!delivery_address || (!delivery_address.address_line1 && !delivery_address.city)) {
      return NextResponse.json(
        { success: false, message: "Delivery address with street and city is required." },
        { status: 400 }
      );
    }

    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const insertPayload = {
      user_id: user.id,
      cake_type: cake_type.trim(),
      flavor: flavor.trim(),
      weight: weight.trim(),
      servings: servings ? String(servings).trim() : null,
      theme_description: theme_description.trim(),
      message_on_cake: message_on_cake ? message_on_cake.trim() : null,
      preferred_delivery_date,
      preferred_delivery_time,
      budget_max: numBudget,
      budget_min: budget_min ? Number(budget_min) : null,
      reference_images: Array.isArray(reference_images) ? reference_images : [],
      contact_name: contact_name.trim(),
      contact_phone: contact_phone.trim(),
      delivery_address,
      dietary_notes: dietary_notes ? dietary_notes.trim() : null,
      additional_instructions: additional_instructions ? additional_instructions.trim() : null,
      status: "SUBMITTED",
    };

    const { data: newRequest, error: insertError } = await supabaseAdmin
      .from("custom_cake_requests")
      .insert(insertPayload)
      .select()
      .single();

    if (insertError) {
      console.error("Error creating custom cake request:", insertError.message);
      return NextResponse.json(
        { success: false, message: "Failed to submit custom cake request: " + insertError.message },
        { status: 500 }
      );
    }

    // Log Activity
    try {
      await supabaseAdmin.from("custom_cake_activity_logs").insert({
        request_id: newRequest.id,
        action: "CUSTOM_REQUEST_SUBMITTED",
        actor_id: user.id,
        actor_role: "customer",
        actor_name: contact_name.trim(),
        notes: `Customer submitted custom cake request (${cake_type}, ${flavor}, ${weight}) with budget up to ₹${numBudget}.`,
        metadata: {
          budget_max: numBudget,
          cake_type,
          flavor,
        },
      });
    } catch {
      // Non-blocking log
    }

    // Customer Notification
    try {
      await supabaseAdmin.from("customer_notifications").insert({
        user_id: user.id,
        title: "Custom Cake Request Received 🎂",
        message: `Your request #${newRequest.request_number || newRequest.id.slice(0, 8)} has been submitted. Our team will review and match with an approved bakery store.`,
        type: "system",
        priority: "medium",
        link_url: `/account/custom-cakes/${newRequest.id}`,
      });
    } catch {
      // Non-blocking notification
    }

    // Admin Notification Log
    try {
      await supabaseAdmin.from("admin_notifications_log").insert({
        title: "New Custom Cake Request",
        message: `Customer ${contact_name} submitted request for ${cake_type} (${flavor}, ${weight}) with budget ₹${numBudget}.`,
        type: "custom_cake_request",
        link_url: `/admin/custom-cakes`,
        metadata: { request_id: newRequest.id },
      });
    } catch {
      // Non-blocking
    }

    return NextResponse.json({
      success: true,
      message: "Custom cake request submitted successfully! We will review and provide a quote.",
      request: newRequest,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("Custom cake request error:", message);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

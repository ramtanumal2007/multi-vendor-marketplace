import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient, createSupabaseAdminClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

function getSupabaseAdmin() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(req: NextRequest) {
  try {
    const cookieStore = cookies();
    const supabaseUser = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
        },
      }
    );

    const {
      data: { user },
      error: authErr,
    } = await supabaseUser.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Verify admin role
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.role !== "admin") {
      return NextResponse.json({ success: false, message: "Admin access required." }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const type = (searchParams.get("type") || "customer").toLowerCase();
    const q = (searchParams.get("q") || "").trim();

    if (type === "seller") {
      // Search Sellers: query seller_profiles and profiles
      let sellerQuery = supabaseAdmin
        .from("seller_profiles")
        .select("id, business_name, contact_name, business_email, phone, created_at");

      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(q);

      if (q) {
        if (isUuid) {
          sellerQuery = sellerQuery.eq("id", q);
        } else {
          sellerQuery = sellerQuery.or(
            `business_name.ilike.%${q}%,contact_name.ilike.%${q}%,business_email.ilike.%${q}%,phone.ilike.%${q}%`
          );
        }
      }

      const { data: sellers, error: sellerErr } = await sellerQuery.limit(25);
      if (sellerErr) {
        return NextResponse.json({ success: false, message: sellerErr.message }, { status: 500 });
      }

      const sellerIds = (sellers || []).map((s) => s.id);
      const { data: wallets } = await supabaseAdmin
        .from("customer_wallets")
        .select("customer_id, balance, currency")
        .in("customer_id", sellerIds);

      const walletMap = new Map((wallets || []).map((w) => [w.customer_id, Number(w.balance || 0)]));

      const results = (sellers || []).map((s) => ({
        id: s.id,
        recipientType: "seller",
        displayName: s.business_name || s.contact_name || "Merchant Store",
        secondaryInfo: s.contact_name ? `Contact: ${s.contact_name}` : s.business_email || "",
        email: s.business_email || null,
        phone: s.phone || null,
        currentBalance: walletMap.get(s.id) ?? 0,
        currency: "INR",
      }));

      return NextResponse.json({ success: true, results });
    } else {
      // Search Customers: query profiles
      let customerQuery = supabaseAdmin
        .from("profiles")
        .select("id, customer_id_code, full_name, email, phone, role, created_at");

      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(q);

      if (q) {
        if (isUuid) {
          customerQuery = customerQuery.eq("id", q);
        } else {
          customerQuery = customerQuery.or(
            `full_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%,customer_id_code.ilike.%${q}%`
          );
        }
      }

      const { data: customers, error: custErr } = await customerQuery.limit(25);
      if (custErr) {
        return NextResponse.json({ success: false, message: custErr.message }, { status: 500 });
      }

      const customerIds = (customers || []).map((c) => c.id);
      const { data: wallets } = await supabaseAdmin
        .from("customer_wallets")
        .select("customer_id, balance, currency")
        .in("customer_id", customerIds);

      const walletMap = new Map((wallets || []).map((w) => [w.customer_id, Number(w.balance || 0)]));

      const results = (customers || []).map((c) => ({
        id: c.id,
        customerIdCode: c.customer_id_code || null,
        recipientType: "customer",
        displayName: c.full_name || c.email || "Registered Customer",
        secondaryInfo: c.customer_id_code ? `ID: ${c.customer_id_code}` : c.email || "",
        email: c.email || null,
        phone: c.phone || null,
        currentBalance: walletMap.get(c.id) ?? 0,
        currency: "INR",
      }));

      return NextResponse.json({ success: true, results });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error.";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

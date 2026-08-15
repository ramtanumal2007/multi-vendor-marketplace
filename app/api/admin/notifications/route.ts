import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

async function getSupabase() {
  const cookieStore = cookies();
  return createServerClient(
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
}

// GET /api/admin/notifications - Fetch admin sent notifications history & list of sellers/customers
export async function GET() {
  try {
    const supabase = await getSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify Admin Role
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "admin") {
      return NextResponse.json({ error: "Forbidden: Admin privileges required" }, { status: 403 });
    }

    // Fetch history logs
    const { data: historyData, error: _historyError } = await supabase
      .from("admin_notifications_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    // Fetch active sellers list for selector dropdown
    const { data: sellers } = await supabase
      .from("seller_profiles")
      .select("id, business_name, business_email, verification_status")
      .order("business_name", { ascending: true });

    // Fetch customers list for selector dropdown
    const { data: customers } = await supabase
      .from("profiles")
      .select("id, full_name, email, role")
      .eq("role", "customer")
      .order("full_name", { ascending: true });

    // Enrich history logs with recipient identity
    const sellerMap = new Map((sellers || []).map((s) => [s.id, s]));
    const customerMap = new Map(
      (customers || []).map((c) => [c.id, c])
    );

    // Also fetch any profile records if customer wasn't in customer list (e.g. admin or seller recipient)
    const customerTargetIds = (historyData || [])
      .filter((h) => h.target_audience === "customer" && h.target_id && !customerMap.has(h.target_id))
      .map((h) => h.target_id as string);

    if (customerTargetIds.length > 0) {
      const { data: extraProfiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", customerTargetIds);
      (extraProfiles || []).forEach((p) => customerMap.set(p.id, p as any));
    }

    const enrichedHistory = (historyData || []).map((log) => {
      let recipient_name = "";
      let recipient_email = "";

      if (log.target_audience === "customer" && log.target_id) {
        const cust = customerMap.get(log.target_id);
        recipient_name = cust?.full_name || "Customer";
        recipient_email = cust?.email || "";
      } else if (log.target_audience === "seller" && log.target_id) {
        const sel = sellerMap.get(log.target_id);
        recipient_name = sel?.business_name || "Seller";
        recipient_email = sel?.business_email || "";
      }

      return {
        ...log,
        recipient_name,
        recipient_email,
      };
    });

    return NextResponse.json({
      history: enrichedHistory,
      sellers: sellers || [],
      customers: customers || [],
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/admin/notifications - Send notification to seller or customer (single or broadcast)
export async function POST(req: NextRequest) {
  try {
    const supabase = await getSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify Admin Role
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "admin") {
      return NextResponse.json({ error: "Forbidden: Admin privileges required" }, { status: 403 });
    }

    const body = await req.json();
    const { 
      targetAudience, // 'all_sellers' | 'seller' | 'all_customers' | 'customer'
      targetId,       // seller_id or user_id
      title, 
      message, 
      type = "system", 
      priority = "medium", 
      linkUrl 
    } = body;

    if (!title || !message || !targetAudience) {
      return NextResponse.json({ error: "Title, message, and targetAudience are required" }, { status: 400 });
    }

    // 1. Broadcast to all sellers
    if (targetAudience === "all_sellers") {
      const { data: count, error } = await supabase.rpc("send_seller_notification_broadcast", {
        p_title: title,
        p_message: message,
        p_type: type,
        p_priority: priority,
        p_link_url: linkUrl || null,
      });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ success: true, count });
    }

    // 2. Direct to single seller
    if (targetAudience === "seller") {
      if (!targetId) {
        return NextResponse.json({ error: "targetId is required for single seller notification" }, { status: 400 });
      }

      const { error: insertError } = await supabase.from("seller_notifications").insert({
        seller_id: targetId,
        title,
        message,
        type,
        priority,
        link_url: linkUrl || null,
      });

      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }

      // Log to admin_notifications_log
      await supabase.from("admin_notifications_log").insert({
        sender_id: user.id,
        target_audience: "seller",
        target_id: targetId,
        title,
        message,
        type,
        priority,
        link_url: linkUrl || null,
        recipient_count: 1,
      });

      return NextResponse.json({ success: true });
    }

    // 3. Broadcast to all customers
    if (targetAudience === "all_customers") {
      const { data: count, error } = await supabase.rpc("send_customer_notification_broadcast", {
        p_title: title,
        p_message: message,
        p_type: type,
        p_priority: priority,
        p_link_url: linkUrl || null,
        p_sender_id: user.id,
      });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ success: true, count });
    }

    // 4. Direct to single customer
    if (targetAudience === "customer") {
      if (!targetId) {
        return NextResponse.json({ error: "targetId is required for single customer notification" }, { status: 400 });
      }

      const { error: insertError } = await supabase.from("customer_notifications").insert({
        user_id: targetId,
        title,
        message,
        type,
        priority,
        link_url: linkUrl || null,
      });

      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }

      // Log to admin_notifications_log
      await supabase.from("admin_notifications_log").insert({
        sender_id: user.id,
        target_audience: "customer",
        target_id: targetId,
        title,
        message,
        type,
        priority,
        link_url: linkUrl || null,
        recipient_count: 1,
      });

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid targetAudience" }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

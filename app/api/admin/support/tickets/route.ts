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

// GET /api/admin/support/tickets - Admin fetch all tickets with metrics & filters
export async function GET(req: NextRequest) {
  try {
    const supabase = await getSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Server-side Admin Role Verification
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "admin") {
      return NextResponse.json({ error: "Forbidden: Admin privileges required" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const statusFilter = searchParams.get("status");
    const categoryFilter = searchParams.get("category");
    const priorityFilter = searchParams.get("priority");
    const search = searchParams.get("search");

    // Fetch all tickets for metric calculation
    const { data: allTickets, error: fetchAllError } = await supabase
      .from("support_tickets")
      .select("id, status, priority, category");

    if (fetchAllError) {
      // Table may not yet be migrated
      return NextResponse.json({
        success: true,
        migrationPending: true,
        tickets: [],
        metrics: { total: 0, open: 0, underReview: 0, actionTaken: 0, resolved: 0, closed: 0 },
      });
    }

    const total = allTickets?.length || 0;
    const open = allTickets?.filter((t) => t.status === "OPEN").length || 0;
    const underReview = allTickets?.filter((t) => t.status === "UNDER_REVIEW").length || 0;
    const actionTaken = allTickets?.filter((t) => t.status === "ACTION_TAKEN").length || 0;
    const resolved = allTickets?.filter((t) => t.status === "RESOLVED").length || 0;
    const closed = allTickets?.filter((t) => t.status === "CLOSED").length || 0;

    // Build filtered query
    let query = supabase
      .from("support_tickets")
      .select("*, support_ticket_messages(*)")
      .order("created_at", { ascending: false });

    if (statusFilter && statusFilter !== "ALL") {
      query = query.eq("status", statusFilter);
    }
    if (categoryFilter && categoryFilter !== "ALL") {
      query = query.eq("category", categoryFilter);
    }
    if (priorityFilter && priorityFilter !== "ALL") {
      query = query.eq("priority", priorityFilter);
    }
    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      query = query.or(`ticket_number.ilike.${q},customer_name.ilike.${q},customer_email.ilike.${q},subject.ilike.${q},order_number.ilike.${q}`);
    }

    const { data: tickets, error: queryError } = await query;

    if (queryError) {
      return NextResponse.json({ error: queryError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      migrationPending: false,
      metrics: { total, open, underReview, actionTaken, resolved, closed },
      tickets: tickets || [],
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}

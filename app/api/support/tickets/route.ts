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

// GET /api/support/tickets - Retrieve customer's tickets and conversation history
export async function GET(req: NextRequest) {
  try {
    const supabase = await getSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: "Authentication required to view support tickets.", tickets: [] },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const ticketNumber = searchParams.get("ticket");

    let query = supabase
      .from("support_tickets")
      .select("*, support_ticket_messages(*)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (ticketNumber) {
      query = query.eq("ticket_number", ticketNumber.trim());
    }

    const { data, error } = await query;

    if (error) {
      // Table pending migration in live database
      return NextResponse.json({
        success: true,
        tickets: [],
        migrationPending: true,
        message: "Support tables pending database migration.",
      });
    }

    return NextResponse.json({
      success: true,
      tickets: data || [],
      migrationPending: false,
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { success: false, error: errMsg, tickets: [] },
      { status: 500 }
    );
  }
}

// POST /api/support/tickets - Create a new support ticket via atomic RPC
export async function POST(req: NextRequest) {
  try {
    const supabase = await getSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: "Please sign in to submit a support request." },
        { status: 401 }
      );
    }

    const body = await req.json();
    const {
      category,
      orderNumber,
      orderId,
      subject,
      description,
      phoneNumber,
    } = body;

    if (!category || !subject?.trim() || !description?.trim()) {
      return NextResponse.json(
        { success: false, error: "Category, subject, and description are required." },
        { status: 400 }
      );
    }

    // Call atomic PostgreSQL RPC (creates ticket + initial message in one single transaction)
    const { data: createdTicket, error: rpcError } = await supabase.rpc("create_support_ticket", {
      p_category: category,
      p_subject: subject.trim(),
      p_description: description.trim(),
      p_order_id: orderId || null,
      p_order_number: orderNumber || null,
      p_phone_number: phoneNumber?.trim() || null,
    });

    if (rpcError) {
      return NextResponse.json(
        { success: false, error: rpcError.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      ticket: createdTicket,
      ticketNumber: createdTicket?.ticket_number,
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { success: false, error: errMsg },
      { status: 500 }
    );
  }
}

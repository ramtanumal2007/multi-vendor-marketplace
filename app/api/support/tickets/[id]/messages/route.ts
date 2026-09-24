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

// GET /api/support/tickets/[id]/messages - Fetch timeline for a ticket
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await getSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: "Authentication required." },
        { status: 401 }
      );
    }

    const ticketId = params.id;

    // RLS ensures customer only sees messages for tickets they own
    const { data, error } = await supabase
      .from("support_ticket_messages")
      .select("*")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({
        success: true,
        messages: [],
        migrationPending: true,
      });
    }

    return NextResponse.json({
      success: true,
      messages: data || [],
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json(
      { success: false, error: errMsg },
      { status: 500 }
    );
  }
}

// POST /api/support/tickets/[id]/messages - Send customer reply via atomic RPC
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await getSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: "Authentication required to reply." },
        { status: 401 }
      );
    }

    const ticketId = params.id;
    const body = await req.json();
    const { message } = body;

    if (!message || !message.trim()) {
      return NextResponse.json(
        { success: false, error: "Message content cannot be empty." },
        { status: 400 }
      );
    }

    // Call atomic PostgreSQL RPC for customer replies
    const { data: createdMessage, error: rpcError } = await supabase.rpc("customer_reply_to_ticket", {
      p_ticket_id: ticketId,
      p_message: message.trim(),
    });

    if (rpcError) {
      return NextResponse.json(
        { success: false, error: rpcError.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: createdMessage,
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json(
      { success: false, error: errMsg },
      { status: 500 }
    );
  }
}

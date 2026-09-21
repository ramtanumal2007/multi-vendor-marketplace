import { NextResponse } from "next/server";
import { createOrderRecord } from "@/lib/order-service";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const result = await createOrderRecord(body);
    return NextResponse.json(result, { status: result.status || (result.success ? 200 : 400) });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to place order.";
    return NextResponse.json(
      { success: false, message },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient, createAdminClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * Helper to authenticate caller as an Admin using server-side session cookies.
 */
async function authenticateAdmin() {
  const cookieStore = cookies();
  const supabase = createServerClient(
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
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: "Unauthorized: Please log in as an administrator.", status: 401 };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profileError || !profile || profile.role !== "admin") {
    return { error: "Forbidden: Administrator privileges required.", status: 403 };
  }

  return { user, profile };
}

/**
 * Service role client for authoritative database operations.
 */
function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * GET /api/admin/hero-slides
 * Returns authoritative list of all hero slides ordered by sort_order.
 */
export async function GET() {
  try {
    const auth = await authenticateAdmin();
    if ("error" in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const supabaseAdmin = getAdminClient();
    const { data: slides, error } = await supabaseAdmin
      .from("hero_slides")
      .select("*")
      .order("sort_order", { ascending: true });

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, slides: slides || [] });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { success: false, error: errorMsg },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/admin/hero-slides
 * Supports:
 *  - Toggling active state: { id, is_active: boolean }
 *  - Updating slide details: { id, heading, subheading, cta_text, cta_link, image_url, sort_order, is_active }
 *  - Reordering batch: { reorder: [{ id, sort_order }, ...] }
 */
export async function PATCH(req: NextRequest) {
  try {
    const auth = await authenticateAdmin();
    if ("error" in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const body = await req.json();
    const supabaseAdmin = getAdminClient();

    // 1. Batch reorder operation
    if (body.reorder && Array.isArray(body.reorder)) {
      const updates = body.reorder.map((item: { id: string; sort_order: number }) =>
        supabaseAdmin
          .from("hero_slides")
          .update({ sort_order: item.sort_order })
          .eq("id", item.id)
      );

      await Promise.all(updates);

      const { data: updatedSlides, error: refetchErr } = await supabaseAdmin
        .from("hero_slides")
        .select("*")
        .order("sort_order", { ascending: true });

      if (refetchErr) {
        return NextResponse.json({ success: false, error: refetchErr.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, slides: updatedSlides });
    }

    // 2. Single slide update / toggle
    const { id, is_active, heading, subheading, cta_text, cta_link, image_url, sort_order } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: "Slide ID is required." }, { status: 400 });
    }

    const updatePayload: Record<string, string | number | boolean> = {};
    if (typeof is_active === "boolean") updatePayload.is_active = is_active;
    if (heading !== undefined) updatePayload.heading = heading;
    if (subheading !== undefined) updatePayload.subheading = subheading;
    if (cta_text !== undefined) updatePayload.cta_text = cta_text;
    if (cta_link !== undefined) updatePayload.cta_link = cta_link;
    if (image_url !== undefined) updatePayload.image_url = image_url;
    if (typeof sort_order === "number") updatePayload.sort_order = sort_order;

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json({ success: false, error: "No update fields provided." }, { status: 400 });
    }

    const { data: updatedSlide, error: updateError } = await supabaseAdmin
      .from("hero_slides")
      .update(updatePayload)
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json(
        { success: false, error: `Database update failed: ${updateError.message}` },
        { status: 500 }
      );
    }

    if (!updatedSlide) {
      return NextResponse.json(
        { success: false, error: "Slide not found or no rows were modified." },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, slide: updatedSlide });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { success: false, error: errorMsg },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/hero-slides
 * Creates a new hero slide record.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateAdmin();
    if ("error" in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const body = await req.json();
    const { heading, subheading, cta_text, cta_link, image_url, sort_order, is_active } = body;

    if (!heading || !image_url) {
      return NextResponse.json(
        { success: false, error: "Heading and image_url are required." },
        { status: 400 }
      );
    }

    const supabaseAdmin = getAdminClient();
    const { data: createdSlide, error: insertError } = await supabaseAdmin
      .from("hero_slides")
      .insert([
        {
          heading,
          subheading: subheading || "",
          cta_text: cta_text || "Shop Now",
          cta_link: cta_link || "/products",
          image_url,
          sort_order: typeof sort_order === "number" ? sort_order : 1,
          is_active: typeof is_active === "boolean" ? is_active : true,
        },
      ])
      .select()
      .single();

    if (insertError) {
      return NextResponse.json(
        { success: false, error: `Failed to insert slide: ${insertError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, slide: createdSlide });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { success: false, error: errorMsg },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/hero-slides
 * Deletes a hero slide record by ID.
 */
export async function DELETE(req: NextRequest) {
  try {
    const auth = await authenticateAdmin();
    if ("error" in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ success: false, error: "Slide ID is required." }, { status: 400 });
    }

    const supabaseAdmin = getAdminClient();
    const { error: deleteError } = await supabaseAdmin
      .from("hero_slides")
      .delete()
      .eq("id", id);

    if (deleteError) {
      return NextResponse.json(
        { success: false, error: `Failed to delete slide: ${deleteError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, id });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { success: false, error: errorMsg },
      { status: 500 }
    );
  }
}

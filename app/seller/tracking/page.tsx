import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import ApplicationTrackingClient from "./ApplicationTrackingClient";

export const dynamic = "force-dynamic";

export default async function TrackingPage() {
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
            // Ignore in Server Component
          }
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/seller/login");
  }

  // 1. Fetch complete seller profile
  const { data: sellerProfile } = await supabase
    .from("seller_profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (!sellerProfile) {
    redirect("/seller/onboarding");
  }

  // 2. Fetch application events history
  const { data: events } = await supabase
    .from("seller_application_events")
    .select("*")
    .eq("seller_id", user.id)
    .order("created_at", { ascending: false });

  // 3. Fetch store information
  const { data: store } = await supabase
    .from("stores")
    .select("id, name, status, slug")
    .eq("seller_id", user.id)
    .maybeSingle();

  return (
    <div className="max-w-4xl mx-auto py-2">
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">
          Application Tracking
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Track the real-time review status, admin decisions, and action items for your seller application.
        </p>
      </div>

      <ApplicationTrackingClient
        initialProfile={sellerProfile}
        initialEvents={events || []}
        store={store || null}
        userId={user.id}
      />
    </div>
  );
}

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import ApplicationTrackingClient from "./ApplicationTrackingClient";

export default async function TrackingPage() {
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
  
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/seller/login");
  }

  const { data: sellerProfile } = await supabase
    .from("seller_profiles")
    .select("id, business_name, created_at, verification_status")
    .eq("id", user.id)
    .single();

  if (!sellerProfile) {
    redirect("/seller/onboarding");
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Application Tracking</h1>
        <p className="mt-2 text-gray-600">Track the status of your seller application.</p>
      </div>
      
      <ApplicationTrackingClient initialProfile={sellerProfile} userId={user.id} />
    </div>
  );
}

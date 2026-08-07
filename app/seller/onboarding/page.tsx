import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import OnboardingForm from "./OnboardingForm";

export default async function SellerOnboardingPage() {
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
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/seller/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const { data: sellerProfile } = await supabase
    .from("seller_profiles")
    .select("id, verification_status")
    .eq("id", user.id)
    .single();

  if (profile?.role === "seller" || profile?.role === "admin") {
    if (sellerProfile && sellerProfile.verification_status === "approved") {
      redirect("/seller"); // Already onboarded and approved
    }
  }

  if (sellerProfile) {
    redirect("/seller/tracking");
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          Become a Seller
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Tell us about your business to get started on the marketplace.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-xl">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <OnboardingForm />
        </div>
      </div>
    </div>
  );
}

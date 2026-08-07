import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import StoreForm from "./StoreForm";

export default async function SellerStorePage() {
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
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    redirect("/login");
  }

  // Fetch the seller profile first to get the seller ID
  const { data: sellerProfile } = await supabase
    .from("seller_profiles")
    .select("id")
    .eq("id", session.user.id)
    .single();

  if (!sellerProfile) {
    redirect("/seller/onboarding");
  }

  // Fetch store if it exists
  const { data: store } = await supabase
    .from("stores")
    .select("*")
    .eq("seller_id", session.user.id)
    .single();

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          {store ? "Manage Store" : "Create Your Store"}
        </h1>
        <p className="text-gray-500 mt-1">
          {store 
            ? "Update your store's public profile and contact information." 
            : "Set up your storefront to start listing products."}
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <StoreForm existingStore={store} sellerId={session.user.id} />
      </div>
    </div>
  );
}

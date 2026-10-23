import { ReactNode } from "react";
import { createServerClient } from "@/lib/supabase";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SellerNavigation } from "@/components/seller/SellerNavigation";

export default async function SellerDashboardLayout({ children }: { children: ReactNode }) {
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
            // Ignore in Server Component if middleware handles refreshing
          }
        },
      },
    }
  );
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/seller/login");
  }

  const { data: sellerProfile } = await supabase
    .from("seller_profiles")
    .select("verification_status")
    .eq("id", user.id)
    .maybeSingle();

  if (sellerProfile?.verification_status === "approved") {
    // Approved seller authorized - globally enforce membership expiry & grace period
    try {
      await supabase.rpc("check_seller_membership_status", { p_seller_id: user.id });
    } catch {
      // Non-blocking fallback
    }
  } else if (sellerProfile?.verification_status === "suspended") {
    // Suspended seller blocked
    redirect("/seller/tracking");
  } else if (sellerProfile) {
    // Pending / Reviewing seller redirected to tracking
    redirect("/seller/tracking");
  } else {
    // Customer without seller profile redirected to onboarding
    redirect("/seller/onboarding");
  }

  return (
    <SellerNavigation sellerId={user.id}>
      {children}
    </SellerNavigation>
  );
}


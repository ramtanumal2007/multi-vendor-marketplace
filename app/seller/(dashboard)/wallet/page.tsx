import React from "react";
import { createServerClient } from "@/lib/supabase";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import SellerPayoutHubClient from "./SellerPayoutHubClient";

export const dynamic = "force-dynamic";

export default async function SellerWalletPage() {
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
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    redirect("/seller/login");
  }

  // Verify seller profile
  const { data: sellerProfile } = await supabase
    .from("seller_profiles")
    .select("id, business_name, verification_status")
    .eq("id", user.id)
    .maybeSingle();

  if (!sellerProfile) {
    redirect("/seller/onboarding");
  }

  return (
    <SellerPayoutHubClient
      initialBusinessName={sellerProfile.business_name || "Merchant Store"}
      sellerId={user.id}
    />
  );
}

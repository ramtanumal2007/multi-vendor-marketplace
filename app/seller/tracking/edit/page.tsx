import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import SellerEditForm from "./SellerEditForm";

export default async function SellerEditPage() {
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
    .select("*")
    .eq("id", user.id)
    .single();

  if (!sellerProfile) {
    redirect("/seller/onboarding");
  }

  if (sellerProfile.verification_status !== "correction_required") {
    redirect("/seller/tracking");
  }

  // Fetch the latest comment
  const { data: commentData } = await supabase
    .from("seller_application_events")
    .select("admin_comment")
    .eq("seller_id", user.id)
    .eq("event_type", "correction_requested")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Edit Application</h1>
        <p className="mt-2 text-gray-600">Please address the requested corrections before resubmitting your application.</p>
      </div>
      
      {commentData?.admin_comment && (
        <div className="bg-purple-50 text-purple-800 p-4 rounded-lg border border-purple-200 shadow-sm mb-8">
          <h3 className="font-semibold mb-2">Admin Feedback:</h3>
          <p className="text-sm whitespace-pre-wrap">{commentData.admin_comment}</p>
        </div>
      )}

      <SellerEditForm initialData={sellerProfile} />
    </div>
  );
}

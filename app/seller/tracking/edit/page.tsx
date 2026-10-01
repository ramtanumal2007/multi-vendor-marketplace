import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import SellerEditForm from "./SellerEditForm";
import { AlertCircle } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function SellerEditPage() {
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

  const { data: sellerProfile } = await supabase
    .from("seller_profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!sellerProfile) {
    redirect("/seller/onboarding");
  }

  if (
    sellerProfile.verification_status !== "correction_required" &&
    sellerProfile.verification_status !== "rejected" &&
    sellerProfile.verification_status !== "pending" &&
    sellerProfile.verification_status !== "under_review"
  ) {
    redirect("/seller/tracking");
  }

  // Fetch the latest correction event for fallback
  const { data: commentData } = await supabase
    .from("seller_application_events")
    .select("admin_comment, admin_reason, admin_note")
    .eq("seller_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const correctionReason =
    sellerProfile.correction_reason ||
    commentData?.admin_reason ||
    commentData?.admin_comment;

  const adminNote = sellerProfile.correction_note || commentData?.admin_note;

  return (
    <div className="max-w-3xl mx-auto py-2">
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">
          Update Application Details
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Review the administrator feedback below, adjust your information, and resubmit for review.
        </p>
      </div>

      {(correctionReason || adminNote) && (
        <div className="bg-purple-50 text-purple-950 p-5 rounded-2xl border border-purple-200 shadow-xs mb-8 space-y-3">
          <div className="flex items-center gap-2 text-purple-900 font-bold text-sm">
            <AlertCircle className="w-5 h-5 text-purple-700" />
            <span>Administrator Feedback & Required Corrections</span>
          </div>

          {correctionReason && (
            <div>
              <div className="text-xs uppercase font-bold tracking-wider text-purple-800 mb-0.5">
                Correction Reason
              </div>
              <div className="bg-white p-3 rounded-lg border border-purple-100 text-sm font-medium text-slate-800">
                {correctionReason}
              </div>
            </div>
          )}

          {adminNote && (
            <div>
              <div className="text-xs uppercase font-bold tracking-wider text-slate-600 mb-0.5">
                Admin Note / Guidance
              </div>
              <div className="bg-white p-3 rounded-lg border border-slate-200 text-sm text-slate-700 whitespace-pre-wrap">
                {adminNote}
              </div>
            </div>
          )}
        </div>
      )}

      <SellerEditForm initialData={sellerProfile} />
    </div>
  );
}

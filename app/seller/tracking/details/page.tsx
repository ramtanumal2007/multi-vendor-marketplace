import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Store, User, Mail, Phone, Calendar } from "lucide-react";

export default async function TrackingDetailsPage() {
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

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Application Details</h1>
        <p className="mt-2 text-gray-600">Review the details you submitted for your seller application.</p>
      </div>

      <div className="bg-white shadow rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
          <h3 className="text-lg leading-6 font-medium text-gray-900">Store Information</h3>
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 uppercase tracking-wider">
            {sellerProfile.verification_status}
          </span>
        </div>
        <div className="px-6 py-5 space-y-6">
          <div className="flex items-start gap-4">
            <div className="bg-gray-100 p-2 rounded text-gray-500">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Business Name</p>
              <p className="mt-1 text-base text-gray-900">{sellerProfile.business_name}</p>
            </div>
          </div>
          
          <div className="flex items-start gap-4">
            <div className="bg-gray-100 p-2 rounded text-gray-500">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Business Type</p>
              <p className="mt-1 text-base text-gray-900 capitalize">{sellerProfile.business_type}</p>
            </div>
          </div>
        </div>

        <div className="px-6 py-5 border-t border-gray-200 bg-gray-50">
          <h3 className="text-lg leading-6 font-medium text-gray-900">Contact Details</h3>
        </div>
        <div className="px-6 py-5 space-y-6">
          <div className="flex items-start gap-4">
            <div className="bg-gray-100 p-2 rounded text-gray-500">
              <User className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Contact Name</p>
              <p className="mt-1 text-base text-gray-900">{sellerProfile.contact_name}</p>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <div className="bg-gray-100 p-2 rounded text-gray-500">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Business Email</p>
              <p className="mt-1 text-base text-gray-900">{sellerProfile.business_email}</p>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <div className="bg-gray-100 p-2 rounded text-gray-500">
              <Phone className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Phone Number</p>
              <p className="mt-1 text-base text-gray-900">{sellerProfile.phone || "Not provided"}</p>
            </div>
          </div>
        </div>

        <div className="px-6 py-5 border-t border-gray-200 bg-gray-50">
          <h3 className="text-lg leading-6 font-medium text-gray-900">Application Meta</h3>
        </div>
        <div className="px-6 py-5 space-y-6">
          <div className="flex items-start gap-4">
            <div className="bg-gray-100 p-2 rounded text-gray-500">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Submitted On</p>
              <p className="mt-1 text-base text-gray-900">{new Date(sellerProfile.created_at).toLocaleString()}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}






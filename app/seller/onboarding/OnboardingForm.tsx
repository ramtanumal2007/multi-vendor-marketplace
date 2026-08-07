"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { Store, User, Phone, Mail, Briefcase } from "lucide-react";

export default function OnboardingForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const data = {
      business_name: formData.get("business_name") as string,
      contact_name: formData.get("contact_name") as string,
      phone: formData.get("phone") as string,
      business_email: formData.get("business_email") as string,
      business_type: formData.get("business_type") as string,
    };

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) throw new Error("Not authenticated");

      // Use atomic RPC for creating both seller profile and initial pending store
      const { error: rpcError } = await supabase.rpc("submit_seller_onboarding", {
        p_business_name: data.business_name,
        p_contact_name: data.contact_name,
        p_phone: data.phone,
        p_business_email: data.business_email,
        p_business_type: data.business_type,
        p_store_name: data.business_name,
        p_store_description: `${data.business_name} official seller store`
      });

      if (rpcError) {
        throw new Error(rpcError.message || "Failed to submit onboarding. Please ensure the database RPC migration has been executed.");
      }

      router.push("/seller/tracking?submitted=true");

    } catch (err: any) {
      console.error(err);
      setError(err.message || "An error occurred during onboarding.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="bg-red-50 text-red-500 p-3 rounded-md text-sm">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="business_name" className="block text-sm font-medium text-gray-700">Business Name</label>
        <div className="mt-1 relative rounded-md shadow-sm">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Store className="h-5 w-5 text-gray-400" />
          </div>
          <input
            type="text"
            name="business_name"
            id="business_name"
            required
            className="focus:ring-blue-500 focus:border-blue-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-md py-2 px-3 border"
            placeholder="Acme Corp"
          />
        </div>
      </div>

      <div>
        <label htmlFor="contact_name" className="block text-sm font-medium text-gray-700">Contact Name</label>
        <div className="mt-1 relative rounded-md shadow-sm">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <User className="h-5 w-5 text-gray-400" />
          </div>
          <input
            type="text"
            name="contact_name"
            id="contact_name"
            required
            className="focus:ring-blue-500 focus:border-blue-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-md py-2 px-3 border"
            placeholder="John Doe"
          />
        </div>
      </div>

      <div>
        <label htmlFor="business_email" className="block text-sm font-medium text-gray-700">Business Email</label>
        <div className="mt-1 relative rounded-md shadow-sm">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Mail className="h-5 w-5 text-gray-400" />
          </div>
          <input
            type="email"
            name="business_email"
            id="business_email"
            required
            className="focus:ring-blue-500 focus:border-blue-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-md py-2 px-3 border"
            placeholder="contact@acme.com"
          />
        </div>
      </div>

      <div>
        <label htmlFor="phone" className="block text-sm font-medium text-gray-700">Phone Number</label>
        <div className="mt-1 relative rounded-md shadow-sm">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Phone className="h-5 w-5 text-gray-400" />
          </div>
          <input
            type="tel"
            name="phone"
            id="phone"
            required
            className="focus:ring-blue-500 focus:border-blue-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-md py-2 px-3 border"
            placeholder="+1 (555) 000-0000"
          />
        </div>
      </div>

      <div>
        <label htmlFor="business_type" className="block text-sm font-medium text-gray-700">Business Type</label>
        <div className="mt-1 relative rounded-md shadow-sm">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Briefcase className="h-5 w-5 text-gray-400" />
          </div>
          <select
            name="business_type"
            id="business_type"
            required
            className="focus:ring-blue-500 focus:border-blue-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-md py-2 px-3 border bg-white"
          >
            <option value="">Select a business type</option>
            <option value="individual">Individual / Sole Proprietor</option>
            <option value="llc">LLC</option>
            <option value="corporation">Corporation</option>
            <option value="partnership">Partnership</option>
          </select>
        </div>
      </div>

      <div>
        <button
          type="submit"
          disabled={loading}
          className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition"
        >
          {loading ? "Submitting..." : "Submit Application"}
        </button>
      </div>
    </form>
  );
}

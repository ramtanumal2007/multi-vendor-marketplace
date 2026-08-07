"use client";

import React, { useState } from "react";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { Store, User, Mail, Phone, Briefcase } from "lucide-react";

export default function SellerEditForm({ initialData }: { initialData: any }) {
  const [formData, setFormData] = useState({
    business_name: initialData.business_name || "",
    contact_name: initialData.contact_name || "",
    phone: initialData.phone || "",
    business_email: initialData.business_email || "",
    business_type: initialData.business_type || "individual",
  });
  
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();
  const { addToast } = useToast();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const { error } = await supabase.rpc("resubmit_application", {
        p_business_name: formData.business_name,
        p_contact_name: formData.contact_name,
        p_phone: formData.phone,
        p_business_email: formData.business_email,
        p_business_type: formData.business_type,
      });

      if (error) throw error;

      addToast({
        title: "Success",
        description: "Application resubmitted successfully.",
        type: "success",
      });

      // Redirect back to tracking page
      router.push("/seller/tracking");
      router.refresh();
    } catch (err: any) {
      addToast({
        title: "Error",
        description: err.message || "Failed to resubmit application.",
        type: "error",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white shadow rounded-lg border border-gray-200 overflow-hidden">
      <div className="p-6 space-y-6">
        <div>
          <label htmlFor="business_name" className="block text-sm font-medium text-gray-700 mb-1">
            Business Name
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Store className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              name="business_name"
              id="business_name"
              required
              className="pl-10 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-accent focus:border-accent sm:text-sm"
              value={formData.business_name}
              onChange={handleChange}
            />
          </div>
        </div>

        <div>
          <label htmlFor="business_type" className="block text-sm font-medium text-gray-700 mb-1">
            Business Type
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Briefcase className="h-5 w-5 text-gray-400" />
            </div>
            <select
              name="business_type"
              id="business_type"
              className="pl-10 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-accent focus:border-accent sm:text-sm bg-white"
              value={formData.business_type}
              onChange={handleChange}
            >
              <option value="individual">Individual / Sole Proprietor</option>
              <option value="llc">LLC (Limited Liability Company)</option>
              <option value="corporation">Corporation</option>
              <option value="partnership">Partnership</option>
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="contact_name" className="block text-sm font-medium text-gray-700 mb-1">
            Contact Name
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <User className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              name="contact_name"
              id="contact_name"
              required
              className="pl-10 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-accent focus:border-accent sm:text-sm"
              value={formData.contact_name}
              onChange={handleChange}
            />
          </div>
        </div>

        <div>
          <label htmlFor="business_email" className="block text-sm font-medium text-gray-700 mb-1">
            Business Email
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Mail className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="email"
              name="business_email"
              id="business_email"
              required
              className="pl-10 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-accent focus:border-accent sm:text-sm"
              value={formData.business_email}
              onChange={handleChange}
            />
          </div>
        </div>

        <div>
          <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
            Phone Number
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Phone className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="tel"
              name="phone"
              id="phone"
              className="pl-10 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-accent focus:border-accent sm:text-sm"
              value={formData.phone}
              onChange={handleChange}
            />
          </div>
        </div>
      </div>
      <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3">
        <Button variant="outline" type="button" onClick={() => router.push('/seller/tracking')} disabled={isLoading}>
          Cancel
        </Button>
        <Button variant="primary" type="submit" isLoading={isLoading}>
          Resubmit Application
        </Button>
      </div>
    </form>
  );
}

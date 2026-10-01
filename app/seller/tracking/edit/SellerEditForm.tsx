"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { Store, User, Mail, Phone, Briefcase, ArrowRight } from "lucide-react";

export interface SellerEditInitialData {
  business_name?: string | null;
  contact_name?: string | null;
  phone?: string | null;
  business_email?: string | null;
  business_type?: string | null;
}

export default function SellerEditForm({ initialData }: { initialData: SellerEditInitialData }) {
  const [formData, setFormData] = useState({
    business_name: initialData.business_name || "",
    contact_name: initialData.contact_name || "",
    phone: initialData.phone || "",
    business_email: initialData.business_email || "",
    business_type: initialData.business_type || "individual",
  });
  
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { addToast } = useToast();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const res = await fetch("/api/seller/application/resubmit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business_name: formData.business_name.trim(),
          contact_name: formData.contact_name.trim(),
          phone: formData.phone.trim(),
          business_email: formData.business_email.trim(),
          business_type: formData.business_type,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to resubmit application.");
      }

      addToast({
        title: "Application Resubmitted",
        description: data.message || "Your updated application has been submitted and is now Under Review.",
        type: "success",
      });

      router.push("/seller/tracking");
      router.refresh();
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err !== null && "message" in err
          ? String((err as { message: unknown }).message)
          : "Failed to resubmit application.";

      addToast({
        title: "Resubmission Error",
        description: message,
        type: "error",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white shadow-xs rounded-2xl border border-slate-200 overflow-hidden">
      <div className="p-6 md:p-8 space-y-6">
        <div>
          <label htmlFor="business_name" className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Business / Store Name <span className="text-rose-500">*</span>
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <Store className="h-4 w-4" />
            </div>
            <input
              type="text"
              name="business_name"
              id="business_name"
              required
              className="pl-9 block w-full border border-slate-300 rounded-xl py-2.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all font-medium text-slate-800"
              value={formData.business_name}
              onChange={handleChange}
              placeholder="e.g. Acme Craft Store"
            />
          </div>
        </div>

        <div>
          <label htmlFor="business_type" className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Business Entity Type <span className="text-rose-500">*</span>
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <Briefcase className="h-4 w-4" />
            </div>
            <select
              name="business_type"
              id="business_type"
              className="pl-9 block w-full border border-slate-300 rounded-xl py-2.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all font-medium text-slate-800 bg-white"
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
          <label htmlFor="contact_name" className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Contact Representative Name <span className="text-rose-500">*</span>
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <User className="h-4 w-4" />
            </div>
            <input
              type="text"
              name="contact_name"
              id="contact_name"
              required
              className="pl-9 block w-full border border-slate-300 rounded-xl py-2.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all font-medium text-slate-800"
              value={formData.contact_name}
              onChange={handleChange}
              placeholder="Full Name"
            />
          </div>
        </div>

        <div>
          <label htmlFor="business_email" className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Official Business Email <span className="text-rose-500">*</span>
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <Mail className="h-4 w-4" />
            </div>
            <input
              type="email"
              name="business_email"
              id="business_email"
              required
              className="pl-9 block w-full border border-slate-300 rounded-xl py-2.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all font-medium text-slate-800"
              value={formData.business_email}
              onChange={handleChange}
              placeholder="contact@store.com"
            />
          </div>
        </div>

        <div>
          <label htmlFor="phone" className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Phone Number
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <Phone className="h-4 w-4" />
            </div>
            <input
              type="tel"
              name="phone"
              id="phone"
              className="pl-9 block w-full border border-slate-300 rounded-xl py-2.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all font-medium text-slate-800"
              value={formData.phone}
              onChange={handleChange}
              placeholder="+91 9876543210"
            />
          </div>
        </div>
      </div>

      <div className="px-6 md:px-8 py-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
        <p className="text-xs text-slate-500">
          Submitting will update your business records and restart administrative review.
        </p>
        <div className="flex gap-3 w-full sm:w-auto">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => router.back()}
            disabled={isLoading}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            isLoading={isLoading}
            className="w-full sm:w-auto bg-purple-600 hover:bg-purple-700 text-white"
          >
            Resubmit for Review <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </div>
    </form>
  );
}

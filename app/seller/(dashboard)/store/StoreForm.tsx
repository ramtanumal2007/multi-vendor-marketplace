"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { Store as StoreIcon, Palette, FileText, Share2, Check } from "lucide-react";

export default function StoreForm({ existingStore, sellerId }: { existingStore: Record<string, unknown> | null, sellerId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [taglineText, setTaglineText] = useState(existingStore?.tagline || "");

  const router = useRouter();
  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    const formData = new FormData(e.currentTarget);
    const taglineVal = (formData.get("tagline") as string) || "";

    if (taglineVal.length > 80) {
      setError("Store tagline cannot exceed 80 characters.");
      setLoading(false);
      return;
    }

    const data = {
      name: formData.get("name") as string,
      slug: formData.get("slug") as string,
      tagline: taglineVal,
      primary_color: (formData.get("primary_color") as string) || "#2563EB",
      logo_url: formData.get("logo_url") as string,
      banner_url: formData.get("banner_url") as string,
      description: formData.get("description") as string,
      about_store: formData.get("about_store") as string,
      shipping_policy: formData.get("shipping_policy") as string,
      return_policy: formData.get("return_policy") as string,
      tax_gst_number: formData.get("tax_gst_number") as string,
      bank_account_details: formData.get("bank_account_details") as string,
      seo_title: formData.get("seo_title") as string,
      seo_description: formData.get("seo_description") as string,
      email: formData.get("email") as string,
      phone: formData.get("phone") as string,
      social_instagram: formData.get("social_instagram") as string,
      social_facebook: formData.get("social_facebook") as string,
      social_twitter: formData.get("social_twitter") as string,
      social_website: formData.get("social_website") as string,
    };

    try {
      if (existingStore) {
        // Update existing store
        const { error: updateError } = await supabase
          .from("stores")
          .update(data)
          .eq("id", existingStore.id);

        if (updateError) throw updateError;
      } else {
        // Create new store
        const { error: insertError } = await supabase
          .from("stores")
          .insert({
            seller_id: sellerId,
            ...data,
            status: "pending",
          });

        if (insertError) throw insertError;
      }

      setSuccess("Store details and branding saved successfully!");
      router.refresh();
      if (!existingStore) {
        router.push("/seller");
      }
    } catch (err: unknown) {
      console.error(err);
      const message = err instanceof Error ? err.message : "An error occurred while saving the store.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8 max-w-4xl">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl text-xs font-medium">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-xl text-xs font-medium flex items-center">
          <Check className="w-4 h-4 text-emerald-600 mr-2" /> {success}
        </div>
      )}

      {existingStore && (
        <div className="bg-slate-50 border border-slate-200 text-slate-700 p-4 rounded-xl text-xs flex justify-between items-center">
          <div>
            <strong className="text-slate-900">Verification Status:</strong>{" "}
            <span className="uppercase font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
              {existingStore.status}
            </span>
          </div>
        </div>
      )}

      {/* Section 1: Basic Store Identity */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2 border-b pb-3">
          <StoreIcon className="w-5 h-5 text-blue-600" /> Basic Identity & Contact
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label htmlFor="name" className="block text-xs font-bold text-slate-700 mb-1">Store Name *</label>
            <input
              type="text"
              name="name"
              id="name"
              defaultValue={existingStore?.name}
              required
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label htmlFor="slug" className="block text-xs font-bold text-slate-700 mb-1">Store URL Slug *</label>
            <div className="flex rounded-lg shadow-xs">
              <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-slate-300 bg-slate-50 text-slate-500 text-xs">
                /store/
              </span>
              <input
                type="text"
                name="slug"
                id="slug"
                defaultValue={existingStore?.slug}
                required
                className="flex-1 min-w-0 block w-full px-3 py-2 rounded-r-lg border border-slate-300 text-sm focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        <div>
          <label htmlFor="tagline" className="block text-xs font-bold text-slate-700 mb-1">
            Store Tagline (Max 80 characters)
          </label>
          <input
            type="text"
            name="tagline"
            id="tagline"
            maxLength={80}
            value={taglineText}
            onChange={(e) => setTaglineText(e.target.value)}
            placeholder="e.g. Premium handcrafted electronics and accessories"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
          />
          <div className="text-right text-[11px] text-slate-400 mt-1">
            {taglineText.length} / 80 characters
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label htmlFor="email" className="block text-xs font-bold text-slate-700 mb-1">Support Email *</label>
            <input
              type="email"
              name="email"
              id="email"
              defaultValue={existingStore?.email}
              required
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>

          <div>
            <label htmlFor="phone" className="block text-xs font-bold text-slate-700 mb-1">Support Phone</label>
            <input
              type="tel"
              name="phone"
              id="phone"
              defaultValue={existingStore?.phone}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t pt-4">
          <div>
            <label htmlFor="tax_gst_number" className="block text-xs font-bold text-slate-700 mb-1">Tax / GST Number</label>
            <input
              type="text"
              name="tax_gst_number"
              id="tax_gst_number"
              defaultValue={existingStore?.tax_gst_number}
              placeholder="e.g. 22AAAAA0000A1Z5"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>

          <div>
            <label htmlFor="bank_account_details" className="block text-xs font-bold text-slate-700 mb-1">Bank Payout Info</label>
            <input
              type="text"
              name="bank_account_details"
              id="bank_account_details"
              defaultValue={existingStore?.bank_account_details}
              placeholder="Bank Name, Account #, IFSC / SWIFT Code"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t pt-4">
          <div>
            <label htmlFor="seo_title" className="block text-xs font-bold text-slate-700 mb-1">Store Meta SEO Title</label>
            <input
              type="text"
              name="seo_title"
              id="seo_title"
              defaultValue={existingStore?.seo_title}
              placeholder="Custom Search Engine Title"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>

          <div>
            <label htmlFor="seo_description" className="block text-xs font-bold text-slate-700 mb-1">Store Meta SEO Description</label>
            <input
              type="text"
              name="seo_description"
              id="seo_description"
              defaultValue={existingStore?.seo_description}
              placeholder="Search engine snippet summary"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>
        </div>
      </div>

      {/* Section 2: Store Branding & Assets */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2 border-b pb-3">
          <Palette className="w-5 h-5 text-purple-600" /> Branding Assets & Colors
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <label htmlFor="logo_url" className="block text-xs font-bold text-slate-700 mb-1">Logo Image URL</label>
            <input
              type="url"
              name="logo_url"
              id="logo_url"
              defaultValue={existingStore?.logo_url}
              placeholder="https://..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>

          <div>
            <label htmlFor="banner_url" className="block text-xs font-bold text-slate-700 mb-1">Store Banner URL</label>
            <input
              type="url"
              name="banner_url"
              id="banner_url"
              defaultValue={existingStore?.banner_url}
              placeholder="https://..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>

          <div>
            <label htmlFor="primary_color" className="block text-xs font-bold text-slate-700 mb-1">Primary Theme Color</label>
            <div className="flex items-center space-x-2">
              <input
                type="color"
                name="primary_color"
                id="primary_color"
                defaultValue={existingStore?.primary_color || "#2563EB"}
                className="w-10 h-9 p-1 border border-slate-300 rounded-lg cursor-pointer"
              />
              <input
                type="text"
                value={existingStore?.primary_color || "#2563EB"}
                readOnly
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono bg-slate-50"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Section 3: About & Store Policies */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2 border-b pb-3">
          <FileText className="w-5 h-5 text-amber-600" /> About Store & Policies
        </h2>

        <div>
          <label htmlFor="description" className="block text-xs font-bold text-slate-700 mb-1">Short Description</label>
          <textarea
            name="description"
            id="description"
            rows={3}
            defaultValue={existingStore?.description}
            placeholder="Brief overview of your store..."
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
          />
        </div>

        <div>
          <label htmlFor="about_store" className="block text-xs font-bold text-slate-700 mb-1">Full About Store Story</label>
          <textarea
            name="about_store"
            id="about_store"
            rows={4}
            defaultValue={existingStore?.about_store}
            placeholder="Tell customers about your brand origin and values..."
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label htmlFor="shipping_policy" className="block text-xs font-bold text-slate-700 mb-1">Shipping Policy</label>
            <textarea
              name="shipping_policy"
              id="shipping_policy"
              rows={3}
              defaultValue={existingStore?.shipping_policy}
              placeholder="e.g. Ships within 2-3 business days nationwide..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>

          <div>
            <label htmlFor="return_policy" className="block text-xs font-bold text-slate-700 mb-1">Return & Refund Policy</label>
            <textarea
              name="return_policy"
              id="return_policy"
              rows={3}
              defaultValue={existingStore?.return_policy}
              placeholder="e.g. 14 days easy returns policy for unused items..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>
        </div>
      </div>

      {/* Section 4: Social Links */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2 border-b pb-3">
          <Share2 className="w-5 h-5 text-emerald-600" /> Social Links & Website
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label htmlFor="social_instagram" className="block text-xs font-bold text-slate-700 mb-1">Instagram URL</label>
            <input
              type="url"
              name="social_instagram"
              id="social_instagram"
              defaultValue={existingStore?.social_instagram}
              placeholder="https://instagram.com/..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>

          <div>
            <label htmlFor="social_facebook" className="block text-xs font-bold text-slate-700 mb-1">Facebook URL</label>
            <input
              type="url"
              name="social_facebook"
              id="social_facebook"
              defaultValue={existingStore?.social_facebook}
              placeholder="https://facebook.com/..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>

          <div>
            <label htmlFor="social_twitter" className="block text-xs font-bold text-slate-700 mb-1">Twitter / X URL</label>
            <input
              type="url"
              name="social_twitter"
              id="social_twitter"
              defaultValue={existingStore?.social_twitter}
              placeholder="https://twitter.com/..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>

          <div>
            <label htmlFor="social_website" className="block text-xs font-bold text-slate-700 mb-1">Official Website URL</label>
            <input
              type="url"
              name="social_website"
              id="social_website"
              defaultValue={existingStore?.social_website}
              placeholder="https://..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>
        </div>
      </div>

      <div className="pt-2 flex justify-end">
        <button
          type="submit"
          disabled={loading}
          className="inline-flex justify-center py-2.5 px-6 border border-transparent shadow-md text-sm font-bold rounded-xl text-white bg-blue-600 hover:bg-blue-700 focus:outline-none disabled:opacity-50 transition-all"
        >
          {loading ? "Saving Details..." : existingStore ? "Save Store Profile" : "Create Store Profile"}
        </button>
      </div>
    </form>
  );
}

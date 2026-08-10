"use client";

import React, { useState, useEffect } from "react";
import { Save, Settings } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { createClient } from "@/lib/supabase";

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<any>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const { addToast } = useToast();
  const supabase = createClient();

  useEffect(() => {
    async function fetchSettings() {
      const { data, error } = await supabase.from("site_settings").select("*").limit(1).single();
      if (!error && data) {
        setSettings(data);
      }
      setIsLoading(false);
    }
    fetchSettings();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setSettings((prev: any) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    
    let query;
    if (settings.id) {
      query = supabase.from("site_settings").update(settings).eq("id", settings.id);
    } else {
      query = supabase.from("site_settings").insert(settings);
    }
    
    const { error } = await query;
    
    setIsSaving(false);
    
    if (error) {
      addToast({ title: "Error saving settings", description: error.message, type: "error" });
    } else {
      addToast({ title: "Settings saved", type: "success" });
    }
  };

  if (isLoading) {
    return <div className="p-12 flex justify-center"><div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="flex flex-col gap-6 w-full max-w-4xl mx-auto h-full pb-12">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Site Settings</h1>
          <p className="text-sm text-slate-500 mt-1">Manage global brand and store settings.</p>
        </div>
        <Button variant="primary" className="flex items-center gap-2" onClick={handleSave} disabled={isSaving}>
          <Save className="w-4 h-4" /> {isSaving ? "Saving..." : "Save Settings"}
        </Button>
      </div>

      <div className="flex flex-col gap-8">
        
        {/* Brand Section */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-200 bg-slate-50/50">
            <h3 className="text-lg font-semibold flex items-center gap-2"><Settings className="w-5 h-5 text-slate-500" /> Brand Identity</h3>
            <p className="text-sm text-slate-500 mt-1">Define your store's name and tagline.</p>
          </div>
          <div className="p-6 flex flex-col gap-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-slate-700">Site Name</label>
                <input 
                  type="text" 
                  name="site_name"
                  value={settings.site_name || ""}
                  onChange={handleChange}
                  className="w-full px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all"
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-slate-700">Tagline</label>
                <input 
                  type="text" 
                  name="tagline"
                  value={settings.tagline || ""}
                  onChange={handleChange}
                  className="w-full px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all"
                />
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-slate-700">Logo URL</label>
                <input 
                  type="text" 
                  name="logo_url"
                  value={settings.logo_url || ""}
                  onChange={handleChange}
                  placeholder="https://"
                  className="w-full px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all"
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-slate-700">Favicon URL</label>
                <input 
                  type="text" 
                  name="favicon_url"
                  value={settings.favicon_url || ""}
                  onChange={handleChange}
                  placeholder="https://"
                  className="w-full px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Contact Info */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-200 bg-slate-50/50">
            <h3 className="text-lg font-semibold flex items-center gap-2"><Settings className="w-5 h-5 text-slate-500" /> Contact Information</h3>
            <p className="text-sm text-slate-500 mt-1">Used on the contact page and in footer links.</p>
          </div>
          <div className="p-6 flex flex-col gap-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-slate-700">Support Email</label>
                <input 
                  type="email" 
                  name="contact_email"
                  value={settings.contact_email || ""}
                  onChange={handleChange}
                  className="w-full px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all"
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-slate-700">Support Phone</label>
                <input 
                  type="tel" 
                  name="contact_phone"
                  value={settings.contact_phone || ""}
                  onChange={handleChange}
                  className="w-full px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all"
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-slate-700">Business Address</label>
              <input 
                type="text" 
                name="business_address"
                value={settings.business_address || ""}
                onChange={handleChange}
                className="w-full px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all"
              />
            </div>
          </div>
        </div>
        
        {/* Localization & Tax & Delivery */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-200 bg-slate-50/50">
            <h3 className="text-lg font-semibold flex items-center gap-2"><Settings className="w-5 h-5 text-slate-500" /> Tax & Delivery Rules</h3>
            <p className="text-sm text-slate-500 mt-1">Configure global tax rate defaults and order free delivery threshold.</p>
          </div>
          <div className="p-6 flex flex-col gap-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-slate-700">Currency Code</label>
                <input 
                  type="text" 
                  name="currency_code"
                  placeholder="INR"
                  value={settings.currency_code || "INR"}
                  onChange={handleChange}
                  className="w-full px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all"
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-slate-700">Currency Symbol</label>
                <input 
                  type="text" 
                  name="currency_symbol"
                  placeholder="₹"
                  value={settings.currency_symbol || "₹"}
                  onChange={handleChange}
                  className="w-full px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all"
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-slate-700">Global Default Tax (%)</label>
                <input 
                  type="number" 
                  name="default_tax_rate"
                  placeholder="0"
                  value={settings.default_tax_rate ?? settings.tax_rate ?? 0}
                  onChange={handleChange}
                  className="w-full px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all"
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-slate-700">Free Delivery Order Minimum (₹)</label>
                <input 
                  type="number" 
                  name="free_delivery_threshold"
                  placeholder="500"
                  value={settings.free_delivery_threshold ?? 500}
                  onChange={handleChange}
                  className="w-full px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all"
                />
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

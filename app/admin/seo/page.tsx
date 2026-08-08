"use client";

import React, { useState, useEffect } from "react";
import { Save, Search, Code, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { createClient } from "@/lib/supabase";

export default function AdminSEOPage() {
  const [settings, setSettings] = useState<any>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const { addToast } = useToast();
  const supabase = createClient();

  useEffect(() => {
    async function fetchSettings() {
      const { data, error } = await supabase.from("seo_settings").select("*").limit(1).single();
      if (!error && data) {
        setSettings(data);
      }
      setIsLoading(false);
    }
    fetchSettings();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setSettings((prev: any) => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    
    let query;
    if (settings.id) {
      query = supabase.from("seo_settings").update(settings).eq("id", settings.id);
    } else {
      query = supabase.from("seo_settings").insert(settings);
    }
    
    const { error } = await query;
    
    setIsSaving(false);
    
    if (error) {
      addToast({ title: "Error saving SEO settings", description: error.message, type: "error" });
    } else {
      addToast({ title: "SEO Settings saved", type: "success" });
    }
  };

  if (isLoading) {
    return <div className="p-12 flex justify-center"><div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="flex flex-col gap-6 w-full max-w-4xl mx-auto h-full pb-12">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">SEO Settings</h1>
          <p className="text-sm text-slate-500 mt-1">Manage global search engine optimization and tracking.</p>
        </div>
        <Button variant="primary" className="flex items-center gap-2" onClick={handleSave} disabled={isSaving}>
          <Save className="w-4 h-4" /> {isSaving ? "Saving..." : "Save Settings"}
        </Button>
      </div>

      <div className="flex flex-col gap-8">
        
        {/* Global Meta */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-200 bg-slate-50/50">
            <h3 className="text-lg font-semibold flex items-center gap-2"><Search className="w-5 h-5 text-slate-500" /> Global Meta Tags</h3>
            <p className="text-sm text-slate-500 mt-1">Default meta information used when page-specific tags aren't set.</p>
          </div>
          <div className="p-6 flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-slate-700">Meta Title Template</label>
              <input 
                type="text" 
                name="meta_title_template"
                placeholder="{Page Title} | {Site Name}"
                value={settings.meta_title_template || ""}
                onChange={handleChange}
                className="w-full px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all"
              />
              <p className="text-xs text-slate-500">Variables available: {'{Page Title}, {Site Name}'}</p>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-slate-700">Default Meta Description</label>
              <textarea 
                name="default_meta_description"
                rows={3}
                value={settings.default_meta_description || ""}
                onChange={handleChange}
                className="w-full px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all resize-none"
              />
              <p className="text-xs text-slate-500">Optimal length is 150-160 characters.</p>
            </div>
          </div>
        </div>

        {/* Social Sharing */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-200 bg-slate-50/50">
            <h3 className="text-lg font-semibold flex items-center gap-2"><ImageIcon className="w-5 h-5 text-slate-500" /> Default Open Graph Image</h3>
            <p className="text-sm text-slate-500 mt-1">The default image shown when your site is shared on social media (Facebook, Twitter, iMessage).</p>
          </div>
          <div className="p-6 flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-slate-700">Image URL</label>
              <input 
                type="text" 
                name="og_default_image_url"
                placeholder="https://"
                value={settings.og_default_image_url || ""}
                onChange={handleChange}
                className="w-full px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all"
              />
            </div>
            {settings.og_default_image_url && (
              <div className="mt-2 w-full max-w-sm rounded border border-slate-200 overflow-hidden bg-slate-100 aspect-video">
                <img src={settings.og_default_image_url} alt="Open Graph Preview" className="w-full h-full object-cover" onError={(e) => (e.target as HTMLImageElement).style.display = 'none'} />
              </div>
            )}
          </div>
        </div>

        {/* Tracking & Webmaster */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-200 bg-slate-50/50">
            <h3 className="text-lg font-semibold flex items-center gap-2"><Code className="w-5 h-5 text-slate-500" /> Tracking & Webmaster Tools</h3>
            <p className="text-sm text-slate-500 mt-1">Connect your analytics and verify site ownership.</p>
          </div>
          <div className="p-6 flex flex-col gap-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-slate-700">Google Analytics (GA4) ID</label>
                <input 
                  type="text" 
                  name="ga_tracking_id"
                  placeholder="G-XXXXXXXXXX"
                  value={settings.ga_tracking_id || ""}
                  onChange={handleChange}
                  className="w-full px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all font-mono"
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-slate-700">Facebook Pixel ID</label>
                <input 
                  type="text" 
                  name="fb_pixel_id"
                  value={settings.fb_pixel_id || ""}
                  onChange={handleChange}
                  className="w-full px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all font-mono"
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-slate-700">Google Search Console Meta Verification</label>
              <input 
                type="text" 
                name="search_console_meta"
                placeholder="<meta name='google-site-verification' content='...' />"
                value={settings.search_console_meta || ""}
                onChange={handleChange}
                className="w-full px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all font-mono"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-slate-700">Robots.txt Content</label>
              <textarea 
                name="robots_txt"
                rows={4}
                value={settings.robots_txt || "User-agent: *\nAllow: /"}
                onChange={handleChange}
                className="w-full px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all resize-none font-mono"
              />
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

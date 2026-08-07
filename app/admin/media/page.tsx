"use client";

import React, { useState, useEffect } from "react";
import { Upload, Trash2, Copy, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { createClient } from "@/lib/supabase";
import Image from "next/image";

export default function AdminMediaPage() {
  const [files, setFiles] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [bucket, setBucket] = useState("product-images");
  const { addToast } = useToast();
  const supabase = createClient();

  const fetchFiles = async () => {
    setIsLoading(true);
    const { data, error } = await supabase.storage.from(bucket).list("", {
      limit: 100,
      offset: 0,
      sortBy: { column: "created_at", order: "desc" },
    });

    if (error) {
      addToast({ title: "Error fetching media", description: error.message, type: "error" });
    } else if (data) {
      // Filter out placeholders like .emptyFolderPlaceholder
      const validFiles = data.filter(f => f.name !== ".emptyFolderPlaceholder");
      setFiles(validFiles);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchFiles();
  }, [bucket]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    
    setIsUploading(true);
    const file = e.target.files[0];
    const fileExt = file.name.split('.').pop();
    const fileName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${fileExt}`;

    const { error } = await supabase.storage.from(bucket).upload(fileName, file);

    setIsUploading(false);
    
    if (error) {
      addToast({ title: "Upload failed", description: error.message, type: "error" });
    } else {
      addToast({ title: "File uploaded successfully", type: "success" });
      fetchFiles();
    }
  };

  const handleDelete = async (fileName: string) => {
    if (!window.confirm("Are you sure you want to delete this file? This action cannot be undone.")) return;
    
    const { error } = await supabase.storage.from(bucket).remove([fileName]);
    
    if (error) {
      addToast({ title: "Delete failed", description: error.message, type: "error" });
    } else {
      addToast({ title: "File deleted", type: "success" });
      fetchFiles();
    }
  };

  const handleCopyLink = (fileName: string) => {
    const { data } = supabase.storage.from(bucket).getPublicUrl(fileName);
    navigator.clipboard.writeText(data.publicUrl);
    addToast({ title: "Link copied to clipboard", type: "success" });
  };

  return (
    <div className="flex flex-col gap-6 w-full max-w-7xl mx-auto h-full pb-12">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Media Library</h1>
          <p className="text-sm text-slate-500 mt-1">Manage product images and brand assets.</p>
        </div>
        
        <div className="flex items-center gap-4">
          <select 
            value={bucket}
            onChange={(e) => setBucket(e.target.value)}
            className="bg-white border border-slate-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
          >
            <option value="product-images">Product Images</option>
            <option value="brand-assets">Brand Assets</option>
          </select>
          
          <div className="relative">
            <input 
              type="file" 
              accept="image/*" 
              onChange={handleUpload} 
              disabled={isUploading}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
            />
            <Button variant="primary" className="flex items-center gap-2 pointer-events-none" disabled={isUploading}>
              <Upload className="w-4 h-4" /> {isUploading ? "Uploading..." : "Upload File"}
            </Button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 min-h-[500px]">
        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : files.length === 0 ? (
          <div className="flex flex-col justify-center items-center h-64 text-slate-500">
            <ImageIcon className="w-12 h-12 text-slate-300 mb-4" />
            <p className="text-lg font-medium">No files found</p>
            <p className="text-sm mt-1">Upload an image to get started</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
            {files.map((file) => {
              const { data } = supabase.storage.from(bucket).getPublicUrl(file.name);
              const url = data.publicUrl;
              
              return (
                <div key={file.id} className="group flex flex-col gap-2 relative">
                  <div className="aspect-square bg-slate-100 rounded-lg overflow-hidden border border-slate-200 relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={file.name} className="object-cover w-full h-full" loading="lazy" />
                    
                    {/* Hover actions */}
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <button 
                        onClick={() => handleCopyLink(file.name)}
                        className="p-2 bg-white rounded-full text-slate-700 hover:text-accent hover:scale-110 transition-all"
                        title="Copy Link"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleDelete(file.name)}
                        className="p-2 bg-white rounded-full text-slate-700 hover:text-red-600 hover:scale-110 transition-all"
                        title="Delete File"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="truncate text-xs text-slate-600 font-medium" title={file.name}>
                    {file.name}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

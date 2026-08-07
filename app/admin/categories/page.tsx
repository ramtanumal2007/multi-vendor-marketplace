"use client";

import React, { useState, useEffect } from "react";
import { Search, Plus, MoreHorizontal, Edit, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase";

function formatDate(dateString: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(new Date(dateString));
}

const MOCK_CATEGORIES = [
  { id: "1", name: "Men", slug: "men", description: "Men's clothing and apparel", created_at: "2023-01-15T10:00:00Z" },
  { id: "2", name: "Women", slug: "women", description: "Women's clothing and apparel", created_at: "2023-01-15T10:30:00Z" },
  { id: "3", name: "Accessories", slug: "accessories", description: "Watches, bags, and jewelry", created_at: "2023-01-16T14:20:00Z" },
];

export default function AdminCategoriesPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [categories, setCategories] = useState<any[]>(MOCK_CATEGORIES);
  const [isLoading, setIsLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function fetchCategories() {
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .order("created_at", { ascending: false });
        
      if (!error && data && data.length > 0) {
        setCategories(data);
      }
      setIsLoading(false);
    }
    fetchCategories();
  }, []);

  const filteredCategories = categories.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    c.slug.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-6 w-full max-w-7xl mx-auto h-full">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Categories</h1>
          <p className="text-sm text-slate-500 mt-1">Organize your products into categories.</p>
        </div>
        <Button variant="primary" className="flex items-center gap-2">
          <Plus className="w-4 h-4" /> Add Category
        </Button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col flex-1 overflow-hidden">
        {/* Toolbar */}
        <div className="p-4 border-b border-slate-200 flex justify-between items-center gap-4 bg-slate-50/50">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search categories..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all"
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-500 font-medium sticky top-0 z-10 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3 w-10">
                  <input type="checkbox" className="rounded border-slate-300 text-accent focus:ring-accent" />
                </th>
                <th className="px-6 py-3">Name</th>
                <th className="px-6 py-3">Slug</th>
                <th className="px-6 py-3">Description</th>
                <th className="px-6 py-3">Created</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    <div className="flex justify-center mb-4">
                      <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                    </div>
                    Loading categories...
                  </td>
                </tr>
              ) : filteredCategories.map((category) => (
                <tr key={category.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-6 py-4">
                    <input type="checkbox" className="rounded border-slate-300 text-accent focus:ring-accent" />
                  </td>
                  <td className="px-6 py-4 font-medium text-slate-900 group-hover:text-accent transition-colors cursor-pointer">
                    {category.name}
                  </td>
                  <td className="px-6 py-4 text-slate-500">{category.slug}</td>
                  <td className="px-6 py-4 text-slate-600 line-clamp-1 max-w-xs">{category.description || "-"}</td>
                  <td className="px-6 py-4 text-slate-500">{formatDate(category.created_at)}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button className="p-1.5 text-slate-400 hover:text-accent hover:bg-blue-50 rounded transition-colors"><Edit className="w-4 h-4" /></button>
                      <button className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"><Trash2 className="w-4 h-4" /></button>
                      <button className="p-1.5 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors"><MoreHorizontal className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        <div className="p-4 border-t border-slate-200 flex justify-between items-center text-sm text-slate-500 bg-white">
          <span>Showing {filteredCategories.length} entries</span>
          <div className="flex gap-1">
            <button className="px-3 py-1 border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-50" disabled>Prev</button>
            <button className="px-3 py-1 border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-50" disabled>Next</button>
          </div>
        </div>
      </div>
    </div>
  );
}

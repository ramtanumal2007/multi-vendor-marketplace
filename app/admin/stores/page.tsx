import React from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { Store } from "lucide-react";

export default async function AdminStoresPage() {
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

  const { data: stores } = await supabase
    .from("stores")
    .select("*, seller_profiles(business_name)")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Stores</h1>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        {stores && stores.length > 0 ? (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-sm font-medium text-gray-500 uppercase tracking-wider">
                <th className="p-4">Store Name</th>
                <th className="p-4">Seller</th>
                <th className="p-4">Contact</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 text-sm">
              {stores.map((store: any) => (
                <tr key={store.id} className="hover:bg-gray-50">
                  <td className="p-4 font-medium text-gray-900">
                    <div>{store.name}</div>
                    <div className="text-gray-500 text-xs">/{store.slug}</div>
                  </td>
                  <td className="p-4">{store.seller_profiles?.business_name}</td>
                  <td className="p-4">
                    <div>{store.email}</div>
                    <div className="text-gray-500">{store.phone}</div>
                  </td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                      store.status === 'approved' ? 'bg-green-100 text-green-800' :
                      store.status === 'pending' || store.status === 'under_review' ? 'bg-amber-100 text-amber-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {store.status.toUpperCase()}
                    </span>
                  </td>
                  <td className="p-4 text-right space-x-2">
                    <button className="text-blue-600 hover:text-blue-900 font-medium">Review</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-12 text-center text-gray-500">
            <Store className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <p>No stores found.</p>
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import React, { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase";
import { Briefcase, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { Modal } from "@/components/ui/Modal";

export default function AdminSellersPage() {
  const [sellers, setSellers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [actionLoading, setActionLoading] = useState(false);
  const [selectedSeller, setSelectedSeller] = useState<any>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogAction, setDialogAction] = useState<"approve" | "reject" | "return_for_correction">("approve");
  const [adminComment, setAdminComment] = useState("");
  
  const supabase = createClient();
  const { addToast } = useToast();

  const fetchSellers = async () => {
    setIsLoading(true);
    let query = supabase
      .from("seller_profiles")
      .select("*, stores(id, name, status, slug)")
      .order("created_at", { ascending: false });
      
    if (filter !== "all") {
      query = query.eq("verification_status", filter);
    }

    const { data, error } = await query;
    if (error) {
      addToast({ title: "Error", description: "Failed to fetch sellers.", type: "error" });
    } else {
      setSellers(data || []);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchSellers();
  }, [filter]);

  const handleActionClick = (seller: any, action: "approve" | "reject" | "return_for_correction" | "suspend") => {
    setSelectedSeller(seller);
    setDialogAction(action as any);
    setAdminComment("");
    setDialogOpen(true);
  };

  const executeAction = async () => {
    if (!selectedSeller) return;
    setActionLoading(true);

    try {
      if (dialogAction === "approve") {
        const { error } = await supabase.rpc("approve_seller", { p_seller_id: selectedSeller.id });
        if (error) throw error;
        addToast({ title: "Approved", description: "Seller and store have been approved.", type: "success" });
      } else if (dialogAction === "reject") {
        const { error } = await supabase.rpc("reject_seller", { p_seller_id: selectedSeller.id });
        if (error) throw error;
        addToast({ title: "Rejected", description: "Seller has been rejected.", type: "success" });
      } else if ((dialogAction as string) === "suspend") {
        const { error } = await supabase.rpc("suspend_seller", { p_seller_id: selectedSeller.id });
        if (error) throw error;
        addToast({ title: "Suspended", description: "Seller has been suspended.", type: "success" });
      } else if (dialogAction === "return_for_correction") {
        if (!adminComment.trim()) throw new Error("A comment is required.");
        const { error } = await supabase.rpc("return_for_correction", { p_seller_id: selectedSeller.id, p_comment: adminComment });
        if (error) throw error;
        addToast({ title: "Returned", description: "Seller returned for correction.", type: "success" });
      }
      
      setDialogOpen(false);
      fetchSellers();
    } catch (err: any) {
      addToast({ title: "Error", description: err.message || "Failed to process action.", type: "error" });
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'approved': return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800 border border-green-200">APPROVED</span>;
      case 'pending':
      case 'under_review': return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">PENDING</span>;
      case 'correction_required': return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-800 border border-purple-200">CORRECTION REQUIRED</span>;
      case 'rejected': return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800 border border-red-200">REJECTED</span>;
      case 'suspended': return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-800 border border-gray-200">SUSPENDED</span>;
      default: return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-800">{status.toUpperCase()}</span>;
    }
  };

  const filters = [
    { id: "all", label: "All" },
    { id: "pending", label: "Pending" },
    { id: "under_review", label: "Under Review" },
    { id: "correction_required", label: "Correction Required" },
    { id: "approved", label: "Approved" },
    { id: "rejected", label: "Rejected" },
    { id: "suspended", label: "Suspended" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Seller Applications</h1>
        
        {/* Filters */}
        <div className="flex bg-white rounded-lg border border-gray-200 p-1 flex-wrap gap-1">
          {filters.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                filter === f.id ? "bg-slate-100 text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="p-12 flex justify-center items-center">
              <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : sellers.length > 0 ? (
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-xs font-bold text-gray-500 uppercase tracking-wider">
                  <th className="p-4">Seller & ID</th>
                  <th className="p-4">Store & Status</th>
                  <th className="p-4">Contact Details</th>
                  <th className="p-4">Verification</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 text-sm">
                {sellers.map((seller: any) => {
                  const store = Array.isArray(seller.stores)
                    ? seller.stores[0]
                    : seller.stores;

                  return (
                    <tr key={seller.id} className="hover:bg-gray-50 transition-colors">
                      <td className="p-4 align-top">
                        <div className="font-bold text-gray-900 mb-0.5">{seller.business_name}</div>
                        <div className="font-mono text-[11px] text-accent font-semibold">{seller.seller_id_code || "Pending Code"}</div>
                        <div className="text-gray-500 text-xs mt-0.5">{seller.business_type || "N/A"}</div>
                      </td>
                      <td className="p-4 align-top">
                        <div className="font-semibold text-gray-800">{store?.name || "No Store Registered"}</div>
                        {store ? (
                          <div className="mt-1">{getStatusBadge(store.status)}</div>
                        ) : (
                          <span className="text-xs text-gray-400">None</span>
                        )}
                      </td>
                      <td className="p-4 align-top">
                        <div className="font-medium text-gray-800">{seller.contact_name}</div>
                        <div className="text-gray-500 text-xs mt-0.5">{seller.business_email}</div>
                        <div className="text-gray-500 text-xs">{seller.phone || "No Phone"}</div>
                      </td>
                      <td className="p-4 align-top">
                        {getStatusBadge(seller.verification_status)}
                      </td>
                      <td className="p-4 align-top text-right">
                        {seller.verification_status === "pending" || seller.verification_status === "under_review" ? (
                          <div className="flex flex-col gap-2 justify-end">
                            <div className="flex justify-end gap-2">
                              <button 
                                onClick={() => handleActionClick(seller, "approve")}
                                className="flex items-center gap-1 px-3 py-1.5 bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 rounded text-xs font-semibold transition-colors"
                              >
                                <CheckCircle className="w-3 h-3" /> Approve
                              </button>
                              <button 
                                onClick={() => handleActionClick(seller, "reject")}
                                className="flex items-center gap-1 px-3 py-1.5 bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 rounded text-xs font-semibold transition-colors"
                              >
                                <XCircle className="w-3 h-3" /> Reject
                              </button>
                            </div>
                            <div className="flex justify-end">
                              <button 
                                onClick={() => handleActionClick(seller, "return_for_correction")}
                                className="flex items-center gap-1 px-3 py-1.5 bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 rounded text-xs font-semibold transition-colors w-full justify-center"
                              >
                                <AlertCircle className="w-3 h-3" /> Return for Correction
                              </button>
                            </div>
                          </div>
                        ) : seller.verification_status === "approved" ? (
                          <button 
                            onClick={() => handleActionClick(seller, "suspend")}
                            className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-300 rounded text-xs font-semibold transition-colors ml-auto"
                          >
                            Suspend Seller
                          </button>
                        ) : (
                          <span className="text-gray-400 text-xs italic">No actions available</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="p-16 text-center text-gray-500">
              <Briefcase className="mx-auto h-12 w-12 text-gray-300 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-1">No applications found</h3>
              <p>There are no seller applications matching this filter.</p>
            </div>
          )}
        </div>
      </div>

      {dialogOpen && selectedSeller && (
        <Modal 
          isOpen={dialogOpen} 
          onClose={() => !actionLoading && setDialogOpen(false)}
          title={dialogAction === "approve" ? "Approve Seller" : dialogAction === "reject" ? "Reject Seller" : "Return for Correction"}
        >
          <div>
            <div className="flex items-start gap-4 mb-6">
              <div className={`p-3 rounded-full ${dialogAction === "approve" ? "bg-green-100 text-green-600" : dialogAction === "reject" ? "bg-red-100 text-red-600" : "bg-purple-100 text-purple-600"}`}>
                {dialogAction === "approve" ? <CheckCircle className="w-6 h-6" /> : <AlertCircle className="w-6 h-6" />}
              </div>
              <div className="flex-1">
                <p className="text-gray-600 mt-1">
                  Are you sure you want to {dialogAction.replace(/_/g, ' ')} the application for <strong>{selectedSeller.business_name}</strong>?
                </p>
                {dialogAction === "approve" && (
                  <p className="text-sm text-gray-500 mt-2">
                    This will grant them the seller role and allow them to start adding products and their store details.
                  </p>
                )}
                {dialogAction === "reject" && (
                  <p className="text-sm text-gray-500 mt-2">
                    This will deny their request. They will remain a customer.
                  </p>
                )}
                {dialogAction === "return_for_correction" && (
                  <div className="mt-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Reason for correction (required)</label>
                    <textarea 
                      className="w-full border border-gray-300 rounded-md shadow-sm p-2 text-sm focus:ring-accent focus:border-accent"
                      rows={4}
                      value={adminComment}
                      onChange={(e) => setAdminComment(e.target.value)}
                      placeholder="Please explain what the seller needs to correct..."
                    />
                  </div>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
              <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={actionLoading}>Cancel</Button>
              <Button 
                variant="primary" 
                className={dialogAction === "approve" ? "bg-green-600 hover:bg-green-700" : dialogAction === "reject" ? "bg-red-600 hover:bg-red-700" : "bg-purple-600 hover:bg-purple-700"}
                onClick={executeAction}
                isLoading={actionLoading}
                disabled={dialogAction === "return_for_correction" && !adminComment.trim()}
              >
                {dialogAction === "approve" ? "Approve Seller" : dialogAction === "reject" ? "Reject Seller" : "Return for Correction"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

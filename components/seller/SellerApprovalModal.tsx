"use client";

import React, { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Sparkles, ArrowRight, Calendar, Store, Hash } from "lucide-react";
import { DownloadCertificateButton } from "./DownloadCertificateButton";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";

interface SellerApprovalModalProps {
  isOpen: boolean;
  onClose: () => void;
  sellerIdCode: string;
  storeName: string;
  approvalDate?: string;
  businessName?: string;
  contactName?: string;
}

export function SellerApprovalModal({
  isOpen,
  onClose,
  sellerIdCode,
  storeName,
  approvalDate,
  businessName = "",
  contactName = "",
}: SellerApprovalModalProps) {
  const [isAcknowledging, setIsAcknowledging] = useState(false);
  const supabase = createClient();
  const router = useRouter();

  const handleStartSelling = async () => {
    setIsAcknowledging(true);
    try {
      await supabase.rpc("acknowledge_seller_approval_modal");
    } catch (err) {
      console.error("Failed to acknowledge approval modal:", err);
    } finally {
      setIsAcknowledging(false);
      onClose();
      router.push("/seller/products/new");
    }
  };

  const formattedDate = approvalDate
    ? new Date(approvalDate).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
    : new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="text-center py-2">
        <div className="w-16 h-16 bg-gradient-to-tr from-amber-500 to-yellow-300 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg shadow-amber-500/20">
          <Sparkles className="w-8 h-8 text-white" />
        </div>

        <h2 className="text-2xl font-bold text-slate-900 mb-1">Congratulations! 🎉</h2>
        <p className="text-sm text-slate-600 mb-6 max-w-sm mx-auto">
          Your seller application has been officially verified and approved. Welcome to our Seller Partner Portal!
        </p>

        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-6 text-left space-y-3">
          <div className="flex items-center justify-between text-sm py-1 border-b border-slate-200/60">
            <span className="text-slate-500 flex items-center">
              <Store className="w-4 h-4 mr-2 text-slate-400" /> Store Name
            </span>
            <span className="font-bold text-slate-900">{storeName}</span>
          </div>

          <div className="flex items-center justify-between text-sm py-1 border-b border-slate-200/60">
            <span className="text-slate-500 flex items-center">
              <Hash className="w-4 h-4 mr-2 text-slate-400" /> Seller ID
            </span>
            <span className="font-mono font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
              {sellerIdCode || "SLR-PENDING"}
            </span>
          </div>

          <div className="flex items-center justify-between text-sm py-1">
            <span className="text-slate-500 flex items-center">
              <Calendar className="w-4 h-4 mr-2 text-slate-400" /> Approval Date
            </span>
            <span className="font-medium text-slate-800">{formattedDate}</span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={handleStartSelling}
            disabled={isAcknowledging}
            className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-2.5 rounded-lg flex items-center justify-center transition-all shadow-sm"
          >
            Start Selling <ArrowRight className="w-4 h-4 ml-2" />
          </button>

          <DownloadCertificateButton
            sellerIdCode={sellerIdCode}
            storeName={storeName}
            businessName={businessName}
            contactName={contactName}
            approvalDate={approvalDate}
            variant="outline"
            className="w-full sm:w-auto"
          />
        </div>
      </div>
    </Modal>
  );
}

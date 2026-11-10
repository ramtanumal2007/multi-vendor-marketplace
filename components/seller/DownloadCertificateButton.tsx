"use client";

import React, { useState } from "react";
import { FileCheck, Loader2 } from "lucide-react";
import { generatePdfCertificate } from "@/lib/pdfCertificate";

import { createClient } from "@/lib/supabase";

interface DownloadCertificateButtonProps {
  sellerIdCode: string;
  storeName: string;
  businessName?: string;
  contactName?: string;
  approvalDate?: string;
  status?: string;
  certificateNumber?: string;
  verificationId?: string;
  variant?: "primary" | "secondary" | "outline";
  className?: string;
}

export function DownloadCertificateButton({
  sellerIdCode,
  storeName,
  businessName = "",
  contactName = "",
  approvalDate = "",
  status = "approved",
  certificateNumber,
  verificationId,
  variant = "primary",
  className = "",
}: DownloadCertificateButtonProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const supabase = createClient();

  const handleDownload = async () => {
    setIsGenerating(true);
    try {
      let finalCertNumber = certificateNumber;
      let finalVerId = verificationId;

      if (!finalCertNumber || !finalVerId) {
        const { data: certData } = await supabase.rpc("get_seller_certificate", {
          p_seller_id: (await supabase.auth.getUser()).data.user?.id
        });

        if (certData && certData.length > 0) {
          finalCertNumber = certData[0].certificate_number;
          finalVerId = certData[0].verification_id;
        } else {
          // Fallback direct table query if RPC not executed yet
          const { data: user } = await supabase.auth.getUser();
          if (user.user) {
            const { data: reg } = await supabase
              .from("seller_certificate_registry")
              .select("certificate_number, verification_id")
              .eq("seller_id", user.user.id)
              .maybeSingle();

            if (reg) {
              finalCertNumber = reg.certificate_number;
              finalVerId = reg.verification_id;
            }
          }
        }
      }

      const formattedDate = approvalDate 
        ? new Date(approvalDate).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
        : new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

      generatePdfCertificate({
        sellerIdCode: sellerIdCode || "SLR-000000",
        storeName: storeName || "Official Seller Store",
        businessName: businessName || storeName,
        contactName: contactName || "Seller",
        issueDate: formattedDate,
        validSince: formattedDate,
        status: status,
        certificateNumber: finalCertNumber,
        verificationId: finalVerId,
      });
    } catch (err) {
      console.error("Certificate generation error:", err);
    } finally {
      setTimeout(() => setIsGenerating(false), 500);
    }
  };

  const baseStyles = "inline-flex items-center justify-center font-medium rounded-lg transition-all text-sm px-4 py-2 shadow-sm";
  let variantStyles = "bg-amber-600 hover:bg-amber-700 text-white";

  if (variant === "secondary") {
    variantStyles = "bg-slate-800 hover:bg-slate-900 text-white";
  } else if (variant === "outline") {
    variantStyles = "border border-amber-500 text-amber-700 hover:bg-amber-50 bg-white";
  }

  return (
    <button
      onClick={handleDownload}
      disabled={isGenerating}
      className={`${baseStyles} ${variantStyles} ${className}`}
    >
      {isGenerating ? (
        <>
          <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating PDF...
        </>
      ) : (
        <>
          <FileCheck className="w-4 h-4 mr-2" /> Download Certificate
        </>
      )}
    </button>
  );
}

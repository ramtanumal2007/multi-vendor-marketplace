"use client";

import React, { useState } from "react";
import { SellerApprovalModal } from "./SellerApprovalModal";

interface SellerApprovalModalWrapperProps {
  sellerIdCode: string;
  storeName: string;
  approvalDate?: string;
  businessName?: string;
  contactName?: string;
}

export function SellerApprovalModalWrapper({
  sellerIdCode,
  storeName,
  approvalDate,
  businessName,
  contactName,
}: SellerApprovalModalWrapperProps) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <SellerApprovalModal
      isOpen={isOpen}
      onClose={() => setIsOpen(false)}
      sellerIdCode={sellerIdCode}
      storeName={storeName}
      approvalDate={approvalDate}
      businessName={businessName}
      contactName={contactName}
    />
  );
}

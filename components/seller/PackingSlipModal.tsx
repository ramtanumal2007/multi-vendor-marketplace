"use client";

import React, { useRef, useState } from "react";
import { X, Printer, Download, Package, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatCurrency, formatExactDateTime } from "@/lib/utils";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

export interface PackingSlipOrder {
  id: string;
  order_number: string;
  created_at: string;
  payment_method?: string;
  payment_status?: string;
  tracking_number?: string | null;
  tracking_carrier?: string | null;
  seller_total?: number;
  items: Array<{
    id: string;
    title: string;
    sku?: string | null;
    quantity: number;
    unit_price: number;
    line_total: number;
  }>;
  store?: {
    name?: string;
    address_line1?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    phone?: string;
  } | null;
  shipping_address?: {
    first_name?: string;
    last_name?: string;
    address_line1?: string;
    address_line2?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    phone?: string;
  } | null;
}

interface PackingSlipModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: PackingSlipOrder;
}

export function PackingSlipModal({ isOpen, onClose, order }: PackingSlipModalProps) {
  const slipRef = useRef<HTMLDivElement>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = async () => {
    if (!slipRef.current) return;
    setIsGeneratingPdf(true);

    try {
      const element = slipRef.current;
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;

      const ratio = Math.min(pdfWidth / imgWidth, pdfHeight / imgHeight);
      const canvasWidthMm = imgWidth * ratio;
      const canvasHeightMm = imgHeight * ratio;

      const xPos = (pdfWidth - canvasWidthMm) / 2;
      const yPos = 5;

      pdf.addImage(imgData, "PNG", xPos, yPos, canvasWidthMm, canvasHeightMm);
      pdf.save(`PACKING-SLIP-${order.order_number}.pdf`);
    } catch (err) {
      console.error("PDF generation failed:", err);
      // Fallback to browser print
      window.print();
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const isCod = order.payment_method?.toUpperCase().includes("COD");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-sm overflow-y-auto">
      {/* Container Dialog */}
      <div className="relative w-full max-w-3xl bg-white rounded-3xl shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
        {/* Top Action Toolbar (Hidden during print) */}
        <div className="p-4 bg-slate-900 text-white flex items-center justify-between flex-shrink-0 print:hidden">
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5 text-blue-400" />
            <span className="font-bold text-sm">Packing Slip Preview — Order #{order.order_number}</span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrint}
              className="text-xs h-8 bg-white/10 hover:bg-white/20 text-white border-white/20 font-bold flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Slip</span>
            </Button>

            <Button
              variant="primary"
              size="sm"
              onClick={handleDownloadPdf}
              disabled={isGeneratingPdf}
              className="text-xs h-8 bg-blue-600 hover:bg-blue-700 text-white font-bold flex items-center gap-1.5"
            >
              {isGeneratingPdf ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              <span>Download PDF</span>
            </Button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300 hover:text-white transition-colors ml-2"
              title="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Printable Content */}
        <div className="overflow-y-auto flex-1 p-6 sm:p-10 bg-white">
          <div
            ref={slipRef}
            className="w-full bg-white text-slate-900 font-sans p-6 sm:p-8 border border-slate-200 rounded-xl"
            style={{ minHeight: "650px" }}
          >
            {/* Header: Brand & Document Label */}
            <div className="flex items-start justify-between border-b-2 border-slate-900 pb-5 mb-6">
              <div>
                <h1 className="text-2xl font-black tracking-tight text-slate-900">
                  {order.store?.name || "VENDOSMITH PARTNER STORE"}
                </h1>
                <p className="text-xs text-slate-500 mt-1 max-w-sm">
                  {[
                    order.store?.address_line1,
                    order.store?.city,
                    order.store?.state,
                    order.store?.postal_code,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                </p>
                {order.store?.phone && (
                  <p className="text-xs text-slate-500">Contact: {order.store.phone}</p>
                )}
              </div>

              <div className="text-right">
                <span className="inline-block px-3 py-1 bg-slate-900 text-white text-xs font-black uppercase tracking-widest rounded">
                  PACKING SLIP
                </span>
                <p className="font-mono text-sm font-bold text-slate-900 mt-2">
                  Order #{order.order_number}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Date: {formatExactDateTime(order.created_at)}
                </p>
              </div>
            </div>

            {/* Addresses & Shipment Details */}
            <div className="grid grid-cols-2 gap-6 mb-6 p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs">
              {/* Shipping Address */}
              <div>
                <span className="font-bold uppercase tracking-wider text-slate-400 text-[10px] block mb-1">
                  SHIP TO (CUSTOMER)
                </span>
                <p className="font-bold text-slate-900 text-sm">
                  {order.shipping_address?.first_name} {order.shipping_address?.last_name}
                </p>
                <p className="text-slate-600 mt-0.5">{order.shipping_address?.address_line1}</p>
                {order.shipping_address?.address_line2 && (
                  <p className="text-slate-600">{order.shipping_address?.address_line2}</p>
                )}
                <p className="text-slate-600 font-semibold">
                  {[
                    order.shipping_address?.city,
                    order.shipping_address?.state,
                    order.shipping_address?.postal_code,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                </p>
                {order.shipping_address?.phone && (
                  <p className="text-slate-600 mt-1 font-mono">
                    Tel: {order.shipping_address.phone}
                  </p>
                )}
              </div>

              {/* Carrier & Tracking */}
              <div>
                <span className="font-bold uppercase tracking-wider text-slate-400 text-[10px] block mb-1">
                  LOGISTICS &amp; PAYMENT
                </span>
                <div className="flex flex-col gap-1">
                  <p className="text-slate-700">
                    <strong>Courier Carrier:</strong>{" "}
                    {order.tracking_carrier || "Designated Surface Carrier"}
                  </p>
                  <p className="text-slate-700 font-mono">
                    <strong>AWB / Tracking:</strong>{" "}
                    {order.tracking_number || "PENDING DISPATCH"}
                  </p>
                  <p className="text-slate-700">
                    <strong>Payment Mode:</strong> {order.payment_method || "PREPAID"}
                  </p>
                  {isCod ? (
                    <div className="mt-2 p-2 bg-amber-100 border border-amber-300 rounded font-bold text-amber-900 text-xs">
                      ⚠️ COLLECT ON DELIVERY: {formatCurrency(order.seller_total || 0)}
                    </div>
                  ) : (
                    <div className="mt-2 p-1.5 bg-emerald-50 border border-emerald-200 rounded font-semibold text-emerald-800 text-[11px] inline-block">
                      ✓ PREPAID ONLINE — NO CASH TO COLLECT
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Itemized Table */}
            <div className="border border-slate-200 rounded-xl overflow-hidden mb-6">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-600 uppercase font-bold text-[10px] tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-2.5">#</th>
                    <th className="px-4 py-2.5">Item Description</th>
                    <th className="px-4 py-2.5 font-mono">SKU</th>
                    <th className="px-4 py-2.5 text-center">Qty</th>
                    <th className="px-4 py-2.5 text-right">Unit Price</th>
                    <th className="px-4 py-2.5 text-right">Line Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {order.items.map((item, idx) => (
                    <tr key={item.id}>
                      <td className="px-4 py-3 font-mono text-slate-400">{idx + 1}</td>
                      <td className="px-4 py-3 font-semibold text-slate-900">{item.title}</td>
                      <td className="px-4 py-3 font-mono text-slate-600">{item.sku || "N/A"}</td>
                      <td className="px-4 py-3 text-center font-bold text-slate-900">
                        {item.quantity}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600">
                        {formatCurrency(item.unit_price)}
                      </td>
                      <td className="px-4 py-3 text-right font-black text-slate-900">
                        {formatCurrency(item.line_total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-slate-900 bg-slate-50 font-bold">
                  <tr>
                    <td colSpan={3} className="px-4 py-3 text-slate-600">
                      Total Package Items: {order.items.reduce((s, i) => s + i.quantity, 0)}
                    </td>
                    <td colSpan={2} className="px-4 py-3 text-right text-slate-900 uppercase">
                      Subtotal
                    </td>
                    <td className="px-4 py-3 text-right font-black text-slate-900 text-sm">
                      {formatCurrency(order.seller_total || 0)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Quality & Security Seal Footer */}
            <div className="border-t border-slate-200 pt-4 flex items-center justify-between text-[11px] text-slate-400">
              <p>
                Packed and inspected by verified vendor. For queries or claims, contact seller via VENDOSMITH Buyer Support.
              </p>
              <div className="font-mono text-slate-400 text-[10px]">
                SLIP ID: {order.order_number}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

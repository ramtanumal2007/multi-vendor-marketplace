"use client";

import React, { useRef, useState } from "react";
import { X, Printer, Download, FileText, CheckCircle2, Building2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatCurrency, formatExactDateTime } from "@/lib/utils";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

export interface InvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: any;
  items: any[];
  customerProfile?: any;
}

export function InvoiceModal({ isOpen, onClose, order, items, customerProfile }: InvoiceModalProps) {
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const invoiceRef = useRef<HTMLDivElement>(null);

  if (!isOpen || !order) return null;

  const shipping = order.shipping_address || {};
  const billing = order.billing_address || shipping;

  const invoiceNumber =
    order.invoice_number ||
    (order.order_number ? `INV-${order.order_number.replace("ORD-", "")}` : "INV-10007");

  const customerName =
    customerProfile?.full_name ||
    `${shipping.first_name || ""} ${shipping.last_name || ""}`.trim() ||
    order.email ||
    "Valued Customer";

  const customerCode =
    customerProfile?.customer_id_code || order.customer_id_code || "CUS-001";

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = async () => {
    if (!invoiceRef.current) return;
    setIsGeneratingPdf(true);

    try {
      const element = invoiceRef.current;
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
      pdf.save(`${invoiceNumber}.pdf`);
    } catch (err) {
      console.error("Failed to generate PDF:", err);
      // Fallback print if canvas fails
      window.print();
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/70 backdrop-blur-md animate-in fade-in duration-200 overflow-y-auto">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden my-auto">
        {/* Top Control Bar */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between flex-shrink-0 print:hidden">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-400" />
            <h3 className="font-bold text-sm sm:text-base">Tax Invoice Preview</h3>
            <span className="text-xs text-slate-400 font-mono hidden sm:inline-block">({invoiceNumber})</span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrint}
              className="text-slate-200 border-slate-700 hover:bg-slate-800 hover:text-white text-xs h-9"
            >
              <Printer className="w-4 h-4 mr-1.5" /> Print
            </Button>

            <Button
              variant="primary"
              size="sm"
              onClick={handleDownloadPdf}
              isLoading={isGeneratingPdf}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs h-9"
            >
              <Download className="w-4 h-4 mr-1.5" /> Download PDF
            </Button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors ml-2"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Invoice Printable Viewport */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-slate-100 print:bg-white print:p-0">
          <div
            ref={invoiceRef}
            className="bg-white p-6 sm:p-10 rounded-xl border border-slate-200 shadow-sm max-w-3xl mx-auto font-sans text-slate-800 print:border-none print:shadow-none print:p-0 print:max-w-none print:w-full"
          >
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start border-b border-slate-200 pb-6 gap-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-blue-600 text-white font-bold text-lg flex items-center justify-center">
                    M
                  </div>
                  <span className="font-extrabold text-xl tracking-tight text-slate-900 uppercase">
                    Marketplace Store
                  </span>
                </div>
                <p className="text-xs text-slate-500 max-w-xs">
                  Official E-Commerce Order Tax Invoice & Receipt of Purchase
                </p>
              </div>

              <div className="sm:text-right">
                <span className="inline-block px-3 py-1 bg-blue-100 text-blue-800 text-xs font-black uppercase tracking-wider rounded-md mb-2">
                  TAX INVOICE
                </span>
                <p className="text-sm font-extrabold text-slate-900 font-mono">{invoiceNumber}</p>
                <p className="text-xs text-slate-500 mt-0.5">Order #{order.order_number}</p>
                <p className="text-xs text-slate-500">{formatExactDateTime(order.created_at)}</p>
              </div>
            </div>

            {/* Customer & Address Details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 my-6 text-xs">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-1">
                <span className="font-extrabold text-slate-900 uppercase tracking-wider block mb-1 text-[11px]">
                  Billed To / Customer Details
                </span>
                <p className="font-bold text-slate-800 text-sm">{customerName}</p>
                <p className="text-slate-500 font-mono text-[11px]">Ref: {customerCode}</p>
                {order.email && <p className="text-slate-600">{order.email}</p>}
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-1">
                <span className="font-extrabold text-slate-900 uppercase tracking-wider block mb-1 text-[11px]">
                  Shipping / Delivery Address
                </span>
                <p className="font-bold text-slate-800">
                  {shipping.first_name || ""} {shipping.last_name || ""}
                </p>
                <p className="text-slate-600">
                  {shipping.address_line1}
                  {shipping.address_line2 ? `, ${shipping.address_line2}` : ""}
                </p>
                {shipping.landmark && <p className="text-slate-600">Landmark: {shipping.landmark}</p>}
                <p className="text-slate-600 font-semibold">
                  {shipping.city}, {shipping.postal_code || shipping.zip_code || ""}
                </p>
              </div>
            </div>

            {/* Order Items Table */}
            <div className="my-6 border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100 text-slate-700 font-bold uppercase border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Item ID</th>
                    <th className="px-4 py-3">Product Description</th>
                    <th className="px-4 py-3">SKU</th>
                    <th className="px-4 py-3 text-center">Qty</th>
                    <th className="px-4 py-3 text-right">Unit Price</th>
                    <th className="px-4 py-3 text-right">Line Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((item: any, idx: number) => {
                    const itemCode =
                      item.order_item_code ||
                      `OI-${(order.order_number || "10000").replace("ORD-", "")}-${String(idx + 1).padStart(3, "0")}`;
                    const itemSku = item.sku || item.products?.sku || "N/A";

                    return (
                      <tr key={item.id || idx}>
                        <td className="px-4 py-3 text-slate-900 font-mono font-bold">{itemCode}</td>
                        <td className="px-4 py-3 font-semibold text-slate-900">
                          {item.title}
                          {item.variant_info && (
                            <span className="block text-[11px] font-normal text-slate-500">
                              {item.variant_info}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-600 font-mono text-[11px]">{itemSku}</td>
                        <td className="px-4 py-3 text-center font-bold text-slate-700">{item.quantity}</td>
                        <td className="px-4 py-3 text-right font-mono">{formatCurrency(item.unit_price)}</td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">
                          {formatCurrency(item.line_total)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Summary & Payment Info */}
            <div className="flex flex-col sm:flex-row justify-between items-start gap-6 my-6 pt-2">
              <div className="w-full sm:w-1/2 bg-slate-50 p-4 rounded-xl border border-slate-100 text-xs space-y-2">
                <span className="font-extrabold text-slate-900 uppercase tracking-wider block text-[11px]">
                  Payment Information
                </span>
                <div className="flex justify-between">
                  <span className="text-slate-500">Payment Method:</span>
                  <span className="font-bold text-slate-800 uppercase">{order.payment_method || "COD"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Payment Status:</span>
                  <span
                    className={`font-bold uppercase ${
                      order.payment_status?.toLowerCase() === "paid" ? "text-emerald-700" : "text-amber-700"
                    }`}
                  >
                    {order.payment_status?.toLowerCase() === "paid" ? "PAID" : "PENDING"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Fulfillment Status:</span>
                  <span className="font-bold text-slate-800 uppercase">{order.internal_status || order.fulfillment_status || "ORDERED"}</span>
                </div>
              </div>

              <div className="w-full sm:w-1/2 space-y-2 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Items Subtotal:</span>
                  <span className="font-mono">{formatCurrency(order.subtotal || 0)}</span>
                </div>
                {order.discount_amount > 0 && (
                  <div className="flex justify-between text-emerald-600 font-semibold">
                    <span>Discount:</span>
                    <span className="font-mono">-{formatCurrency(order.discount_amount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-600">
                  <span>Shipping & Handling:</span>
                  <span className="font-mono">{formatCurrency(order.shipping_cost || 0)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Estimated Tax:</span>
                  <span className="font-mono">{formatCurrency(order.tax_amount || 0)}</span>
                </div>
                <div className="flex justify-between text-sm font-extrabold text-slate-900 border-t border-slate-200 pt-2">
                  <span>Grand Total:</span>
                  <span className="font-mono text-base text-blue-700">{formatCurrency(order.total || 0)}</span>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="border-t border-slate-200 pt-6 text-center text-xs text-slate-400 space-y-1">
              <p className="font-semibold text-slate-600">Thank you for your business!</p>
              <p>For customer support or order inquiries, please visit our contact portal or email support.</p>
              <p className="text-[10px] text-slate-300">This is a computer-generated tax invoice. No signature required.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

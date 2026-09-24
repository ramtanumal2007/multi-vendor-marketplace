"use client";

import React, { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { 
  ShoppingBag, 
  CreditCard, 
  Truck, 
  Package, 
  RefreshCw, 
  User, 
  HelpCircle, 
  ArrowRight, 
  CheckCircle2, 
  Send, 
  Paperclip, 
  FileText, 
  MessageSquare, 
  ShieldCheck, 
  X,
  Loader2,
  Sparkles
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/context/AuthContext";
import { createClient } from "@/lib/supabase";
import { useToast } from "@/components/ui/Toast";

// Support Categories
const SUPPORT_CATEGORIES = [
  {
    id: "Order Issue",
    name: "Order Issue",
    desc: "Delays, missing items, or wrong order received",
    icon: ShoppingBag,
    color: "from-blue-500/10 to-indigo-500/10 text-blue-600 dark:text-blue-400 border-blue-200/60 dark:border-blue-800/60",
  },
  {
    id: "Payment Issue",
    name: "Payment Issue",
    desc: "UPI, card debits, double charges or payment failures",
    icon: CreditCard,
    color: "from-emerald-500/10 to-teal-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200/60 dark:border-emerald-800/60",
  },
  {
    id: "Delivery Issue",
    name: "Delivery Issue",
    desc: "Courier delay, tracking issues or incorrect address",
    icon: Truck,
    color: "from-purple-500/10 to-violet-500/10 text-purple-600 dark:text-purple-400 border-purple-200/60 dark:border-purple-800/60",
  },
  {
    id: "Product Issue",
    name: "Product Issue",
    desc: "Damaged item, quality issue or specification mismatch",
    icon: Package,
    color: "from-amber-500/10 to-orange-500/10 text-amber-600 dark:text-amber-400 border-amber-200/60 dark:border-amber-800/60",
  },
  {
    id: "Return / Refund",
    name: "Return / Refund",
    desc: "Initiate return, refund status or exchange request",
    icon: RefreshCw,
    color: "from-rose-500/10 to-pink-500/10 text-rose-600 dark:text-rose-400 border-rose-200/60 dark:border-rose-800/60",
  },
  {
    id: "Account Issue",
    name: "Account Issue",
    desc: "Login problems, profile update or security questions",
    icon: User,
    color: "from-cyan-500/10 to-sky-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-200/60 dark:border-cyan-800/60",
  },
  {
    id: "Other",
    name: "Other",
    desc: "General inquiry, store feedback or partnership questions",
    icon: HelpCircle,
    color: "from-slate-500/10 to-zinc-500/10 text-slate-600 dark:text-slate-400 border-slate-200/60 dark:border-slate-700/60",
  },
];

export interface SupportTicketMessage {
  id: string;
  ticket_id: string;
  sender_role: "customer" | "admin" | "system";
  sender_name: string;
  message: string;
  attachment_url?: string | null;
  status_change_to?: string | null;
  created_at: string;
}

export interface SupportTicket {
  id: string;
  ticket_number: string;
  user_id?: string | null;
  category: string;
  order_number?: string | null;
  order_id?: string | null;
  subject: string;
  description: string;
  phone_number?: string | null;
  customer_name?: string;
  customer_email?: string | null;
  attachment_url?: string | null;
  status: "OPEN" | "UNDER REVIEW" | "ACTION TAKEN" | "RESOLVED" | "CLOSED";
  priority?: string;
  created_at: string;
  updated_at: string;
  support_ticket_messages?: SupportTicketMessage[];
}

export default function SupportCenterPage() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const supabase = createClient();
  const formRef = useRef<HTMLDivElement>(null);

  // Form State
  const [selectedCategory, setSelectedCategory] = useState<string>("Order Issue");
  const [orderNumber, setOrderNumber] = useState<string>("");
  const [customOrderInput, setCustomOrderInput] = useState<string>("");
  const [subject, setSubject] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [phoneNumber, setPhoneNumber] = useState<string>("");
  const [attachmentName, setAttachmentName] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Success State
  const [submittedTicket, setSubmittedTicket] = useState<SupportTicket | null>(null);

  // Tickets List & Timeline Modal
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [isLoadingTickets, setIsLoadingTickets] = useState<boolean>(true);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);

  // Timeline reply state
  const [replyMessage, setReplyMessage] = useState<string>("");
  const [isSendingReply, setIsSendingReply] = useState<boolean>(false);

  // Customer recent orders for dropdown
  const [userOrders, setUserOrders] = useState<Array<{ id: string; order_number: string; created_at: string; total: number }>>([]);

  // Load User Info and Recent Orders
  useEffect(() => {
    async function loadUserData() {
      if (!user) return;

      // Prefill phone from profiles if available
      const { data: profile } = await supabase
        .from("profiles")
        .select("phone, full_name")
        .eq("id", user.id)
        .single();

      if (profile?.phone) {
        setPhoneNumber((prev) => prev || profile.phone);
      }

      // Fetch customer orders for the dropdown
      const { data: orders } = await supabase
        .from("orders")
        .select("id, order_number, created_at, total")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(8);

      if (orders) {
        setUserOrders(orders);
      }
    }

    loadUserData();
  }, [user, supabase]);

  const searchParams = useSearchParams();
  const ticketQueryParam = searchParams ? searchParams.get("ticket") : null;

  // Load Customer Tickets strictly from Supabase Database API
  const loadTickets = async () => {
    setIsLoadingTickets(true);
    try {
      const res = await fetch("/api/support/tickets");
      if (res.ok) {
        const data = await res.json();
        const loaded: SupportTicket[] = data.tickets || [];
        setTickets(loaded);

        // If deep-link ticket query param exists, open that conversation
        if (ticketQueryParam) {
          const matched = loaded.find((t) => t.ticket_number === ticketQueryParam.trim());
          if (matched) {
            setSelectedTicket(matched);
          }
        }
      }
    } catch (err) {
      console.error("Failed to load tickets from API:", err);
    } finally {
      setIsLoadingTickets(false);
    }
  };

  useEffect(() => {
    loadTickets();
  }, [user]);

  // Handle Category Card Click (preselects category and scrolls to form)
  const handleSelectCategory = (catId: string) => {
    setSelectedCategory(catId);
    if (formRef.current) {
      formRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  // Handle Form Submission
  const handleSubmitComplaint = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      addToast({ title: "Please sign in to submit a complaint", type: "error" });
      return;
    }
    if (!selectedCategory) {
      addToast({ title: "Please choose an Issue Category", type: "error" });
      return;
    }
    if (!subject.trim()) {
      addToast({ title: "Please enter a Subject", type: "error" });
      return;
    }
    if (!description.trim()) {
      addToast({ title: "Please describe your issue", type: "error" });
      return;
    }

    setIsSubmitting(true);

    const resolvedOrderNumber = orderNumber === "custom" ? customOrderInput.trim() : orderNumber;
    const matchingOrder = userOrders.find((o) => o.order_number === resolvedOrderNumber);

    try {
      const payload = {
        category: selectedCategory,
        orderNumber: resolvedOrderNumber || undefined,
        orderId: matchingOrder?.id,
        subject: subject.trim(),
        description: description.trim(),
        phoneNumber: phoneNumber.trim() || undefined,
      };

      const res = await fetch("/api/support/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to submit ticket.");
      }

      const newTicket: SupportTicket = data.ticket;

      setSubmittedTicket(newTicket);
      setTickets((prev) => [newTicket, ...prev.filter((t) => t.ticket_number !== newTicket.ticket_number)]);

      // Reset form fields
      setSubject("");
      setDescription("");
      setOrderNumber("");
      setCustomOrderInput("");

      addToast({
        title: "Support Request Submitted",
        description: `Ticket ${newTicket.ticket_number} created successfully in database.`,
        type: "success",
      });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Error submitting support request";
      addToast({ title: "Submission Failed", description: errMsg, type: "error" });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Sending a Reply in the Conversation
  const handleSendReply = async () => {
    if (!selectedTicket || !replyMessage.trim() || isSendingReply) return;

    if (selectedTicket.status === "CLOSED") {
      addToast({ title: "Ticket is Closed", description: "Replies cannot be added to a closed ticket.", type: "error" });
      return;
    }

    setIsSendingReply(true);

    try {
      const res = await fetch(`/api/support/tickets/${selectedTicket.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: replyMessage.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to send reply");
      }

      const newMsg: SupportTicketMessage = data.message;
      const updatedMessages = [...(selectedTicket.support_ticket_messages || []), newMsg];
      const updatedTicket: SupportTicket = {
        ...selectedTicket,
        updated_at: new Date().toISOString(),
        support_ticket_messages: updatedMessages,
      };

      setSelectedTicket(updatedTicket);
      setTickets((prev) =>
        prev.map((t) => (t.ticket_number === selectedTicket.ticket_number ? updatedTicket : t))
      );

      setReplyMessage("");
      addToast({ title: "Reply Sent", type: "success" });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Error sending reply";
      addToast({ title: "Failed to send reply", description: errMsg, type: "error" });
    } finally {
      setIsSendingReply(false);
    }
  };

  // Helper for Status Badge styling
  const renderStatusBadge = (status: SupportTicket["status"]) => {
    switch (status) {
      case "OPEN":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-300 dark:border-blue-800">
            OPEN
          </span>
        );
      case "UNDER REVIEW":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
            UNDER REVIEW
          </span>
        );
      case "ACTION TAKEN":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-300 dark:border-purple-800">
            ACTION TAKEN
          </span>
        );
      case "RESOLVED":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
            RESOLVED
          </span>
        );
      case "CLOSED":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-300 dark:border-slate-700">
            CLOSED
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">
            {status}
          </span>
        );
    }
  };

  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      {/* 1. HEADER */}
      <section className="bg-gradient-to-b from-slate-100 via-slate-50 to-background dark:from-slate-900 dark:via-slate-900/60 dark:to-background border-b border-border py-12 md:py-16 px-4 md:px-12 text-center">
        <div className="max-w-3xl mx-auto space-y-3">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-accent/10 text-accent">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Dedicated Customer Care Center</span>
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
            Help &amp; Support
          </h1>

          <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 font-medium">
            How can we help you today?
          </p>

          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-xl mx-auto leading-relaxed">
            Select an issue category below or submit a support request. Our customer resolution team typically responds within 2–4 hours.
          </p>
        </div>
      </section>

      <div className="max-w-[1320px] mx-auto px-4 sm:px-6 md:px-12 mt-8 space-y-12">
        {/* 2. HELP CATEGORY CARDS */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-accent" />
              <span>Select Your Issue Category</span>
            </h2>
            <span className="text-xs text-slate-500 dark:text-slate-400 hidden sm:inline">
              Click a card to auto-fill form
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {SUPPORT_CATEGORIES.map((cat) => {
              const IconComp = cat.icon;
              const isSelected = selectedCategory === cat.id;

              return (
                <div
                  key={cat.id}
                  onClick={() => handleSelectCategory(cat.id)}
                  className={`group relative p-4 rounded-2xl border transition-all duration-200 cursor-pointer flex flex-col justify-between ${
                    isSelected
                      ? "bg-accent/5 dark:bg-accent/10 border-accent shadow-md shadow-accent/10 scale-[1.02]"
                      : "bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 hover:border-accent/40 hover:shadow-lg hover:-translate-y-0.5"
                  }`}
                >
                  <div className="space-y-3">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center border ${cat.color} group-hover:scale-105 transition-transform`}
                    >
                      <IconComp className="w-5 h-5" />
                    </div>

                    <div>
                      <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center justify-between">
                        <span>{cat.name}</span>
                        {isSelected && <CheckCircle2 className="w-4 h-4 text-accent" />}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                        {cat.desc}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs font-semibold text-accent">
                    <span>Raise Request</span>
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* 3. SUCCESS STATE (AFTER SUBMISSION) */}
        {submittedTicket && (
          <section className="animate-in fade-in zoom-in-95 duration-300">
            <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent border border-emerald-500/30 text-center max-w-2xl mx-auto shadow-xl space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-emerald-600 text-white flex items-center justify-center mx-auto shadow-lg shadow-emerald-600/30">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <div>
                <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-slate-100">
                  Support Request Submitted
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                  Your complaint has been received successfully.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-emerald-500/20 max-w-md mx-auto shadow-xs">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Assigned Ticket Number
                </span>
                <p className="text-2xl font-extrabold font-mono text-emerald-600 dark:text-emerald-400 mt-0.5 tracking-wider">
                  {submittedTicket.ticket_number}
                </p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Category: {submittedTicket.category} • Status: {submittedTicket.status}
                </p>
              </div>

              <div className="flex items-center justify-center gap-3 pt-2">
                <Button
                  variant="primary"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm px-6 h-11"
                  onClick={() => {
                    setSelectedTicket(submittedTicket);
                    setSubmittedTicket(null);
                  }}
                >
                  Track Support Request
                </Button>
                <Button
                  variant="outline"
                  className="text-xs sm:text-sm h-11"
                  onClick={() => setSubmittedTicket(null)}
                >
                  Raise Another Request
                </Button>
              </div>
            </div>
          </section>
        )}

        {/* 4. SUBMIT A COMPLAINT / RAISE A SUPPORT REQUEST FORM */}
        <section ref={formRef} className="scroll-mt-24">
          <div className="p-6 sm:p-8 md:p-10 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-xl max-w-3xl mx-auto">
            <div className="border-b border-slate-100 dark:border-slate-800 pb-5 mb-6">
              <span className="text-[11px] font-bold uppercase tracking-wider text-accent">
                Customer Grievance &amp; Redressal
              </span>
              <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-slate-100 mt-1">
                Submit a Complaint / Raise a Support Request
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
                Please provide accurate details so our team can resolve your query swiftly.
              </p>
            </div>

            <form onSubmit={handleSubmitComplaint} className="space-y-5">
              {/* Field 1: Issue Category * */}
              <div>
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider mb-1.5">
                  1. Issue Category <span className="text-red-500">*</span>
                </label>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-accent"
                  required
                >
                  {SUPPORT_CATEGORIES.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Field 2: Order Number (Optional) */}
              <div>
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider mb-1.5">
                  2. Order Number <span className="text-slate-400 font-normal lowercase">(optional)</span>
                </label>
                {userOrders.length > 0 ? (
                  <div className="space-y-2">
                    <select
                      value={orderNumber}
                      onChange={(e) => setOrderNumber(e.target.value)}
                      className="w-full h-11 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent"
                    >
                      <option value="">-- Select from your recent orders (optional) --</option>
                      {userOrders.map((ord) => (
                        <option key={ord.id} value={ord.order_number}>
                          {ord.order_number} — ₹{ord.total} ({formatDate(ord.created_at)})
                        </option>
                      ))}
                      <option value="custom">Other / Type another order number...</option>
                    </select>

                    {orderNumber === "custom" && (
                      <input
                        type="text"
                        placeholder="e.g. ORD-2026-XXXXX"
                        value={customOrderInput}
                        onChange={(e) => setCustomOrderInput(e.target.value)}
                        className="w-full h-10 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                      />
                    )}
                  </div>
                ) : (
                  <input
                    type="text"
                    placeholder="Enter order number if applicable (e.g. ORD-XXXXX)"
                    value={orderNumber}
                    onChange={(e) => setOrderNumber(e.target.value)}
                    className="w-full h-11 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                )}
              </div>

              {/* Field 3: Subject * */}
              <div>
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider mb-1.5">
                  3. Subject <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Brief summary of your complaint / issue"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  required
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>

              {/* Field 4: Description * */}
              <div>
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider mb-1.5">
                  4. Description <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={4}
                  placeholder="Please describe what happened in detail (what you ordered, payment ref if any, and resolution desired)..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required
                  className="w-full p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-xs sm:text-sm font-normal focus:outline-none focus:ring-2 focus:ring-accent leading-relaxed"
                />
              </div>

              {/* Field 5: Phone Number */}
              <div>
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider mb-1.5">
                  5. Phone Number <span className="text-slate-400 font-normal lowercase">(prefilled if available)</span>
                </label>
                <input
                  type="tel"
                  placeholder="+91 9876543210"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-xs sm:text-sm font-mono focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>

              {/* Field 6: Attachment */}
              <div>
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider mb-1.5">
                  6. Attachment <span className="text-slate-400 font-normal lowercase">(screenshot / invoice, optional)</span>
                </label>
                <div className="flex items-center gap-3">
                  <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                    <Paperclip className="w-3.5 h-3.5 text-accent" />
                    <span>Choose File</span>
                    <input
                      type="file"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) setAttachmentName(file.name);
                      }}
                    />
                  </label>
                  {attachmentName ? (
                    <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {attachmentName}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">No file selected</span>
                  )}
                </div>
              </div>

              {/* Field 7: Submit Complaint Button */}
              <div className="pt-2">
                <Button
                  type="submit"
                  variant="primary"
                  disabled={isSubmitting}
                  className="w-full h-12 rounded-xl text-sm font-bold shadow-lg shadow-accent/25 flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Submitting Complaint...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Submit Complaint</span>
                    </>
                  )}
                </Button>
              </div>
            </form>
          </div>
        </section>

        {/* 5. MY SUPPORT REQUESTS LIST */}
        <section className="pt-6 border-t border-slate-200/80 dark:border-slate-800">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-accent" />
                <span>MY SUPPORT REQUESTS</span>
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                Track status and chat directly with our grievance redressal team.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={loadTickets}
              className="text-xs font-semibold"
            >
              Refresh
            </Button>
          </div>

          {isLoadingTickets ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Array(2)
                .fill(0)
                .map((_, i) => (
                  <div
                    key={i}
                    className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse space-y-3"
                  >
                    <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-1/3" />
                    <div className="h-5 bg-slate-200 dark:bg-slate-800 rounded w-3/4" />
                    <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-1/2" />
                  </div>
                ))}
            </div>
          ) : tickets.length === 0 ? (
            <div className="p-12 text-center bg-white dark:bg-slate-900 rounded-3xl border border-dashed border-slate-200 dark:border-slate-800 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
                <FileText className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                No Support Requests Found
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                You haven&apos;t submitted any complaints or support tickets yet. Use the form above if you need assistance.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {tickets.map((ticket) => (
                <div
                  key={ticket.ticket_number}
                  className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 hover:border-accent/40 hover:shadow-lg transition-all flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-2">
                    {/* Top Row: Ticket Number & Status Badge */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-extrabold text-accent bg-accent/10 px-2.5 py-0.5 rounded-md">
                        {ticket.ticket_number}
                      </span>
                      {renderStatusBadge(ticket.status)}
                    </div>

                    {/* Subject */}
                    <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 line-clamp-1">
                      {ticket.subject}
                    </h3>

                    {/* Category & Order Badge */}
                    <div className="flex items-center gap-2 flex-wrap text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-medium">{ticket.category}</span>
                      {ticket.order_number && (
                        <>
                          <span>•</span>
                          <span className="font-mono text-[11px] text-slate-600 dark:text-slate-300">
                            Order #{ticket.order_number}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Dates & View Details Button */}
                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                    <div className="space-y-0.5 text-slate-400 dark:text-slate-500 text-[11px]">
                      <p>Created: {formatDate(ticket.created_at)}</p>
                      <p>Updated: {formatDate(ticket.updated_at || ticket.created_at)}</p>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedTicket(ticket)}
                      className="text-xs font-bold border-accent/40 text-accent hover:bg-accent hover:text-white"
                    >
                      View Details
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* 6. SUPPORT CONVERSATION & TIMELINE MODAL */}
      {selectedTicket && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={() => setSelectedTicket(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Support ticket timeline"
          >
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/90 dark:bg-slate-800/50">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-extrabold text-xs text-accent">
                    {selectedTicket.ticket_number}
                  </span>
                  {renderStatusBadge(selectedTicket.status)}
                </div>
                <h3 className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-slate-100 mt-0.5 line-clamp-1">
                  {selectedTicket.subject}
                </h3>
              </div>

              <button
                onClick={() => setSelectedTicket(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Conversation / Timeline Body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
              {/* Original Complaint Card */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                  <span className="flex items-center gap-1.5 text-accent font-bold">
                    <User className="w-3.5 h-3.5" />
                    Original Complaint ({selectedTicket.customer_name || "Customer"})
                  </span>
                  <span>{formatDate(selectedTicket.created_at)}</span>
                </div>

                <p className="text-xs sm:text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
                  {selectedTicket.description}
                </p>

                {selectedTicket.order_number && (
                  <p className="text-[11px] font-mono text-slate-400">
                    Associated Order: #{selectedTicket.order_number}
                  </p>
                )}
              </div>

              {/* Messages / Replies Timeline */}
              {selectedTicket.support_ticket_messages &&
                selectedTicket.support_ticket_messages
                  .filter((m) => m.message !== selectedTicket.description)
                  .map((msg) => {
                    const isAdmin = msg.sender_role === "admin";
                    const isSystem = msg.sender_role === "system";

                    if (isSystem) {
                      return (
                        <div key={msg.id} className="text-center py-1">
                          <span className="inline-block px-3 py-1 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500">
                            {msg.message} • {formatDate(msg.created_at)}
                          </span>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col ${isAdmin ? "items-start" : "items-end"}`}
                      >
                        <div
                          className={`max-w-[85%] p-3.5 rounded-2xl space-y-1 text-xs sm:text-sm ${
                            isAdmin
                              ? "bg-blue-50 dark:bg-blue-950/40 text-blue-950 dark:text-blue-100 border border-blue-200/80 dark:border-blue-900/60 rounded-tl-xs"
                              : "bg-accent text-white rounded-tr-xs shadow-xs"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-4 text-[10px] opacity-80 font-bold uppercase tracking-wider">
                            <span>{isAdmin ? "Support Desk Agent" : "You (Customer)"}</span>
                            <span>{formatDate(msg.created_at)}</span>
                          </div>
                          <p className="whitespace-pre-wrap leading-relaxed">{msg.message}</p>
                        </div>
                      </div>
                    );
                  })}
            </div>

            {/* Customer Reply Input */}
            <div className="p-3 sm:p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40">
              {selectedTicket.status === "CLOSED" ? (
                <div className="text-center py-2.5 px-4 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs font-medium border border-slate-200 dark:border-slate-700">
                  This support request is marked <span className="font-bold text-slate-800 dark:text-slate-200">CLOSED</span>. To receive further assistance, please submit a new complaint.
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Type a reply or additional information..."
                    value={replyMessage}
                    onChange={(e) => setReplyMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSendReply();
                      }
                    }}
                    className="flex-1 h-10 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={isSendingReply || !replyMessage.trim()}
                    onClick={handleSendReply}
                    className="h-10 px-4 font-bold text-xs"
                  >
                    {isSendingReply ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <span>Send</span>
                        <Send className="w-3.5 h-3.5 ml-1" />
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import React, { useState, useEffect, useCallback } from "react";
import { 
  LifeBuoy, 
  Search, 
  Filter, 
  RefreshCw, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  XCircle, 
  Send, 
  User, 
  Mail, 
  Phone, 
  ShoppingBag, 
  X,
  MessageSquare,
  ShieldCheck,
  Tag,
  AlertTriangle
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

interface SupportTicketMessage {
  id: string;
  ticket_id: string;
  sender_role: "customer" | "admin" | "system";
  sender_name: string;
  message: string;
  attachment_url?: string | null;
  created_at: string;
}

interface SupportTicket {
  id: string;
  ticket_number: string;
  user_id?: string | null;
  customer_name: string;
  customer_email: string;
  phone_number?: string | null;
  order_id?: string | null;
  order_number?: string | null;
  category: string;
  subject: string;
  description: string;
  status: "OPEN" | "UNDER_REVIEW" | "ACTION_TAKEN" | "RESOLVED" | "CLOSED";
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  admin_notes?: string | null;
  created_at: string;
  updated_at: string;
  resolved_at?: string | null;
  closed_at?: string | null;
  support_ticket_messages?: SupportTicketMessage[];
}

interface Metrics {
  total: number;
  open: number;
  underReview: number;
  actionTaken: number;
  resolved: number;
  closed: number;
}

export default function AdminSupportPage() {
  const { addToast } = useToast();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [metrics, setMetrics] = useState<Metrics>({
    total: 0,
    open: 0,
    underReview: 0,
    actionTaken: 0,
    resolved: 0,
    closed: 0,
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [migrationPending, setMigrationPending] = useState<boolean>(false);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [priorityFilter, setPriorityFilter] = useState<string>("ALL");

  // Selected Ticket for Drawer Detail
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [replyMessage, setReplyMessage] = useState<string>("");
  const [newStatus, setNewStatus] = useState<string>("");
  const [newPriority, setNewPriority] = useState<string>("");
  const [isSubmittingAction, setIsSubmittingAction] = useState<boolean>(false);

  const fetchTickets = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "ALL") params.append("status", statusFilter);
      if (categoryFilter !== "ALL") params.append("category", categoryFilter);
      if (priorityFilter !== "ALL") params.append("priority", priorityFilter);
      if (searchQuery.trim()) params.append("search", searchQuery.trim());

      const res = await fetch(`/api/admin/support/tickets?${params.toString()}`);
      const data = await res.json();

      if (data.migrationPending) {
        setMigrationPending(true);
      } else {
        setMigrationPending(false);
      }

      if (data.success) {
        setTickets(data.tickets || []);
        if (data.metrics) setMetrics(data.metrics);
        // Refresh selected ticket in drawer if currently open
        if (selectedTicket) {
          const updated = (data.tickets || []).find((t: SupportTicket) => t.id === selectedTicket.id);
          if (updated) {
            setSelectedTicket(updated);
            setNewStatus(updated.status);
            setNewPriority(updated.priority);
          }
        }
      } else {
        addToast({ title: "Failed to load support tickets", description: data.error, type: "error" });
      }
    } catch {
      addToast({ title: "Network error loading tickets", type: "error" });
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, categoryFilter, priorityFilter, searchQuery, addToast, selectedTicket]);

  useEffect(() => {
    fetchTickets();
  }, [statusFilter, categoryFilter, priorityFilter]);

  const handleOpenDetail = (ticket: SupportTicket) => {
    setSelectedTicket(ticket);
    setNewStatus(ticket.status);
    setNewPriority(ticket.priority);
    setReplyMessage("");
  };

  const handleAdminAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket) return;

    if (!replyMessage.trim() && newStatus === selectedTicket.status && newPriority === selectedTicket.priority) {
      addToast({ title: "No changes to submit", description: "Enter a reply or change status/priority.", type: "info" });
      return;
    }

    setIsSubmittingAction(true);
    try {
      const payload: { message?: string; status?: string; priority?: string } = {};
      if (replyMessage.trim()) payload.message = replyMessage.trim();
      if (newStatus && newStatus !== selectedTicket.status) payload.status = newStatus;
      if (newPriority && newPriority !== selectedTicket.priority) payload.priority = newPriority;

      const res = await fetch(`/api/admin/support/tickets/${selectedTicket.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to update ticket.");
      }

      addToast({
        title: "Ticket Updated",
        description: `Ticket ${selectedTicket.ticket_number} successfully updated.`,
        type: "success",
      });

      setReplyMessage("");
      // Refresh tickets list and detail drawer
      await fetchTickets();
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Error updating ticket";
      addToast({ title: "Update Failed", description: errMsg, type: "error" });
    } finally {
      setIsSubmittingAction(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "OPEN":
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">OPEN</span>;
      case "UNDER_REVIEW":
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200">UNDER REVIEW</span>;
      case "ACTION_TAKEN":
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-800 border border-purple-200">ACTION TAKEN</span>;
      case "RESOLVED":
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">RESOLVED</span>;
      case "CLOSED":
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-800 border border-slate-200">CLOSED</span>;
      default:
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-800">{status}</span>;
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case "URGENT":
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-red-100 text-red-700 border border-red-200">URGENT</span>;
      case "HIGH":
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-orange-100 text-orange-700 border border-orange-200">HIGH</span>;
      case "NORMAL":
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">NORMAL</span>;
      case "LOW":
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">LOW</span>;
      default:
        return <span className="text-xs">{priority}</span>;
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto pb-12">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <LifeBuoy className="w-6 h-6 text-indigo-600" />
            Support Ticket Management
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Real database-backed customer complaints, inquiries, and ticket resolution center.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => fetchTickets()} 
            disabled={isLoading}
            className="flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Migration Pending Notification Banner if tables are not yet run in Supabase */}
      {migrationPending && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800">
            <span className="font-semibold">Database Migration Pending Approval:</span> The support tickets table has not yet been executed in your Supabase SQL editor. Once the SQL migration is approved and applied, all customer tickets and conversations will persist here in real time.
          </div>
        </div>
      )}

      {/* Metric Counters */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total</span>
          <span className="text-2xl font-bold text-slate-900 mt-2">{metrics.total}</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-amber-200 shadow-sm flex flex-col justify-between bg-amber-50/30">
          <span className="text-xs font-medium text-amber-700 uppercase tracking-wider flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" /> Open
          </span>
          <span className="text-2xl font-bold text-amber-700 mt-2">{metrics.open}</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-blue-200 shadow-sm flex flex-col justify-between bg-blue-50/30">
          <span className="text-xs font-medium text-blue-700 uppercase tracking-wider flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" /> Under Review
          </span>
          <span className="text-2xl font-bold text-blue-700 mt-2">{metrics.underReview}</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-purple-200 shadow-sm flex flex-col justify-between bg-purple-50/30">
          <span className="text-xs font-medium text-purple-700 uppercase tracking-wider flex items-center gap-1.5">
            <Tag className="w-3.5 h-3.5" /> Action Taken
          </span>
          <span className="text-2xl font-bold text-purple-700 mt-2">{metrics.actionTaken}</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-emerald-200 shadow-sm flex flex-col justify-between bg-emerald-50/30">
          <span className="text-xs font-medium text-emerald-700 uppercase tracking-wider flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" /> Resolved
          </span>
          <span className="text-2xl font-bold text-emerald-700 mt-2">{metrics.resolved}</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between bg-slate-50/50">
          <span className="text-xs font-medium text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
            <XCircle className="w-3.5 h-3.5" /> Closed
          </span>
          <span className="text-2xl font-bold text-slate-700 mt-2">{metrics.closed}</span>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 justify-between items-center">
        {/* Search */}
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && fetchTickets()}
            placeholder="Search ticket #, customer, order..."
            className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
          />
        </div>

        {/* Filter Dropdowns */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Status Filter */}
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-xs font-medium bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 text-slate-700 focus:outline-none focus:border-indigo-500"
            >
              <option value="ALL">All Statuses</option>
              <option value="OPEN">Open</option>
              <option value="UNDER_REVIEW">Under Review</option>
              <option value="ACTION_TAKEN">Action Taken</option>
              <option value="RESOLVED">Resolved</option>
              <option value="CLOSED">Closed</option>
            </select>
          </div>

          {/* Category Filter */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="text-xs font-medium bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 text-slate-700 focus:outline-none focus:border-indigo-500"
          >
            <option value="ALL">All Categories</option>
            <option value="Order Issue">Order Issue</option>
            <option value="Payment Issue">Payment Issue</option>
            <option value="Delivery Issue">Delivery Issue</option>
            <option value="Product Issue">Product Issue</option>
            <option value="Return / Refund">Return / Refund</option>
            <option value="Account Issue">Account Issue</option>
            <option value="General Inquiry">General Inquiry</option>
            <option value="Other">Other</option>
          </select>

          {/* Priority Filter */}
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="text-xs font-medium bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 text-slate-700 focus:outline-none focus:border-indigo-500"
          >
            <option value="ALL">All Priorities</option>
            <option value="URGENT">Urgent</option>
            <option value="HIGH">High</option>
            <option value="NORMAL">Normal</option>
            <option value="LOW">Low</option>
          </select>
        </div>
      </div>

      {/* Ticket List Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase font-semibold text-slate-500">
                <th className="py-3 px-4">Ticket ID</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Subject</th>
                <th className="py-3 px-4">Order #</th>
                <th className="py-3 px-4">Priority</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-600" />
                    Loading support tickets...
                  </td>
                </tr>
              ) : tickets.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    No tickets found matching the selected filters.
                  </td>
                </tr>
              ) : (
                tickets.map((ticket) => (
                  <tr 
                    key={ticket.id} 
                    className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                    onClick={() => handleOpenDetail(ticket)}
                  >
                    <td className="py-3.5 px-4 font-mono font-bold text-indigo-600 text-xs">
                      {ticket.ticket_number}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-500 whitespace-nowrap">
                      {new Date(ticket.created_at).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric"
                      })}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-medium text-slate-900">{ticket.customer_name}</div>
                      <div className="text-xs text-slate-500">{ticket.customer_email}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">
                        {ticket.category}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-medium text-slate-800 max-w-xs truncate">
                      {ticket.subject}
                    </td>
                    <td className="py-3.5 px-4 text-xs font-mono text-slate-600">
                      {ticket.order_number ? `#${ticket.order_number}` : "—"}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      {getPriorityBadge(ticket.priority)}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      {getStatusBadge(ticket.status)}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenDetail(ticket);
                        }}
                        className="text-xs h-8 px-2.5"
                      >
                        Manage
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detailed Ticket Drawer / Modal */}
      {selectedTicket && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col overflow-hidden">
            {/* Drawer Header */}
            <div className="p-6 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <span className="font-mono font-bold text-lg text-indigo-600">
                  {selectedTicket.ticket_number}
                </span>
                {getStatusBadge(selectedTicket.status)}
                {getPriorityBadge(selectedTicket.priority)}
              </div>
              <button
                onClick={() => setSelectedTicket(null)}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Content */}
            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
              {/* Customer Profile Card */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col gap-3">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5" /> Customer Details
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-xs text-slate-400 block">Name</span>
                    <span className="font-medium text-slate-800">{selectedTicket.customer_name}</span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 block">Email</span>
                    <span className="font-medium text-slate-800 flex items-center gap-1">
                      <Mail className="w-3.5 h-3.5 text-slate-400" />
                      {selectedTicket.customer_email}
                    </span>
                  </div>
                  {selectedTicket.phone_number && (
                    <div>
                      <span className="text-xs text-slate-400 block">Phone</span>
                      <span className="font-medium text-slate-800 flex items-center gap-1">
                        <Phone className="w-3.5 h-3.5 text-slate-400" />
                        {selectedTicket.phone_number}
                      </span>
                    </div>
                  )}
                  {selectedTicket.order_number && (
                    <div>
                      <span className="text-xs text-slate-400 block">Linked Order</span>
                      <span className="font-mono font-semibold text-indigo-600 flex items-center gap-1">
                        <ShoppingBag className="w-3.5 h-3.5" />
                        #{selectedTicket.order_number}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Ticket Subject & Category */}
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs font-semibold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-100">
                    {selectedTicket.category}
                  </span>
                  <span className="text-xs text-slate-400">
                    Created on {new Date(selectedTicket.created_at).toLocaleString()}
                  </span>
                </div>
                <h2 className="text-lg font-bold text-slate-900">{selectedTicket.subject}</h2>
              </div>

              {/* Conversation Timeline */}
              <div className="flex flex-col gap-4 border-t border-slate-200 pt-6">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5" /> Full Conversation History
                </div>

                <div className="flex flex-col gap-4">
                  {/* Initial Description / Message */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                    <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                      <span className="font-semibold text-slate-800">{selectedTicket.customer_name} (Initial Issue)</span>
                      <span>{new Date(selectedTicket.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
                      {selectedTicket.description}
                    </p>
                  </div>

                  {/* Messages from support_ticket_messages */}
                  {selectedTicket.support_ticket_messages?.map((msg) => {
                    const isAdmin = msg.sender_role === "admin";
                    return (
                      <div
                        key={msg.id}
                        className={`rounded-xl p-4 text-sm max-w-[85%] ${
                          isAdmin
                            ? "ml-auto bg-indigo-600 text-white shadow-sm"
                            : "mr-auto bg-white border border-slate-200 text-slate-800 shadow-sm"
                        }`}
                      >
                        <div
                          className={`flex items-center justify-between text-xs mb-1.5 ${
                            isAdmin ? "text-indigo-200" : "text-slate-400"
                          }`}
                        >
                          <span className="font-semibold flex items-center gap-1">
                            {isAdmin && <ShieldCheck className="w-3.5 h-3.5" />}
                            {msg.sender_name} {isAdmin ? "(Support)" : ""}
                          </span>
                          <span>
                            {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="whitespace-pre-wrap leading-relaxed">{msg.message}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Admin Action Form */}
              <form onSubmit={handleAdminAction} className="border-t border-slate-200 pt-6 flex flex-col gap-4 mt-auto">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">Update Status</label>
                    <select
                      value={newStatus}
                      onChange={(e) => setNewStatus(e.target.value)}
                      className="w-full text-xs font-medium bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-800 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="OPEN">OPEN</option>
                      <option value="UNDER_REVIEW">UNDER REVIEW</option>
                      <option value="ACTION_TAKEN">ACTION TAKEN</option>
                      <option value="RESOLVED">RESOLVED</option>
                      <option value="CLOSED">CLOSED</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">Update Priority</label>
                    <select
                      value={newPriority}
                      onChange={(e) => setNewPriority(e.target.value)}
                      className="w-full text-xs font-medium bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-800 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="LOW">LOW</option>
                      <option value="NORMAL">NORMAL</option>
                      <option value="HIGH">HIGH</option>
                      <option value="URGENT">URGENT</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Send Reply to Customer (Dispatches Real-time Notification)
                  </label>
                  <textarea
                    rows={3}
                    value={replyMessage}
                    onChange={(e) => setReplyMessage(e.target.value)}
                    placeholder="Type official reply to customer..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all resize-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedTicket(null)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    disabled={isSubmittingAction}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white"
                  >
                    <Send className="w-4 h-4" />
                    {isSubmittingAction ? "Updating..." : "Update Ticket & Send"}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

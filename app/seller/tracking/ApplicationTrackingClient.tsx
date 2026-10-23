"use client";

import React, { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase";
import {
  CheckCircle,
  Clock,
  AlertCircle,
  Store,
  XCircle,
  ArrowRight,
  HelpCircle,
  FileEdit,
  History,
  ShieldCheck,
  Calendar,
  Sparkles,
} from "lucide-react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Modal } from "@/components/ui/Modal";

export interface SellerProfileData {
  id: string;
  business_name: string | null;
  contact_name: string | null;
  phone: string | null;
  business_email: string | null;
  business_type: string | null;
  verification_status: string;
  created_at: string;
  updated_at?: string;
  reviewed_at?: string | null;
  resubmitted_at?: string | null;
  seller_id_code?: string;
  rejection_reason?: string | null;
  rejection_note?: string | null;
  correction_reason?: string | null;
  correction_note?: string | null;
}

export interface ApplicationEvent {
  id: string;
  seller_id: string;
  event_type: string;
  admin_comment?: string | null;
  admin_reason?: string | null;
  admin_note?: string | null;
  previous_status?: string | null;
  new_status?: string | null;
  created_at: string;
}

interface ApplicationTrackingClientProps {
  initialProfile: SellerProfileData;
  initialEvents: ApplicationEvent[];
  store: { id: string; name: string; status: string; slug: string } | null;
  userId: string;
}

export default function ApplicationTrackingClient({
  initialProfile,
  initialEvents,
  store,
  userId,
}: ApplicationTrackingClientProps) {
  const [profile, setProfile] = useState<SellerProfileData>(initialProfile);
  const [events, setEvents] = useState<ApplicationEvent[]>(initialEvents);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const searchParams = useSearchParams();
  const router = useRouter();
  const supabase = createClient();

  // Check URL query for recent submission success
  useEffect(() => {
    if (searchParams.get("submitted") === "true") {
      setShowSuccessModal(true);
      const newUrl = window.location.pathname;
      window.history.replaceState({}, document.title, newUrl);
    }
  }, [searchParams]);

  // Realtime subscription for profile updates & new audit events
  useEffect(() => {
    const profileChannel = supabase
      .channel(`seller_profile_tracking_${userId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "seller_profiles",
          filter: `id=eq.${userId}`,
        },
        (payload: { new: SellerProfileData }) => {
          if (payload.new) {
            setProfile(payload.new);
            if (payload.new.verification_status === "approved") {
              router.refresh();
            }
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "seller_application_events",
          filter: `seller_id=eq.${userId}`,
        },
        (payload: { new: ApplicationEvent }) => {
          if (payload.new) {
            setEvents((prev) => [payload.new, ...prev]);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(profileChannel);
    };
  }, [supabase, userId, router]);

  function parseAdminFeedback(comment?: string | null, reason?: string | null, note?: string | null) {
    if (reason) return { reason, note: note || null };
    if (!comment) return null;
    const parts = comment.split(/\n+Admin Note:\s*/i);
    if (parts.length > 1) {
      return {
        reason: parts[0].replace(/^Reason:\s*/i, "").trim(),
        note: parts[1].trim(),
      };
    }
    return {
      reason: comment.replace(/^Reason:\s*/i, "").trim(),
      note: null,
    };
  }

  // Extract latest correction details
  const correctionDetails = useMemo(() => {
    if (profile.correction_reason) {
      return {
        reason: profile.correction_reason,
        note: profile.correction_note || null,
      };
    }
    const correctionEvent = events.find(
      (e) => e.event_type === "correction_requested"
    );
    if (correctionEvent) {
      return parseAdminFeedback(
        correctionEvent.admin_comment,
        correctionEvent.admin_reason,
        correctionEvent.admin_note
      );
    }
    return null;
  }, [profile, events]);

  // Extract latest rejection details
  const rejectionDetails = useMemo(() => {
    if (profile.rejection_reason) {
      return {
        reason: profile.rejection_reason,
        note: profile.rejection_note || null,
      };
    }
    const rejectEvent = events.find((e) => e.event_type === "rejected");
    if (rejectEvent) {
      return parseAdminFeedback(
        rejectEvent.admin_comment,
        rejectEvent.admin_reason,
        rejectEvent.admin_note
      );
    }
    return null;
  }, [profile, events]);

  // Format Dates
  const submittedDate = profile.created_at
    ? new Date(profile.created_at).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "N/A";

  const updatedDate = profile.updated_at
    ? new Date(profile.updated_at).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : submittedDate;

  const status = profile.verification_status;

  return (
    <div className="space-y-6">
      {/* Top Application Overview Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-5 md:p-6 bg-slate-50/70 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-blue-100/80 text-blue-700 flex items-center justify-center flex-shrink-0">
              <Store className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                {profile.business_name || "Seller Store"}
              </h2>
              <div className="flex flex-wrap items-center gap-2 mt-0.5 text-xs text-slate-500">
                <span>Submitted on {submittedDate}</span>
                <span>•</span>
                <span>Last updated: {updatedDate}</span>
                {profile.seller_id_code && (
                  <>
                    <span>•</span>
                    <span className="font-mono font-semibold text-indigo-600">
                      ID: {profile.seller_id_code}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div>
            {status === "approved" && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-green-100 text-green-800 border border-green-200">
                <CheckCircle className="w-4 h-4" /> APPROVED
              </span>
            )}
            {status === "pending" && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                <Clock className="w-4 h-4" /> PENDING REVIEW
              </span>
            )}
            {status === "under_review" && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200">
                <Clock className="w-4 h-4" /> UNDER REVIEW
              </span>
            )}
            {status === "correction_required" && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-800 border border-purple-200">
                <AlertCircle className="w-4 h-4" /> CORRECTION REQUIRED
              </span>
            )}
            {status === "rejected" && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200">
                <XCircle className="w-4 h-4" /> REJECTED
              </span>
            )}
            {status === "suspended" && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-800 border border-slate-200">
                <AlertCircle className="w-4 h-4" /> SUSPENDED
              </span>
            )}
          </div>
        </div>

        {/* Dynamic Status Decision Card */}
        <div className="p-6 md:p-8">
          {/* APPROVED STATE */}
          {status === "approved" && (
            <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-6 md:p-8 text-center sm:text-left flex flex-col sm:flex-row items-center justify-between gap-6 shadow-xs">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center flex-shrink-0">
                  <CheckCircle className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-emerald-950">
                    Application Status: APPROVED
                  </h3>
                  <p className="text-sm text-emerald-800 mt-1">
                    Your seller account is active and verified. You now have full access to list products, receive customer orders, and manage your store.
                  </p>
                  <p className="text-xs text-emerald-600 mt-2 font-medium">
                    Store: {store?.name || profile.business_name} ({store?.slug ? `vendosmith.com/stores/${store.slug}` : "Active"})
                  </p>
                </div>
              </div>
              <Link
                href="/seller"
                className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl text-sm transition-all shadow-xs flex-shrink-0"
              >
                Go to Seller Hub <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          )}

          {/* CORRECTION REQUIRED STATE */}
          {status === "correction_required" && (
            <div className="bg-purple-50/70 border border-purple-200 rounded-2xl p-6 md:p-8 shadow-xs space-y-5">
              <div className="flex items-start gap-3.5">
                <div className="w-11 h-11 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center flex-shrink-0">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-purple-950">
                    Action Required: Corrections Needed
                  </h3>
                  <p className="text-sm text-purple-800 mt-0.5">
                    Our team reviewed your application and requested the following adjustments before approval.
                  </p>
                </div>
              </div>

              {/* Reason & Note Display */}
              <div className="bg-white rounded-xl border border-purple-200/80 p-5 space-y-4 shadow-2xs">
                <div>
                  <div className="text-xs uppercase font-bold tracking-wider text-purple-900 mb-1">
                    Correction Reason
                  </div>
                  <div className="text-sm font-medium text-slate-800 bg-purple-50/50 p-3 rounded-lg border border-purple-100">
                    {correctionDetails?.reason || "Please review and correct your business application details."}
                  </div>
                </div>

                {correctionDetails?.note && (
                  <div>
                    <div className="text-xs uppercase font-bold tracking-wider text-slate-600 mb-1">
                      Admin Custom Message / Guidance
                    </div>
                    <div className="text-sm text-slate-700 bg-slate-50 p-3 rounded-lg border border-slate-200 whitespace-pre-wrap">
                      {correctionDetails.note}
                    </div>
                  </div>
                )}
              </div>

              {/* Action Button */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2 border-t border-purple-100">
                <p className="text-xs text-purple-700">
                  After updating the required fields, submit your revision to return your application to <strong>Under Review</strong>.
                </p>
                <Link
                  href="/seller/tracking/edit"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-xl text-sm transition-all shadow-xs flex-shrink-0"
                >
                  <FileEdit className="w-4 h-4" /> Update & Resubmit Application
                </Link>
              </div>
            </div>
          )}

          {/* REJECTED STATE */}
          {status === "rejected" && (
            <div className="bg-rose-50/70 border border-rose-200 rounded-2xl p-6 md:p-8 shadow-xs space-y-5">
              <div className="flex items-start gap-3.5">
                <div className="w-11 h-11 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center flex-shrink-0">
                  <XCircle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-rose-950">
                    Application Status: REJECTED
                  </h3>
                  <p className="text-sm text-rose-800 mt-0.5">
                    Thank you for your interest in selling on Vendosmith. We are unable to approve your application at this time.
                  </p>
                </div>
              </div>

              {/* Reason & Admin Message Card */}
              <div className="bg-white rounded-xl border border-rose-200/80 p-5 space-y-4 shadow-2xs">
                <div>
                  <div className="text-xs uppercase font-bold tracking-wider text-rose-900 mb-1">
                    Rejection Reason
                  </div>
                  <div className="text-sm font-medium text-slate-800 bg-rose-50/50 p-3 rounded-lg border border-rose-100">
                    {rejectionDetails?.reason || "Application does not meet current marketplace criteria."}
                  </div>
                </div>

                {rejectionDetails?.note && (
                  <div>
                    <div className="text-xs uppercase font-bold tracking-wider text-slate-600 mb-1">
                      Admin Message / Details
                    </div>
                    <div className="text-sm text-slate-700 bg-slate-50 p-3 rounded-lg border border-slate-200 whitespace-pre-wrap">
                      {rejectionDetails.note}
                    </div>
                  </div>
                )}
              </div>

              {/* Next Steps Card */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2 border-t border-rose-100">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-rose-900">
                    Next Step
                  </h4>
                  <p className="text-xs text-rose-700 mt-0.5">
                    If you believe this decision was made in error or wish to submit clarifying documentation, our support team can assist you with an appeal.
                  </p>
                </div>
                <Link
                  href="/contact"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-white hover:bg-slate-50 text-slate-800 font-semibold rounded-xl text-xs border border-slate-300 transition-colors shadow-2xs flex-shrink-0"
                >
                  <HelpCircle className="w-4 h-4 text-slate-500" /> Contact Support
                </Link>
              </div>
            </div>
          )}

          {/* PENDING / UNDER REVIEW STATE */}
          {(status === "pending" || status === "under_review") && (
            <div className="bg-blue-50/70 border border-blue-200 rounded-2xl p-6 md:p-8 shadow-xs space-y-6">
              <div className="flex items-start gap-3.5">
                <div className="w-11 h-11 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center flex-shrink-0">
                  <Clock className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-blue-950">
                    Application Status: {status === "under_review" ? "Under Review" : "Pending Verification"}
                  </h3>
                  <p className="text-sm text-blue-800 mt-0.5">
                    Your store registration has been safely received. Our compliance team is verifying your business and tax details.
                  </p>
                </div>
              </div>

              {/* Review Timeline */}
              <div className="bg-white rounded-xl border border-blue-100 p-5 space-y-4 shadow-2xs">
                <h4 className="text-xs uppercase font-bold tracking-wider text-slate-500">
                  Review Milestone Timeline
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="flex items-start gap-3 p-3 bg-emerald-50/60 rounded-lg border border-emerald-100">
                    <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs font-bold text-emerald-950">1. Application Submitted</div>
                      <div className="text-[11px] text-emerald-700 mt-0.5">{submittedDate}</div>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <Clock className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5 animate-pulse" />
                    <div>
                      <div className="text-xs font-bold text-blue-950">2. Under Review</div>
                      <div className="text-[11px] text-blue-700 mt-0.5">Compliance verification in progress</div>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <ShieldCheck className="w-5 h-5 text-slate-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs font-bold text-slate-700">3. Awaiting Decision</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">Typically completed within 12-24 hours</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="text-xs text-blue-800 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-blue-600 flex-shrink-0" />
                <span>You will receive an in-app notification and email as soon as an administrator makes a decision.</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Application Details Summary Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/50 flex justify-between items-center">
          <h3 className="font-bold text-slate-900 text-sm">
            Submitted Business Profile
          </h3>
          {status === "correction_required" && (
            <Link
              href="/seller/tracking/edit"
              className="text-xs font-semibold text-purple-700 hover:text-purple-900 flex items-center gap-1"
            >
              <FileEdit className="w-3.5 h-3.5" /> Edit Details
            </Link>
          )}
        </div>

        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 text-xs">
          <div>
            <span className="text-slate-400 block font-medium">Business / Trade Name</span>
            <span className="text-slate-800 font-semibold text-sm mt-0.5 block">
              {profile.business_name || "N/A"}
            </span>
          </div>

          <div>
            <span className="text-slate-400 block font-medium">Contact Representative</span>
            <span className="text-slate-800 font-semibold text-sm mt-0.5 block">
              {profile.contact_name || "N/A"}
            </span>
          </div>

          <div>
            <span className="text-slate-400 block font-medium">Business Email</span>
            <span className="text-slate-800 font-semibold text-sm mt-0.5 block">
              {profile.business_email || "N/A"}
            </span>
          </div>

          <div>
            <span className="text-slate-400 block font-medium">Phone Number</span>
            <span className="text-slate-800 font-semibold text-sm mt-0.5 block">
              {profile.phone || "Not provided"}
            </span>
          </div>

          <div>
            <span className="text-slate-400 block font-medium">Business Entity Type</span>
            <span className="text-slate-800 font-semibold text-sm mt-0.5 block capitalize">
              {profile.business_type || "Individual / Sole Proprietor"}
            </span>
          </div>

          <div>
            <span className="text-slate-400 block font-medium">Assigned Store Name</span>
            <span className="text-slate-800 font-semibold text-sm mt-0.5 block">
              {store?.name || profile.business_name || "Pending store creation"}
            </span>
          </div>
        </div>
      </div>

      {/* Complete Decision History / Audit Trail Card */}
      {events && events.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/50 flex items-center gap-2">
            <History className="w-4 h-4 text-slate-500" />
            <h3 className="font-bold text-slate-900 text-sm">
              Application Decision & Activity History
            </h3>
          </div>

          <div className="divide-y divide-slate-100">
            {events.map((ev) => {
              const evDate = new Date(ev.created_at).toLocaleDateString(undefined, {
                year: "numeric",
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              });

              return (
                <div key={ev.id} className="p-4 sm:p-5 flex items-start gap-3.5 hover:bg-slate-50/50 transition-colors">
                  <div className="mt-0.5">
                    {ev.event_type === "approved" && (
                      <div className="w-7 h-7 rounded-full bg-green-100 text-green-700 flex items-center justify-center">
                        <CheckCircle className="w-4 h-4" />
                      </div>
                    )}
                    {ev.event_type === "rejected" && (
                      <div className="w-7 h-7 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center">
                        <XCircle className="w-4 h-4" />
                      </div>
                    )}
                    {ev.event_type === "correction_requested" && (
                      <div className="w-7 h-7 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center">
                        <AlertCircle className="w-4 h-4" />
                      </div>
                    )}
                    {ev.event_type === "resubmitted" && (
                      <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center">
                        <FileEdit className="w-4 h-4" />
                      </div>
                    )}
                    {ev.event_type === "reconsidered" && (
                      <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center">
                        <Clock className="w-4 h-4" />
                      </div>
                    )}
                    {!["approved", "rejected", "correction_requested", "resubmitted", "reconsidered"].includes(ev.event_type) && (
                      <div className="w-7 h-7 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center">
                        <Calendar className="w-4 h-4" />
                      </div>
                    )}
                  </div>

                  <div className="flex-1 text-xs">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                      <span className="font-bold text-slate-800 capitalize">
                        {ev.event_type.replace(/_/g, " ")}
                      </span>
                      <span className="text-[11px] text-slate-400">{evDate}</span>
                    </div>

                    {(ev.admin_reason || ev.admin_comment) && (
                      <p className="text-slate-600 mt-1 whitespace-pre-wrap">
                        {ev.admin_reason || ev.admin_comment}
                      </p>
                    )}

                    {ev.admin_note && (
                      <div className="mt-1.5 p-2 bg-slate-50 border border-slate-200 rounded text-slate-700 whitespace-pre-wrap font-sans">
                        <span className="font-semibold text-slate-900">Note: </span>
                        {ev.admin_note}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Submission Confirmation Modal */}
      <Modal
        isOpen={showSuccessModal}
        onClose={() => setShowSuccessModal(false)}
        title="Application Submitted Successfully"
      >
        <div className="py-4 text-center space-y-4">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle className="w-10 h-10 text-green-600" />
          </div>
          <h4 className="text-lg font-bold text-slate-900">
            Your application is in queue!
          </h4>
          <p className="text-xs text-slate-600 max-w-sm mx-auto leading-relaxed">
            Your seller application has been submitted successfully. Our operations team reviews incoming submissions within 12-24 hours. You can monitor your review progress on this page.
          </p>
          <div className="pt-2">
            <button
              onClick={() => setShowSuccessModal(false)}
              className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-xs transition-colors"
            >
              View Application Status
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

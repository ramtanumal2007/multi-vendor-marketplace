"use client";

import React, { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import { CheckCircle, Clock, AlertCircle, Store, XCircle } from "lucide-react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Modal } from "@/components/ui/Modal";

interface SellerProfile {
  id: string;
  business_name: string;
  created_at: string;
  verification_status: string;
}

export default function ApplicationTrackingClient({ initialProfile, userId }: { initialProfile: SellerProfile, userId: string }) {
  const [profile, setProfile] = useState<SellerProfile>(initialProfile);
  const [latestComment, setLatestComment] = useState<string | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const searchParams = useSearchParams();
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    // Check if we should show the success modal
    if (searchParams.get("submitted") === "true") {
      setShowSuccessModal(true);
      // Clean up the URL
      const newUrl = window.location.pathname;
      window.history.replaceState({}, document.title, newUrl);
    }
  }, [searchParams]);

  useEffect(() => {
    // Setup Realtime subscription
    const channel = supabase
      .channel('seller_profile_updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'seller_profiles',
          filter: `id=eq.${userId}`
        },
        (payload) => {
          if (payload.new) {
            setProfile(payload.new as SellerProfile);
            // In a real application, you might also want to router.refresh() 
            // if the status change implies a layout change (e.g., pending -> approved)
            // so the server knows to grant dashboard access next time.
            if (payload.new.verification_status === "approved") {
              router.refresh();
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, userId, router]);

  useEffect(() => {
    const fetchLatestComment = async () => {
      if (profile.verification_status === "correction_required") {
        const { data } = await supabase
          .from("seller_application_events")
          .select("admin_comment")
          .eq("seller_id", userId)
          .eq("event_type", "correction_requested")
          .order("created_at", { ascending: false })
          .limit(1)
          .single();
        if (data) {
          setLatestComment(data.admin_comment);
        }
      }
    };
    fetchLatestComment();
  }, [profile.verification_status, supabase, userId]);

  const getStepStatus = (step: number) => {
    const status = profile.verification_status;
    
    if (step === 1) return "completed"; // Application Submitted is always completed if they are here
    
    if (step === 2) {
      if (status === "pending" || status === "under_review" || status === "correction_required") return "current";
      if (status === "approved" || status === "rejected" || status === "suspended") return "completed";
      return "upcoming";
    }
    
    if (step === 3) {
      if (status === "approved" || status === "rejected" || status === "suspended") return "current";
      return "upcoming";
    }
    
    return "upcoming";
  };

  return (
    <>
      <div className="bg-white shadow rounded-lg overflow-hidden border border-gray-200">
        <div className="px-6 py-5 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="bg-blue-100 p-2 rounded-lg">
              <Store className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">{profile.business_name}</h3>
              <p className="text-xs text-gray-500">Submitted on {new Date(profile.created_at).toLocaleDateString()}</p>
            </div>
          </div>
          
          <div>
            {profile.verification_status === "approved" && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800 border border-green-200">
                <CheckCircle className="w-4 h-4" /> Approved
              </span>
            )}
            {(profile.verification_status === "pending" || profile.verification_status === "under_review") && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium bg-amber-100 text-amber-800 border border-amber-200">
                <Clock className="w-4 h-4" /> Under Verification
              </span>
            )}
            {profile.verification_status === "correction_required" && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium bg-purple-100 text-purple-800 border border-purple-200">
                <AlertCircle className="w-4 h-4" /> Correction Required
              </span>
            )}
            {profile.verification_status === "rejected" && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium bg-red-100 text-red-800 border border-red-200">
                <XCircle className="w-4 h-4" /> Rejected
              </span>
            )}
            {profile.verification_status === "suspended" && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-800 border border-gray-200">
                <AlertCircle className="w-4 h-4" /> Suspended
              </span>
            )}
          </div>
        </div>
        
        <div className="p-8">
          <div className="relative">
            {/* Connecting line */}
            <div className="absolute left-6 top-8 bottom-8 w-0.5 bg-gray-200"></div>
            
            <div className="space-y-10 relative">
              {/* Step 1 */}
              <div className="flex gap-6">
                <div className={`relative z-10 flex items-center justify-center w-12 h-12 rounded-full border-4 border-white ${getStepStatus(1) === 'completed' ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
                  <CheckCircle className="w-6 h-6" />
                </div>
                <div className="pt-2">
                  <h4 className="text-lg font-bold text-gray-900">Application Submitted</h4>
                  <p className="text-gray-500 text-sm mt-1">Your store registration details were successfully received.</p>
                  <p className="text-gray-400 text-xs mt-2">{new Date(profile.created_at).toLocaleString()}</p>
                </div>
              </div>
              
              {/* Step 2 */}
              <div className="flex gap-6">
                <div className={`relative z-10 flex items-center justify-center w-12 h-12 rounded-full border-4 border-white ${
                  getStepStatus(2) === 'completed' ? 'bg-green-500 text-white' : 
                  getStepStatus(2) === 'current' ? 'bg-blue-500 text-white ring-4 ring-blue-100' : 'bg-gray-200 text-gray-500'
                }`}>
                  {getStepStatus(2) === 'completed' ? <CheckCircle className="w-6 h-6" /> : <Clock className="w-6 h-6" />}
                </div>
                <div className="pt-2">
                  <h4 className="text-lg font-bold text-gray-900">Under Verification</h4>
                  <p className="text-gray-500 text-sm mt-1">Our team is reviewing your business details. This typically takes 12-24 hours.</p>
                  {getStepStatus(2) === 'current' && profile.verification_status !== 'correction_required' && (
                    <div className="mt-3 bg-blue-50 text-blue-700 p-3 rounded text-sm border border-blue-100 flex items-start gap-2">
                      <InfoIcon className="w-5 h-5 flex-shrink-0" />
                      <p>Your application is currently in the queue. You'll receive an email update once a decision is made.</p>
                    </div>
                  )}
                  {profile.verification_status === 'correction_required' && (
                    <div className="mt-3 bg-purple-50 text-purple-800 p-4 rounded-lg border border-purple-200 shadow-sm">
                      <div className="flex items-start gap-2 mb-2">
                        <AlertCircle className="w-5 h-5 text-purple-600 flex-shrink-0" />
                        <h5 className="font-semibold">Action Required</h5>
                      </div>
                      <p className="text-sm mb-3">Our team reviewed your application and requested the following corrections:</p>
                      <div className="bg-white p-3 rounded border border-purple-100 text-sm mb-4 whitespace-pre-wrap text-gray-700">
                        {latestComment || "Loading feedback..."}
                      </div>
                      <Link 
                        href="/seller/tracking/edit"
                        className="inline-flex items-center justify-center px-4 py-2 bg-purple-600 text-white rounded font-medium hover:bg-purple-700 transition-colors text-sm"
                      >
                        Edit and Resubmit Application
                      </Link>
                    </div>
                  )}
                </div>
              </div>
              
              {/* Step 3 */}
              <div className="flex gap-6">
                <div className={`relative z-10 flex items-center justify-center w-12 h-12 rounded-full border-4 border-white ${
                  getStepStatus(3) === 'current' ? (
                    profile.verification_status === 'approved' ? 'bg-green-500 text-white' :
                    profile.verification_status === 'rejected' ? 'bg-red-500 text-white' : 'bg-gray-500 text-white'
                  ) : 'bg-gray-200 text-gray-500'
                }`}>
                  {getStepStatus(3) === 'current' ? (
                    profile.verification_status === 'approved' ? <CheckCircle className="w-6 h-6" /> :
                    profile.verification_status === 'rejected' ? <XCircle className="w-6 h-6" /> : <AlertCircle className="w-6 h-6" />
                  ) : (
                    <Store className="w-5 h-5" />
                  )}
                </div>
                <div className="pt-2">
                  <h4 className="text-lg font-bold text-gray-900">Decision</h4>
                  <p className="text-gray-500 text-sm mt-1">
                    {profile.verification_status === 'approved' ? 'Your store has been approved! You can now access your seller dashboard.' :
                     profile.verification_status === 'rejected' ? 'Unfortunately, your application could not be approved at this time.' :
                     profile.verification_status === 'suspended' ? 'Your account has been suspended.' :
                     'Pending final review.'}
                  </p>
                  
                  {profile.verification_status === 'approved' && (
                    <button 
                      onClick={() => router.push('/seller')}
                      className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
                    >
                      Go to Seller Dashboard
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Modal isOpen={showSuccessModal} onClose={() => setShowSuccessModal(false)} title="Application Submitted successfully">
        <div className="py-4">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle className="w-10 h-10 text-green-600" />
            </div>
          </div>
          <p className="text-center text-gray-700 leading-relaxed">
            Your seller application has been submitted successfully. We aim to complete verification within 12 hours. You can track your application status from the Seller Portal. After approval, you will receive access to the Seller Dashboard.
          </p>
          <div className="mt-8 flex justify-center">
            <button 
              onClick={() => setShowSuccessModal(false)}
              className="px-6 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              Track Application
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}

function InfoIcon(props: any) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"></circle>
      <line x1="12" y1="16" x2="12" y2="12"></line>
      <line x1="12" y1="8" x2="12.01" y2="8"></line>
    </svg>
  );
}

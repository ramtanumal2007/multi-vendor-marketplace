"use client";

import React, { useEffect, useState } from "react";
import { FileText, ExternalLink, ShieldCheck, Loader2 } from "lucide-react";
import { isLegacyExternalUrl } from "@/lib/storage";

interface AttachmentViewerProps {
  attachmentUrl?: string | null;
  fileName?: string;
  bucket?: string;
  className?: string;
}

export function AttachmentViewer({
  attachmentUrl,
  fileName,
  bucket = "support-attachments",
  className = "",
}: AttachmentViewerProps) {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function resolveUrl() {
      if (!attachmentUrl) {
        setLoading(false);
        return;
      }

      if (isLegacyExternalUrl(attachmentUrl)) {
        if (isMounted) {
          setResolvedUrl(attachmentUrl);
          setLoading(false);
        }
        return;
      }

      try {
        setLoading(true);
        const res = await fetch(
          `/api/storage/signed-url?bucket=${encodeURIComponent(bucket)}&path=${encodeURIComponent(
            attachmentUrl
          )}`
        );
        const data = await res.json();

        if (!isMounted) return;

        if (res.ok && data.success && data.signedUrl) {
          setResolvedUrl(data.signedUrl);
        } else {
          setError(data.message || "Failed to resolve secure attachment link.");
        }
      } catch {
        if (isMounted) {
          setError("Failed to fetch secure signed URL.");
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    resolveUrl();
    return () => {
      isMounted = false;
    };
  }, [attachmentUrl, bucket]);

  if (!attachmentUrl) return null;

  const isImage =
    attachmentUrl.toLowerCase().endsWith(".png") ||
    attachmentUrl.toLowerCase().endsWith(".jpg") ||
    attachmentUrl.toLowerCase().endsWith(".jpeg") ||
    attachmentUrl.toLowerCase().endsWith(".webp");

  const displayName = fileName || attachmentUrl.split("/").pop() || "Attached File";

  if (loading) {
    return (
      <div className={`flex items-center gap-2 text-xs text-slate-500 py-1.5 px-3 rounded-lg bg-slate-50 border border-slate-200 ${className}`}>
        <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />
        <span>Authorizing secure attachment access...</span>
      </div>
    );
  }

  if (error || !resolvedUrl) {
    return (
      <div className={`text-xs text-rose-600 bg-rose-50 border border-rose-200 py-1.5 px-3 rounded-lg flex items-center gap-1.5 ${className}`}>
        <span>Access restricted: {error || "Unable to authorize"}</span>
      </div>
    );
  }

  return (
    <div className={`mt-2 flex flex-col gap-1.5 ${className}`}>
      <div className="flex items-center gap-2 text-[11px] text-slate-500">
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
        <span>Verified private asset (Signed URL expires in 5m)</span>
      </div>

      {isImage ? (
        <a
          href={resolvedUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="group block relative w-fit max-w-sm rounded-xl overflow-hidden border border-slate-200 shadow-xs hover:border-accent transition-all"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={resolvedUrl}
            alt={displayName}
            className="max-h-48 w-auto object-cover group-hover:scale-105 transition-transform duration-200"
          />
          <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-semibold gap-1.5">
            <ExternalLink className="w-3.5 h-3.5" /> View Full Resolution
          </div>
        </a>
      ) : (
        <a
          href={resolvedUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-700 hover:border-accent transition-colors w-fit"
        >
          <FileText className="w-4 h-4 text-indigo-500" />
          <span className="truncate max-w-[200px]">{displayName}</span>
          <ExternalLink className="w-3 h-3 text-slate-400" />
        </a>
      )}
    </div>
  );
}

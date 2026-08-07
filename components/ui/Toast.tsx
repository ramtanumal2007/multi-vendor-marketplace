"use client";

import React, { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, CircleCheck, CircleAlert } from "lucide-react";
import { create } from "zustand";

export type ToastType = "success" | "error" | "info";

interface ToastMessage {
  id: string;
  title: string;
  description?: string;
  type: ToastType;
}

interface ToastStore {
  toasts: ToastMessage[];
  addToast: (toast: Omit<ToastMessage, "id">) => void;
  removeToast: (id: string) => void;
}

export const useToast = create<ToastStore>((set) => ({
  toasts: [],
  addToast: (toast) => {
    const id = Math.random().toString(36).substring(2, 9);
    set((state) => ({ toasts: [...state.toasts, { ...toast, id }] }));
  },
  removeToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

export function ToastContainer() {
  const { toasts, removeToast } = useToast();

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onRemove={() => removeToast(toast.id)} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function ToastItem({ toast, onRemove }: { toast: ToastMessage; onRemove: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onRemove, 3000);
    return () => clearTimeout(timer);
  }, [onRemove]);

  return (
    <motion.div
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 50, transition: { duration: 0.2 } }}
      className="pointer-events-auto relative flex w-[350px] items-start gap-3 rounded-lg bg-card p-4 shadow-card border"
    >
      {toast.type === "success" && <CircleCheck className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />}
      {toast.type === "error" && <CircleAlert className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />}
      {toast.type === "info" && <CircleAlert className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />}
      
      <div className="flex-1">
        <h4 className="text-sm font-semibold">{toast.title}</h4>
        {toast.description && <p className="text-sm text-foreground-secondary mt-1">{toast.description}</p>}
      </div>

      <button onClick={onRemove} className="text-foreground-secondary hover:text-foreground">
        <X className="w-4 h-4" />
      </button>

      {/* Progress Bar */}
      <motion.div
        initial={{ scaleX: 1 }}
        animate={{ scaleX: 0 }}
        transition={{ duration: 3, ease: "linear" }}
        className={`absolute bottom-0 left-0 h-1 origin-left w-full rounded-b-lg ${
          toast.type === "success" ? "bg-success" : toast.type === "error" ? "bg-destructive" : "bg-accent"
        }`}
      />
    </motion.div>
  );
}

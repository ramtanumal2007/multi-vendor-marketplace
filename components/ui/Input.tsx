"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, id, ...props }, ref) => {
    const inputId = id || label.replace(/\s+/g, "-").toLowerCase();
    const [isFocused, setIsFocused] = useState(false);
    const [hasValue, setHasValue] = useState(Boolean(props.value || props.defaultValue));

    return (
      <div className="relative w-full">
        <div className="relative">
          <input
            id={inputId}
            ref={ref}
            className={cn(
              "peer w-full h-14 rounded-md border bg-transparent px-4 pt-4 pb-1 text-base outline-none transition-colors",
              error ? "border-destructive" : "border-border focus:border-accent",
              className
            )}
            onFocus={(e) => {
              setIsFocused(true);
              props.onFocus?.(e);
            }}
            onBlur={(e) => {
              setIsFocused(false);
              setHasValue(Boolean(e.target.value));
              props.onBlur?.(e);
            }}
            onChange={(e) => {
              setHasValue(Boolean(e.target.value));
              props.onChange?.(e);
            }}
            {...props}
          />
          <motion.label
            htmlFor={inputId}
            initial={false}
            animate={{
              y: isFocused || hasValue ? -10 : 0,
              scale: isFocused || hasValue ? 0.8 : 1,
              color: error
                ? "var(--destructive)"
                : isFocused
                ? "var(--accent)"
                : "var(--foreground-secondary)",
            }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="absolute left-4 top-4 origin-left text-base pointer-events-none"
          >
            {label}
          </motion.label>
        </div>
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-1 text-sm text-destructive"
          >
            {error}
          </motion.p>
        )}
      </div>
    );
  }
);
Input.displayName = "Input";

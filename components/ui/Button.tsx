"use client";

import { motion, HTMLMotionProps } from "framer-motion";
import { cn } from "@/lib/utils";
import React from "react";

interface ButtonProps extends Omit<HTMLMotionProps<"button">, "ref"> {
  variant?:
    | "primary"
    | "secondary"
    | "outline"
    | "ghost"
    | "destructive"
    | "success"
    | "subtle";
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "icon";
  isLoading?: boolean;
  loadingText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      isLoading = false,
      loadingText,
      leftIcon,
      rightIcon,
      children,
      disabled,
      onClick,
      ...props
    },
    ref
  ) => {
    const isInteractiveDisabled = disabled || isLoading;

    const baseStyles =
      "relative inline-flex items-center justify-center font-bold tracking-tight transition-all duration-200 select-none overflow-hidden outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:opacity-55 disabled:cursor-not-allowed disabled:pointer-events-none active:scale-[0.98]";

    const variants = {
      primary:
        "bg-accent hover:bg-accent-hover text-white shadow-sm hover:shadow-md hover:shadow-accent/20 active:bg-accent-hover border border-transparent",
      secondary:
        "bg-background-secondary hover:bg-slate-200 dark:hover:bg-slate-800 text-foreground border border-border/80 shadow-2xs",
      outline:
        "border border-slate-300 dark:border-slate-700 bg-transparent hover:bg-background-secondary text-foreground active:bg-slate-100 dark:active:bg-slate-800",
      ghost:
        "bg-transparent hover:bg-background-secondary text-foreground-secondary hover:text-foreground active:bg-slate-100 dark:active:bg-slate-800",
      destructive:
        "bg-destructive hover:bg-red-700 text-white shadow-sm hover:shadow-red-500/25 active:bg-red-800 border border-transparent",
      success:
        "bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm hover:shadow-emerald-500/25 active:bg-emerald-800 border border-transparent",
      subtle:
        "bg-accent/10 hover:bg-accent/20 text-accent dark:bg-accent/20 dark:hover:bg-accent/30 border border-accent/20",
    };

    const sizes = {
      xs: "min-h-[32px] h-8 px-2.5 text-xs rounded-lg gap-1.5",
      sm: "min-h-[38px] h-9 px-3.5 text-xs sm:text-sm rounded-xl gap-1.5",
      md: "min-h-[44px] h-11 px-5 text-sm sm:text-base rounded-xl gap-2",
      lg: "min-h-[48px] h-12 sm:h-14 px-7 text-base rounded-2xl gap-2.5",
      xl: "min-h-[54px] h-14 sm:h-16 px-8 text-lg rounded-2xl gap-3",
      icon: "min-h-[40px] w-10 h-10 p-0 rounded-xl flex items-center justify-center shrink-0",
    };

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (isInteractiveDisabled) {
        e.preventDefault();
        return;
      }
      onClick?.(e);
    };

    return (
      <motion.button
        ref={ref}
        whileTap={isInteractiveDisabled ? undefined : { scale: 0.98 }}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        disabled={isInteractiveDisabled}
        aria-busy={isLoading}
        aria-disabled={isInteractiveDisabled}
        onClick={handleClick}
        {...props}
      >
        {isLoading ? (
          <div className="flex items-center gap-2">
            <span
              className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0"
              role="status"
              aria-label="Loading"
            />
            {loadingText && (
              <span className="text-xs sm:text-sm font-semibold">{loadingText}</span>
            )}
          </div>
        ) : (
          <>
            {leftIcon && <span className="shrink-0">{leftIcon}</span>}
            {children && <span className="relative z-10 truncate">{children as React.ReactNode}</span>}
            {rightIcon && <span className="shrink-0">{rightIcon}</span>}
          </>
        )}
      </motion.button>
    );
  }
);
Button.displayName = "Button";

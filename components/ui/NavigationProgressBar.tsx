"use client";

import React, { useEffect, useState, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export function NavigationProgressBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [progress, setProgress] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const fadeTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Complete and reset progress bar when route changes
  useEffect(() => {
    if (isVisible) {
      if (timerRef.current) clearInterval(timerRef.current);

      // Quickly advance to 100%
      setProgress(100);

      // Fade out after completion
      fadeTimerRef.current = setTimeout(() => {
        setIsVisible(false);
        setProgress(0);
      }, 250);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    };
  }, [pathname, searchParams]);

  // Intercept all internal navigation link clicks and popstate events
  useEffect(() => {
    const startProgress = () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);

      setIsVisible(true);
      setProgress(20);

      // Trickle progress up to 85% while waiting for route transition
      timerRef.current = setInterval(() => {
        setProgress((prev) => {
          if (prev < 50) return prev + 12;
          if (prev < 75) return prev + 6;
          if (prev < 90) return prev + 1.5;
          return prev;
        });
      }, 120);
    };

    const handleAnchorClick = (event: MouseEvent) => {
      // Ignore modified clicks or non-primary clicks
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      // Find closest anchor
      const target = event.target as HTMLElement;
      const anchor = target.closest("a");

      if (!anchor) return;

      const href = anchor.getAttribute("href");
      const targetAttr = anchor.getAttribute("target");

      if (
        !href ||
        targetAttr === "_blank" ||
        anchor.hasAttribute("download") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:") ||
        href.startsWith("#") ||
        href.startsWith("javascript:")
      ) {
        return;
      }

      // Check if it's an internal URL
      try {
        const url = new URL(anchor.href, window.location.href);
        const currentUrl = new URL(window.location.href);

        const isInternal = url.origin === currentUrl.origin;
        const isSamePage =
          url.pathname === currentUrl.pathname &&
          url.search === currentUrl.search &&
          url.hash !== "";

        if (isInternal && !isSamePage && url.href !== currentUrl.href) {
          startProgress();
        }
      } catch {
        // Fallback for relative paths
        if (href.startsWith("/") && href !== window.location.pathname) {
          startProgress();
        }
      }
    };

    const handlePopState = () => {
      startProgress();
    };

    document.addEventListener("click", handleAnchorClick, { capture: true });
    window.addEventListener("popstate", handlePopState);

    return () => {
      document.removeEventListener("click", handleAnchorClick, { capture: true });
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  if (!isVisible && progress === 0) return null;

  return (
    <div
      aria-hidden="true"
      className="fixed top-0 left-0 right-0 z-[99999] pointer-events-none h-[2.5px] overflow-hidden"
    >
      <div
        className="h-full bg-gradient-to-r from-blue-600 via-indigo-500 to-accent shadow-[0_0_10px_rgba(37,99,235,0.7)] transition-all duration-200 ease-out"
        style={{
          width: `${progress}%`,
          opacity: isVisible ? 1 : 0,
          transitionProperty: "width, opacity",
        }}
      />
    </div>
  );
}

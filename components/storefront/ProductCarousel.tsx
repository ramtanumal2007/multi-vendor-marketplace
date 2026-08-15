"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProductCarouselProps {
  children: React.ReactNode;
  className?: string;
  autoScrollInterval?: number; // default 5000ms
}

export function ProductCarousel({
  children,
  className,
  autoScrollInterval = 5000
}: ProductCarouselProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const pauseTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Check scroll positions to show/hide arrow buttons
  const checkScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 5);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 5);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    checkScroll();
    el.addEventListener("scroll", checkScroll, { passive: true });
    window.addEventListener("resize", checkScroll);
    return () => {
      el.removeEventListener("scroll", checkScroll);
      window.removeEventListener("resize", checkScroll);
    };
  }, [checkScroll, children]);

  // Scroll handler for arrows
  const scroll = (direction: "left" | "right") => {
    const el = containerRef.current;
    if (!el) return;
    const scrollAmount = el.clientWidth * 0.75;
    el.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth"
    });
    handleUserInteraction();
  };

  // Pause auto-scroll temporarily on interaction and resume after 4s
  const handleUserInteraction = () => {
    setIsPaused(true);
    if (pauseTimeoutRef.current) clearTimeout(pauseTimeoutRef.current);
    pauseTimeoutRef.current = setTimeout(() => {
      setIsPaused(false);
    }, 4000);
  };

  // Auto-scroll loop every 5s if not paused
  useEffect(() => {
    if (isPaused) return;

    const interval = setInterval(() => {
      const el = containerRef.current;
      if (!el) return;
      
      const { scrollLeft, scrollWidth, clientWidth } = el;
      if (scrollLeft + clientWidth >= scrollWidth - 10) {
        // Loop back to start smoothly
        el.scrollTo({ left: 0, behavior: "smooth" });
      } else {
        el.scrollBy({ left: clientWidth * 0.6, behavior: "smooth" });
      }
    }, autoScrollInterval);

    return () => clearInterval(interval);
  }, [isPaused, autoScrollInterval]);

  return (
    <div
      className={cn("relative group w-full max-w-full overflow-hidden", className)}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onTouchStart={handleUserInteraction}
      onMouseDown={handleUserInteraction}
    >
      {/* Left Navigation Arrow */}
      {canScrollLeft && (
        <button
          onClick={() => scroll("left")}
          className="absolute left-1 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-background/90 hover:bg-background text-foreground border border-border shadow-md flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 hover:scale-110 focus:outline-none"
          aria-label="Scroll left"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
      )}

      {/* Right Navigation Arrow */}
      {canScrollRight && (
        <button
          onClick={() => scroll("right")}
          className="absolute right-1 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-background/90 hover:bg-background text-foreground border border-border shadow-md flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 hover:scale-110 focus:outline-none"
          aria-label="Scroll right"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      )}

      {/* Scrollable Container */}
      <div
        ref={containerRef}
        className="flex overflow-x-auto no-scrollbar scroll-smooth gap-4 py-2 px-1 snap-x w-full"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {children}
      </div>
    </div>
  );
}

"use client";

import React, { useRef, useState, useEffect } from "react";

export type PerimeterTheme = "slate" | "blue" | "purple" | "emerald";

interface AnimatedPerimeterCardProps {
  children: React.ReactNode;
  className?: string;
  theme?: PerimeterTheme;
  isCurrent?: boolean;
  isPopular?: boolean;
}

const THEME_CONFIG: Record<
  PerimeterTheme,
  {
    baseBorder: string;
    beamColor: string;
    beamGradientId: string;
    glowFilter: string;
    stop1: string;
    stop2: string;
  }
> = {
  slate: {
    baseBorder: "stroke-slate-200 dark:stroke-slate-700",
    beamColor: "#64748b",
    beamGradientId: "slate-beam-grad",
    glowFilter: "drop-shadow(0 0 6px rgba(100, 116, 139, 0.45))",
    stop1: "#0284c7",
    stop2: "#38bdf8",
  },
  blue: {
    baseBorder: "stroke-blue-200 dark:stroke-blue-800/60",
    beamColor: "#2563eb",
    beamGradientId: "blue-beam-grad",
    glowFilter: "drop-shadow(0 0 8px rgba(37, 99, 235, 0.6))",
    stop1: "#2563eb",
    stop2: "#60a5fa",
  },
  purple: {
    baseBorder: "stroke-purple-200 dark:stroke-purple-800/60",
    beamColor: "#9333ea",
    beamGradientId: "purple-beam-grad",
    glowFilter: "drop-shadow(0 0 8px rgba(147, 51, 234, 0.6))",
    stop1: "#9333ea",
    stop2: "#c084fc",
  },
  emerald: {
    baseBorder: "stroke-emerald-200 dark:stroke-emerald-800/60",
    beamColor: "#059669",
    beamGradientId: "emerald-beam-grad",
    glowFilter: "drop-shadow(0 0 8px rgba(5, 150, 105, 0.6))",
    stop1: "#059669",
    stop2: "#34d399",
  },
};

export function AnimatedPerimeterCard({
  children,
  className = "",
  theme = "blue",
  isCurrent = false,
}: AnimatedPerimeterCardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!containerRef.current) return;

    const el = containerRef.current;
    const updateSize = () => {
      setSize({
        width: el.offsetWidth,
        height: el.offsetHeight,
      });
    };

    updateSize();

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(() => {
        updateSize();
      });
      observer.observe(el);
      return () => observer.disconnect();
    }
  }, []);

  const config = THEME_CONFIG[theme] || THEME_CONFIG.blue;

  // Approximate corner radius = 16px (rounded-2xl)
  const r = 16;
  const strokeWidth = isCurrent ? 2 : 1.75;
  const w = Math.max(0, size.width - strokeWidth);
  const h = Math.max(0, size.height - strokeWidth);

  // Perimeter = 2*(w + h) - 8*r + 2*PI*r
  const perimeter = w > 0 && h > 0 ? Math.round(2 * (w + h) - 8 * r + 2 * Math.PI * r) : 1000;
  // Beam length ~ 18% of perimeter for elegant travelling line
  const beamLength = Math.max(40, Math.round(perimeter * 0.18));
  const dashGap = perimeter - beamLength;

  return (
    <div
      ref={containerRef}
      className={`relative rounded-2xl transition-all duration-300 hover:-translate-y-1 hover:shadow-lg ${className}`}
    >
      {/* SVG Animated Perimeter Overlay */}
      {size.width > 0 && size.height > 0 && (
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none rounded-2xl overflow-visible z-20"
          style={{ width: size.width, height: size.height }}
          aria-hidden="true"
        >
          <defs>
            <linearGradient id={`${config.beamGradientId}-${theme}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={config.stop1} />
              <stop offset="100%" stopColor={config.stop2} />
            </linearGradient>
          </defs>

          {/* Static Subtle Track */}
          <rect
            x={strokeWidth / 2}
            y={strokeWidth / 2}
            width={w}
            height={h}
            rx={r}
            ry={r}
            fill="none"
            className={config.baseBorder}
            strokeWidth={1}
            opacity={0.7}
          />

          {/* Animated Travelling Perimeter Line */}
          <rect
            x={strokeWidth / 2}
            y={strokeWidth / 2}
            width={w}
            height={h}
            rx={r}
            ry={r}
            fill="none"
            stroke={`url(#${config.beamGradientId}-${theme})`}
            strokeWidth={strokeWidth}
            strokeDasharray={`${beamLength} ${dashGap}`}
            strokeLinecap="round"
            style={{
              filter: config.glowFilter,
              animation: `perimeter-run 4.5s linear infinite`,
            }}
            className="perimeter-traveller motion-reduce:animation-none motion-reduce:opacity-80"
          />
        </svg>
      )}

      {/* Card Content container with pristine readability and solid bg */}
      <div className="relative z-10 w-full h-full rounded-2xl bg-white dark:bg-slate-900 overflow-hidden flex flex-col justify-between">
        {children}
      </div>

      <style jsx>{`
        @keyframes perimeter-run {
          0% {
            stroke-dashoffset: 0;
          }
          100% {
            stroke-dashoffset: -${perimeter};
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .perimeter-traveller {
            animation: none !important;
            stroke-dasharray: none !important;
            stroke-dashoffset: 0 !important;
            opacity: 0.85 !important;
          }
        }
      `}</style>
    </div>
  );
}

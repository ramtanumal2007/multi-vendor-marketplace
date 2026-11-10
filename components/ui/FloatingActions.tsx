"use client";

import React, { useState, useEffect } from "react";
import { ArrowUp } from "lucide-react";

export function FloatingActions() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsVisible(window.scrollY > 300);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  return (
    <>
      {/* Scroll to Top Button (Bottom Right) */}
      <div
        className={`fixed bottom-28 md:bottom-6 right-4 md:right-6 z-30 transition-all duration-300 ${isVisible ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-4 pointer-events-none'}`}
      >
        <button
          onClick={scrollToTop}
          className="w-12 h-12 bg-accent hover:bg-accent/90 text-white rounded-full flex items-center justify-center shadow-lg transition-transform hover:scale-110"
          aria-label="Scroll to top"
        >
          <ArrowUp className="w-6 h-6" />
        </button>
      </div>
    </>
  );
}

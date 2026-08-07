"use client";

import React from "react";
import { Store, MapPin, Search } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export default function StoresPage() {
  return (
    <div className="mx-auto max-w-[1440px] px-6 md:px-16 py-8 md:py-12 w-full pt-[80px] md:pt-[100px] min-h-[80vh] flex flex-col">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12 border-b border-border pb-6">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold flex items-center gap-3">
            <Store className="w-8 h-8 text-accent" /> Stores Near You
          </h1>
          <p className="text-foreground-secondary mt-2">Discover local sellers and get products delivered in minutes.</p>
        </div>
        
        <div className="w-full md:w-auto flex flex-col sm:flex-row gap-3">
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-secondary" />
            <input 
              type="text" 
              placeholder="Enter your delivery location..." 
              className="pl-9 pr-4 py-2 bg-background border border-border rounded-lg text-sm w-full md:w-[300px] focus:outline-none focus:border-accent"
              defaultValue="New Delhi, India"
            />
          </div>
          <Button variant="primary" className="font-bold">
            Search
          </Button>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-background-secondary/30 rounded-3xl border border-dashed border-border mb-12">
        <div className="w-24 h-24 bg-accent/10 rounded-full flex items-center justify-center mb-6">
          <Store className="w-12 h-12 text-accent" />
        </div>
        <h2 className="text-2xl font-bold mb-3">Seller Onboarding in Progress</h2>
        <p className="text-foreground-secondary max-w-md mx-auto mb-8 leading-relaxed">
          We are currently onboarding the best local sellers in your area. Very soon, you'll be able to shop directly from your favorite neighborhood stores!
        </p>
        <Button variant="outline" className="font-bold border-2">
          Notify Me When Stores Are Live
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12 opacity-50 pointer-events-none grayscale">
        {[1, 2, 3].map((_, i) => (
          <div key={i} className="bg-card border border-border p-6 rounded-2xl flex gap-4 items-center">
            <div className="w-16 h-16 bg-slate-200 dark:bg-slate-800 rounded-xl" />
            <div className="flex flex-col gap-2 flex-1">
              <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-3/4" />
              <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

"use client";

import React from "react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/Button";

export default function AboutPage() {
  return (
    <div className="max-w-[1440px] mx-auto px-6 md:px-16 py-12 md:py-24">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-24 items-center">
        <div className="flex flex-col gap-6">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-serif leading-tight">
            Crafting premium experiences since 2024.
          </h1>
          <p className="text-lg text-foreground-secondary leading-relaxed">
            We believe that true quality lies in the details. Every product in our collection is carefully selected and crafted with uncompromising attention to detail, bringing you the finest materials and timeless design.
          </p>
          <div className="mt-4">
            <Link href="/products">
              <Button variant="primary" size="lg">Explore Collection</Button>
            </Link>
          </div>
        </div>
        
        <div className="relative aspect-square bg-background-secondary rounded-xl overflow-hidden shadow-lg">
          <Image 
            src="https://images.unsplash.com/photo-1441986300917-64674bd600d8?q=80&w=1200&auto=format&fit=crop" 
            alt="About us interior"
            fill
            className="object-cover"
          />
        </div>
      </div>

      <div className="mt-24 md:mt-32 grid grid-cols-1 md:grid-cols-3 gap-12">
        <div className="flex flex-col gap-4">
          <h3 className="text-2xl font-serif">Our Mission</h3>
          <p className="text-foreground-secondary leading-relaxed">
            To provide uncompromising quality and exceptional design, making premium lifestyle products accessible to those who appreciate true craftsmanship.
          </p>
        </div>
        <div className="flex flex-col gap-4">
          <h3 className="text-2xl font-serif">Sustainability</h3>
          <p className="text-foreground-secondary leading-relaxed">
            We are committed to minimizing our environmental footprint by partnering with ethical manufacturers and using sustainable materials wherever possible.
          </p>
        </div>
        <div className="flex flex-col gap-4">
          <h3 className="text-2xl font-serif">The Experience</h3>
          <p className="text-foreground-secondary leading-relaxed">
            From the moment you browse our collection to the unboxing of your purchase, we strive to deliver a seamless, delightful, and truly premium experience.
          </p>
        </div>
      </div>
    </div>
  );
}

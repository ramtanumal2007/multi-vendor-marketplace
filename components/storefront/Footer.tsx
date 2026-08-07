import React from "react";
import Link from "next/link";
import { Camera, Share2, MessageSquare, Video } from "lucide-react";

export function Footer() {
  return (
    <footer className="bg-background-secondary pt-20 pb-10 border-t border-border mt-20">
      <div className="mx-auto max-w-[1440px] px-6 md:px-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
          {/* Brand */}
          <div className="flex flex-col gap-6">
            <Link href="/" className="font-serif text-2xl font-bold tracking-tight">
              MY STORE
            </Link>
            <p className="text-foreground-secondary text-sm leading-relaxed">
              Elevating everyday essentials through thoughtful design and uncompromising quality.
            </p>
            <div className="flex gap-4">
              <a href="#" className="p-2 bg-background rounded-full hover:bg-accent hover:text-white transition-colors" title="Instagram">
                <Camera className="w-4 h-4" />
              </a>
              <a href="#" className="p-2 bg-background rounded-full hover:bg-accent hover:text-white transition-colors" title="Facebook">
                <Share2 className="w-4 h-4" />
              </a>
              <a href="#" className="p-2 bg-background rounded-full hover:bg-accent hover:text-white transition-colors" title="Twitter">
                <MessageSquare className="w-4 h-4" />
              </a>
              <a href="#" className="p-2 bg-background rounded-full hover:bg-accent hover:text-white transition-colors" title="Youtube">
                <Video className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Shop */}
          <div className="flex flex-col gap-4">
            <h4 className="font-serif text-lg font-medium">Shop</h4>
            <Link href="/products?sort=newest" className="text-sm text-foreground-secondary hover:text-foreground transition-colors">New Arrivals</Link>
            <Link href="/categories/men" className="text-sm text-foreground-secondary hover:text-foreground transition-colors">Men</Link>
            <Link href="/categories/women" className="text-sm text-foreground-secondary hover:text-foreground transition-colors">Women</Link>
            <Link href="/categories/accessories" className="text-sm text-foreground-secondary hover:text-foreground transition-colors">Accessories</Link>
            <Link href="/products?sale=true" className="text-sm text-foreground-secondary hover:text-foreground transition-colors">Sale</Link>
          </div>

          {/* Support */}
          <div className="flex flex-col gap-4">
            <h4 className="font-serif text-lg font-medium">Support</h4>
            <Link href="/faq" className="text-sm text-foreground-secondary hover:text-foreground transition-colors">FAQ</Link>
            <Link href="/shipping" className="text-sm text-foreground-secondary hover:text-foreground transition-colors">Shipping Policy</Link>
            <Link href="/returns" className="text-sm text-foreground-secondary hover:text-foreground transition-colors">Returns Policy</Link>
            <Link href="/contact" className="text-sm text-foreground-secondary hover:text-foreground transition-colors">Contact Us</Link>
          </div>

          {/* Newsletter */}
          <div className="flex flex-col gap-4">
            <h4 className="font-serif text-lg font-medium">Newsletter</h4>
            <p className="text-sm text-foreground-secondary">
              Subscribe to receive updates, access to exclusive deals, and more.
            </p>
            <form className="flex mt-2">
              <input
                type="email"
                placeholder="Enter your email"
                className="flex-1 bg-background border border-border rounded-l-md px-4 py-2 text-sm focus:outline-none focus:border-accent"
              />
              <button
                type="submit"
                className="bg-foreground text-background px-4 py-2 rounded-r-md text-sm font-medium hover:bg-accent transition-colors"
              >
                Subscribe
              </button>
            </form>
          </div>
        </div>

        <div className="pt-8 border-t border-border flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-xs text-foreground-secondary">
            &copy; {new Date().getFullYear()} My Store. All rights reserved.
          </p>
          <div className="flex gap-4">
            <Link href="/privacy" className="text-xs text-foreground-secondary hover:text-foreground transition-colors">Privacy Policy</Link>
            <Link href="/terms" className="text-xs text-foreground-secondary hover:text-foreground transition-colors">Terms of Service</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

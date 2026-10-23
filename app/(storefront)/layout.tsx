import React from "react";
import { Header } from "@/components/storefront/Header";
import { Footer } from "@/components/storefront/Footer";
import { CartDrawer } from "@/components/storefront/CartDrawer";
import { MobileBottomNav } from "@/components/storefront/MobileBottomNav";
import { FloatingViewCartBar } from "@/components/storefront/FloatingViewCartBar";
import { FloatingActions } from "@/components/ui/FloatingActions";
import { CartProvider } from "@/lib/context/CartContext";
import { AuthProvider } from "@/lib/context/AuthContext";
import { ToastContainer } from "@/components/ui/Toast";

export default function StorefrontLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <CartProvider>
        <div className="relative min-h-screen flex flex-col pt-[164px] md:pt-[154px] pb-24 md:pb-6">
          <Header />
          <main className="flex-1 flex flex-col relative overflow-x-hidden">{children}</main>
          <Footer />
          <CartDrawer />
          <FloatingViewCartBar />
          <MobileBottomNav />
          <FloatingActions />
          <ToastContainer />
        </div>
      </CartProvider>
    </AuthProvider>
  );
}

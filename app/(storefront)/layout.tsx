import React from "react";
import { Header } from "@/components/storefront/Header";
import { Footer } from "@/components/storefront/Footer";
import { CartDrawer } from "@/components/storefront/CartDrawer";
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
        <div className="relative min-h-screen flex flex-col pt-[60px]">
        <Header />
        <main className="flex-1 flex flex-col relative overflow-x-hidden">{children}</main>
        <Footer />
        <CartDrawer />
        <ToastContainer />
      </div>
    </CartProvider>
    </AuthProvider>
  );
}

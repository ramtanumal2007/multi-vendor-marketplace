"use client";

import React, { createContext, useContext, useEffect, useState, useRef } from "react";
import { useAuth } from "./AuthContext";

export interface CartItem {
  id: string; // unique identifier (usually variant_id or product_id)
  productId: string;
  title: string;
  price: number;
  mrp?: number;
  image: string;
  quantity: number;
  variantInfo?: string;
}

interface CartContextType {
  items: CartItem[];
  buyNowItem: CartItem | null;
  isDrawerOpen: boolean;
  itemCount: number;
  subtotal: number;
  openDrawer: () => void;
  closeDrawer: () => void;
  addItem: (item: Omit<CartItem, "quantity">, quantityToAdd?: number) => void;
  setBuyNowItem: (item: CartItem | null) => void;
  clearBuyNowItem: () => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

function mergeCartItems(savedCart: CartItem[], guestCart: CartItem[]): CartItem[] {
  const mergedMap = new Map<string, CartItem>();

  // Add saved user items first
  for (const item of savedCart) {
    mergedMap.set(item.id, { ...item });
  }

  // Merge guest items: add quantities if existing, else add new item
  for (const guestItem of guestCart) {
    const existing = mergedMap.get(guestItem.id);
    if (existing) {
      existing.quantity = existing.quantity + guestItem.quantity;
      if (guestItem.mrp) existing.mrp = guestItem.mrp;
      if (guestItem.price) existing.price = guestItem.price;
    } else {
      mergedMap.set(guestItem.id, { ...guestItem });
    }
  }

  return Array.from(mergedMap.values());
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [buyNowItem, setBuyNowItemState] = useState<CartItem | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  const { user, isLoading: authLoading } = useAuth();
  const prevUserIdRef = useRef<string | null>(null);

  // Initial Load from localStorage & sessionStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("cart");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const sanitized: CartItem[] = parsed
            .filter((item: Partial<CartItem>) => Boolean(item && item.id))
            .map((item: Partial<CartItem>) => ({
              id: String(item.id),
              productId: String(item.productId || item.id),
              title: String(item.title || ""),
              image: String(item.image || ""),
              variantInfo: item.variantInfo ? String(item.variantInfo) : undefined,
              mrp: item.mrp !== undefined && item.mrp !== null ? Number(item.mrp) : Number(item.price || 0),
              price: Number(item.price || 0),
              quantity: Number(item.quantity) || 1,
            }));
          setItems(sanitized);
        }
      }
    } catch (e) {
      console.warn("Failed to parse cart from localStorage:", e);
    }

    try {
      const savedBuyNow = sessionStorage.getItem("buy_now_item");
      if (savedBuyNow) {
        const parsed = JSON.parse(savedBuyNow);
        if (parsed && parsed.id) {
          setBuyNowItemState({
            ...parsed,
            mrp: parsed.mrp !== undefined && parsed.mrp !== null ? Number(parsed.mrp) : Number(parsed.price),
            price: Number(parsed.price),
            quantity: Number(parsed.quantity) || 1,
          });
        }
      }
    } catch (e) {
      console.warn("Failed to parse buyNow from sessionStorage:", e);
    }

    setIsLoaded(true);
  }, []);

  // Sync Cart with User Session (Merge Guest Cart on Login)
  useEffect(() => {
    if (!isLoaded || authLoading) return;

    const currentUserId = user?.id || null;
    const previousUserId = prevUserIdRef.current;

    // Trigger merge only when user transitions from unauthenticated to authenticated
    if (currentUserId && currentUserId !== previousUserId) {
      try {
        const userCartKey = `cart_${currentUserId}`;
        const savedUserCartRaw = localStorage.getItem(userCartKey);
        const savedUserCart: CartItem[] = savedUserCartRaw ? JSON.parse(savedUserCartRaw) : [];

        if (items.length > 0 && savedUserCart.length > 0) {
          // Merge guest items into existing user cart
          const merged = mergeCartItems(savedUserCart, items);
          setItems(merged);
          localStorage.setItem(userCartKey, JSON.stringify(merged));
          localStorage.setItem("cart", JSON.stringify(merged));
        } else if (items.length > 0 && savedUserCart.length === 0) {
          // User had no previous cart, assign current guest items to user cart
          localStorage.setItem(userCartKey, JSON.stringify(items));
        } else if (items.length === 0 && savedUserCart.length > 0) {
          // Guest had empty cart, restore user's previous cart
          setItems(savedUserCart);
          localStorage.setItem("cart", JSON.stringify(savedUserCart));
        }
      } catch (err) {
        console.error("Error merging guest cart on login:", err);
      }
    }

    prevUserIdRef.current = currentUserId;
  }, [user?.id, authLoading, isLoaded, items]);

  // Persist items to localStorage on change (both active cart and user cart key if logged in)
  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem("cart", JSON.stringify(items));
      if (user?.id) {
        localStorage.setItem(`cart_${user.id}`, JSON.stringify(items));
      }
    }
  }, [items, isLoaded, user?.id]);

  const openDrawer = () => setIsDrawerOpen(true);
  const closeDrawer = () => setIsDrawerOpen(false);

  // Buy Now sessionStorage Isolation
  const setBuyNowItem = (item: CartItem | null) => {
    setBuyNowItemState(item);
    if (item) {
      sessionStorage.setItem("buy_now_item", JSON.stringify(item));
    } else {
      sessionStorage.removeItem("buy_now_item");
    }
  };

  const clearBuyNowItem = () => {
    setBuyNowItem(null);
  };

  // Add Item to Cart (Guest & Authenticated friendly - never forces login on add)
  const addItem = (newItem: Omit<CartItem, "quantity">, quantityToAdd = 1) => {
    const itemWithMrp: CartItem = {
      ...newItem,
      quantity: quantityToAdd,
      mrp: newItem.mrp !== undefined && newItem.mrp !== null ? Number(newItem.mrp) : Number(newItem.price),
      price: Number(newItem.price),
    };

    setItems((prev) => {
      const existingIndex = prev.findIndex((item) => item.id === itemWithMrp.id);
      if (existingIndex > -1) {
        const updated = [...prev];
        updated[existingIndex] = {
          ...updated[existingIndex],
          quantity: updated[existingIndex].quantity + quantityToAdd,
        };
        return updated;
      }
      return [...prev, itemWithMrp];
    });

    openDrawer();
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const updateQuantity = (id: string, quantity: number) => {
    if (quantity < 1) return;
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, quantity } : item))
    );
  };

  const clearCart = () => {
    setItems([]);
    if (typeof window !== "undefined") {
      localStorage.removeItem("cart");
      if (user?.id) {
        localStorage.removeItem(`cart_${user.id}`);
      }
    }
  };

  const itemCount = items.reduce((acc, item) => acc + item.quantity, 0);
  const subtotal = items.reduce((acc, item) => acc + item.price * item.quantity, 0);

  if (!isLoaded) {
    return null;
  }

  return (
    <CartContext.Provider
      value={{
        items,
        buyNowItem,
        isDrawerOpen,
        itemCount,
        subtotal,
        openDrawer,
        closeDrawer,
        addItem,
        setBuyNowItem,
        clearBuyNowItem,
        removeItem,
        updateQuantity,
        clearCart,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
}

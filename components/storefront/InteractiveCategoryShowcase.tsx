"use client";

import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  Cake,
  Shirt,
  Sparkles,
  Smartphone,
  Home,
  Footprints,
  Dumbbell,
  ArrowRight,
  Star,
  Plus,
  ChevronLeft,
  ChevronRight,
  Heart,
  Flame,
  Clock,
  LayoutGrid,
  ShoppingBag,
  Smile,
  BookOpen,
  Palette,
  Watch,
  Gamepad2,
  Tag,
  ArrowDown,
} from "lucide-react";
import { useCart } from "@/lib/context/CartContext";
import { useToast } from "@/components/ui/Toast";
import { formatCurrency, cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase";
import { calculateFlipkartDiscount } from "@/lib/search";
import { FlipkartPriceRow } from "@/components/ui/ProductCard";
import {
  CATEGORY_STYLES,
  DEFAULT_CATEGORY_STYLE,
} from "@/components/storefront/TopCategoryNav";

export type ProductLayoutStyle =
  | "standard"
  | "compact"
  | "featured"
  | "rail"
  | "carousel"
  | "two_card"
  | "dense"
  | "editorial";

export interface CategoryLayoutConfig {
  layout_style?: ProductLayoutStyle;
  desktop_cols?: number;
  tablet_cols?: number;
  mobile_cols?: number;
  mobile_rail?: boolean;
  section_limit?: number;
  active?: boolean;
}

export interface StorefrontGridConfig {
  desktop_cols?: number;
  tablet_cols?: number;
  mobile_cols?: number;
  section_limit?: number;
  category_layouts?: Record<string, CategoryLayoutConfig>;
}

export interface InteractiveCategoryShowcaseProps {
  gridConfig?: StorefrontGridConfig;
}

export interface ShowcaseProductItem {
  id: string;
  productId?: string;
  title: string;
  weightOrUnit: string;
  price: number;
  mrp: number;
  image: string;
  rating: number;
  reviewsCount: number;
  tag?: string;
  tagColor?: string;
  deliveryTime?: string;
  stockLeft?: string;
  stock_quantity?: number | null;
  subcategoryId?: string;
  isReal?: boolean;
  slug?: string;
}

export interface DepartmentSection {
  id: string;
  title: string;
  subcategoryId?: string;
  catSlug?: string;
  layout_style: ProductLayoutStyle;
  desktop_cols?: number;
  tablet_cols?: number;
  mobile_cols?: number;
  seeAllHref?: string;
  products: ShowcaseProductItem[];
}

export interface CategoryThemeTokens {
  primary: string;
  border: string;
  bg: string;
  glow: string;
  iconActiveBg: string;
  stripBg: string;
  stripBorder: string;
}

export const CATEGORY_THEMES: Record<string, CategoryThemeTokens> = {
  cake: {
    primary: "#e11d48",
    border: "#fb7185",
    bg: "rgba(255, 241, 242, 0.95)",
    glow: "rgba(244, 63, 94, 0.25)",
    iconActiveBg: "#f43f5e",
    stripBg: "#fff5f7",
    stripBorder: "rgba(254, 205, 211, 0.75)",
  },
  "grocery-food": {
    primary: "#059669",
    border: "#34d399",
    bg: "rgba(236, 253, 245, 0.95)",
    glow: "rgba(16, 185, 129, 0.25)",
    iconActiveBg: "#10b981",
    stripBg: "#f0fdf4",
    stripBorder: "rgba(167, 243, 208, 0.75)",
  },
  electronics: {
    primary: "#7c3aed",
    border: "#c084fc",
    bg: "rgba(250, 245, 255, 0.95)",
    glow: "rgba(168, 85, 247, 0.25)",
    iconActiveBg: "#9333ea",
    stripBg: "#faf5ff",
    stripBorder: "rgba(233, 213, 255, 0.75)",
  },
  "beauty-care": {
    primary: "#c026d3",
    border: "#e879f9",
    bg: "rgba(253, 244, 255, 0.95)",
    glow: "rgba(217, 70, 239, 0.25)",
    iconActiveBg: "#d946ef",
    stripBg: "#fdf4ff",
    stripBorder: "rgba(245, 208, 254, 0.75)",
  },
  "mens-fashion": {
    primary: "#2563eb",
    border: "#60a5fa",
    bg: "rgba(239, 246, 255, 0.95)",
    glow: "rgba(59, 130, 246, 0.25)",
    iconActiveBg: "#3b82f6",
    stripBg: "#eff6ff",
    stripBorder: "rgba(191, 219, 254, 0.75)",
  },
  "womens-fashion": {
    primary: "#db2777",
    border: "#f472b6",
    bg: "rgba(253, 242, 248, 0.95)",
    glow: "rgba(236, 72, 153, 0.25)",
    iconActiveBg: "#ec4899",
    stripBg: "#fdf2f8",
    stripBorder: "rgba(251, 207, 232, 0.75)",
  },
  "home-living": {
    primary: "#d97706",
    border: "#fbbf24",
    bg: "rgba(255, 251, 235, 0.95)",
    glow: "rgba(245, 158, 11, 0.25)",
    iconActiveBg: "#f59e0b",
    stripBg: "#fffbeb",
    stripBorder: "rgba(253, 230, 138, 0.75)",
  },
  footwear: {
    primary: "#0284c7",
    border: "#38bdf8",
    bg: "rgba(240, 249, 255, 0.95)",
    glow: "rgba(14, 165, 233, 0.25)",
    iconActiveBg: "#0ea5e9",
    stripBg: "#f0f9ff",
    stripBorder: "rgba(186, 230, 253, 0.75)",
  },
  "sports-fitness": {
    primary: "#0d9488",
    border: "#2dd4bf",
    bg: "rgba(240, 253, 250, 0.95)",
    glow: "rgba(20, 184, 166, 0.25)",
    iconActiveBg: "#14b8a6",
    stripBg: "#f0fdfa",
    stripBorder: "rgba(153, 246, 228, 0.75)",
  },
  "books-stationery": {
    primary: "#9333ea",
    border: "#c084fc",
    bg: "rgba(250, 245, 255, 0.95)",
    glow: "rgba(168, 85, 247, 0.25)",
    iconActiveBg: "#9333ea",
    stripBg: "#faf5ff",
    stripBorder: "rgba(233, 213, 255, 0.75)",
  },
  "hand-craft": {
    primary: "#e11d48",
    border: "#fb7185",
    bg: "rgba(255, 241, 242, 0.95)",
    glow: "rgba(244, 63, 94, 0.25)",
    iconActiveBg: "#f43f5e",
    stripBg: "#fff5f7",
    stripBorder: "rgba(254, 205, 211, 0.75)",
  },
  accessories: {
    primary: "#ea580c",
    border: "#fb923c",
    bg: "rgba(255, 247, 237, 0.95)",
    glow: "rgba(249, 115, 22, 0.25)",
    iconActiveBg: "#f97316",
    stripBg: "#fff7ed",
    stripBorder: "rgba(254, 215, 170, 0.75)",
  },
  "toys-baby": {
    primary: "#d97706",
    border: "#fbbf24",
    bg: "rgba(254, 252, 232, 0.95)",
    glow: "rgba(245, 158, 11, 0.25)",
    iconActiveBg: "#f59e0b",
    stripBg: "#fefce8",
    stripBorder: "rgba(254, 240, 138, 0.75)",
  },
  all: {
    primary: "#4f46e5",
    border: "#818cf8",
    bg: "rgba(238, 242, 255, 0.75)",
    glow: "rgba(99, 102, 241, 0.25)",
    iconActiveBg: "#4f46e5",
    stripBg: "#f8fafc",
    stripBorder: "rgba(226, 232, 240, 0.8)",
  },
};

const DEFAULT_CATEGORY_THEME: CategoryThemeTokens = {
  primary: "#4f46e5",
  border: "#818cf8",
  bg: "rgba(238, 242, 255, 0.95)",
  glow: "rgba(99, 102, 241, 0.25)",
  iconActiveBg: "#6366f1",
  stripBg: "#f8fafc",
  stripBorder: "rgba(226, 232, 240, 0.8)",
};

export function getCategoryTheme(catId: string): CategoryThemeTokens {
  return CATEGORY_THEMES[catId] || DEFAULT_CATEGORY_THEME;
}

export interface CategorySpec {
  id: string;
  name: string;
  shortLabel: string;
  icon: React.ElementType;
  badge?: string;
  accent: {
    border: string;
    bg: string;
    text: string;
    iconActiveBg: string;
    glow: string;
  };
  bannerTitle: string;
  bannerSubtitle: string;
  bannerImage: string;
  bannerGradient: string;
  subcategories: {
    id: string;
    label: string;
    image: string;
  }[];
  sections: DepartmentSection[];
  // Fallback flat product pool for backwards compatibility
  products?: ShowcaseProductItem[];
}

export const CATEGORY_SHOWCASE_DATA: CategorySpec[] = [
  {
    id: "cake",
    name: "Cake & Bakery",
    shortLabel: "Cake",
    icon: Cake,
    badge: "Custom",
    accent: {
      border: "border-rose-400 dark:border-rose-500",
      bg: "bg-rose-50/90 dark:bg-rose-950/40",
      text: "text-rose-600 dark:text-rose-400",
      iconActiveBg: "bg-rose-500 text-white",
      glow: "shadow-rose-500/25",
    },
    bannerTitle: "Fresh & Delicious Cakes",
    bannerSubtitle: "Handcrafted for Every Celebration with 100% Eggless & Fresh Ingredients",
    bannerImage: "https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=1200&q=80",
    bannerGradient: "from-rose-950/85 via-pink-900/65 to-transparent",
    subcategories: [
      {
        id: "birthday",
        label: "Birthday",
        image: "https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=140&q=80",
      },
      {
        id: "pastries",
        label: "Pastries",
        image: "https://images.unsplash.com/photo-1616541823729-00fe0aacd32c?w=140&q=80",
      },
      {
        id: "cupcakes",
        label: "Cupcakes",
        image: "https://images.unsplash.com/photo-1587668178277-295251f900ce?w=140&q=80",
      },
      {
        id: "desserts",
        label: "Desserts",
        image: "https://images.unsplash.com/photo-1551024601-bec78aea704b?w=140&q=80",
      },
    ],
    sections: [
      {
        id: "cake-sec-1",
        title: "Cakes & Pastries",
        subcategoryId: "birthday",
        layout_style: "standard",
        desktop_cols: 4,
        mobile_cols: 2,
        seeAllHref: "/categories/cake",
        products: [
          {
            id: "cake-1",
            title: "Chocolate Truffle Cake",
            weightOrUnit: "500 g",
            price: 499,
            mrp: 650,
            rating: 4.8,
            reviewsCount: 124,
            image: "https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=600&q=80",
            tag: "23% OFF",
            tagColor: "bg-rose-500 text-white",
            deliveryTime: "30 mins",
            stockLeft: "3 left",
            subcategoryId: "birthday",
          },
          {
            id: "cake-2",
            title: "Red Velvet Pastry (2 pcs)",
            weightOrUnit: "2 pcs",
            price: 120,
            mrp: 160,
            rating: 4.9,
            reviewsCount: 89,
            image: "https://images.unsplash.com/photo-1616541823729-00fe0aacd32c?w=600&q=80",
            tag: "25% OFF",
            tagColor: "bg-rose-500 text-white",
            deliveryTime: "20 mins",
            stockLeft: "5 left",
            subcategoryId: "pastries",
          },
          {
            id: "cake-3",
            title: "Black Forest Gateau",
            weightOrUnit: "500 g",
            price: 450,
            mrp: 550,
            rating: 4.7,
            reviewsCount: 210,
            image: "https://images.unsplash.com/photo-1606890737304-57a1ca8a5b62?w=600&q=80",
            tag: "18% OFF",
            tagColor: "bg-rose-500 text-white",
            deliveryTime: "30 mins",
            stockLeft: "2 left",
            subcategoryId: "birthday",
          },
          {
            id: "cake-4",
            title: "Cupcakes (Pack of 4)",
            weightOrUnit: "Pack of 4",
            price: 180,
            mrp: 220,
            rating: 4.9,
            reviewsCount: 78,
            image: "https://images.unsplash.com/photo-1587668178277-295251f900ce?w=600&q=80",
            tag: "18% OFF",
            tagColor: "bg-purple-500 text-white",
            deliveryTime: "25 mins",
            stockLeft: "4 left",
            subcategoryId: "cupcakes",
          },
        ],
      },
      {
        id: "cake-sec-2",
        title: "Gourmet Cupcakes & Desserts",
        subcategoryId: "desserts",
        layout_style: "rail",
        desktop_cols: 5,
        mobile_cols: 2,
        seeAllHref: "/categories/cake",
        products: [
          {
            id: "cake-5",
            title: "Belgian Chocolate Mousse Cup",
            weightOrUnit: "150 g",
            price: 135,
            mrp: 175,
            rating: 4.9,
            reviewsCount: 54,
            image: "https://images.unsplash.com/photo-1551024601-bec78aea704b?w=600&q=80",
            tag: "Best Seller",
            tagColor: "bg-amber-500 text-white",
            deliveryTime: "20 mins",
            stockLeft: "6 left",
            subcategoryId: "desserts",
          },
          {
            id: "cake-6",
            title: "New York Baked Cheesecake Slice",
            weightOrUnit: "180 g",
            price: 199,
            mrp: 260,
            rating: 4.8,
            reviewsCount: 92,
            image: "https://images.unsplash.com/photo-1533134242443-d4fd215305ad?w=600&q=80",
            tag: "Chef Pick",
            tagColor: "bg-emerald-500 text-white",
            deliveryTime: "25 mins",
            stockLeft: "3 left",
            subcategoryId: "desserts",
          },
          {
            id: "cake-7",
            title: "Rich Dark Walnut Brownie",
            weightOrUnit: "2 pcs",
            price: 140,
            mrp: 190,
            rating: 4.7,
            reviewsCount: 118,
            image: "https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=600&q=80",
            tag: "26% OFF",
            tagColor: "bg-rose-500 text-white",
            deliveryTime: "20 mins",
            stockLeft: "8 left",
            subcategoryId: "desserts",
          },
          {
            id: "cake-8",
            title: "French Macaron Gift Box (6 pcs)",
            weightOrUnit: "Box of 6",
            price: 299,
            mrp: 399,
            rating: 4.9,
            reviewsCount: 41,
            image: "https://images.unsplash.com/photo-1569864321390-344464132049?w=600&q=80",
            tag: "Premium",
            tagColor: "bg-indigo-500 text-white",
            deliveryTime: "30 mins",
            stockLeft: "5 left",
            subcategoryId: "desserts",
          },
        ],
      },
    ],
  },
  {
    id: "grocery-food",
    name: "Grocery & Food",
    shortLabel: "Grocery",
    icon: ShoppingBag,
    accent: {
      border: "border-emerald-400 dark:border-emerald-500",
      bg: "bg-emerald-50/90 dark:bg-emerald-950/40",
      text: "text-emerald-700 dark:text-emerald-300",
      iconActiveBg: "bg-emerald-600 text-white",
      glow: "shadow-emerald-500/25",
    },
    bannerTitle: "Fresh Grocery & Daily Food",
    bannerSubtitle: "HOUSEFULL SNACKS & Farm Fresh Essentials — Up to 60% OFF",
    bannerImage: "https://images.unsplash.com/photo-1542838132-92c53300491e?w=1200&q=80",
    bannerGradient: "from-emerald-950/85 via-emerald-900/65 to-transparent",
    subcategories: [
      {
        id: "fruits-veg",
        label: "Fruits & Veg",
        image: "https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=140&q=80",
      },
      {
        id: "rice-dal",
        label: "Rice & Dal",
        image: "https://images.unsplash.com/photo-1586201375761-83865001e31c?w=140&q=80",
      },
      {
        id: "snacks",
        label: "Chips & Snacks",
        image: "https://images.unsplash.com/photo-1566478989037-eec170784d0b?w=140&q=80",
      },
      {
        id: "oil-masala",
        label: "Oil & Masala",
        image: "https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=140&q=80",
      },
      {
        id: "biscuits",
        label: "Biscuits",
        image: "https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=140&q=80",
      },
    ],
    sections: [
      {
        id: "groc-sec-1",
        title: "Fresh Fruits & Vegetables",
        subcategoryId: "fruits-veg",
        layout_style: "compact", // Compact 3-card presentation like Reference 1
        desktop_cols: 5,
        mobile_cols: 3,
        seeAllHref: "/categories/grocery-food",
        products: [
          {
            id: "groc-1",
            title: "Fresh Farm Tomatoes",
            weightOrUnit: "1 kg",
            price: 28,
            mrp: 40,
            rating: 4.6,
            reviewsCount: 310,
            image: "https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=600&q=80",
            tag: "30% OFF",
            tagColor: "bg-red-500 text-white",
            deliveryTime: "15 mins",
            stockLeft: "3 left",
            subcategoryId: "fruits-veg",
          },
          {
            id: "groc-2",
            title: "Fresh Mountain Potato",
            weightOrUnit: "1 kg",
            price: 22,
            mrp: 30,
            rating: 4.5,
            reviewsCount: 198,
            image: "https://images.unsplash.com/photo-1518977676601-b53f82aba655?w=600&q=80",
            tag: "26% OFF",
            tagColor: "bg-red-500 text-white",
            deliveryTime: "15 mins",
            stockLeft: "5 left",
            subcategoryId: "fruits-veg",
          },
          {
            id: "groc-3",
            title: "Crisp Royal Gala Apples",
            weightOrUnit: "1 kg",
            price: 180,
            mrp: 240,
            rating: 4.8,
            reviewsCount: 145,
            image: "https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?w=600&q=80",
            tag: "25% OFF",
            tagColor: "bg-red-500 text-white",
            deliveryTime: "15 mins",
            stockLeft: "4 left",
            subcategoryId: "fruits-veg",
          },
          {
            id: "groc-4",
            title: "Fresh Red Onions",
            weightOrUnit: "1 kg",
            price: 35,
            mrp: 50,
            rating: 4.5,
            reviewsCount: 420,
            image: "https://images.unsplash.com/photo-1618512496248-a07fe83aa8cb?w=600&q=80",
            tag: "30% OFF",
            tagColor: "bg-red-500 text-white",
            deliveryTime: "15 mins",
            stockLeft: "8 left",
            subcategoryId: "fruits-veg",
          },
          {
            id: "groc-5",
            title: "Farm Fresh Baby Spinach",
            weightOrUnit: "250 g",
            price: 25,
            mrp: 35,
            rating: 4.7,
            reviewsCount: 88,
            image: "https://images.unsplash.com/photo-1576045057995-568f588f82fb?w=600&q=80",
            tag: "28% OFF",
            tagColor: "bg-emerald-600 text-white",
            deliveryTime: "15 mins",
            stockLeft: "2 left",
            subcategoryId: "fruits-veg",
          },
          {
            id: "groc-6",
            title: "Nagpur Sweet Oranges",
            weightOrUnit: "1 kg",
            price: 90,
            mrp: 120,
            rating: 4.6,
            reviewsCount: 110,
            image: "https://images.unsplash.com/photo-1582979512210-99b6a53386f9?w=600&q=80",
            tag: "25% OFF",
            tagColor: "bg-amber-500 text-white",
            deliveryTime: "15 mins",
            stockLeft: "6 left",
            subcategoryId: "fruits-veg",
          },
        ],
      },
      {
        id: "groc-sec-2",
        title: "Chips & Namkeen",
        subcategoryId: "snacks",
        layout_style: "rail", // Horizontal rail scrolling inside section only
        desktop_cols: 5,
        mobile_cols: 2,
        seeAllHref: "/categories/grocery-food",
        products: [
          {
            id: "snack-1",
            title: "Lays Classic Salted",
            weightOrUnit: "52 g",
            price: 40,
            mrp: 60,
            rating: 4.6,
            reviewsCount: 2100,
            image: "https://images.unsplash.com/photo-1566478989037-eec170784d0b?w=600&q=80",
            tag: "20% OFF",
            tagColor: "bg-red-500 text-white",
            deliveryTime: "15 mins",
            stockLeft: "3 left",
            subcategoryId: "snacks",
          },
          {
            id: "snack-2",
            title: "Haldiram's Aloo Bhujia",
            weightOrUnit: "180 g",
            price: 120,
            mrp: 135,
            rating: 4.5,
            reviewsCount: 940,
            image: "https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?w=600&q=80",
            tag: "10% OFF",
            tagColor: "bg-red-500 text-white",
            deliveryTime: "15 mins",
            stockLeft: "12 left",
            subcategoryId: "snacks",
          },
          {
            id: "snack-3",
            title: "Bikano Tasty Namkeen",
            weightOrUnit: "200 g",
            price: 99,
            mrp: 120,
            rating: 4.3,
            reviewsCount: 640,
            image: "https://images.unsplash.com/photo-1601050690597-df0568f70950?w=600&q=80",
            tag: "17% OFF",
            tagColor: "bg-red-500 text-white",
            deliveryTime: "15 mins",
            stockLeft: "8 left",
            subcategoryId: "snacks",
          },
          {
            id: "snack-4",
            title: "Kurkure Masala Munch",
            weightOrUnit: "80 g",
            price: 20,
            mrp: 25,
            rating: 4.7,
            reviewsCount: 1820,
            image: "https://images.unsplash.com/photo-1527515637462-cff94eecc1ac?w=600&q=80",
            tag: "Popular",
            tagColor: "bg-amber-500 text-white",
            deliveryTime: "15 mins",
            stockLeft: "15 left",
            subcategoryId: "snacks",
          },
          {
            id: "snack-5",
            title: "Pringles Sour Cream & Onion",
            weightOrUnit: "107 g",
            price: 115,
            mrp: 135,
            rating: 4.8,
            reviewsCount: 750,
            image: "https://images.unsplash.com/photo-1566478989037-eec170784d0b?w=600&q=80",
            tag: "15% OFF",
            tagColor: "bg-emerald-600 text-white",
            deliveryTime: "15 mins",
            stockLeft: "4 left",
            subcategoryId: "snacks",
          },
        ],
      },
      {
        id: "groc-sec-3",
        title: "Rice, Dal & Kitchen Staples",
        subcategoryId: "rice-dal",
        layout_style: "two_card", // 2-card presentation
        desktop_cols: 4,
        mobile_cols: 1,
        seeAllHref: "/categories/grocery-food",
        products: [
          {
            id: "groc-7",
            title: "Royal Basmati Rice Super",
            weightOrUnit: "5 kg",
            price: 499,
            mrp: 650,
            rating: 4.8,
            reviewsCount: 420,
            image: "https://images.unsplash.com/photo-1586201375761-83865001e31c?w=600&q=80",
            tag: "Best Seller",
            tagColor: "bg-blue-600 text-white",
            deliveryTime: "30 mins",
            stockLeft: "4 left",
            subcategoryId: "rice-dal",
          },
          {
            id: "groc-8",
            title: "Pure Refined Sunflower Oil",
            weightOrUnit: "1 L",
            price: 135,
            mrp: 170,
            rating: 4.7,
            reviewsCount: 275,
            image: "https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=600&q=80",
            tag: "Kitchen Staple",
            tagColor: "bg-amber-600 text-white",
            deliveryTime: "20 mins",
            stockLeft: "9 left",
            subcategoryId: "oil-masala",
          },
        ],
      },
    ],
  },
  {
    id: "electronics",
    name: "Electronics & Gadgets",
    shortLabel: "Electronics",
    icon: Smartphone,
    accent: {
      border: "border-purple-400 dark:border-purple-500",
      bg: "bg-purple-50/90 dark:bg-purple-950/40",
      text: "text-purple-700 dark:text-purple-300",
      iconActiveBg: "bg-purple-600 text-white",
      glow: "shadow-purple-500/25",
    },
    bannerTitle: "TOP ELECTRONICS DEALS",
    bannerSubtitle: "Next-Gen Audio, Smart Wearables & Mobile Gear — Up to 60% OFF",
    bannerImage: "https://images.unsplash.com/photo-1550009158-9ebf69173e03?w=1200&q=80",
    bannerGradient: "from-purple-950/85 via-indigo-900/65 to-transparent",
    subcategories: [
      {
        id: "headphones",
        label: "Headphones",
        image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=140&q=80",
      },
      {
        id: "wearables",
        label: "Smart Wearables",
        image: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=140&q=80",
      },
      {
        id: "mobiles",
        label: "Mobiles",
        image: "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=140&q=80",
      },
      {
        id: "accessories",
        label: "Accessories",
        image: "https://images.unsplash.com/photo-1622445268046-86f78a7aa6d9?w=140&q=80",
      },
      {
        id: "speakers",
        label: "Speakers",
        image: "https://images.unsplash.com/photo-1545454675-3531b543be5d?w=140&q=80",
      },
    ],
    sections: [
      {
        id: "elec-sec-1",
        title: "Headphones",
        subcategoryId: "headphones",
        layout_style: "compact", // 3-column compact like Reference Image 1
        desktop_cols: 5,
        mobile_cols: 3,
        seeAllHref: "/categories/electronics",
        products: [
          {
            id: "elec-1",
            title: "boAt Rockerz 450",
            weightOrUnit: "Wireless Over-Ear",
            price: 1299,
            mrp: 2999,
            rating: 4.5,
            reviewsCount: 1200,
            image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&q=80",
            tag: "56% OFF",
            tagColor: "bg-red-500 text-white",
            deliveryTime: "15 mins",
            stockLeft: "7 left",
            subcategoryId: "headphones",
          },
          {
            id: "elec-2",
            title: "Realme Buds T300",
            weightOrUnit: "30dB ANC Earbuds",
            price: 1799,
            mrp: 2999,
            rating: 4.4,
            reviewsCount: 980,
            image: "https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=600&q=80",
            tag: "40% OFF",
            tagColor: "bg-red-500 text-white",
            deliveryTime: "15 mins",
            stockLeft: "3 left",
            subcategoryId: "headphones",
          },
          {
            id: "elec-3",
            title: "JBL Tune 520BT",
            weightOrUnit: "Pure Bass Sound",
            price: 2999,
            mrp: 4999,
            rating: 4.6,
            reviewsCount: 640,
            image: "https://images.unsplash.com/photo-1583394838336-acd977736f90?w=600&q=80",
            tag: "40% OFF",
            tagColor: "bg-red-500 text-white",
            deliveryTime: "15 mins",
            stockLeft: "5 left",
            subcategoryId: "headphones",
          },
          {
            id: "elec-4",
            title: "Sony WH-CH520",
            weightOrUnit: "50 Hr Battery",
            price: 3990,
            mrp: 4990,
            rating: 4.8,
            reviewsCount: 420,
            image: "https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=600&q=80",
            tag: "20% OFF",
            tagColor: "bg-blue-600 text-white",
            deliveryTime: "20 mins",
            stockLeft: "2 left",
            subcategoryId: "headphones",
          },
          {
            id: "elec-5",
            title: "OnePlus Nord Buds 2",
            weightOrUnit: "BassWave Audio",
            price: 2299,
            mrp: 3299,
            rating: 4.5,
            reviewsCount: 510,
            image: "https://images.unsplash.com/photo-1606220588913-b3aacb4d2f46?w=600&q=80",
            tag: "30% OFF",
            tagColor: "bg-red-500 text-white",
            deliveryTime: "15 mins",
            stockLeft: "6 left",
            subcategoryId: "headphones",
          },
        ],
      },
      {
        id: "elec-sec-2",
        title: "Smart Wearables",
        subcategoryId: "wearables",
        layout_style: "dense", // 6-column dense grid on desktop / 3-column on mobile
        desktop_cols: 6,
        mobile_cols: 3,
        seeAllHref: "/categories/electronics",
        products: [
          {
            id: "watch-1",
            title: "boAt Storm Call 3",
            weightOrUnit: "1.83'' HD Display",
            price: 1499,
            mrp: 3499,
            rating: 4.4,
            reviewsCount: 880,
            image: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&q=80",
            tag: "57% OFF",
            tagColor: "bg-red-500 text-white",
            deliveryTime: "15 mins",
            stockLeft: "4 left",
            subcategoryId: "wearables",
          },
          {
            id: "watch-2",
            title: "Noise ColorFit Pulse",
            weightOrUnit: "BT Calling Watch",
            price: 1799,
            mrp: 3999,
            rating: 4.5,
            reviewsCount: 920,
            image: "https://images.unsplash.com/photo-1546868871-7041f2a55e12?w=600&q=80",
            tag: "55% OFF",
            tagColor: "bg-red-500 text-white",
            deliveryTime: "15 mins",
            stockLeft: "9 left",
            subcategoryId: "wearables",
          },
          {
            id: "watch-3",
            title: "Fire-Boltt Ninja Call",
            weightOrUnit: "AI Voice Assistant",
            price: 1299,
            mrp: 2999,
            rating: 4.3,
            reviewsCount: 610,
            image: "https://images.unsplash.com/photo-1508685096489-7aacd43bd3b1?w=600&q=80",
            tag: "56% OFF",
            tagColor: "bg-red-500 text-white",
            deliveryTime: "15 mins",
            stockLeft: "5 left",
            subcategoryId: "wearables",
          },
          {
            id: "watch-4",
            title: "Fastrack Limitless FS1",
            weightOrUnit: "UltraVU Curved",
            price: 1899,
            mrp: 3495,
            rating: 4.6,
            reviewsCount: 340,
            image: "https://images.unsplash.com/photo-1579586337278-3befd40fd17a?w=600&q=80",
            tag: "45% OFF",
            tagColor: "bg-red-500 text-white",
            deliveryTime: "20 mins",
            stockLeft: "3 left",
            subcategoryId: "wearables",
          },
          {
            id: "watch-5",
            title: "Amazfit Bip 3 Pro",
            weightOrUnit: "Built-in GPS",
            price: 2499,
            mrp: 4999,
            rating: 4.7,
            reviewsCount: 290,
            image: "https://images.unsplash.com/photo-1510017803434-a899398421b3?w=600&q=80",
            tag: "50% OFF",
            tagColor: "bg-red-500 text-white",
            deliveryTime: "25 mins",
            stockLeft: "2 left",
            subcategoryId: "wearables",
          },
          {
            id: "watch-6",
            title: "Titan Smart 3 Premium",
            weightOrUnit: "AMOLED Display",
            price: 4995,
            mrp: 8995,
            rating: 4.8,
            reviewsCount: 180,
            image: "https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=600&q=80",
            tag: "44% OFF",
            tagColor: "bg-amber-600 text-white",
            deliveryTime: "30 mins",
            stockLeft: "4 left",
            subcategoryId: "wearables",
          },
        ],
      },
      {
        id: "elec-sec-3",
        title: "Power Banks & Accessories",
        subcategoryId: "accessories",
        layout_style: "rail", // Horizontal rail
        desktop_cols: 5,
        mobile_cols: 2,
        seeAllHref: "/categories/electronics",
        products: [
          {
            id: "acc-1",
            title: "20000mAh 22.5W Fast Power Bank",
            weightOrUnit: "Triple Output",
            price: 1299,
            mrp: 2499,
            rating: 4.7,
            reviewsCount: 680,
            image: "https://images.unsplash.com/photo-1609592807664-8395642a8b30?w=600&q=80",
            tag: "48% OFF",
            tagColor: "bg-red-500 text-white",
            deliveryTime: "15 mins",
            stockLeft: "6 left",
            subcategoryId: "accessories",
          },
          {
            id: "acc-2",
            title: "65W GaN Dual Port Fast Charger",
            weightOrUnit: "Type-C + USB",
            price: 1499,
            mrp: 2299,
            rating: 4.8,
            reviewsCount: 340,
            image: "https://images.unsplash.com/photo-1622445268046-86f78a7aa6d9?w=600&q=80",
            tag: "35% OFF",
            tagColor: "bg-blue-600 text-white",
            deliveryTime: "15 mins",
            stockLeft: "8 left",
            subcategoryId: "accessories",
          },
          {
            id: "acc-3",
            title: "Braided 100W Fast Charging Cable",
            weightOrUnit: "2m Length",
            price: 399,
            mrp: 799,
            rating: 4.6,
            reviewsCount: 890,
            image: "https://images.unsplash.com/photo-1583863788434-e58a36330cf0?w=600&q=80",
            tag: "50% OFF",
            tagColor: "bg-emerald-600 text-white",
            deliveryTime: "15 mins",
            stockLeft: "14 left",
            subcategoryId: "accessories",
          },
          {
            id: "acc-4",
            title: "MagSafe Magnetic Car Mount",
            weightOrUnit: "15W Fast Charge",
            price: 999,
            mrp: 1899,
            rating: 4.7,
            reviewsCount: 160,
            image: "https://images.unsplash.com/photo-1584438784894-089d6a62b8fa?w=600&q=80",
            tag: "47% OFF",
            tagColor: "bg-purple-600 text-white",
            deliveryTime: "20 mins",
            stockLeft: "5 left",
            subcategoryId: "accessories",
          },
        ],
      },
    ],
  },
  {
    id: "beauty-care",
    name: "Beauty & Personal Care",
    shortLabel: "Beauty",
    icon: Smile,
    accent: {
      border: "border-pink-400 dark:border-pink-500",
      bg: "bg-pink-50/90 dark:bg-pink-950/40",
      text: "text-pink-700 dark:text-pink-300",
      iconActiveBg: "bg-pink-600 text-white",
      glow: "shadow-pink-500/25",
    },
    bannerTitle: "BEAUTY ESSENTIALS",
    bannerSubtitle: "Glow Every Day with Curated Skincare, Luxury Scents & Makeup — Up to 50% OFF",
    bannerImage: "https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=1200&q=80",
    bannerGradient: "from-pink-950/85 via-rose-900/65 to-transparent",
    subcategories: [
      {
        id: "skincare",
        label: "Skincare",
        image: "https://images.unsplash.com/photo-1556228720-195a672e8a03?w=140&q=80",
      },
      {
        id: "makeup",
        label: "Makeup",
        image: "https://images.unsplash.com/photo-1586495777744-4413f21062fa?w=140&q=80",
      },
      {
        id: "haircare",
        label: "Hair Care",
        image: "https://images.unsplash.com/photo-1535585209827-a15fcdbc4c2d?w=140&q=80",
      },
      {
        id: "fragrance",
        label: "Fragrance",
        image: "https://images.unsplash.com/photo-1541643600914-78b084683601?w=140&q=80",
      },
      {
        id: "personalcare",
        label: "Personal Care",
        image: "https://images.unsplash.com/photo-1556228852-80b6e5eeff06?w=140&q=80",
      },
    ],
    sections: [
      {
        id: "beauty-sec-1",
        title: "Skincare",
        subcategoryId: "skincare",
        layout_style: "compact", // 3-column compact like Reference Image 1
        desktop_cols: 5,
        mobile_cols: 3,
        seeAllHref: "/categories/beauty-care",
        products: [
          {
            id: "beauty-1",
            title: "Ponds Super Light Gel",
            weightOrUnit: "100 g",
            price: 299,
            mrp: 450,
            rating: 4.5,
            reviewsCount: 2300,
            image: "https://images.unsplash.com/photo-1556228720-195a672e8a03?w=600&q=80",
            tag: "34% OFF",
            tagColor: "bg-red-500 text-white",
            deliveryTime: "15 mins",
            stockLeft: "5 left",
            subcategoryId: "skincare",
          },
          {
            id: "beauty-2",
            title: "Nivea Body Lotion",
            weightOrUnit: "400 ml",
            price: 380,
            mrp: 550,
            rating: 4.4,
            reviewsCount: 1100,
            image: "https://images.unsplash.com/photo-1556228852-80b6e5eeff06?w=600&q=80",
            tag: "30% OFF",
            tagColor: "bg-red-500 text-white",
            deliveryTime: "15 mins",
            stockLeft: "8 left",
            subcategoryId: "skincare",
          },
          {
            id: "beauty-3",
            title: "Cetaphil Gentle Cleanser",
            weightOrUnit: "125 ml",
            price: 550,
            mrp: 750,
            rating: 4.6,
            reviewsCount: 980,
            image: "https://images.unsplash.com/photo-1535585209827-a15fcdbc4c2d?w=600&q=80",
            tag: "26% OFF",
            tagColor: "bg-red-500 text-white",
            deliveryTime: "15 mins",
            stockLeft: "4 left",
            subcategoryId: "skincare",
          },
          {
            id: "beauty-4",
            title: "Dot & Key Vitamin C Gel",
            weightOrUnit: "50 ml",
            price: 445,
            mrp: 595,
            rating: 4.7,
            reviewsCount: 650,
            image: "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=600&q=80",
            tag: "25% OFF",
            tagColor: "bg-amber-500 text-white",
            deliveryTime: "15 mins",
            stockLeft: "6 left",
            subcategoryId: "skincare",
          },
          {
            id: "beauty-5",
            title: "Minimalist 10% Niacinamide",
            weightOrUnit: "30 ml",
            price: 599,
            mrp: 699,
            rating: 4.8,
            reviewsCount: 1400,
            image: "https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=600&q=80",
            tag: "Top Rated",
            tagColor: "bg-blue-600 text-white",
            deliveryTime: "15 mins",
            stockLeft: "3 left",
            subcategoryId: "skincare",
          },
        ],
      },
      {
        id: "beauty-sec-2",
        title: "Makeup",
        subcategoryId: "makeup",
        layout_style: "rail", // Horizontal rail
        desktop_cols: 5,
        mobile_cols: 2,
        seeAllHref: "/categories/beauty-care",
        products: [
          {
            id: "make-1",
            title: "Velvet Matte Long-Stay Lipstick",
            weightOrUnit: "Ruby Red 4.2g",
            price: 249,
            mrp: 399,
            rating: 4.9,
            reviewsCount: 780,
            image: "https://images.unsplash.com/photo-1586495777744-4413f21062fa?w=600&q=80",
            tag: "37% OFF",
            tagColor: "bg-pink-600 text-white",
            deliveryTime: "15 mins",
            stockLeft: "7 left",
            subcategoryId: "makeup",
          },
          {
            id: "make-2",
            title: "Maybelline Superstay Matte Ink",
            weightOrUnit: "Liquid 5ml",
            price: 499,
            mrp: 699,
            rating: 4.7,
            reviewsCount: 1120,
            image: "https://images.unsplash.com/photo-1599305090598-fe179d501227?w=600&q=80",
            tag: "28% OFF",
            tagColor: "bg-rose-600 text-white",
            deliveryTime: "15 mins",
            stockLeft: "9 left",
            subcategoryId: "makeup",
          },
          {
            id: "make-3",
            title: "Lakme Eyeconic Smudge-Free Kajal",
            weightOrUnit: "Deep Black 0.35g",
            price: 185,
            mrp: 225,
            rating: 4.6,
            reviewsCount: 2400,
            image: "https://images.unsplash.com/photo-1512496015851-a90fb38ba796?w=600&q=80",
            tag: "Daily Essential",
            tagColor: "bg-slate-800 text-white",
            deliveryTime: "15 mins",
            stockLeft: "12 left",
            subcategoryId: "makeup",
          },
          {
            id: "make-4",
            title: "Plum Matterific 12-Hour Lipstick",
            weightOrUnit: "Caramel Nude",
            price: 399,
            mrp: 549,
            rating: 4.8,
            reviewsCount: 430,
            image: "https://images.unsplash.com/photo-1631214500115-598fc2cb8d2d?w=600&q=80",
            tag: "Vegan",
            tagColor: "bg-emerald-600 text-white",
            deliveryTime: "15 mins",
            stockLeft: "4 left",
            subcategoryId: "makeup",
          },
          {
            id: "make-5",
            title: "Sugar Cosmetics Contour Palette",
            weightOrUnit: "3-in-1 Face Kit",
            price: 599,
            mrp: 799,
            rating: 4.7,
            reviewsCount: 310,
            image: "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=600&q=80",
            tag: "25% OFF",
            tagColor: "bg-amber-600 text-white",
            deliveryTime: "15 mins",
            stockLeft: "5 left",
            subcategoryId: "makeup",
          },
        ],
      },
      {
        id: "beauty-sec-3",
        title: "Hair Care & Cleansers",
        subcategoryId: "haircare",
        layout_style: "two_card", // 2-card presentation
        desktop_cols: 4,
        mobile_cols: 1,
        seeAllHref: "/categories/beauty-care",
        products: [
          {
            id: "beauty-6",
            title: "Nourishing Herbal Shampoo",
            weightOrUnit: "650 ml",
            price: 380,
            mrp: 450,
            rating: 4.7,
            reviewsCount: 165,
            image: "https://images.unsplash.com/photo-1535585209827-a15fcdbc4c2d?w=600&q=80",
            tag: "Sulfate Free",
            tagColor: "bg-emerald-600 text-white",
            deliveryTime: "20 mins",
            stockLeft: "8 left",
            subcategoryId: "haircare",
          },
          {
            id: "beauty-7",
            title: "Tea Tree Gentle Face Wash",
            weightOrUnit: "100 ml",
            price: 199,
            mrp: 299,
            rating: 4.8,
            reviewsCount: 215,
            image: "https://images.unsplash.com/photo-1556228852-80b6e5eeff06?w=600&q=80",
            tag: "Anti-Acne",
            tagColor: "bg-teal-600 text-white",
            deliveryTime: "20 mins",
            stockLeft: "11 left",
            subcategoryId: "skincare",
          },
        ],
      },
    ],
  },
  {
    id: "mens-fashion",
    name: "Men's Fashion",
    shortLabel: "Men",
    icon: Shirt,
    accent: {
      border: "border-blue-400 dark:border-blue-500",
      bg: "bg-blue-50/90 dark:bg-blue-950/40",
      text: "text-blue-700 dark:text-blue-300",
      iconActiveBg: "bg-blue-600 text-white",
      glow: "shadow-blue-500/25",
    },
    bannerTitle: "Men's Fashion",
    bannerSubtitle: "Style For Every Day — Formals, Casuals, Denim & Streetwear",
    bannerImage: "https://images.unsplash.com/photo-1617137984095-74e4e5e3613f?w=1200&q=80",
    bannerGradient: "from-blue-950/85 via-blue-900/65 to-transparent",
    subcategories: [
      {
        id: "tshirts",
        label: "T-Shirts",
        image: "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=140&q=80",
      },
      {
        id: "shirts",
        label: "Shirts",
        image: "https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=140&q=80",
      },
      {
        id: "jeans",
        label: "Jeans",
        image: "https://images.unsplash.com/photo-1542272604-780c96856592?w=140&q=80",
      },
      {
        id: "jackets",
        label: "Jackets",
        image: "https://images.unsplash.com/photo-1551028719-00167b16eac5?w=140&q=80",
      },
    ],
    sections: [
      {
        id: "men-sec-1",
        title: "Trending for Men",
        subcategoryId: "tshirts",
        layout_style: "featured", // 3-col featured presentation
        desktop_cols: 3,
        mobile_cols: 2,
        seeAllHref: "/categories/mens-fashion",
        products: [
          {
            id: "men-1",
            title: "Pure Cotton Crewneck T-Shirt",
            weightOrUnit: "Regular Fit",
            price: 399,
            mrp: 699,
            rating: 4.6,
            reviewsCount: 204,
            image: "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=600&q=80",
            tag: "43% OFF",
            tagColor: "bg-blue-600 text-white",
            deliveryTime: "30 mins",
            stockLeft: "6 left",
            subcategoryId: "tshirts",
          },
          {
            id: "men-2",
            title: "Classic Oxford Casual Shirt",
            weightOrUnit: "Slim Fit",
            price: 599,
            mrp: 999,
            rating: 4.7,
            reviewsCount: 165,
            image: "https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=600&q=80",
            tag: "Trending",
            tagColor: "bg-indigo-600 text-white",
            deliveryTime: "35 mins",
            stockLeft: "4 left",
            subcategoryId: "shirts",
          },
          {
            id: "men-3",
            title: "Oversized Streetwear Graphic Tee",
            weightOrUnit: "Heavyweight Cotton",
            price: 499,
            mrp: 899,
            rating: 4.8,
            reviewsCount: 142,
            image: "https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?w=600&q=80",
            tag: "Hot Pick",
            tagColor: "bg-rose-600 text-white",
            deliveryTime: "30 mins",
            stockLeft: "5 left",
            subcategoryId: "tshirts",
          },
        ],
      },
      {
        id: "men-sec-2",
        title: "Bottomwear & Jackets",
        subcategoryId: "jeans",
        layout_style: "rail", // Horizontal rail
        desktop_cols: 4,
        mobile_cols: 2,
        seeAllHref: "/categories/mens-fashion",
        products: [
          {
            id: "men-4",
            title: "Stretch Denim Slim Fit Jeans",
            weightOrUnit: "Sizes 30-36",
            price: 899,
            mrp: 1499,
            rating: 4.8,
            reviewsCount: 310,
            image: "https://images.unsplash.com/photo-1542272604-780c96856592?w=600&q=80",
            tag: "40% OFF",
            tagColor: "bg-blue-600 text-white",
            deliveryTime: "40 mins",
            stockLeft: "7 left",
            subcategoryId: "jeans",
          },
          {
            id: "men-5",
            title: "Urban Windbreaker Hoodie Jacket",
            weightOrUnit: "Water Resistant",
            price: 1199,
            mrp: 1999,
            rating: 4.7,
            reviewsCount: 95,
            image: "https://images.unsplash.com/photo-1551028719-00167b16eac5?w=600&q=80",
            tag: "40% OFF",
            tagColor: "bg-amber-600 text-white",
            deliveryTime: "45 mins",
            stockLeft: "3 left",
            subcategoryId: "jackets",
          },
          {
            id: "men-6",
            title: "Cotton Stretch Chino Trousers",
            weightOrUnit: "Olive Green",
            price: 999,
            mrp: 1599,
            rating: 4.6,
            reviewsCount: 180,
            image: "https://images.unsplash.com/photo-1473966968600-fa801b869a1a?w=600&q=80",
            tag: "38% OFF",
            tagColor: "bg-emerald-600 text-white",
            deliveryTime: "35 mins",
            stockLeft: "8 left",
            subcategoryId: "jeans",
          },
          {
            id: "men-7",
            title: "Utility Multi-Pocket Cargo Joggers",
            weightOrUnit: "Khaki Brown",
            price: 849,
            mrp: 1399,
            rating: 4.7,
            reviewsCount: 115,
            image: "https://images.unsplash.com/photo-1517445312882-bc9910d016b7?w=600&q=80",
            tag: "Comfort",
            tagColor: "bg-slate-700 text-white",
            deliveryTime: "35 mins",
            stockLeft: "4 left",
            subcategoryId: "jeans",
          },
        ],
      },
    ],
  },
  {
    id: "womens-fashion",
    name: "Women's Fashion",
    shortLabel: "Women",
    icon: Sparkles,
    accent: {
      border: "border-pink-400 dark:border-pink-500",
      bg: "bg-pink-50/90 dark:bg-pink-950/40",
      text: "text-pink-700 dark:text-pink-300",
      iconActiveBg: "bg-pink-600 text-white",
      glow: "shadow-pink-500/25",
    },
    bannerTitle: "Women's Fashion",
    bannerSubtitle: "Trendy Styles For Every You — Ethnic Kurtis, Sarees & Party Wear",
    bannerImage: "https://images.unsplash.com/photo-1525507119028-ed4c629a60a3?w=1200&q=80",
    bannerGradient: "from-pink-950/85 via-purple-900/65 to-transparent",
    subcategories: [
      {
        id: "kurtis",
        label: "Kurtis",
        image: "https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?w=140&q=80",
      },
      {
        id: "sarees",
        label: "Sarees",
        image: "https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=140&q=80",
      },
      {
        id: "tops",
        label: "Tops",
        image: "https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?w=140&q=80",
      },
      {
        id: "dresses",
        label: "Dresses",
        image: "https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=140&q=80",
      },
    ],
    sections: [
      {
        id: "women-sec-1",
        title: "Trending for Women",
        subcategoryId: "kurtis",
        layout_style: "standard", // 2-col mobile / 4-col desktop
        desktop_cols: 4,
        mobile_cols: 2,
        seeAllHref: "/categories/womens-fashion",
        products: [
          {
            id: "women-1",
            title: "Cotton Printed Anarkali Kurti",
            weightOrUnit: "100% Breathable Cotton",
            price: 499,
            mrp: 899,
            rating: 4.8,
            reviewsCount: 340,
            image: "https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?w=600&q=80",
            tag: "44% OFF",
            tagColor: "bg-pink-600 text-white",
            deliveryTime: "30 mins",
            stockLeft: "4 left",
            subcategoryId: "kurtis",
          },
          {
            id: "women-2",
            title: "Designer Georgette Party Saree",
            weightOrUnit: "With Blouse Piece",
            price: 999,
            mrp: 1899,
            rating: 4.9,
            reviewsCount: 210,
            image: "https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=600&q=80",
            tag: "47% OFF",
            tagColor: "bg-purple-600 text-white",
            deliveryTime: "40 mins",
            stockLeft: "3 left",
            subcategoryId: "sarees",
          },
          {
            id: "women-3",
            title: "Handcrafted Floral Kurta Set",
            weightOrUnit: "Kurta with Pant & Dupatta",
            price: 899,
            mrp: 1499,
            rating: 4.7,
            reviewsCount: 185,
            image: "https://images.unsplash.com/photo-1525507119028-ed4c629a60a3?w=600&q=80",
            tag: "40% OFF",
            tagColor: "bg-rose-600 text-white",
            deliveryTime: "35 mins",
            stockLeft: "5 left",
            subcategoryId: "kurtis",
          },
          {
            id: "women-4",
            title: "Elegant Floral Summer Maxi Dress",
            weightOrUnit: "Soft Chiffon Fabric",
            price: 799,
            mrp: 1299,
            rating: 4.8,
            reviewsCount: 160,
            image: "https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=600&q=80",
            tag: "38% OFF",
            tagColor: "bg-amber-600 text-white",
            deliveryTime: "30 mins",
            stockLeft: "6 left",
            subcategoryId: "dresses",
          },
        ],
      },
      {
        id: "women-sec-2",
        title: "Western & Casual Tops",
        subcategoryId: "tops",
        layout_style: "rail", // Horizontal rail
        desktop_cols: 4,
        mobile_cols: 2,
        seeAllHref: "/categories/womens-fashion",
        products: [
          {
            id: "women-5",
            title: "Ribbed Knit Crop Top",
            weightOrUnit: "Stretch Fabric",
            price: 349,
            mrp: 599,
            rating: 4.7,
            reviewsCount: 220,
            image: "https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?w=600&q=80",
            tag: "Top Trend",
            tagColor: "bg-pink-600 text-white",
            deliveryTime: "25 mins",
            stockLeft: "9 left",
            subcategoryId: "tops",
          },
          {
            id: "women-6",
            title: "High-Waist Wide Leg Denim Jeans",
            weightOrUnit: "Vintage Wash",
            price: 999,
            mrp: 1699,
            rating: 4.8,
            reviewsCount: 175,
            image: "https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=600&q=80",
            tag: "41% OFF",
            tagColor: "bg-blue-600 text-white",
            deliveryTime: "35 mins",
            stockLeft: "4 left",
            subcategoryId: "tops",
          },
          {
            id: "women-7",
            title: "Oversized Pure Linen Shirt",
            weightOrUnit: "Breathable Pure Linen",
            price: 699,
            mrp: 1199,
            rating: 4.6,
            reviewsCount: 95,
            image: "https://images.unsplash.com/photo-1598554747436-c9293d6a588f?w=600&q=80",
            tag: "New",
            tagColor: "bg-emerald-600 text-white",
            deliveryTime: "30 mins",
            stockLeft: "7 left",
            subcategoryId: "tops",
          },
        ],
      },
    ],
  },
  {
    id: "home-living",
    name: "Home & Living",
    shortLabel: "Home",
    icon: Home,
    accent: {
      border: "border-amber-400 dark:border-amber-500",
      bg: "bg-amber-50/90 dark:bg-amber-950/40",
      text: "text-amber-700 dark:text-amber-300",
      iconActiveBg: "bg-amber-500 text-white",
      glow: "shadow-amber-500/25",
    },
    bannerTitle: "Home & Living",
    bannerSubtitle: "Make Your Home Beautiful — Modern Furniture, Ambient Lighting & Decor",
    bannerImage: "https://images.unsplash.com/photo-1513694203232-719a280e022f?w=1200&q=80",
    bannerGradient: "from-amber-950/85 via-amber-900/65 to-transparent",
    subcategories: [
      {
        id: "furniture",
        label: "Furniture",
        image: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=140&q=80",
      },
      {
        id: "decor",
        label: "Home Decor",
        image: "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=140&q=80",
      },
      {
        id: "kitchen",
        label: "Kitchen",
        image: "https://images.unsplash.com/photo-1556911220-e15b29be8c8f?w=140&q=80",
      },
      {
        id: "storage",
        label: "Storage",
        image: "https://images.unsplash.com/photo-1584992236310-6edddc08acff?w=140&q=80",
      },
    ],
    sections: [
      {
        id: "home-sec-1",
        title: "Home Essentials & Furniture",
        subcategoryId: "furniture",
        layout_style: "two_card", // 2-card presentation
        desktop_cols: 2,
        mobile_cols: 1,
        seeAllHref: "/categories/home-living",
        products: [
          {
            id: "home-1",
            title: "Modern Ergonomic Accent Sofa Chair",
            weightOrUnit: "Velvet Cushion Seat",
            price: 4999,
            mrp: 8999,
            rating: 4.9,
            reviewsCount: 88,
            image: "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=600&q=80",
            tag: "44% OFF",
            tagColor: "bg-amber-600 text-white",
            deliveryTime: "Same Day",
            stockLeft: "2 left",
            subcategoryId: "furniture",
          },
          {
            id: "home-2",
            title: "Solid Sheesham Wood Coffee Table",
            weightOrUnit: "Natural Teak Finish",
            price: 3499,
            mrp: 5999,
            rating: 4.8,
            reviewsCount: 64,
            image: "https://images.unsplash.com/photo-1533090161767-e6ffed986c88?w=600&q=80",
            tag: "Handcrafted",
            tagColor: "bg-amber-700 text-white",
            deliveryTime: "Same Day",
            stockLeft: "3 left",
            subcategoryId: "furniture",
          },
        ],
      },
      {
        id: "home-sec-2",
        title: "Decor, Linen & Organization",
        subcategoryId: "decor",
        layout_style: "standard", // 4-column on desktop / 2-col on mobile
        desktop_cols: 4,
        mobile_cols: 2,
        seeAllHref: "/categories/home-living",
        products: [
          {
            id: "home-3",
            title: "Warm Minimalist Ceramic Table Lamp",
            weightOrUnit: "Warm LED Included",
            price: 649,
            mrp: 1099,
            rating: 4.8,
            reviewsCount: 140,
            image: "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=600&q=80",
            tag: "Lighting",
            tagColor: "bg-yellow-500 text-white",
            deliveryTime: "25 mins",
            stockLeft: "5 left",
            subcategoryId: "decor",
          },
          {
            id: "home-4",
            title: "King Size 100% Cotton Bed Sheet",
            weightOrUnit: "300 TC + 2 Pillow Covers",
            price: 799,
            mrp: 1299,
            rating: 4.7,
            reviewsCount: 220,
            image: "https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?w=600&q=80",
            tag: "38% OFF",
            tagColor: "bg-teal-600 text-white",
            deliveryTime: "30 mins",
            stockLeft: "8 left",
            subcategoryId: "decor",
          },
          {
            id: "home-5",
            title: "Multi-Purpose Storage Box Set of 3",
            weightOrUnit: "Foldable Canvas Organizer",
            price: 499,
            mrp: 899,
            rating: 4.6,
            reviewsCount: 110,
            image: "https://images.unsplash.com/photo-1584992236310-6edddc08acff?w=600&q=80",
            tag: "Organize",
            tagColor: "bg-slate-700 text-white",
            deliveryTime: "25 mins",
            stockLeft: "6 left",
            subcategoryId: "storage",
          },
          {
            id: "home-6",
            title: "Ceramic Nordic Flower Vase",
            weightOrUnit: "Matte White Finish",
            price: 450,
            mrp: 750,
            rating: 4.7,
            reviewsCount: 95,
            image: "https://images.unsplash.com/photo-1612196808214-b8e1d6145a8c?w=600&q=80",
            tag: "40% OFF",
            tagColor: "bg-rose-600 text-white",
            deliveryTime: "20 mins",
            stockLeft: "4 left",
            subcategoryId: "decor",
          },
        ],
      },
    ],
  },
  {
    id: "footwear",
    name: "Footwear",
    shortLabel: "Footwear",
    icon: Footprints,
    accent: {
      border: "border-sky-400 dark:border-sky-500",
      bg: "bg-sky-50/90 dark:bg-sky-950/40",
      text: "text-sky-700 dark:text-sky-300",
      iconActiveBg: "bg-sky-600 text-white",
      glow: "shadow-sky-500/25",
    },
    bannerTitle: "Footwear",
    bannerSubtitle: "Step Up Your Style — Comfort Sneakers, Running Shoes & Casuals",
    bannerImage: "https://images.unsplash.com/photo-1549298916-b41d501d3772?w=1200&q=80",
    bannerGradient: "from-sky-950/85 via-sky-900/65 to-transparent",
    subcategories: [
      {
        id: "sneakers",
        label: "Sneakers",
        image: "https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?w=140&q=80",
      },
      {
        id: "running",
        label: "Running",
        image: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=140&q=80",
      },
      {
        id: "casual",
        label: "Casual Shoes",
        image: "https://images.unsplash.com/photo-1608231387042-66d1773070a5?w=140&q=80",
      },
      {
        id: "sandals",
        label: "Sandals",
        image: "https://images.unsplash.com/photo-1562183241-b937e95585b6?w=140&q=80",
      },
    ],
    sections: [
      {
        id: "foot-sec-1",
        title: "Trending Footwear",
        subcategoryId: "running",
        layout_style: "standard", // 4-column desktop / 2-column mobile
        desktop_cols: 4,
        mobile_cols: 2,
        seeAllHref: "/categories/footwear",
        products: [
          {
            id: "foot-1",
            title: "Lightweight Running Shoes",
            weightOrUnit: "Air Cushion Sole",
            price: 1299,
            mrp: 2499,
            rating: 4.8,
            reviewsCount: 310,
            image: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600&q=80",
            tag: "48% OFF",
            tagColor: "bg-sky-600 text-white",
            deliveryTime: "30 mins",
            stockLeft: "4 left",
            subcategoryId: "running",
          },
          {
            id: "foot-2",
            title: "Classic White Leather Sneakers",
            weightOrUnit: "Memory Foam Insole",
            price: 999,
            mrp: 1899,
            rating: 4.7,
            reviewsCount: 220,
            image: "https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?w=600&q=80",
            tag: "Top Style",
            tagColor: "bg-indigo-600 text-white",
            deliveryTime: "30 mins",
            stockLeft: "6 left",
            subcategoryId: "sneakers",
          },
          {
            id: "foot-3",
            title: "Court Master Athletic Trainer",
            weightOrUnit: "Grip Sole",
            price: 1499,
            mrp: 2999,
            rating: 4.9,
            reviewsCount: 188,
            image: "https://images.unsplash.com/photo-1608231387042-66d1773070a5?w=600&q=80",
            tag: "50% OFF",
            tagColor: "bg-red-500 text-white",
            deliveryTime: "35 mins",
            stockLeft: "2 left",
            subcategoryId: "running",
          },
          {
            id: "foot-4",
            title: "Casual Canvas Slip-On Loafers",
            weightOrUnit: "Breathable Canvas",
            price: 799,
            mrp: 1399,
            rating: 4.6,
            reviewsCount: 135,
            image: "https://images.unsplash.com/photo-1560769629-975ec94e6a86?w=600&q=80",
            tag: "43% OFF",
            tagColor: "bg-amber-600 text-white",
            deliveryTime: "25 mins",
            stockLeft: "5 left",
            subcategoryId: "casual",
          },
        ],
      },
      {
        id: "foot-sec-2",
        title: "Sandals & Daily Comfort",
        subcategoryId: "sandals",
        layout_style: "rail", // Horizontal rail
        desktop_cols: 4,
        mobile_cols: 2,
        seeAllHref: "/categories/footwear",
        products: [
          {
            id: "foot-5",
            title: "Comfort Outdoor Walking Sandals",
            weightOrUnit: "Adjustable Straps",
            price: 699,
            mrp: 1199,
            rating: 4.6,
            reviewsCount: 145,
            image: "https://images.unsplash.com/photo-1562183241-b937e95585b6?w=600&q=80",
            tag: "Comfort",
            tagColor: "bg-emerald-600 text-white",
            deliveryTime: "25 mins",
            stockLeft: "7 left",
            subcategoryId: "sandals",
          },
          {
            id: "foot-6",
            title: "Orthopedic Dual-Strap Recovery Slides",
            weightOrUnit: "Ultra Soft EVA",
            price: 499,
            mrp: 899,
            rating: 4.8,
            reviewsCount: 190,
            image: "https://images.unsplash.com/photo-1603808033192-082d6919d3e1?w=600&q=80",
            tag: "44% OFF",
            tagColor: "bg-sky-600 text-white",
            deliveryTime: "20 mins",
            stockLeft: "10 left",
            subcategoryId: "sandals",
          },
          {
            id: "foot-7",
            title: "Genuine Leather Strap Sandals",
            weightOrUnit: "Cushioned Footbed",
            price: 899,
            mrp: 1499,
            rating: 4.7,
            reviewsCount: 95,
            image: "https://images.unsplash.com/photo-1543163521-1bf539c55dd2?w=600&q=80",
            tag: "Leather",
            tagColor: "bg-amber-700 text-white",
            deliveryTime: "30 mins",
            stockLeft: "3 left",
            subcategoryId: "sandals",
          },
        ],
      },
    ],
  },
  {
    id: "sports-fitness",
    name: "Sports & Fitness",
    shortLabel: "Sports",
    icon: Dumbbell,
    accent: {
      border: "border-teal-400 dark:border-teal-500",
      bg: "bg-teal-50/90 dark:bg-teal-950/40",
      text: "text-teal-700 dark:text-teal-300",
      iconActiveBg: "bg-teal-600 text-white",
      glow: "shadow-teal-500/25",
    },
    bannerTitle: "Sports & Fitness",
    bannerSubtitle: "Stay Active & Train Hard with Home Workout Equipment & Activewear",
    bannerImage: "https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=1200&q=80",
    bannerGradient: "from-teal-950/85 via-teal-900/65 to-transparent",
    subcategories: [
      {
        id: "gym",
        label: "Gym Equipment",
        image: "https://images.unsplash.com/photo-1586401100295-7a8096fd231a?w=140&q=80",
      },
      {
        id: "yoga",
        label: "Yoga & Mats",
        image: "https://images.unsplash.com/photo-1592432678016-e910b452f9a2?w=140&q=80",
      },
      {
        id: "wear",
        label: "Sports Wear",
        image: "https://images.unsplash.com/photo-1591195853828-11db59a44f6b?w=140&q=80",
      },
      {
        id: "outdoor",
        label: "Outdoor Games",
        image: "https://images.unsplash.com/photo-1614632537197-38a17061c2bd?w=140&q=80",
      },
    ],
    sections: [
      {
        id: "sport-sec-1",
        title: "Workout Equipment",
        subcategoryId: "gym",
        layout_style: "compact", // 3-col on mobile / 5-col on desktop
        desktop_cols: 5,
        mobile_cols: 3,
        seeAllHref: "/categories/sports-fitness",
        products: [
          {
            id: "sport-1",
            title: "Cast Iron Hex Dumbbell (10 kg)",
            weightOrUnit: "5 kg x 2",
            price: 1299,
            mrp: 2499,
            rating: 4.9,
            reviewsCount: 230,
            image: "https://images.unsplash.com/photo-1586401100295-7a8096fd231a?w=600&q=80",
            tag: "Heavy Duty",
            tagColor: "bg-teal-600 text-white",
            deliveryTime: "30 mins",
            stockLeft: "4 left",
            subcategoryId: "gym",
          },
          {
            id: "sport-2",
            title: "Anti-Skid Eco Yoga Mat 6mm",
            weightOrUnit: "With Carry Strap",
            price: 499,
            mrp: 999,
            rating: 4.8,
            reviewsCount: 310,
            image: "https://images.unsplash.com/photo-1592432678016-e910b452f9a2?w=600&q=80",
            tag: "50% OFF",
            tagColor: "bg-purple-600 text-white",
            deliveryTime: "20 mins",
            stockLeft: "8 left",
            subcategoryId: "yoga",
          },
          {
            id: "sport-3",
            title: "Resistance Bands Set of 5",
            weightOrUnit: "10-50 lbs Tension",
            price: 399,
            mrp: 799,
            rating: 4.7,
            reviewsCount: 180,
            image: "https://images.unsplash.com/photo-1598289431512-b97b0917affc?w=600&q=80",
            tag: "50% OFF",
            tagColor: "bg-blue-600 text-white",
            deliveryTime: "15 mins",
            stockLeft: "9 left",
            subcategoryId: "gym",
          },
          {
            id: "sport-4",
            title: "Dual Wheel Core Ab Roller",
            weightOrUnit: "With Knee Mat",
            price: 349,
            mrp: 699,
            rating: 4.6,
            reviewsCount: 140,
            image: "https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=600&q=80",
            tag: "Core Fit",
            tagColor: "bg-amber-600 text-white",
            deliveryTime: "20 mins",
            stockLeft: "5 left",
            subcategoryId: "gym",
          },
        ],
      },
      {
        id: "sport-sec-2",
        title: "Activewear & Outdoor Sports",
        subcategoryId: "outdoor",
        layout_style: "rail", // Horizontal rail
        desktop_cols: 4,
        mobile_cols: 2,
        seeAllHref: "/categories/sports-fitness",
        products: [
          {
            id: "sport-5",
            title: "Dry-Fit Training Running Shorts",
            weightOrUnit: "Zipper Pockets",
            price: 599,
            mrp: 1199,
            rating: 4.7,
            reviewsCount: 165,
            image: "https://images.unsplash.com/photo-1591195853828-11db59a44f6b?w=600&q=80",
            tag: "Activewear",
            tagColor: "bg-sky-600 text-white",
            deliveryTime: "25 mins",
            stockLeft: "6 left",
            subcategoryId: "wear",
          },
          {
            id: "sport-6",
            title: "All-Weather Match Football (Size 5)",
            weightOrUnit: "Official Match Weight",
            price: 499,
            mrp: 899,
            rating: 4.7,
            reviewsCount: 190,
            image: "https://images.unsplash.com/photo-1614632537197-38a17061c2bd?w=600&q=80",
            tag: "Match Ready",
            tagColor: "bg-emerald-600 text-white",
            deliveryTime: "25 mins",
            stockLeft: "5 left",
            subcategoryId: "outdoor",
          },
          {
            id: "sport-7",
            title: "Pro Graphite Badminton Rackets",
            weightOrUnit: "Pair + 3 Shuttles",
            price: 999,
            mrp: 1799,
            rating: 4.8,
            reviewsCount: 115,
            image: "https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?w=600&q=80",
            tag: "44% OFF",
            tagColor: "bg-rose-600 text-white",
            deliveryTime: "30 mins",
            stockLeft: "3 left",
            subcategoryId: "outdoor",
          },
        ],
      },
    ],
  },
  {
    id: "books-stationery",
    name: "Books & Stationery",
    shortLabel: "Books",
    icon: BookOpen,
    badge: "Popular",
    accent: {
      border: "border-purple-400 dark:border-purple-500",
      bg: "bg-purple-50/90 dark:bg-purple-950/40",
      text: "text-purple-600 dark:text-purple-400",
      iconActiveBg: "bg-purple-600 text-white",
      glow: "shadow-purple-500/25",
    },
    bannerTitle: "Books, Literature & Fine Stationery",
    bannerSubtitle: "Bestselling novels, journals, office essentials, and student notebooks.",
    bannerImage: "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=1200&q=80",
    bannerGradient: "from-purple-950/85 via-indigo-900/65 to-transparent",
    subcategories: [
      { id: "novels", label: "Novels & Fiction", image: "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=140&q=80" },
      { id: "notebooks", label: "Notebooks & Diaries", image: "https://images.unsplash.com/photo-1517842645767-c639042777db?w=140&q=80" },
      { id: "pens", label: "Pens & Supplies", image: "https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?w=140&q=80" },
      { id: "academic", label: "Academic & Exam", image: "https://images.unsplash.com/photo-1497633762265-9d179a990aa6?w=140&q=80" },
    ],
    sections: [
      {
        id: "books-sec-1",
        title: "Bestselling Books & Novels",
        subcategoryId: "novels",
        layout_style: "standard",
        desktop_cols: 4,
        mobile_cols: 2,
        seeAllHref: "/categories/books-stationery",
        products: [
          {
            id: "book-1",
            title: "Classic Hardcover Journal Notebook",
            weightOrUnit: "192 Pages, Ruled",
            price: 249,
            mrp: 399,
            rating: 4.8,
            reviewsCount: 142,
            image: "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=600&q=80",
            tag: "Best Seller",
            tagColor: "bg-purple-600 text-white",
            deliveryTime: "3 days",
            stockLeft: "In Stock",
            subcategoryId: "notebooks",
          },
          {
            id: "book-2",
            title: "Executive Rollerball Metal Pen Set",
            weightOrUnit: "2 Pcs + Refills",
            price: 349,
            mrp: 599,
            rating: 4.9,
            reviewsCount: 88,
            image: "https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?w=600&q=80",
            tag: "Premium",
            tagColor: "bg-indigo-600 text-white",
            deliveryTime: "3 days",
            stockLeft: "In Stock",
            subcategoryId: "pens",
          },
          {
            id: "book-3",
            title: "Vintage Botanical Bookmark Set",
            weightOrUnit: "Set of 6 Brass Marks",
            price: 199,
            mrp: 299,
            rating: 4.7,
            reviewsCount: 64,
            image: "https://images.unsplash.com/photo-1517842645767-c639042777db?w=600&q=80",
            tag: "Handcrafted",
            tagColor: "bg-amber-600 text-white",
            deliveryTime: "3 days",
            stockLeft: "In Stock",
            subcategoryId: "novels",
          },
          {
            id: "book-4",
            title: "Artist Watercolor Sketchbook 300GSM",
            weightOrUnit: "A5, Cold Pressed",
            price: 449,
            mrp: 699,
            rating: 4.9,
            reviewsCount: 110,
            image: "https://images.unsplash.com/photo-1497633762265-9d179a990aa6?w=600&q=80",
            tag: "Artist Grade",
            tagColor: "bg-emerald-600 text-white",
            deliveryTime: "3 days",
            stockLeft: "In Stock",
            subcategoryId: "notebooks",
          },
        ],
      },
    ],
  },
  {
    id: "hand-craft",
    name: "Artisan Handicrafts",
    shortLabel: "Handicraft",
    icon: Palette,
    badge: "Artisan",
    accent: {
      border: "border-rose-400 dark:border-rose-500",
      bg: "bg-rose-50/90 dark:bg-rose-950/40",
      text: "text-rose-600 dark:text-rose-400",
      iconActiveBg: "bg-rose-600 text-white",
      glow: "shadow-rose-500/25",
    },
    bannerTitle: "Authentic Bengal Handicrafts",
    bannerSubtitle: "Terracotta, Dokra metal craft, handloom tapestries, and artisan pottery.",
    bannerImage: "/placeholder.jpg",
    bannerGradient: "from-rose-950/85 via-amber-900/65 to-transparent",
    subcategories: [
      { id: "terracotta", label: "Terracotta Art", image: "/placeholder.jpg" },
      { id: "dokra", label: "Dokra Metal", image: "https://images.unsplash.com/photo-1513519245088-0e12902e5a38?w=140&q=80" },
      { id: "pottery", label: "Studio Pottery", image: "https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?w=140&q=80" },
      { id: "woodcraft", label: "Wooden Decor", image: "https://images.unsplash.com/photo-1538688525198-9b88f6f53126?w=140&q=80" },
    ],
    sections: [
      {
        id: "craft-sec-1",
        title: "Bishnupur Terracotta & Clay Sculptures",
        subcategoryId: "terracotta",
        layout_style: "standard",
        desktop_cols: 4,
        mobile_cols: 2,
        seeAllHref: "/categories/hand-craft",
        products: [
          {
            id: "craft-1",
            title: "Traditional Bankura Terracotta Horse (10-inch)",
            weightOrUnit: "Handmade Baked Clay",
            price: 799,
            mrp: 1299,
            rating: 4.9,
            reviewsCount: 165,
            image: "/placeholder.jpg",
            tag: "GI Tagged",
            tagColor: "bg-rose-600 text-white",
            deliveryTime: "3 days",
            stockLeft: "In Stock",
            subcategoryId: "terracotta",
          },
          {
            id: "craft-2",
            title: "Handmade Dokra Brass Tribal Musician Figurine",
            weightOrUnit: "Lost-Wax Cast Brass",
            price: 1199,
            mrp: 1899,
            rating: 4.8,
            reviewsCount: 94,
            image: "https://images.unsplash.com/photo-1513519245088-0e12902e5a38?w=600&q=80",
            tag: "Artisan Heritage",
            tagColor: "bg-amber-600 text-white",
            deliveryTime: "3 days",
            stockLeft: "In Stock",
            subcategoryId: "dokra",
          },
          {
            id: "craft-3",
            title: "Studio Glazed Ceramic Tea Cup Set (4 pcs)",
            weightOrUnit: "Hand-thrown Stoneware",
            price: 649,
            mrp: 999,
            rating: 4.7,
            reviewsCount: 112,
            image: "https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?w=600&q=80",
            tag: "Microwave Safe",
            tagColor: "bg-teal-600 text-white",
            deliveryTime: "3 days",
            stockLeft: "In Stock",
            subcategoryId: "pottery",
          },
          {
            id: "craft-4",
            title: "Hand-Carved Wooden Wall Panel Decor",
            weightOrUnit: "Solid Teak Wood 12x12 in",
            price: 899,
            mrp: 1499,
            rating: 4.8,
            reviewsCount: 76,
            image: "https://images.unsplash.com/photo-1538688525198-9b88f6f53126?w=600&q=80",
            tag: "Artisan",
            tagColor: "bg-amber-700 text-white",
            deliveryTime: "3 days",
            stockLeft: "In Stock",
            subcategoryId: "woodcraft",
          },
        ],
      },
    ],
  },
  {
    id: "accessories",
    name: "Fashion Accessories",
    shortLabel: "Accessories",
    icon: Watch,
    accent: {
      border: "border-orange-400 dark:border-orange-500",
      bg: "bg-orange-50/90 dark:bg-orange-950/40",
      text: "text-orange-600 dark:text-orange-400",
      iconActiveBg: "bg-orange-500 text-white",
      glow: "shadow-orange-500/25",
    },
    bannerTitle: "Fashion Accessories & Accents",
    bannerSubtitle: "Watches, jewelry, bags, and curated artisan accents.",
    bannerImage: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=1200&q=80",
    bannerGradient: "from-orange-950/85 via-amber-900/65 to-transparent",
    subcategories: [],
    sections: [
      {
        id: "acc-sec-1",
        title: "Curated Accessories",
        layout_style: "standard",
        desktop_cols: 4,
        mobile_cols: 2,
        seeAllHref: "/categories/accessories",
        products: [],
      },
    ],
  },
  {
    id: "toys-baby",
    name: "Toys & Baby Care",
    shortLabel: "Toys & Baby",
    icon: Gamepad2,
    accent: {
      border: "border-amber-400 dark:border-amber-500",
      bg: "bg-amber-50/90 dark:bg-amber-950/40",
      text: "text-amber-600 dark:text-amber-400",
      iconActiveBg: "bg-amber-500 text-white",
      glow: "shadow-amber-500/25",
    },
    bannerTitle: "Toys & Baby Care",
    bannerSubtitle: "Safe, delightful, and certified essentials for little ones.",
    bannerImage: "https://images.unsplash.com/photo-1596461404969-9ae70f2830c1?w=1200&q=80",
    bannerGradient: "from-amber-950/85 via-yellow-900/65 to-transparent",
    subcategories: [],
    sections: [
      {
        id: "toys-sec-1",
        title: "Toys & Essentials",
        layout_style: "standard",
        desktop_cols: 4,
        mobile_cols: 2,
        seeAllHref: "/categories/toys-baby",
        products: [],
      },
    ],
  },
];

export const DEFAULT_CATEGORY_LAYOUTS: Record<string, CategoryLayoutConfig> = {
  accessories: {
    layout_style: "standard",
    desktop_cols: 4,
    tablet_cols: 3,
    mobile_cols: 2,
    section_limit: 8,
  },
  "toys-baby": {
    layout_style: "standard",
    desktop_cols: 4,
    tablet_cols: 3,
    mobile_cols: 2,
    section_limit: 8,
  },
  cake: {
    layout_style: "standard",
    desktop_cols: 4,
    tablet_cols: 3,
    mobile_cols: 2,
    section_limit: 8,
  },
  "books-stationery": {
    layout_style: "standard",
    desktop_cols: 4,
    tablet_cols: 3,
    mobile_cols: 2,
    section_limit: 8,
  },
  "hand-craft": {
    layout_style: "standard",
    desktop_cols: 4,
    tablet_cols: 3,
    mobile_cols: 2,
    section_limit: 8,
  },
  "grocery-food": {
    layout_style: "compact",
    desktop_cols: 5,
    tablet_cols: 4,
    mobile_cols: 3,
    section_limit: 10,
  },
  "mens-fashion": {
    layout_style: "featured",
    desktop_cols: 3,
    tablet_cols: 2,
    mobile_cols: 2,
    section_limit: 6,
  },
  "womens-fashion": {
    layout_style: "standard",
    desktop_cols: 4,
    tablet_cols: 3,
    mobile_cols: 2,
    section_limit: 8,
  },
  electronics: {
    layout_style: "compact",
    desktop_cols: 5,
    tablet_cols: 4,
    mobile_cols: 3,
    section_limit: 10,
  },
  "home-living": {
    layout_style: "two_card",
    desktop_cols: 2,
    tablet_cols: 2,
    mobile_cols: 1,
    section_limit: 6,
  },
  "beauty-care": {
    layout_style: "compact",
    desktop_cols: 5,
    tablet_cols: 4,
    mobile_cols: 3,
    section_limit: 10,
  },
  footwear: {
    layout_style: "standard",
    desktop_cols: 4,
    tablet_cols: 3,
    mobile_cols: 2,
    section_limit: 8,
  },
  "sports-fitness": {
    layout_style: "compact",
    desktop_cols: 5,
    tablet_cols: 4,
    mobile_cols: 3,
    section_limit: 8,
  },
};

interface RealProductFromDB {
  id: string;
  title: string;
  slug?: string;
  price: number;
  sale_price?: number | null;
  stock_quantity?: number | null;
  category_id?: string;
  tags?: string[] | null;
  product_images?: { image_url: string }[];
  categories?: { id: string; name: string; slug: string; parent_id?: string | null } | null;
}

interface DbCategoryItem {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  icon?: string | null;
  image_url?: string | null;
  description?: string | null;
}

function getSubcategoryIcon(label: string, slug: string, parentIcon?: React.ElementType): React.ElementType {
  const text = `${label} ${slug}`.toLowerCase();
  if (text.includes("shirt") || text.includes("apparel") || text.includes("top") || text.includes("tee")) return Shirt;
  if (text.includes("jean") || text.includes("trouser") || text.includes("pant") || text.includes("denim")) return Shirt;
  if (text.includes("cake") || text.includes("pastry") || text.includes("slice") || text.includes("bakery") || text.includes("dessert")) return Cake;
  if (text.includes("snack") || text.includes("chip") || text.includes("biscuit") || text.includes("munch") || text.includes("food") || text.includes("grain")) return ShoppingBag;
  if (text.includes("phone") || text.includes("mobile") || text.includes("gadget") || text.includes("tech")) return Smartphone;
  if (text.includes("audio") || text.includes("headphone") || text.includes("speaker") || text.includes("computer")) return Smartphone;
  if (text.includes("book") || text.includes("stationery") || text.includes("notebook") || text.includes("academic") || text.includes("office")) return BookOpen;
  if (text.includes("shoe") || text.includes("sneaker") || text.includes("boot") || text.includes("footwear") || text.includes("casual")) return Footprints;
  if (text.includes("home") || text.includes("decor") || text.includes("kitchen") || text.includes("living") || text.includes("furniture")) return Home;
  if (text.includes("beauty") || text.includes("skin") || text.includes("hair") || text.includes("makeup") || text.includes("fragrance")) return Smile;
  if (text.includes("sport") || text.includes("gym") || text.includes("fitness") || text.includes("active") || text.includes("yoga")) return Dumbbell;
  if (text.includes("craft") || text.includes("hand") || text.includes("art") || text.includes("terracotta")) return Palette;
  if (text.includes("watch") || text.includes("jewel") || text.includes("accessory") || text.includes("belt")) return Watch;
  if (text.includes("toy") || text.includes("game") || text.includes("baby")) return Gamepad2;
  return parentIcon || Tag;
}

export function InteractiveCategoryShowcase({
  gridConfig,
}: InteractiveCategoryShowcaseProps = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selectedCatId, setSelectedCatId] = useState<string>("all");
  const [selectedSubcatId, setSelectedSubcatId] = useState<string>("all");
  const shouldReduceMotion = useReducedMotion();
  const { addItem } = useCart();
  const { addToast } = useToast();
  const supabase = createClient();

  const [allRealProducts, setAllRealProducts] = useState<RealProductFromDB[]>([]);
  const [allDbCategories, setAllDbCategories] = useState<DbCategoryItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Sync state with URL search parameters
  useEffect(() => {
    const cat = searchParams?.get("category");
    const sub = searchParams?.get("sub");
    if (cat && cat !== "all") {
      setSelectedCatId(cat);
    } else {
      setSelectedCatId("all");
    }
    if (sub && sub !== "all") {
      setSelectedSubcatId(sub);
    } else {
      setSelectedSubcatId("all");
    }
  }, [searchParams]);

  // Fetch real products & categories dynamically from database
  useEffect(() => {
    let isMounted = true;
    async function loadStorefrontData() {
      setIsLoading(true);
      try {
        const [catsRes, prodsRes] = await Promise.all([
          supabase
            .from("categories")
            .select("id, name, slug, parent_id, image_url, description, sort_order")
            .order("sort_order", { ascending: true })
            .order("name", { ascending: true }),
          supabase
            .from("products")
            .select(
              "id, title, slug, price, sale_price, stock_quantity, category_id, tags, product_images(image_url), categories(id, name, slug, parent_id)"
            )
            .eq("status", "active")
            .order("created_at", { ascending: false }),
        ]);

        if (isMounted) {
          if (catsRes.data) {
            const activeCats = (catsRes.data as Array<DbCategoryItem & { is_active?: boolean }>).filter(
              (c) => c.is_active !== false
            );
            setAllDbCategories(activeCats as DbCategoryItem[]);
          }
          if (prodsRes.data) setAllRealProducts(prodsRes.data as RealProductFromDB[]);
        }
      } catch (err) {
        console.error("Failed to load storefront categories & products:", err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    loadStorefrontData();
    return () => {
      isMounted = false;
    };
  }, [supabase]);

  // Map of parent category slug -> array of valid child subcategories from DB
  const dbSubcategoriesByParent = useMemo(() => {
    const map: Record<string, { id: string; slug: string; label: string; image: string; icon?: string | null }[]> = {};
    const parentMap: Record<string, string> = {};
    allDbCategories.forEach((c) => {
      if (!c.parent_id) {
        parentMap[c.id] = c.slug;
      }
    });

    allDbCategories.forEach((c) => {
      if (c.parent_id && parentMap[c.parent_id]) {
        const pSlug = parentMap[c.parent_id];
        if (!map[pSlug]) map[pSlug] = [];
        map[pSlug].push({
          id: c.slug,
          slug: c.slug,
          label: c.name,
          image: c.image_url || "",
          icon: c.icon || null,
        });
      }
    });
    return map;
  }, [allDbCategories]);

  // Dynamically merge parent categories from database with design tokens
  const displayedCategories = useMemo(() => {
    if (allDbCategories.length > 0) {
      const dbParents = allDbCategories.filter((c) => !c.parent_id);
      if (dbParents.length > 0) {
        return dbParents.map((dbCat) => {
          const hardcoded = CATEGORY_SHOWCASE_DATA.find(
            (c) => c.id === dbCat.slug || c.id === dbCat.id
          );
          if (hardcoded) {
            let label = hardcoded.shortLabel;
            if (dbCat.slug === "grocery-food") label = "Grocery & Food";
            else if (dbCat.slug === "cake") label = "Cake";
            else if (dbCat.slug === "mens-fashion") label = "Men's Fashion";
            else if (dbCat.slug === "womens-fashion") label = "Women's Fashion";
            else if (dbCat.slug === "electronics") label = "Electronics & Gadgets";
            else if (dbCat.slug === "home-living") label = "Home & Living";
            else if (dbCat.slug === "beauty-care") label = "Beauty & Personal Care";
            else if (dbCat.slug === "footwear") label = "Footwear";
            else if (dbCat.slug === "sports-fitness") label = "Sports & Fitness";
            return {
              ...hardcoded,
              name: dbCat.name || hardcoded.name,
              shortLabel: label || dbCat.name,
            };
          }
          const catStyle = CATEGORY_STYLES[dbCat.slug] || DEFAULT_CATEGORY_STYLE;
          const IconComp = catStyle.icon;
          return {
            id: dbCat.slug,
            name: dbCat.name,
            shortLabel: dbCat.name.length > 18 ? dbCat.name.split(" ")[0] : dbCat.name,
            icon: IconComp,
            badge: undefined,
            accent: {
              border: "border-slate-300 dark:border-slate-700",
              bg: "bg-slate-100 dark:bg-slate-800",
              text: "text-slate-800 dark:text-slate-200",
              iconActiveBg: "bg-slate-900 text-white",
              glow: "shadow-slate-500/25",
            },
            bannerTitle: `Explore ${dbCat.name}`,
            bannerSubtitle: dbCat.description || `Browse authentic products in ${dbCat.name}`,
            bannerImage: dbCat.image_url || "https://images.unsplash.com/photo-1542838132-92c53300491e?w=1200&q=80",
            bannerGradient: "from-slate-950/85 via-slate-900/65 to-transparent",
            subcategories: dbSubcategoriesByParent[dbCat.slug] || [],
            sections: [],
          } as CategorySpec;
        });
      }
    }
    return CATEGORY_SHOWCASE_DATA;
  }, [allDbCategories, dbSubcategoriesByParent]);

  const ALL_CATEGORY_SPEC: CategorySpec = useMemo(
    () => ({
      id: "all",
      name: "All Products",
      shortLabel: "All Products",
      icon: LayoutGrid,
      accent: {
        border: "border-slate-800 dark:border-slate-200",
        bg: "bg-slate-100 dark:bg-slate-800/60",
        text: "text-slate-900 dark:text-white",
        iconActiveBg: "#0f172a",
        glow: "rgba(15, 23, 42, 0.25)",
      },
      bannerTitle: "Explore All Departments",
      bannerSubtitle:
        "Discover curated essentials, local favorites, and verified merchants across Bengal.",
      bannerImage:
        "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=1600&q=80",
      bannerGradient: "from-slate-950 via-slate-900",
      subcategories: [],
      sections: CATEGORY_SHOWCASE_DATA.flatMap((c) =>
        c.sections.slice(0, 1).map((s) => ({
          ...s,
          catSlug: c.id,
        }))
      ),
    }),
    []
  );

  const mainCategoriesList = useMemo(() => {
    return [
      ALL_CATEGORY_SPEC,
      ...displayedCategories.filter((c) => c.id !== "all"),
    ];
  }, [ALL_CATEGORY_SPEC, displayedCategories]);

  const currentCategory = useMemo(() => {
    if (selectedCatId === "all") {
      return ALL_CATEGORY_SPEC;
    }
    const found =
      displayedCategories.find((c) => c.id === selectedCatId) ||
      displayedCategories[0] ||
      CATEGORY_SHOWCASE_DATA[0];

    const hasDbCats = allDbCategories.length > 0;
    const dbSubs = dbSubcategoriesByParent[found.id];
    return {
      ...found,
      subcategories: hasDbCats ? (dbSubs || []) : (found.subcategories || []),
    };
  }, [selectedCatId, ALL_CATEGORY_SPEC, displayedCategories, dbSubcategoriesByParent, allDbCategories.length]);

  const handleSelectCategory = (catId: string) => {
    setSelectedCatId(catId);
    setSelectedSubcatId("all");
    const params = new URLSearchParams(searchParams?.toString() || "");
    if (catId === "all") {
      params.delete("category");
    } else {
      params.set("category", catId);
    }
    params.delete("sub");
    const query = params.toString();
    const newUrl = query ? `${pathname}?${query}` : pathname;
    router.push(newUrl, { scroll: false });
  };

  const handleSelectSubcategory = (subId: string) => {
    const nextSub = subId === selectedSubcatId ? "all" : subId;
    setSelectedSubcatId(nextSub);
    const params = new URLSearchParams(searchParams?.toString() || "");
    if (nextSub === "all") {
      params.delete("sub");
    } else {
      params.set("sub", nextSub);
    }
    const query = params.toString();
    const newUrl = query ? `${pathname}?${query}` : pathname;
    router.push(newUrl, { scroll: false });
  };

  // Validate that selectedSubcatId belongs to currentCategory's child categories
  useEffect(() => {
    if (allDbCategories.length === 0) return;
    if (selectedCatId === "all") {
      if (selectedSubcatId !== "all") {
        setSelectedSubcatId("all");
        const params = new URLSearchParams(searchParams?.toString() || "");
        params.delete("sub");
        const query = params.toString();
        router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
      }
      return;
    }

    const validSubs = dbSubcategoriesByParent[currentCategory.id] || [];
    if (selectedSubcatId !== "all") {
      const isValid = validSubs.some((s) => s.id === selectedSubcatId || s.slug === selectedSubcatId);
      if (!isValid) {
        setSelectedSubcatId("all");
        const params = new URLSearchParams(searchParams?.toString() || "");
        params.delete("sub");
        const query = params.toString();
        router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
      }
    }
  }, [allDbCategories, selectedCatId, selectedSubcatId, currentCategory.id, dbSubcategoriesByParent, pathname, router, searchParams]);

  // Only show subcategory strip when a specific department is selected AND that department has DB subcategories
  const activeSubcategories = useMemo(() => {
    if (selectedCatId === "all") return [];
    const subs =
      allDbCategories.length > 0
        ? dbSubcategoriesByParent[currentCategory.id] || []
        : currentCategory.subcategories || [];
    if (subs.length === 0) return [];
    return [
      {
        id: "all",
        slug: "all",
        label: "All Items",
        image: "",
        icon: null,
      },
      ...subs,
    ];
  }, [selectedCatId, currentCategory, dbSubcategoriesByParent, allDbCategories.length]);

  const handleQuickAdd = (product: {
    id: string;
    productId?: string;
    title: string;
    price: number;
    mrp: number;
    image: string;
  }) => {
    addItem({
      id: product.productId || product.id,
      productId: product.productId || product.id,
      title: product.title,
      price: product.price,
      mrp: product.mrp,
      image: product.image,
    });
    addToast({
      title: "Added to Cart ✓",
      description: `${product.title} added to your cart.`,
      type: "success",
    });
  };

  const mapToProductItem = useCallback((rp: RealProductFromDB): ShowcaseProductItem => {
    const realImg =
      rp.product_images?.[0]?.image_url ||
      "https://images.unsplash.com/photo-1542838132-92c53300491e?w=600&q=80";
    const discountInfo = calculateFlipkartDiscount(rp.price, rp.sale_price);

    // Filter out internal system metadata tags (store tags, policy tags, subcategory tags)
    const cleanUnitTag = rp.tags?.find(
      (t) =>
        typeof t === "string" &&
        !t.toLowerCase().startsWith("store:") &&
        !t.toLowerCase().startsWith("policy:") &&
        !t.toLowerCase().startsWith("subcat:") &&
        !t.toLowerCase().includes("store")
    );

    return {
      id: rp.id,
      productId: rp.id,
      title: rp.title,
      weightOrUnit: cleanUnitTag || "Standard Pack",
      price: discountInfo.finalPrice,
      mrp: discountInfo.originalPrice,
      image: realImg,
      rating: 4.8,
      reviewsCount: 24,
      tag: discountInfo.hasDiscount ? `${discountInfo.discountPercent}% OFF` : undefined,
      tagColor: "bg-emerald-600 text-white font-bold",
      deliveryTime: "30 mins",
      stockLeft:
        rp.stock_quantity !== undefined && rp.stock_quantity !== null && rp.stock_quantity <= 0
          ? "Out of Stock"
          : "In Stock",
      stock_quantity: rp.stock_quantity,
      isReal: true,
      slug: rp.slug,
    };
  }, []);

  const getProductsForCategory = useCallback(
    (catSlug: string, subcatId: string = "all"): ShowcaseProductItem[] => {
      // Find parent category from DB
      const parentCat = allDbCategories.find(
        (c) =>
          !c.parent_id &&
          (c.slug === catSlug ||
            (catSlug === "beauty-care" && c.slug === "beauty") ||
            (catSlug === "handicraft-art" && c.slug === "hand-craft"))
      );
      const parentId = parentCat?.id;
      const canonicalParentSlug = parentCat?.slug || catSlug;

      // Child subcategories for this parent
      const childCats = allDbCategories.filter((c) => c.parent_id && c.parent_id === parentId);
      const childIds = new Set(childCats.map((c) => c.id));
      const childSlugs = new Set(childCats.map((c) => c.slug));

      // Specific subcategory target
      let targetSub: DbCategoryItem | undefined;
      if (subcatId !== "all") {
        targetSub = childCats.find((c) => c.slug === subcatId || c.id === subcatId);
      }

      return allRealProducts
        .filter((rp) => {
          // If a specific subcategory is selected, product MUST match this subcategory
          if (subcatId !== "all") {
            if (targetSub) {
              const matchesSubId = rp.category_id === targetSub.id || rp.categories?.id === targetSub.id;
              const matchesSubSlug = rp.categories?.slug === targetSub.slug;
              const matchesSubTag = (rp.tags || []).some(
                (t) =>
                  t === `subcat:${targetSub!.id}` ||
                  t === `subcat:${targetSub!.slug}` ||
                  (parentId && t === `subcat:std_${parentId}_${targetSub!.slug}`)
              );
              return matchesSubId || matchesSubSlug || matchesSubTag;
            }
            // Fallback match if subcategory ID is directly in tags/slug
            const subLower = subcatId.toLowerCase();
            return (
              rp.categories?.slug === subLower ||
              rp.category_id === subcatId ||
              (rp.tags || []).some((t) => t.toLowerCase() === `subcat:${subLower}` || t.includes(subLower))
            );
          }

          // Otherwise (subcatId === "all"), product belongs to this parent department
          const matchesDirectParentId = parentId ? rp.category_id === parentId || rp.categories?.id === parentId : false;
          const matchesDirectSlug = rp.categories?.slug === canonicalParentSlug;
          const matchesParentOfCategory = parentId ? rp.categories?.parent_id === parentId : false;
          const matchesChildId = rp.category_id ? childIds.has(rp.category_id) : false;
          const matchesChildSlug = rp.categories?.slug ? childSlugs.has(rp.categories.slug) : false;
          const matchesChildTag = (rp.tags || []).some((t) => {
            return (
              Array.from(childIds).some((cid) => t === `subcat:${cid}`) ||
              Array.from(childSlugs).some((cslug) => t === `subcat:${cslug}`) ||
              (parentId && t.includes(`subcat:std_${parentId}_`))
            );
          });

          return (
            matchesDirectParentId ||
            matchesDirectSlug ||
            matchesParentOfCategory ||
            matchesChildId ||
            matchesChildSlug ||
            matchesChildTag
          );
        })
        .map(mapToProductItem);
    },
    [allDbCategories, allRealProducts, mapToProductItem]
  );

  // Resolve section layout: honors admin gridConfig for section 1, or uses default
  const resolveSectionLayout = (section: DepartmentSection, sectionIndex: number): CategoryLayoutConfig => {
    if (sectionIndex === 0) {
      const configured = gridConfig?.category_layouts?.[currentCategory.id];
      const defaultLayout = DEFAULT_CATEGORY_LAYOUTS[currentCategory.id];
      return {
        layout_style: configured?.layout_style || section.layout_style || defaultLayout?.layout_style || "standard",
        desktop_cols: configured?.desktop_cols ?? section.desktop_cols ?? defaultLayout?.desktop_cols ?? 4,
        tablet_cols: configured?.tablet_cols ?? section.tablet_cols ?? defaultLayout?.tablet_cols ?? 3,
        mobile_cols: configured?.mobile_cols ?? section.mobile_cols ?? defaultLayout?.mobile_cols ?? 2,
        mobile_rail: configured?.mobile_rail ?? false,
      };
    }

    return {
      layout_style: section.layout_style,
      desktop_cols: section.desktop_cols || 4,
      tablet_cols: section.tablet_cols || 3,
      mobile_cols: section.mobile_cols || 2,
      mobile_rail: section.layout_style === "rail" || section.layout_style === "carousel",
    };
  };

  const currentTheme = getCategoryTheme(currentCategory.id);

  return (
    <section className="w-full max-w-[1440px] mx-auto px-2.5 sm:px-4 md:px-12 pt-1 pb-3 md:py-6 select-none overflow-x-hidden">
      {/* ========================================================================= */}
      {/* 1. LEVEL 1 — MAIN CATEGORY NAVIGATION (ORIGINAL PREMIUM VENDOSMITH STYLE) */}
      {/* ========================================================================= */}
      <div className="relative mb-3 sm:mb-5">
        <div
          className="flex items-center gap-2 sm:gap-3 overflow-x-auto scrollbar-none py-1.5 px-1 scroll-smooth"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          role="tablist"
          aria-label="Main Categories"
        >
          {mainCategoriesList.map((cat) => {
            const isSelected =
              selectedCatId === cat.id ||
              (cat.id === "all" && (selectedCatId === "all" || !selectedCatId));
            const catTheme = getCategoryTheme(cat.id);
            const style = CATEGORY_STYLES[cat.id] || DEFAULT_CATEGORY_STYLE;
            const Icon = cat.icon || style.icon || LayoutGrid;

            return (
              <button
                key={cat.id}
                role="tab"
                aria-selected={isSelected}
                aria-label={cat.name}
                onClick={() => handleSelectCategory(cat.id)}
                className={`group relative flex flex-col items-center justify-center min-w-[74px] sm:min-w-[86px] md:min-w-[96px] py-2 sm:py-2.5 px-2 rounded-2xl transition-all duration-200 shrink-0 outline-none focus:outline-none min-h-[44px] ${isSelected
                  ? "text-slate-900 dark:text-white"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  }`}
              >
                {/* ANIMATED ROUNDED HIGHLIGHT BOX (SLIDES SMOOTHLY) */}
                {isSelected && (
                  <motion.div
                    layoutId="main-category-active-box"
                    transition={
                      shouldReduceMotion
                        ? { duration: 0 }
                        : {
                          type: "spring",
                          stiffness: 420,
                          damping: 34,
                        }
                    }
                    style={{
                      backgroundColor: catTheme.bg,
                      borderColor: catTheme.border,
                      boxShadow: `0 2px 12px ${catTheme.glow}`,
                    }}
                    className="absolute inset-0 rounded-2xl border-2 pointer-events-none transition-colors duration-300 dark:bg-slate-800/80"
                  />
                )}

                {/* Category Icon with Artful Container */}
                <div
                  className={cn(
                    "relative w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center mb-1.5 transition-transform duration-200 group-hover:scale-105",
                    isSelected
                      ? "bg-white dark:bg-slate-800 shadow-2xs border"
                      : (style.iconBg || "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300")
                  )}
                  style={
                    isSelected
                      ? {
                        borderColor: catTheme.border,
                        color: catTheme.primary,
                      }
                      : undefined
                  }
                >
                  <Icon className="w-5 h-5 sm:w-6 sm:h-6" />
                  {cat.badge && (
                    <span className="absolute -top-1 -right-1 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider bg-rose-600 text-white rounded-full shadow-xs">
                      {cat.badge}
                    </span>
                  )}
                </div>

                {/* Category Label */}
                <span
                  className={cn(
                    "text-[11px] sm:text-xs text-center font-bold tracking-tight line-clamp-1 transition-colors relative z-10 px-0.5",
                    isSelected ? "font-extrabold" : ""
                  )}
                  style={isSelected ? { color: catTheme.primary } : undefined}
                >
                  {cat.shortLabel || cat.name}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* LEVEL 2 — SUBCATEGORY NAVIGATION OF SELECTED MAIN CATEGORY                */}
      {/* ========================================================================= */}
      {selectedCatId !== "all" && (
        <div className="relative mb-2 sm:mb-4">
          {activeSubcategories.length > 0 ? (
            <div
              style={{
                backgroundColor: currentTheme.stripBg,
                borderColor: currentTheme.stripBorder,
              }}
              className="w-full rounded-xl sm:rounded-2xl p-1.5 sm:p-2.5 shadow-2xs border transition-colors duration-300 dark:bg-slate-900/80 dark:border-slate-800"
            >
              <div
                className="flex items-center gap-1.5 sm:gap-3 overflow-x-auto scrollbar-none py-0.5 px-0.5 scroll-smooth"
                style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
                role="tablist"
                aria-label={`${currentCategory.name} subcategories`}
              >
                {activeSubcategories.map((sub) => {
                  const isSubSelected =
                    selectedSubcatId === sub.id ||
                    (sub.id === "all" && (selectedSubcatId === "all" || !selectedSubcatId));
                  const SubIcon =
                    sub.id === "all"
                      ? LayoutGrid
                      : getSubcategoryIcon(sub.label, "slug" in sub ? sub.slug : "", currentCategory.icon);
                  const catTheme = currentTheme;

                  return (
                    <button
                      key={sub.id}
                      role="tab"
                      aria-selected={isSubSelected}
                      aria-label={sub.label}
                      onClick={() => handleSelectSubcategory(sub.id)}
                      className={`group relative flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl transition-all duration-200 shrink-0 outline-none focus:outline-none min-h-[44px] ${isSubSelected
                        ? "text-slate-900 dark:text-white"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                        }`}
                    >
                      {/* ANIMATED ROUNDED HIGHLIGHT BOX */}
                      {isSubSelected && (
                        <motion.div
                          layoutId="category-active-box"
                          transition={
                            shouldReduceMotion
                              ? { duration: 0 }
                              : {
                                type: "spring",
                                stiffness: 420,
                                damping: 34,
                              }
                          }
                          style={{
                            backgroundColor: catTheme.bg,
                            borderColor: catTheme.border,
                            boxShadow: `0 2px 10px ${catTheme.glow}`,
                          }}
                          className="absolute inset-0 rounded-xl border-2 pointer-events-none transition-colors duration-300 dark:bg-slate-800/80"
                        />
                      )}

                      {/* Subcategory Icon / Image Container with Department Theme */}
                      <div
                        className={cn(
                          "relative w-7 h-7 sm:w-8 sm:h-8 rounded-lg overflow-hidden flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105",
                          isSubSelected
                            ? "shadow-2xs text-white"
                            : "bg-white/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700/60"
                        )}
                        style={
                          isSubSelected
                            ? { backgroundColor: catTheme.primary }
                            : undefined
                        }
                      >
                        {sub.image && sub.image.startsWith("http") ? (
                          <Image
                            src={sub.image}
                            alt={sub.label}
                            fill
                            className="object-cover rounded-lg"
                            sizes="32px"
                          />
                        ) : (
                          <SubIcon className="w-4 h-4" />
                        )}
                      </div>

                      {/* Subcategory Label */}
                      <span
                        className={`relative z-10 text-[11px] sm:text-xs text-center tracking-tight leading-tight whitespace-nowrap transition-colors ${isSubSelected
                          ? "font-extrabold text-slate-900 dark:text-white"
                          : "font-bold text-slate-700 dark:text-slate-300"
                          }`}
                        style={
                          isSubSelected
                            ? { color: catTheme.primary }
                            : undefined
                        }
                      >
                        {sub.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="w-full flex items-center gap-2 py-2.5 px-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/60 text-xs text-slate-500 dark:text-slate-400">
              <Tag className="w-4 h-4 text-slate-400 shrink-0" />
              <span>Showing all authentic products in {currentCategory.name} (No subcategories available)</span>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. DYNAMIC CATEGORY VISUAL BANNER                                         */}
      {/* ========================================================================= */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentCategory.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className="relative w-full rounded-xl sm:rounded-3xl overflow-hidden shadow-sm mb-2 sm:mb-4 group min-h-[82px] sm:min-h-[160px] md:min-h-[200px]"
        >
          {/* Banner Image & Gradient Overlay */}
          <div className="absolute inset-0">
            <Image
              src={currentCategory.bannerImage}
              alt={currentCategory.bannerTitle}
              fill
              priority
              className="object-cover transition-transform duration-700 group-hover:scale-103"
              sizes="(max-width: 768px) 100vw, 1440px"
            />
            <div
              className={`absolute inset-0 bg-gradient-to-r ${currentCategory.bannerGradient} to-transparent`}
            />
            <div className="absolute inset-0 bg-black/25" />
          </div>

          {/* Banner Content */}
          <div className="relative z-10 p-2.5 sm:p-5 md:p-7 flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4 h-full">
            <div className="max-w-xl text-white">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-bold uppercase tracking-wider bg-white/20 backdrop-blur-md mb-1 sm:mb-1.5">
                <Sparkles className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-amber-300" /> VENDOSMITH Verified
              </span>
              <h2 className="text-sm sm:text-2xl md:text-3xl font-black tracking-tight drop-shadow-sm leading-tight">
                {currentCategory.bannerTitle}
              </h2>
              <p className="text-[10px] sm:text-xs md:text-sm text-white/90 mt-0.5 max-w-md font-medium line-clamp-1 sm:line-clamp-none leading-tight">
                {currentCategory.bannerSubtitle}
              </p>
            </div>

            {/* Custom Cake Special Entry Point if Cake Department */}
            {currentCategory.id === "cake" ? (
              <div className="shrink-0">
                {/* Mobile: Ultra-compact, visually lighter CTA button */}
                <div className="sm:hidden">
                  <Link
                    href="/customize-cake"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/95 hover:bg-white text-rose-700 font-extrabold text-[11px] shadow-sm active:scale-95 transition-all border border-rose-200/80"
                  >
                    <Cake className="w-3.5 h-3.5 text-rose-600" />
                    <span>Customize Your Cake</span>
                    <ArrowRight className="w-3 h-3 text-rose-600 ml-0.5" />
                  </Link>
                </div>

                {/* Desktop: Rich Card */}
                <div className="hidden sm:block bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-3.5 rounded-xl shadow-lg border border-rose-200/80 dark:border-rose-900/60 max-w-xs">
                  <div className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400 font-extrabold text-xs mb-0.5">
                    <Cake className="w-4 h-4" />
                    <span>Customize Your Cake</span>
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-300 mb-2 leading-tight">
                    Tell us what cake you want and we&apos;ll help you create it.
                  </p>
                  <Link
                    href="/customize-cake"
                    className="inline-flex items-center justify-center gap-1.5 w-full py-1.5 px-3 rounded-lg bg-rose-600 hover:bg-rose-700 active:scale-[0.98] text-white text-xs font-bold transition-all shadow-sm shadow-rose-600/25"
                  >
                    <span>Customize Cake</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            ) : currentCategory.id !== "all" ? (
              <div className="shrink-0 flex items-center gap-2">
                {/* Mobile: Ultra-compact, visually lighter CTA button */}
                <div className="sm:hidden">
                  <Link
                    href={
                      selectedSubcatId !== "all"
                        ? `/categories/${currentCategory.id}?sub=${selectedSubcatId}`
                        : `/categories/${currentCategory.id}`
                    }
                    aria-label={`Explore All ${currentCategory.shortLabel}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/95 hover:bg-white text-slate-900 font-extrabold text-[11px] shadow-sm active:scale-95 transition-all border border-slate-200/80"
                  >
                    <span>Explore All</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
                {/* Desktop: Rich Button */}
                <div className="hidden sm:block">
                  <Link
                    href={
                      selectedSubcatId !== "all"
                        ? `/categories/${currentCategory.id}?sub=${selectedSubcatId}`
                        : `/categories/${currentCategory.id}`
                    }
                    aria-label={`Explore All ${currentCategory.shortLabel}`}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/95 hover:bg-white text-slate-900 text-xs sm:text-sm font-bold shadow-md transition-transform hover:scale-105"
                  >
                    <span>Explore All {currentCategory.shortLabel}</span>
                    <ChevronRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            ) : (
              <div className="shrink-0 flex items-center gap-2">
                {/* Mobile: Prominent Discover Marketplace CTA */}
                <div className="sm:hidden">
                  <Link
                    href="/products"
                    aria-label="Discover All Products on Marketplace"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/95 hover:bg-white text-slate-900 font-extrabold text-[11px] shadow-sm active:scale-95 transition-all border border-slate-200/80"
                  >
                    <span>Discover All</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
                {/* Desktop: Rich Button */}
                <div className="hidden sm:block">
                  <Link
                    href="/products"
                    aria-label="Discover Marketplace"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/95 hover:bg-white text-slate-900 text-xs sm:text-sm font-bold shadow-md transition-transform hover:scale-105"
                  >
                    <span>Discover Marketplace</span>
                    <ChevronRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </AnimatePresence>

      {/* ========================================================================= */}
      {/* 4. MULTIPLE CATEGORY PRODUCT SECTIONS (AUTHENTIC DATABASE PRODUCTS ONLY)  */}
      {/* ========================================================================= */}
      <div className="space-y-3.5 sm:space-y-7">
        {(() => {
          if (isLoading) {
            return (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-4">
                {Array(4)
                  .fill(0)
                  .map((_, i) => (
                    <div
                      key={i}
                      className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col gap-2"
                    >
                      <div className="aspect-square rounded-xl bg-slate-200 dark:bg-slate-800 animate-pulse" />
                      <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded animate-pulse w-3/4" />
                      <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded animate-pulse w-1/3" />
                    </div>
                  ))}
              </div>
            );
          }

          // Case A: ALL DEPARTMENTS SELECTED
          if (selectedCatId === "all") {
            const departmentSections = CATEGORY_SHOWCASE_DATA.filter((cat) => cat.id !== "all")
              .map((cat, idx) => {
                const prods = getProductsForCategory(cat.id, "all");
                const section = cat.sections[0] || {
                  id: `${cat.id}-sec-1`,
                  title: `Featured in ${cat.name}`,
                  layout_style: "standard",
                  desktop_cols: 4,
                  mobile_cols: 2,
                  seeAllHref: `/categories/${cat.id}`,
                  products: [],
                };
                const layout = resolveSectionLayout(section, idx);
                return { cat, section, prods, layout };
              })
              .filter((item) => item.prods.length > 0);

            if (departmentSections.length === 0) {
              return (
                <div className="w-full py-16 px-6 text-center rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                    <ShoppingBag className="w-8 h-8" />
                  </div>
                  <h3 className="text-xl font-extrabold text-slate-900 dark:text-white mb-2">
                    Marketplace Inventory Updating
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto mb-6">
                    Our verified merchants are cataloging fresh products for delivery across Bengal.
                  </p>
                  <Link
                    href="/products"
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold shadow-md"
                  >
                    <span>Browse All Listings</span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              );
            }

            return departmentSections.map(({ cat, section, prods, layout }) => (
              <DepartmentSectionRenderer
                key={section.id}
                section={{
                  ...section,
                  title: section.title || `Trending in ${cat.shortLabel}`,
                  products: prods,
                  seeAllHref: `/categories/${cat.id}`,
                }}
                products={prods}
                layout={layout}
                onQuickAdd={handleQuickAdd}
                category={cat}
              />
            ));
          }

          // Case B: SPECIFIC CATEGORY SELECTED (e.g. mens-fashion, cake, grocery-food)
          const targetProducts = getProductsForCategory(currentCategory.id, selectedSubcatId);
          const activeSubObj = activeSubcategories.find((s) => s.id === selectedSubcatId);
          const activeSubLabel = activeSubObj ? activeSubObj.label : undefined;

          // If NO matching products, render branded Coming Soon empty state!
          if (targetProducts.length === 0) {
            return (
              <div className="w-full py-12 px-6 sm:py-16 sm:px-8 text-center rounded-2xl sm:rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
                <div
                  className="absolute -top-24 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full blur-3xl opacity-20 pointer-events-none"
                  style={{ backgroundColor: currentTheme.primary }}
                />
                <div
                  className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-4 rounded-2xl flex items-center justify-center shadow-inner"
                  style={{
                    backgroundColor: currentTheme.bg,
                    color: currentTheme.primary,
                    border: `1.5px solid ${currentTheme.border}`,
                  }}
                >
                  <Clock className="w-8 h-8 sm:w-10 sm:h-10" />
                </div>
                <div
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-3"
                  style={{
                    backgroundColor: currentTheme.stripBg,
                    color: currentTheme.primary,
                    border: `1px solid ${currentTheme.stripBorder}`,
                  }}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>VENDOSMITH Verified Inventory</span>
                </div>
                <h3 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white mb-2 tracking-tight">
                  {selectedSubcatId !== "all"
                    ? `${activeSubLabel || "Subcategory"} Products Coming Soon`
                    : `${currentCategory.name} Collection Coming Soon`}
                </h3>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto mb-6 leading-relaxed">
                  {selectedSubcatId !== "all"
                    ? `Our verified merchants are curating fresh listings for this subcategory. Explore all ${currentCategory.shortLabel} products or browse other departments.`
                    : `Our team and certified local sellers are preparing new authentic inventory for ${currentCategory.name}. Check back shortly or explore available products across Bengal.`}
                </p>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  {selectedSubcatId !== "all" && (
                    <button
                      onClick={() => handleSelectSubcategory("all")}
                      className="px-5 py-2.5 rounded-xl text-white text-xs sm:text-sm font-bold transition-all shadow-md active:scale-95 flex items-center gap-2"
                      style={{ backgroundColor: currentTheme.primary }}
                    >
                      <span>View All {currentCategory.shortLabel}</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => handleSelectCategory("all")}
                    className="px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs sm:text-sm font-bold transition-all active:scale-95"
                  >
                    Explore All Departments
                  </button>
                  <Link
                    href="/products"
                    className="px-5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 hover:border-slate-400 text-slate-700 dark:text-slate-300 text-xs sm:text-sm font-semibold transition-all active:scale-95"
                  >
                    Discover Marketplace
                  </Link>
                </div>
              </div>
            );
          }

          // Render matching products for the current department / subcategory
          const sectionTitle =
            selectedSubcatId !== "all"
              ? activeSubLabel || "Products"
              : currentCategory.sections[0]?.title || `Trending in ${currentCategory.shortLabel}`;

          const section = {
            id: `${currentCategory.id}-sec-1`,
            title: sectionTitle,
            layout_style: resolveSectionLayout(currentCategory.sections[0], 0).layout_style || "standard",
            desktop_cols: 4,
            mobile_cols: 2,
            seeAllHref:
              selectedSubcatId !== "all"
                ? `/categories/${currentCategory.id}?sub=${selectedSubcatId}`
                : `/categories/${currentCategory.id}`,
            products: targetProducts,
          };
          const layout = resolveSectionLayout(section, 0);

          return (
            <DepartmentSectionRenderer
              key={section.id}
              section={section}
              products={targetProducts}
              layout={layout}
              onQuickAdd={handleQuickAdd}
              category={currentCategory}
            />
          );
        })()}
      </div>
    </section>
  );
}

// =============================================================================
// INDIVIDUAL DEPARTMENT SECTION RENDERER COMPONENT
// =============================================================================

interface DepartmentSectionRendererProps {
  section: DepartmentSection;
  products: ShowcaseProductItem[];
  layout: CategoryLayoutConfig;
  onQuickAdd: (product: ShowcaseProductItem) => void;
  category: CategorySpec;
}

function DepartmentSectionRenderer({
  section,
  products,
  layout,
  onQuickAdd,
  category,
}: DepartmentSectionRendererProps) {
  const railRef = useRef<HTMLDivElement>(null);

  const scrollRail = (direction: "left" | "right") => {
    if (railRef.current) {
      const scrollAmount = railRef.current.clientWidth * 0.75;
      railRef.current.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth",
      });
    }
  };

  const isRailLayout =
    layout.layout_style === "rail" ||
    layout.layout_style === "carousel" ||
    layout.mobile_rail;

  return (
    <div className="w-full">
      {/* SECTION TITLE + SEE ALL IMMEDIATELY PRECEDING PRODUCTS */}
      <div className="flex items-center justify-between mb-1.5 sm:mb-3 px-0.5">
        <div>
          <h3 className="text-xs sm:text-base md:text-lg font-black text-slate-900 dark:text-white tracking-tight">
            {section.title}
          </h3>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* Rail Scroll Arrows (Desktop only) */}
          {isRailLayout && (
            <div className="hidden sm:flex items-center gap-1.5">
              <button
                onClick={() => scrollRail("left")}
                aria-label="Scroll left"
                className="w-7 h-7 rounded-full border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-center text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shadow-2xs"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => scrollRail("right")}
                aria-label="Scroll right"
                className="w-7 h-7 rounded-full border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-center text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shadow-2xs"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <Link
            href={section.seeAllHref || `/categories/${category.id}`}
            className="text-[11px] sm:text-sm font-bold text-accent hover:underline flex items-center gap-0.5 sm:gap-1 group whitespace-nowrap"
          >
            <span>See All</span>
            <ChevronRight className="w-3 h-3 sm:w-3.5 sm:h-3.5 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>

      {/* PRODUCT GRID / RAIL PRESENTATION */}
      {(() => {
        const style = layout.layout_style;

        // 1. HORIZONTAL RAIL (SCROLLS INSIDE SECTION ONLY)
        if (style === "rail" || style === "carousel") {
          return (
            <div className="relative w-full max-w-full overflow-hidden select-none">
              <div
                ref={railRef}
                className="flex items-stretch gap-2 sm:gap-3.5 overflow-x-auto scrollbar-none snap-x snap-mandatory overscroll-x-contain py-1 sm:py-1.5 px-0.5 scroll-smooth"
                style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
              >
                {products.map((p) => (
                  <div
                    key={p.id}
                    className="w-[136px] sm:w-[180px] md:w-[205px] shrink-0 snap-start"
                  >
                    <CompactReferenceProductCard
                      product={p}
                      onAdd={() => onQuickAdd(p)}
                      categoryId={category.id}
                    />
                  </div>
                ))}
              </div>
            </div>
          );
        }

        // 2. TWO-CARD FEATURED LAYOUT
        if (style === "two_card") {
          return (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 sm:gap-4">
              {products.slice(0, 4).map((p) => {
                const discountInfo = calculateFlipkartDiscount(p.mrp, p.price);
                const href = p.isReal
                  ? `/products/${p.productId || p.id}`
                  : `/categories/${category.id}`;
                const isOutOfStock = Boolean(
                  (p.stockLeft && p.stockLeft.toLowerCase().includes("out")) ||
                  (p.stock_quantity !== undefined && p.stock_quantity !== null && p.stock_quantity <= 0)
                );
                const cleanUnit =
                  p.weightOrUnit &&
                    !p.weightOrUnit.toLowerCase().startsWith("store:") &&
                    !p.weightOrUnit.toLowerCase().startsWith("subcat:") &&
                    !p.weightOrUnit.toLowerCase().startsWith("policy:") &&
                    !p.weightOrUnit.toLowerCase().includes("store")
                    ? p.weightOrUnit
                    : "";

                return (
                  <div
                    key={p.id}
                    className="group relative flex flex-col sm:flex-row items-center gap-3 sm:gap-3.5 bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl border border-slate-200/90 dark:border-slate-800 p-2.5 sm:p-3.5 hover:shadow-lg transition-all duration-200"
                  >
                    <Link
                      href={href}
                      className="relative w-full sm:w-36 h-32 sm:h-36 aspect-square rounded-xl overflow-hidden bg-slate-50 dark:bg-slate-800 shrink-0"
                    >
                      <Image
                        src={p.image}
                        alt={p.title}
                        fill
                        className="object-cover group-hover:scale-106 transition-transform duration-300"
                        sizes="(max-width: 640px) 100vw, 150px"
                      />
                      {discountInfo.hasDiscount && discountInfo.discountPercent > 0 && (
                        <span className="inline-flex items-center gap-0.5 absolute top-2 left-2 px-1.5 py-0.5 rounded text-[9px] sm:text-[10px] font-extrabold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/80 shadow-2xs">
                          <ArrowDown className="w-2.5 h-2.5 stroke-[2.5]" />
                          <span>{discountInfo.discountPercent}% OFF</span>
                        </span>
                      )}
                    </Link>

                    <div className="flex flex-col justify-between flex-1 w-full min-w-0">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="px-1.5 sm:px-2 py-0.5 rounded text-[8.5px] sm:text-[9px] font-black uppercase tracking-wider bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300">
                            ★ Top Choice
                          </span>
                          <button
                            aria-label="Wishlist"
                            className="p-1 text-slate-400 hover:text-rose-500 transition-colors"
                          >
                            <Heart className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <Link href={href}>
                          <h4 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white line-clamp-2 group-hover:text-accent">
                            {p.title}
                          </h4>
                        </Link>
                        {cleanUnit && (
                          <p className="text-[10px] sm:text-[11px] text-slate-500 mt-0.5">{cleanUnit}</p>
                        )}

                        <div className="flex items-center gap-1 mt-1 text-[10px] sm:text-[11px] font-bold text-amber-500">
                          <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                          <span>{p.rating}</span>
                          <span className="text-slate-400 font-normal">({p.reviewsCount})</span>
                        </div>
                      </div>

                      <div className="mt-2.5 sm:mt-3 pt-2 sm:pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 flex-wrap">
                        <FlipkartPriceRow
                          originalPrice={discountInfo.originalPrice}
                          sellingPrice={discountInfo.finalPrice}
                          hasDiscount={discountInfo.hasDiscount}
                          discountPercent={discountInfo.discountPercent}
                          savingsAmount={discountInfo.savingsAmount}
                          size="compact"
                          showSavings={true}
                        />

                        {isOutOfStock ? (
                          <button
                            disabled
                            className="px-3 sm:px-3.5 py-1 sm:py-1.5 rounded-lg sm:rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 font-bold text-[10px] sm:text-xs cursor-not-allowed select-none"
                          >
                            Out of Stock
                          </button>
                        ) : (
                          <button
                            onClick={() => onQuickAdd(p)}
                            className="px-3 sm:px-3.5 py-1 sm:py-1.5 rounded-lg sm:rounded-xl border-2 border-emerald-600 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-600 hover:text-white font-extrabold text-[10px] sm:text-xs transition-all active:scale-95 flex items-center gap-1"
                          >
                            <Plus className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                            <span>ADD</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        }

        // 3. 3-COLUMN COMPACT GRID (MOBILE 3-COL / DESKTOP 5-6 COL - REFERENCE MATCH!)
        if (style === "compact") {
          return (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-5 xl:grid-cols-6 gap-1.5 sm:gap-3">
              {products.map((p) => (
                <CompactReferenceProductCard
                  key={p.id}
                  product={p}
                  onAdd={() => onQuickAdd(p)}
                  categoryId={category.id}
                />
              ))}
            </div>
          );
        }

        // 4. 6-COLUMN DENSE GRID (IDEAL FOR WEARABLES / GADGETS)
        if (style === "dense") {
          return (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-1.5 sm:gap-2.5">
              {products.map((p) => (
                <CompactReferenceProductCard
                  key={p.id}
                  product={p}
                  onAdd={() => onQuickAdd(p)}
                  categoryId={category.id}
                />
              ))}
            </div>
          );
        }

        // 5. FEATURED 3-COLUMN GRID
        if (style === "featured") {
          return (
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-5">
              {products.map((p) => (
                <CompactReferenceProductCard
                  key={p.id}
                  product={p}
                  onAdd={() => onQuickAdd(p)}
                  categoryId={category.id}
                />
              ))}
            </div>
          );
        }

        // 6. STANDARD GRID (MOBILE 2-COL / TABLET 3-COL / DESKTOP 4-COL)
        return (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-4">
            {products.map((p) => (
              <CompactReferenceProductCard
                key={p.id}
                product={p}
                onAdd={() => onQuickAdd(p)}
                categoryId={category.id}
              />
            ))}
          </div>
        );
      })()}
    </div>
  );
}

// =============================================================================
// COMPACT REFERENCE-MATCH PRODUCT CARD (MATCHING REFERENCE IMAGE 1 & 2)
// =============================================================================

interface CompactReferenceProductCardProps {
  product: ShowcaseProductItem;
  onAdd: () => void;
  categoryId: string;
}

function CompactReferenceProductCard({
  product,
  onAdd,
  categoryId,
}: CompactReferenceProductCardProps) {
  const discountInfo = calculateFlipkartDiscount(product.mrp, product.price);
  const href = product.isReal
    ? `/products/${product.productId || product.id}`
    : `/categories/${categoryId}`;
  const isOutOfStock = Boolean(
    (product.stockLeft && product.stockLeft.toLowerCase().includes("out")) ||
    (product.stock_quantity !== undefined && product.stock_quantity !== null && product.stock_quantity <= 0)
  );

  const cleanUnit =
    product.weightOrUnit &&
      !product.weightOrUnit.toLowerCase().startsWith("store:") &&
      !product.weightOrUnit.toLowerCase().startsWith("subcat:") &&
      !product.weightOrUnit.toLowerCase().startsWith("policy:") &&
      !product.weightOrUnit.toLowerCase().includes("store")
      ? product.weightOrUnit
      : "";

  return (
    <div className="group relative flex flex-col justify-between bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl border border-slate-200/80 dark:border-slate-800 p-1.5 sm:p-3 hover:shadow-lg transition-all duration-200 h-full">
      {/* Top Bar: Discount Tag (if valid discount) + Wishlist Heart */}
      <div className="flex items-center justify-between mb-1 sm:mb-1.5 min-h-[20px]">
        {discountInfo.hasDiscount && discountInfo.discountPercent > 0 ? (
          <span className="inline-flex items-center gap-0.5 px-1 sm:px-1.5 py-0.5 rounded text-[8px] sm:text-[9px] font-extrabold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/80 shadow-2xs">
            <ArrowDown className="w-2.5 h-2.5 stroke-[2.5]" />
            <span>{discountInfo.discountPercent}% OFF</span>
          </span>
        ) : (
          <div />
        )}

        <button
          className="p-0.5 sm:p-1 rounded-full text-slate-400 hover:text-rose-500 transition-colors ml-auto"
          aria-label="Wishlist"
        >
          <Heart className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
        </button>
      </div>

      {/* Product Image Frame */}
      <Link
        href={href}
        className="block relative aspect-square w-full rounded-lg sm:rounded-xl overflow-hidden mb-1.5 sm:mb-2 bg-slate-50 dark:bg-slate-800/80"
      >
        <Image
          src={product.image}
          alt={product.title}
          fill
          className="object-cover group-hover:scale-106 transition-transform duration-300 ease-out"
          sizes="(max-width: 640px) 33vw, 210px"
        />
      </Link>

      {/* Product Titles & Ratings */}
      <div className="flex flex-col mb-1.5 sm:mb-2">
        <Link href={href}>
          <h4 className="font-bold text-[10.5px] sm:text-xs text-slate-900 dark:text-white line-clamp-1 group-hover:text-accent transition-colors leading-tight">
            {product.title}
          </h4>
        </Link>
        {cleanUnit && (
          <span className="text-[9px] sm:text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 truncate font-normal">
            {cleanUnit}
          </span>
        )}

        <div className="flex items-center gap-0.5 sm:gap-1 mt-0.5 text-[9px] sm:text-[10px] font-bold text-amber-500">
          <Star className="w-2.5 h-2.5 sm:w-3 sm:h-3 fill-amber-500 text-amber-500 shrink-0" />
          <span>{product.rating}</span>
          <span className="text-slate-400 font-normal">
            ({product.reviewsCount > 999 ? `${(product.reviewsCount / 1000).toFixed(1)}K` : product.reviewsCount})
          </span>
        </div>
      </div>

      {/* Pricing + Green ADD Button */}
      <div className="pt-1.5 sm:pt-2 border-t border-slate-100 dark:border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
        <div className="min-w-0 flex-1">
          <FlipkartPriceRow
            originalPrice={discountInfo.originalPrice}
            sellingPrice={discountInfo.finalPrice}
            hasDiscount={discountInfo.hasDiscount}
            discountPercent={discountInfo.discountPercent}
            savingsAmount={discountInfo.savingsAmount}
            size="compact"
            showSavings={true}
          />
        </div>

        {isOutOfStock ? (
          <button
            disabled
            className="self-start sm:self-auto px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-lg sm:rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 font-bold text-[8.5px] sm:text-[10px] cursor-not-allowed select-none shrink-0"
          >
            Out of Stock
          </button>
        ) : (
          <button
            onClick={onAdd}
            className="self-start sm:self-auto px-2 sm:px-3 py-0.5 sm:py-1.5 rounded-lg sm:rounded-xl border-2 border-emerald-600 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-600 hover:text-white font-black text-[9px] sm:text-xs transition-all active:scale-95 shadow-2xs flex items-center gap-0.5 shrink-0"
          >
            <Plus className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
            <span>ADD</span>
          </button>
        )}
      </div>

      {/* Bottom Delivery Badge & Stock Count (Matching Reference Image 1) */}
      <div className="mt-1 sm:mt-1.5 pt-0.5 sm:pt-1 border-t border-slate-100/60 dark:border-slate-800/60 flex items-center justify-between text-[8px] sm:text-[9px] text-slate-500 dark:text-slate-400 font-medium">
        <span className="flex items-center gap-0.5 sm:gap-1">
          <Clock className="w-2 h-2 sm:w-2.5 sm:h-2.5 text-slate-400" />
          <span>{product.deliveryTime || "15 mins"}</span>
        </span>
        {product.stockLeft && (
          <span className="flex items-center gap-0.5 text-amber-600 dark:text-amber-400 font-bold">
            <Flame className="w-2 h-2 sm:w-2.5 sm:h-2.5" />
            <span>{product.stockLeft}</span>
          </span>
        )}
      </div>
    </div>
  );
}

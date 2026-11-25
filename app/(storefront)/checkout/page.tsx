"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/context/AuthContext";
import { useCart } from "@/lib/context/CartContext";
import { formatCurrency } from "@/lib/utils";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import {
  MapPin,
  LocateFixed,
  Loader2,
  Search,
  CheckCircle2,
  CreditCard,
  Banknote,
  Navigation,
  Info,
  MapPinOff,
  Compass,
  Tag,
  TicketPercent,
  Receipt,
  X,
  Sparkles,
  Zap,
  Building2,
  MessageSquareQuote,
  HeartHandshake,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Truck,
  Calendar,
  ArrowRight,
  ArrowLeft,
  Trash2,
  Edit3,
  Star,
} from "lucide-react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import {
  calculateDeliveryEstimate,
  formatReadableDateIST,
  getAvailableSchedulingDates,
} from "@/lib/delivery";

// Dynamic import for client-only Leaflet map
const InteractiveLocationMap = dynamic(
  () => import("@/components/checkout/InteractiveLocationMap"),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-72 sm:h-80 rounded-2xl bg-slate-100 border border-slate-200 flex flex-col items-center justify-center gap-2 text-slate-400 text-xs">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
        <span>Loading Interactive Location Map...</span>
      </div>
    ),
  }
);

interface CityRule {
  name: string;
  delivery_fee: number;
}

interface GeocodingSearchResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

interface AvailableCouponItem {
  id: string;
  code: string;
  type: string;
  value: number;
  min_order_value?: number;
  min_order_amount?: number;
  max_discount?: number;
  description?: string;
  reason?: string;
  savings?: number;
  displayBadge?: string;
  [key: string]: unknown;
}

interface ProductTaxDeliveryData {
  id: string;
  tax_rate?: number | null;
  delivery_fee?: number | null;
  category_id?: string | null;
  categories?: { tax_rate?: number | null } | { tax_rate?: number | null }[] | null;
}

interface CashfreeCheckoutOptions {
  paymentSessionId: string;
  redirectTarget?: "_self" | "_modal" | "_blank";
}

interface CashfreeInstance {
  checkout: (options: CashfreeCheckoutOptions) => Promise<{ error?: { message?: string; code?: string } }>;
}

interface WindowWithCashfree extends Window {
  Cashfree?: (config: { mode: "sandbox" | "production" }) => CashfreeInstance;
}

interface SavedAddress {
  id: string;
  user_id: string;
  full_name: string;
  phone: string;
  address_line1: string;
  address_line2?: string | null;
  city: string;
  state?: string | null;
  zip: string;
  country: string;
  is_default: boolean;
  landmark?: string | null;
  google_maps_url?: string | null;
  created_at: string;
}

const DEFAULT_CITIES: CityRule[] = [
  { name: "TARKESWAR", delivery_fee: 40 },
  { name: "LOKNATH", delivery_fee: 40 },
  { name: "KAIKALA", delivery_fee: 40 },
  { name: "HARIPAL", delivery_fee: 50 },
  { name: "MALIYA HALT", delivery_fee: 40 },
  { name: "NALIKUL", delivery_fee: 30 },
  { name: "KAMARKUNDU", delivery_fee: 40 },
  { name: "SINGUR", delivery_fee: 40 },
  { name: "NASHIBPUR", delivery_fee: 40 },
  { name: "DIARA", delivery_fee: 40 },
  { name: "SHEORAAPHULI", delivery_fee: 45 },
  { name: "MADHUSUDANPUR", delivery_fee: 40 },
];

const DELIVERY_INSTRUCTION_CHIPS = [
  "Leave at the door",
  "Do not ring the bell",
  "Avoid calling",
  "Beware of pets",
  "Leave with security guard",
  "Call before arrival",
];

export default function CheckoutPage() {
  const { items, buyNowItem, clearCart, clearBuyNowItem } = useCart();
  const searchParams = useSearchParams();
  const isBuyNow = searchParams.get("mode") === "buy_now" || Boolean(buyNowItem);
  const checkoutItems = useMemo(() => {
    return isBuyNow && buyNowItem ? [buyNowItem] : items;
  }, [isBuyNow, buyNowItem, items]);

  const [isProcessing, setIsProcessing] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [locationAccuracy, setLocationAccuracy] = useState<number | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);

  // Idempotency Single Order Guard & Attempt ID Tracking
  const isSubmittingRef = useRef(false);
  const checkoutAttemptIdRef = useRef<string>("");
  useEffect(() => {
    if (!checkoutAttemptIdRef.current) {
      checkoutAttemptIdRef.current =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `chk_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    }
  }, []);

  // Track previous checkout fingerprint to regenerate attempt ID on any checkout change
  const prevCheckoutHashRef = useRef("");

  // Admin-controlled Rules State
  const [cityRules, setCityRules] = useState<CityRule[]>(DEFAULT_CITIES);
  const [productTaxMap, setProductTaxMap] = useState<Map<string, number>>(new Map());
  const [productDeliveryMap, setProductDeliveryMap] = useState<Map<string, number>>(new Map());
  const [globalTaxRate, setGlobalTaxRate] = useState(0);
  const [freeDeliveryThreshold, setFreeDeliveryThreshold] = useState(500);

  // Coupon System State
  const [couponInput, setCouponInput] = useState("");
  const [isValidatingCoupon, setIsValidatingCoupon] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState<{
    id?: string;
    code: string;
    type: string;
    value: number;
  } | null>(null);
  const [couponDiscountAmount, setCouponDiscountAmount] = useState(0);
  const [couponMessage, setCouponMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Available Coupons State
  const [availableCoupons, setAvailableCoupons] = useState<AvailableCouponItem[]>([]);

  // Geocoding Search State
  const [locationSearch, setLocationSearch] = useState("");
  const [searchResults, setSearchResults] = useState<GeocodingSearchResult[]>([]);
  const [isSearchingLocation, setIsSearchingLocation] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchNotice, setSearchNotice] = useState<string | null>(null);
  const [suggestedAreas, setSuggestedAreas] = useState<string[]>([]);
  const [selectedDisplayAddress, setSelectedDisplayAddress] = useState<string>("");

  // Additional Checkout Options: GSTIN & Delivery Instructions & Partner Tip
  const [showGstinInput, setShowGstinInput] = useState(false);
  const [gstin, setGstin] = useState("");
  const [deliveryInstructions, setDeliveryInstructions] = useState("");
  const [selectedInstructionChips, setSelectedInstructionChips] = useState<string[]>([]);
  const [selectedTip, setSelectedTip] = useState<number | null>(null);

  // Customer Wallet State
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [useWalletBalance, setUseWalletBalance] = useState<boolean>(false);
  const [isLoadingWallet, setIsLoadingWallet] = useState<boolean>(false);

  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const supabase = createClient();
  const { addToast } = useToast();

  const [errors, setErrors] = useState<{
    fullName?: string;
    phone?: string;
    addressLine2?: string;
    landmark?: string;
    city?: string;
    postalCode?: string;
  }>({});

  const [form, setForm] = useState({
    fullName: "",
    phone: "",
    email: "",
    addressLine1: "",
    addressLine2: "",
    landmark: "",
    googleMapsUrl: "",
    city: "",
    state: "WEST BENGAL",
    postalCode: "",
    latitude: null as number | null,
    longitude: null as number | null,
    addressTag: "Home" as "Home" | "Work" | "Other",
    paymentMethod: null as "COD" | "ONLINE" | null,
  });

  // When checkout items, coupon, delivery address, or wallet selection change, generate a fresh attempt ID
  useEffect(() => {
    const itemsPart = checkoutItems.map((i) => `${i.id}_${i.quantity}`).join(",");
    const couponPart = appliedCoupon ? appliedCoupon.code : "";
    const addrPart = `${form.fullName}_${form.phone}_${form.addressLine1}_${form.city}_${form.postalCode}`;
    const walletPart = useWalletBalance ? "wallet_true" : "wallet_false";
    const currentHash = `${itemsPart}|${couponPart}|${addrPart}|${walletPart}`;

    if (prevCheckoutHashRef.current && prevCheckoutHashRef.current !== currentHash) {
      checkoutAttemptIdRef.current =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `chk_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    }
    prevCheckoutHashRef.current = currentHash;
  }, [
    checkoutItems,
    appliedCoupon,
    form.fullName,
    form.phone,
    form.addressLine1,
    form.city,
    form.postalCode,
    useWalletBalance,
  ]);

  // Step Machine: "address" | "payment"
  const [checkoutStep, setCheckoutStep] = useState<"address" | "payment">("address");

  // Dedicated Address Modal State in Checkout
  const [isAddressModalOpen, setIsAddressModalOpen] = useState(false);
  const [editingModalAddress, setEditingModalAddress] = useState<SavedAddress | null>(null);
  const [addressModalData, setAddressModalData] = useState({
    full_name: "",
    phone: "",
    address_line1: "",
    address_line2: "",
    landmark: "",
    city: "",
    state: "WEST BENGAL",
    zip: "",
    country: "India",
    is_default: false,
  });
  const [isSavingModalAddress, setIsSavingModalAddress] = useState(false);
  const isSavingModalAddressRef = useRef(false);
  const [addressModalError, setAddressModalError] = useState<string | null>(null);

  // Saved Addresses & Delivery Preferences State
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [isLoadingAddresses, setIsLoadingAddresses] = useState(false);
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [saveAddressForFuture, setSaveAddressForFuture] = useState(true);
  const [updateSavedAddressInBook, setUpdateSavedAddressInBook] = useState(false);

  // Delivery Estimates & Scheduling State (Asia/Kolkata)
  const [scheduledDeliveryDate, setScheduledDeliveryDate] = useState<string>("");
  const [paymentHighlighted, setPaymentHighlighted] = useState(false);

  const handleOpenAddAddressModal = () => {
    setEditingModalAddress(null);
    setAddressModalData({
      full_name: user?.user_metadata?.full_name || form.fullName || "",
      phone: form.phone || "",
      address_line1: "",
      address_line2: "",
      landmark: "",
      city: form.city || "",
      state: "WEST BENGAL",
      zip: "",
      country: "India",
      is_default: savedAddresses.length === 0,
    });
    setAddressModalError(null);
    setIsAddressModalOpen(true);
  };

  const handleOpenEditAddressModal = (addr: SavedAddress, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingModalAddress(addr);
    setAddressModalData({
      full_name: addr.full_name || "",
      phone: addr.phone || "",
      address_line1: addr.address_line1 || "",
      address_line2: addr.address_line2 || "",
      landmark: addr.landmark || "",
      city: addr.city || "",
      state: addr.state || "WEST BENGAL",
      zip: addr.zip || "",
      country: addr.country || "India",
      is_default: addr.is_default,
    });
    setAddressModalError(null);
    setIsAddressModalOpen(true);
  };

  const handleSetDefaultSavedAddress = async (e: React.MouseEvent, addrId: string) => {
    e.stopPropagation();
    if (!user?.id) return;
    try {
      await supabase.from("addresses").update({ is_default: false }).eq("user_id", user.id);
      const { error } = await supabase.from("addresses").update({ is_default: true }).eq("id", addrId).eq("user_id", user.id);
      if (error) throw error;
      setSavedAddresses((prev) =>
        prev.map((a) => ({
          ...a,
          is_default: a.id === addrId,
        }))
      );
      addToast({ title: "Default Address Updated", type: "success" });
    } catch {
      addToast({ title: "Failed to set default address", type: "error" });
    }
  };

  const handleSaveModalAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id || isSavingModalAddressRef.current) return;

    if (!addressModalData.full_name.trim()) {
      setAddressModalError("Recipient full name is required.");
      return;
    }
    const rawLine1 = addressModalData.address_line1.trim();
    const rawLine2 = addressModalData.address_line2.trim();
    const effectiveLine1 = rawLine1 || rawLine2;
    const effectiveLine2 = rawLine2 || rawLine1;

    if (!effectiveLine1) {
      setAddressModalError("Street address is required.");
      return;
    }
    if (!addressModalData.landmark.trim()) {
      setAddressModalError("Landmark or nearby area is required.");
      return;
    }
    if (!addressModalData.city.trim() || !cityRules.some((c) => c.name.toLowerCase() === addressModalData.city.trim().toLowerCase())) {
      setAddressModalError("Please select a valid serviceable City / Delivery area.");
      return;
    }
    const cleanZip = addressModalData.zip.trim();
    if (!/^\d{6}$/.test(cleanZip)) {
      setAddressModalError("Postal PIN Code must be exactly 6 digits.");
      return;
    }

    isSavingModalAddressRef.current = true;
    setIsSavingModalAddress(true);
    setAddressModalError(null);

    try {
      if (addressModalData.is_default) {
        await supabase
          .from("addresses")
          .update({ is_default: false })
          .eq("user_id", user.id);
      }

      if (editingModalAddress) {
        const { error } = await supabase
          .from("addresses")
          .update({
            full_name: addressModalData.full_name.trim(),
            phone: addressModalData.phone.trim() || null,
            address_line1: effectiveLine1,
            address_line2: rawLine2 && rawLine2 !== effectiveLine1 ? rawLine2 : null,
            landmark: addressModalData.landmark.trim() || null,
            city: addressModalData.city.trim(),
            state: addressModalData.state.trim() || "WEST BENGAL",
            zip: cleanZip,
            country: addressModalData.country.trim() || "India",
            is_default: addressModalData.is_default,
          })
          .eq("id", editingModalAddress.id)
          .eq("user_id", user.id);

        if (error) throw error;

        setSavedAddresses((prev) =>
          prev.map((a) =>
            a.id === editingModalAddress.id
              ? {
                  ...a,
                  full_name: addressModalData.full_name.trim(),
                  phone: addressModalData.phone.trim(),
                  address_line1: effectiveLine1,
                  address_line2: rawLine2 && rawLine2 !== effectiveLine1 ? rawLine2 : null,
                  landmark: addressModalData.landmark.trim() || null,
                  city: addressModalData.city.trim(),
                  state: addressModalData.state.trim() || "WEST BENGAL",
                  zip: cleanZip,
                  country: addressModalData.country.trim() || "India",
                  is_default: addressModalData.is_default,
                }
              : addressModalData.is_default
              ? { ...a, is_default: false }
              : a
          )
        );

        if (selectedAddressId === editingModalAddress.id) {
          setForm((prev) => ({
            ...prev,
            fullName: addressModalData.full_name.trim(),
            phone: addressModalData.phone.trim(),
            addressLine1: effectiveLine1,
            addressLine2: effectiveLine2,
            landmark: addressModalData.landmark.trim(),
            city: addressModalData.city.trim(),
            state: addressModalData.state.trim() || "WEST BENGAL",
            postalCode: cleanZip,
          }));
          setErrors({});
        }

        addToast({ title: "Address Updated", description: "Your delivery address was updated.", type: "success" });
      } else {
        const shouldBeDefault = addressModalData.is_default || savedAddresses.length === 0;
        const { data: newAddr, error } = await supabase
          .from("addresses")
          .insert({
            user_id: user.id,
            full_name: addressModalData.full_name.trim(),
            phone: addressModalData.phone.trim() || null,
            address_line1: effectiveLine1,
            address_line2: rawLine2 && rawLine2 !== effectiveLine1 ? rawLine2 : null,
            landmark: addressModalData.landmark.trim() || null,
            city: addressModalData.city.trim(),
            state: addressModalData.state.trim() || "WEST BENGAL",
            zip: cleanZip,
            country: addressModalData.country.trim() || "India",
            is_default: shouldBeDefault,
          })
          .select()
          .single();

        if (error) throw error;

        const createdAddr = newAddr as SavedAddress;
        setSavedAddresses((prev) => [
          createdAddr,
          ...(shouldBeDefault ? prev.map((a) => ({ ...a, is_default: false })) : prev),
        ]);

        setSelectedAddressId(createdAddr.id);
        setForm((prev) => ({
          ...prev,
          fullName: createdAddr.full_name || prev.fullName,
          phone: createdAddr.phone || prev.phone,
          addressLine1: createdAddr.address_line1 || effectiveLine1,
          addressLine2: createdAddr.address_line2 || createdAddr.address_line1 || effectiveLine2,
          landmark: createdAddr.landmark || "",
          city: createdAddr.city || prev.city,
          state: createdAddr.state || "WEST BENGAL",
          postalCode: createdAddr.zip || prev.postalCode,
        }));
        setErrors({});
        setShowAddressForm(false);

        addToast({ title: "Address Saved", description: "New delivery address saved for current and future orders.", type: "success" });
      }

      setIsAddressModalOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save address.";
      setAddressModalError(msg);
    } finally {
      setIsSavingModalAddress(false);
      isSavingModalAddressRef.current = false;
    }
  };

  const cartCategoryInfo = useMemo(() => {
    return checkoutItems.map((item) => ({
      categorySlug: item.title?.toLowerCase() || "",
    }));
  }, [checkoutItems]);

  const deliveryEstimate = useMemo(() => {
    return calculateDeliveryEstimate(cartCategoryInfo);
  }, [cartCategoryInfo]);

  const availableScheduledDates = useMemo(() => {
    return getAvailableSchedulingDates(cartCategoryInfo);
  }, [cartCategoryInfo]);

  const isDraftRestoredRef = useRef(false);

  // Restore non-sensitive draft on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const rawDraft = sessionStorage.getItem("vendosmith_checkout_draft");
      if (!rawDraft) return;
      const draft = JSON.parse(rawDraft);
      // Discard stale drafts older than 24 hours
      if (draft.updatedAt && Date.now() - draft.updatedAt > 24 * 60 * 60 * 1000) {
        sessionStorage.removeItem("vendosmith_checkout_draft");
        return;
      }
      setForm((prev) => ({
        ...prev,
        fullName: draft.fullName ?? prev.fullName,
        phone: draft.phone ?? prev.phone,
        email: draft.email ?? prev.email,
        addressLine1: draft.addressLine1 ?? prev.addressLine1,
        addressLine2: draft.addressLine2 ?? prev.addressLine2,
        landmark: draft.landmark ?? prev.landmark,
        city: draft.city ?? prev.city,
        postalCode: draft.postalCode ?? prev.postalCode,
        addressTag: draft.addressTag ?? prev.addressTag,
        paymentMethod: null, // Strictly neutral! Never restore paymentMethod
      }));
      if (typeof draft.deliveryInstructions === "string") {
        setDeliveryInstructions(draft.deliveryInstructions);
      }
      if (Array.isArray(draft.selectedInstructionChips)) {
        setSelectedInstructionChips(draft.selectedInstructionChips);
      }
      if (typeof draft.saveAddressForFuture === "boolean") {
        setSaveAddressForFuture(draft.saveAddressForFuture);
      }
      setShowAddressForm(true);
    } catch (err) {
      console.warn("Notice: Failed to restore checkout draft:", err);
    } finally {
      setTimeout(() => {
        isDraftRestoredRef.current = true;
      }, 100);
    }
  }, []);

  // ISSUE-03: Safe Checkout Recovery after browser refresh or interrupted redirect
  useEffect(() => {
    if (typeof window === "undefined" || !user) return;

    try {
      const rawActiveAttempt = sessionStorage.getItem("vendosmith_active_checkout_attempt");
      if (!rawActiveAttempt) return;

      const activeAttempt = JSON.parse(rawActiveAttempt);
      const ageMs = Date.now() - (activeAttempt.createdAt || 0);

      // Discard stale attempts older than 30 minutes
      if (ageMs > 30 * 60 * 1000) {
        sessionStorage.removeItem("vendosmith_active_checkout_attempt");
        return;
      }

      if (activeAttempt.cfOrderId && activeAttempt.attemptId) {
        // Restore attempt ID reference so subsequent actions don't fragment the checkout attempt
        checkoutAttemptIdRef.current = activeAttempt.attemptId;

        // Perform silent verification to check if the payment was completed before refresh
        fetch("/api/payment/cashfree/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cashfreeOrderId: activeAttempt.cfOrderId,
            orderPayload: {
              idempotencyKey: activeAttempt.attemptId,
              userId: user.id,
              email: user.email,
            },
          }),
        })
          .then((res) => res.json())
          .then((recoveryResult) => {
            if (recoveryResult?.success && (recoveryResult.order_number || recoveryResult.order?.order_number)) {
              const confirmedOrderNum = recoveryResult.order_number || recoveryResult.order?.order_number;
              sessionStorage.removeItem("vendosmith_active_checkout_attempt");
              sessionStorage.removeItem("vendosmith_checkout_draft");
              if (isBuyNow) clearBuyNowItem(); else clearCart();
              addToast({
                title: "Order Already Confirmed",
                description: `Payment was completed for order #${confirmedOrderNum}. Redirecting...`,
                type: "success",
              });
              router.push(`/checkout/success?order=${confirmedOrderNum}`);
            }
          })
          .catch((err) => {
            console.warn("Notice: Background checkout recovery notice:", err);
          });
      }
    } catch (parseErr) {
      console.warn("Notice: Failed to parse active checkout attempt:", parseErr);
    }
  }, [user, router, isBuyNow, clearBuyNowItem, clearCart, addToast]);

  // Save non-sensitive draft to sessionStorage on state changes
  useEffect(() => {
    if (typeof window === "undefined" || !isDraftRestoredRef.current) return;
    const isFormPopulated = Boolean(form.fullName || form.phone || form.addressLine1 || form.addressLine2);
    if (!isFormPopulated) return;
    const draftPayload = {
      fullName: form.fullName,
      phone: form.phone,
      email: form.email,
      addressLine1: form.addressLine1,
      addressLine2: form.addressLine2,
      landmark: form.landmark,
      city: form.city,
      postalCode: form.postalCode,
      addressTag: form.addressTag,
      deliveryInstructions,
      selectedInstructionChips,
      saveAddressForFuture,
      updatedAt: Date.now(),
    };
    try {
      sessionStorage.setItem("vendosmith_checkout_draft", JSON.stringify(draftPayload));
    } catch (err) {
      console.warn("Notice: Failed to save checkout draft:", err);
    }
  }, [
    form.fullName,
    form.phone,
    form.email,
    form.addressLine1,
    form.addressLine2,
    form.landmark,
    form.city,
    form.postalCode,
    form.addressTag,
    deliveryInstructions,
    selectedInstructionChips,
    saveAddressForFuture,
  ]);

  // Load Saved Addresses for logged-in user
  useEffect(() => {
    if (!user?.id) return;
    const currentUserId = user.id;
    async function loadSavedAddresses() {
      setIsLoadingAddresses(true);
      try {
        const { data, error } = await supabase
          .from("addresses")
          .select("*")
          .eq("user_id", currentUserId)
          .order("is_default", { ascending: false })
          .order("created_at", { ascending: false });

        if (error) {
          console.warn("Failed to load saved addresses from Supabase:", error);
        }

        if (data && data.length > 0) {
          const addrs = data as SavedAddress[];
          setSavedAddresses(addrs);
          const defaultAddr = addrs.find((a) => a.is_default) || addrs[0];
          setSelectedAddressId(defaultAddr.id);
          setForm((prev) => ({
            ...prev,
            fullName: defaultAddr.full_name || prev.fullName,
            phone: defaultAddr.phone || prev.phone,
            addressLine1: defaultAddr.address_line1 || defaultAddr.address_line2 || prev.addressLine1,
            addressLine2: defaultAddr.address_line2 || defaultAddr.address_line1 || "",
            landmark: defaultAddr.landmark || "",
            city: defaultAddr.city || prev.city,
            state: defaultAddr.state || "WEST BENGAL",
            postalCode: defaultAddr.zip || prev.postalCode,
            googleMapsUrl: defaultAddr.google_maps_url || prev.googleMapsUrl,
          }));
          setErrors({});
          setShowAddressForm(false);
        } else {
          setShowAddressForm(true);
        }
      } catch (err) {
        console.warn("Error loading saved addresses:", err);
      } finally {
        setIsLoadingAddresses(false);
      }
    }
    loadSavedAddresses();
  }, [user?.id, supabase]);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login?redirect=/checkout");
    }
  }, [user, authLoading, router]);

  // Load Customer Wallet Balance
  useEffect(() => {
    if (!user?.id) return;
    async function loadCustomerWallet() {
      setIsLoadingWallet(true);
      try {
        const res = await fetch("/api/wallet");
        const data = await res.json();
        if (data.success && data.wallet) {
          setWalletBalance(Number(data.wallet.balance || 0));
        }
      } catch (err) {
        console.warn("Notice: Failed to fetch customer wallet balance:", err);
      } finally {
        setIsLoadingWallet(false);
      }
    }
    loadCustomerWallet();
  }, [user?.id]);

  // Load Admin Configurations
  useEffect(() => {
    async function loadAdminConfiguration() {
      try {
        const { data: citiesData } = await supabase
          .from("delivery_cities")
          .select("name, delivery_fee")
          .eq("is_active", true)
          .order("name", { ascending: true });

        if (citiesData && citiesData.length > 0) {
          const rules: CityRule[] = citiesData.map((c: { name: string; delivery_fee?: number | string | null }) => ({
            name: c.name,
            delivery_fee: Number(c.delivery_fee ?? 40),
          }));
          setCityRules(rules);
          if (form.city && !rules.some((r) => r.name.toLowerCase() === form.city.trim().toLowerCase())) {
            setForm((prev) => ({ ...prev, city: "" }));
          }
        }

        if (items.length > 0) {
          const productIds = items.map((i) => i.productId);
          const { data: prodsData } = await supabase
            .from("products")
            .select("id, tax_rate, delivery_fee, category_id, categories:categories!products_category_id_fkey(tax_rate)")
            .in("id", productIds);

          const taxMap = new Map<string, number>();
          const delivMap = new Map<string, number>();

          ((prodsData as ProductTaxDeliveryData[]) || []).forEach((p) => {
            const catObj = Array.isArray(p.categories) ? p.categories[0] : p.categories;
            const effectiveTax =
              p.tax_rate !== null && p.tax_rate !== undefined
                ? Number(p.tax_rate)
                : catObj?.tax_rate !== null && catObj?.tax_rate !== undefined
                ? Number(catObj.tax_rate)
                : null;

            if (effectiveTax !== null) {
              taxMap.set(p.id, effectiveTax);
            }

            if (p.delivery_fee !== null && p.delivery_fee !== undefined) {
              delivMap.set(p.id, Number(p.delivery_fee));
            }
          });

          setProductTaxMap(taxMap);
          setProductDeliveryMap(delivMap);
        }

        const { data: settingsData } = await supabase
          .from("site_settings")
          .select("default_tax_rate, free_delivery_threshold")
          .single();

        if (settingsData) {
          if (settingsData.default_tax_rate !== undefined) {
            setGlobalTaxRate(Number(settingsData.default_tax_rate || 0));
          }
          if (settingsData.free_delivery_threshold !== undefined) {
            setFreeDeliveryThreshold(Number(settingsData.free_delivery_threshold || 500));
          }
        }
      } catch (err) {
        console.error("Error loading admin configurations:", err);
      }
    }

    loadAdminConfiguration();
  }, [items, form.city, supabase]);

  // Live Location Search via Nominatim Geocoding
  useEffect(() => {
    const queryStr = locationSearch.trim();
    if (!queryStr || queryStr.length < 2) {
      setSearchResults([]);
      setSearchNotice(null);
      setSuggestedAreas([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearchingLocation(true);
      setSearchNotice(null);
      setSuggestedAreas([]);

      try {
        const primaryUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          queryStr
        )}&countrycodes=in&limit=5`;
        const resPrimary = await fetch(primaryUrl);
        let dataPrimary: GeocodingSearchResult[] = [];

        if (resPrimary.ok) {
          dataPrimary = await resPrimary.json();
        }

        if (dataPrimary && dataPrimary.length > 0) {
          setSearchResults(dataPrimary);
          setShowSuggestions(true);
        } else {
          const fallbackQuery = `${queryStr}, ${form.city}, West Bengal, India`;
          const fallbackUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
            fallbackQuery
          )}&countrycodes=in&limit=5`;
          const resFallback = await fetch(fallbackUrl);
          let dataFallback: GeocodingSearchResult[] = [];

          if (resFallback.ok) {
            dataFallback = await resFallback.json();
          }

          if (dataFallback && dataFallback.length > 0) {
            setSearchResults(dataFallback);
            setShowSuggestions(true);
          } else {
            setSearchResults([]);
            setSearchNotice(
              `No specific place matching "${queryStr}" was found. Please select your area/city or search with a landmark/station.`
            );
            setSuggestedAreas(
              cityRules.map((c) => `${c.name} Station / Main Area`).slice(0, 4)
            );
            setShowSuggestions(true);
          }
        }
      } catch (e) {
        console.warn("Location geocoding error:", e);
      } finally {
        setIsSearchingLocation(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [locationSearch, form.city, cityRules]);

  // Price Calculation
  const itemsMRP = checkoutItems.reduce((acc, item) => acc + (item.mrp || item.price) * item.quantity, 0);
  const productDiscountTotal = checkoutItems.reduce(
    (acc, item) => acc + Math.max(0, (item.mrp || item.price) - item.price) * item.quantity,
    0
  );
  const cartItemSubtotal = checkoutItems.reduce((acc, item) => acc + item.price * item.quantity, 0);
  const subtotalAfterCoupon = Math.max(0, cartItemSubtotal - couponDiscountAmount);
  const totalSavings = productDiscountTotal + couponDiscountAmount;

  const calculatedTax = checkoutItems.reduce((acc, item) => {
    const rate = productTaxMap.get(item.productId) ?? globalTaxRate;
    const itemTotal = item.price * item.quantity;
    return acc + (itemTotal * rate) / 100;
  }, 0);

  const selectedCityRule = cityRules.find(
    (c) => c.name.toLowerCase() === form.city.trim().toLowerCase()
  );

  let calculatedDeliveryFee = selectedCityRule ? selectedCityRule.delivery_fee : 0;

  if (selectedCityRule) {
    if (cartItemSubtotal >= freeDeliveryThreshold && freeDeliveryThreshold > 0) {
      calculatedDeliveryFee = 0;
    } else {
      let maxProductFee: number | null = null;
      checkoutItems.forEach((item) => {
        const pFee = productDeliveryMap.get(item.productId);
        if (pFee !== undefined && pFee !== null) {
          if (maxProductFee === null || pFee > maxProductFee) {
            maxProductFee = pFee;
          }
        }
      });

      if (maxProductFee !== null) {
        calculatedDeliveryFee = maxProductFee;
      }
    }
  }

  const grandTotal = Math.round((subtotalAfterCoupon + calculatedTax + calculatedDeliveryFee) * 100) / 100;

  const walletAmountApplied = useMemo(() => {
    if (!useWalletBalance || walletBalance <= 0) return 0;
    return Math.min(walletBalance, grandTotal);
  }, [useWalletBalance, walletBalance, grandTotal]);

  const remainingPayable = Math.max(0, Math.round((grandTotal - walletAmountApplied) * 100) / 100);
  const isZeroPayable = walletAmountApplied > 0 && remainingPayable === 0;

  // Available Coupons Fetcher
  useEffect(() => {
    if (checkoutItems.length === 0) return;
    async function fetchAvailableCoupons() {
      try {
        const res = await fetch("/api/coupons/available", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subtotal: cartItemSubtotal,
            items: checkoutItems,
          }),
        });
        const data = await res.json();
        if (data) {
          setAvailableCoupons(data.applicableCoupons || []);
        }
      } catch (err) {
        console.error("Error fetching available coupons:", err);
      }
    }
    fetchAvailableCoupons();
  }, [cartItemSubtotal, checkoutItems]);

  const handleApplyCoupon = async (e?: React.FormEvent | string) => {
    let codeToUse = "";
    if (typeof e === "string") {
      codeToUse = e.trim();
    } else if (e) {
      e.preventDefault();
      codeToUse = couponInput.trim();
    } else {
      codeToUse = couponInput.trim();
    }

    if (!codeToUse) {
      setCouponMessage({ text: "Please enter a coupon code.", type: "error" });
      return;
    }

    setCouponInput(codeToUse.toUpperCase());
    setIsValidatingCoupon(true);
    setCouponMessage(null);

    try {
      const res = await fetch("/api/coupons/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: codeToUse,
          subtotal: cartItemSubtotal,
          items: checkoutItems,
          userId: user?.id,
        }),
      });

      const data = await res.json();
      if (data.valid) {
        setAppliedCoupon(data.coupon);
        setCouponDiscountAmount(data.discountAmount);
        setCouponMessage({
          text: data.message || `Coupon ${data.coupon.code} applied! Saved ${formatCurrency(data.discountAmount)}`,
          type: "success",
        });
        addToast({
          title: "Coupon Applied",
          description: `Saved ${formatCurrency(data.discountAmount)} on your order!`,
          type: "success",
        });
      } else {
        setAppliedCoupon(null);
        setCouponDiscountAmount(0);
        setCouponMessage({ text: data.message || "Invalid coupon code.", type: "error" });
        addToast({ title: "Coupon Error", description: data.message || "Invalid coupon code.", type: "error" });
      }
    } catch {
      setCouponMessage({ text: "Failed to validate coupon code.", type: "error" });
    } finally {
      setIsValidatingCoupon(false);
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponDiscountAmount(0);
    setCouponInput("");
    setCouponMessage(null);
    addToast({ title: "Coupon Removed", description: "Coupon discount removed.", type: "info" });
  };

  const validateAddressForm = (): boolean => {
    // 1. If an existing saved address is selected, validate using the saved record or form
    if (selectedAddressId && selectedAddressId !== "new") {
      const activeSaved = savedAddresses.find((a) => a.id === selectedAddressId);
      const streetAddress = (
        activeSaved?.address_line1 ||
        activeSaved?.address_line2 ||
        form.addressLine1 ||
        form.addressLine2 ||
        ""
      ).trim();
      const fullName = (activeSaved?.full_name || form.fullName || "").trim();
      const phone = (activeSaved?.phone || form.phone || "").trim();
      const landmark = (activeSaved?.landmark || form.landmark || "").trim();
      const city = (activeSaved?.city || form.city || "").trim();
      const postalCode = (activeSaved?.zip || form.postalCode || "").trim();

      const newErrors: {
        fullName?: string;
        phone?: string;
        addressLine2?: string;
        landmark?: string;
        city?: string;
        postalCode?: string;
      } = {};

      if (!fullName) newErrors.fullName = "Full Name is required";
      if (!phone) newErrors.phone = "Mobile Number is required";
      if (!streetAddress) newErrors.addressLine2 = "Street Address & Area is required";
      if (!landmark) newErrors.landmark = "Landmark is required";
      if (!city) {
        newErrors.city = "City / Delivery area is required";
      } else if (!cityRules.some((r) => r.name.toLowerCase() === city.toLowerCase())) {
        newErrors.city = "Selected city is not in our serviceable delivery zones";
      }
      if (!postalCode) newErrors.postalCode = "PIN Code is required";
      else if (!/^\d{6}$/.test(postalCode)) newErrors.postalCode = "PIN Code must be 6 digits";

      setErrors(newErrors);
      return Object.keys(newErrors).length === 0;
    }

    // 2. Manual / New Address Form Validation
    const newErrors: {
      fullName?: string;
      phone?: string;
      addressLine2?: string;
      landmark?: string;
      city?: string;
      postalCode?: string;
    } = {};

    if (!form.city.trim()) {
      newErrors.city = "Please select a serviceable City / Delivery Area";
    } else if (!cityRules.some((r) => r.name.toLowerCase() === form.city.trim().toLowerCase())) {
      newErrors.city = "Selected city is not in our serviceable delivery zones";
    }
    if (!form.fullName.trim()) newErrors.fullName = "Full Name is required";
    if (!form.phone.trim()) newErrors.phone = "Mobile Number is required";
    const hasStreet = Boolean(form.addressLine2.trim() || form.addressLine1.trim());
    if (!hasStreet) newErrors.addressLine2 = "Street Address & Area is required";
    if (!form.landmark.trim()) newErrors.landmark = "Landmark is required";
    if (!form.postalCode.trim()) newErrors.postalCode = "PIN Code is required";
    else if (!/^\d{6}$/.test(form.postalCode.trim())) newErrors.postalCode = "PIN Code must be 6 digits";

    setErrors(newErrors);

    const firstErrorKey = Object.keys(newErrors)[0];
    if (firstErrorKey) {
      const el = document.getElementById(`${firstErrorKey}-input`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.focus();
      }
      return false;
    }

    return true;
  };

  const handleContinueToPayment = () => {
    if (!validateAddressForm()) {
      setShowAddressForm(true);
      addToast({
        title: "Incomplete Address",
        description: "Please complete all required address fields before proceeding to payment.",
        type: "error",
      });
      return;
    }

    addToast({
      title: "Address Confirmed",
      description: "Proceeding to payment step.",
      type: "success",
    });

    setCheckoutStep("payment");
    setPaymentHighlighted(true);
    setTimeout(() => {
      setPaymentHighlighted(false);
    }, 2000);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDeleteSavedAddress = async (e: React.MouseEvent, addrId: string) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this saved address?")) return;
    try {
      const { error } = await supabase.from("addresses").delete().eq("id", addrId);
      if (error) throw error;
      setSavedAddresses((prev) => prev.filter((a) => a.id !== addrId));
      if (selectedAddressId === addrId) {
        const remaining = savedAddresses.filter((a) => a.id !== addrId);
        if (remaining.length > 0) {
          const next = remaining.find((a) => a.is_default) || remaining[0];
          setSelectedAddressId(next.id);
          setForm((prev) => ({
            ...prev,
            fullName: next.full_name || prev.fullName,
            phone: next.phone || prev.phone,
            addressLine1: next.address_line1 || next.address_line2 || prev.addressLine1,
            addressLine2: next.address_line2 || next.address_line1 || "",
            landmark: next.landmark || "",
            city: next.city || prev.city,
            state: next.state || "WEST BENGAL",
            postalCode: next.zip || prev.postalCode,
            googleMapsUrl: next.google_maps_url || prev.googleMapsUrl,
          }));
          setErrors({});
        } else {
          setSelectedAddressId("new");
          setShowAddressForm(true);
        }
      }
      addToast({ title: "Address Deleted", type: "info" });
    } catch {
      addToast({ title: "Failed to delete address", type: "error" });
    }
  };

  const reverseGeocode = async (lat: number, lng: number) => {
    try {
      const revUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`;
      const res = await fetch(revUrl);
      if (res.ok) {
        const data = await res.json();
        if (data && data.display_name) {
          setSelectedDisplayAddress(data.display_name);

          const addrObj = data.address || {};
          const readableLine = [
            addrObj.road || addrObj.building || addrObj.suburb,
            addrObj.neighbourhood || addrObj.village || addrObj.town || addrObj.city_district,
          ]
            .filter(Boolean)
            .join(", ");

          if (readableLine) {
            setForm((prev) => ({
              ...prev,
              addressLine2: prev.addressLine2 ? prev.addressLine2 : readableLine,
              postalCode: prev.postalCode ? prev.postalCode : addrObj.postcode || prev.postalCode,
            }));
          }

          const upperDisplay = data.display_name.toUpperCase();
          const matched = cityRules.find((c) => upperDisplay.includes(c.name));
          if (matched) {
            setForm((prev) => ({ ...prev, city: matched.name }));
          }
        }
      }
    } catch (e) {
      console.warn("Reverse geocoding error:", e);
    }
  };

  const handleGetCurrentLocation = () => {
    setLocationError(null);

    if (!navigator.geolocation) {
      const msg = "Unable to determine your current location. Please search your address manually.";
      setLocationError(msg);
      addToast({ title: "Location Unavailable", description: msg, type: "error" });
      return;
    }

    setIsLocating(true);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const accuracyMeters = position.coords.accuracy;

        setIsLocating(false);

        const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;

        setForm((prev) => ({
          ...prev,
          latitude: lat,
          longitude: lng,
          googleMapsUrl: mapsUrl,
        }));
        setLocationAccuracy(accuracyMeters);

        await reverseGeocode(lat, lng);

        addToast({
          title: accuracyMeters <= 500 ? "Location Captured via GPS" : "Location Captured (Approximate)",
          description: `Coordinates (${lat.toFixed(5)}, ${lng.toFixed(5)}). Please verify your street address & landmark below.`,
          type: accuracyMeters <= 500 ? "success" : "info",
        });
      },
      (error) => {
        setIsLocating(false);
        const errorMsg =
          error.code === error.PERMISSION_DENIED
            ? "Location permission was denied. Please allow location access or search your address manually."
            : "Unable to determine your current location. Please search your address manually.";

        setLocationError(errorMsg);
        addToast({ title: "Location Error", description: errorMsg, type: "error" });
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  };

  const handleSelectGeocodedLocation = (result: GeocodingSearchResult) => {
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;

    setSelectedDisplayAddress(result.display_name);

    setForm((prev) => ({
      ...prev,
      latitude: lat,
      longitude: lng,
      googleMapsUrl: mapsUrl,
      addressLine2: prev.addressLine2 ? prev.addressLine2 : result.display_name.split(",").slice(0, 3).join(",").trim(),
    }));
    setLocationAccuracy(null);
    setLocationError(null);

    const upperDisplay = result.display_name.toUpperCase();
    const matchedCity = cityRules.find((c) => upperDisplay.includes(c.name));
    if (matchedCity) {
      setForm((prev) => ({ ...prev, city: matchedCity.name }));
    }

    setLocationSearch("");
    setShowSuggestions(false);
    addToast({
      title: "Location Selected",
      description: "Coordinates set on map. Please verify street & landmark details below.",
      type: "info",
    });
  };

  const handleMapLocationSelect = async (lat: number, lng: number) => {
    const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;

    setForm((prev) => ({
      ...prev,
      latitude: lat,
      longitude: lng,
      googleMapsUrl: mapsUrl,
    }));

    await reverseGeocode(lat, lng);
  };

  const toggleInstructionChip = (chip: string) => {
    setSelectedInstructionChips((prev) =>
      prev.includes(chip) ? prev.filter((c) => c !== chip) : [...prev, chip]
    );
  };

  const loadCashfreeSdk = (mode: "sandbox" | "production" = "sandbox"): Promise<CashfreeInstance | null> => {
    return new Promise((resolve) => {
      if (typeof window === "undefined") {
        resolve(null);
        return;
      }
      const win = window as unknown as WindowWithCashfree;
      if (win.Cashfree) {
        resolve(win.Cashfree({ mode }));
        return;
      }
      const script = document.createElement("script");
      script.src = "https://sdk.cashfree.com/js/v3/cashfree.js";
      script.async = true;
      script.onload = () => {
        if (win.Cashfree) {
          resolve(win.Cashfree({ mode }));
        } else {
          resolve(null);
        }
      };
      script.onerror = () => resolve(null);
      document.body.appendChild(script);
    });
  };

  // Safely persist newly entered address after order confirmation under existing schema (Option A)
  const saveAddressAfterOrderSuccess = async () => {
    if (!user?.id) return;

    if (selectedAddressId && selectedAddressId !== "new") {
      if (updateSavedAddressInBook) {
        try {
          const line1 = form.addressLine1.trim() || form.addressLine2.trim();
          const line2 = form.addressLine2.trim() && form.addressLine2.trim() !== line1 ? form.addressLine2.trim() : null;
          await supabase
            .from("addresses")
            .update({
              full_name: form.fullName.trim(),
              phone: form.phone.trim() || null,
              address_line1: line1,
              address_line2: line2,
              landmark: form.landmark.trim() || null,
              city: form.city.trim(),
              state: form.state?.trim() || "WEST BENGAL",
              zip: form.postalCode.trim(),
            })
            .eq("id", selectedAddressId)
            .eq("user_id", user.id);
        } catch (updateErr) {
          console.warn("Notice: Failed to update saved address in address book:", updateErr);
        }
      }
      return;
    }

    // Only save newly entered manual addresses; never duplicate an existing saved address
    if (!saveAddressForFuture) return;
    try {
      const line1 = form.addressLine1.trim() || form.addressLine2.trim();
      const line2 = form.addressLine2.trim() && form.addressLine2.trim() !== line1 ? form.addressLine2.trim() : null;
      const zipCode = form.postalCode.trim();
      const cityName = form.city.trim();
      const fullName = form.fullName.trim();
      const phoneNum = form.phone.trim();
      const stateVal = form.state?.trim() || "WEST BENGAL";

      if (!line1 || !zipCode || !cityName) return;

      // Sequential duplicate check under current schema
      const { data: existing } = await supabase
        .from("addresses")
        .select("id")
        .eq("user_id", user.id)
        .eq("address_line1", line1)
        .eq("zip", zipCode)
        .eq("city", cityName)
        .maybeSingle();

      if (existing) {
        return; // Address already saved in DB
      }

      // Check if user has any existing addresses to decide is_default
      const { count } = await supabase
        .from("addresses")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id);

      const isFirst = (count ?? 0) === 0;

      // Insert ONLY the 12 existing columns in public.addresses
      // Strictly do NOT insert latitude, longitude, address_tag
      await supabase.from("addresses").insert([
        {
          user_id: user.id,
          full_name: fullName,
          phone: phoneNum,
          address_line1: line1,
          address_line2: line2,
          city: cityName,
          state: stateVal,
          zip: zipCode,
          country: "IN",
          is_default: isFirst,
          landmark: form.landmark.trim() || null,
          google_maps_url: form.googleMapsUrl.trim() || null,
        },
      ]);
    } catch (saveErr) {
      // Strictly isolated; never interrupt successful order flow
      console.warn("Notice: Post-order address save notice (non-fatal):", saveErr);
    }
  };

  const handlePlaceOrder = async () => {
    if (isSubmittingRef.current || isProcessing) return;

    if (!isZeroPayable && !form.paymentMethod) {
      addToast({
        title: "Select Payment Method",
        description: "Please choose either Online Payment or Cash on Delivery to proceed.",
        type: "error",
      });
      const el = document.getElementById("payment-method-section");
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return;
    }

    isSubmittingRef.current = true;
    setIsProcessing(true);

    try {
      if (!validateAddressForm()) {
        addToast({
          title: "Incomplete Address",
          description: "Please fill in all required address fields marked with * before placing your order.",
          type: "error",
        });
        setIsProcessing(false);
        isSubmittingRef.current = false;
        return;
      }

      const nameParts = form.fullName.trim().split(" ");
      const firstName = nameParts[0] || "Customer";
      const lastName = nameParts.slice(1).join(" ") || "";

      const fullInstructions = [
        ...selectedInstructionChips,
        deliveryInstructions.trim(),
      ]
        .filter(Boolean)
        .join(" | ");

      const shippingAddress = {
        first_name: firstName,
        last_name: lastName,
        full_name: form.fullName.trim() || `${firstName} ${lastName}`.trim(),
        phone: form.phone.trim(),
        mobile_number: form.phone.trim(),
        address_line1: form.addressLine1.trim() || form.addressLine2.trim(),
        address_line2: form.addressLine2.trim() !== form.addressLine1.trim() ? form.addressLine2.trim() : "",
        landmark: form.landmark.trim(),
        google_maps_url: form.googleMapsUrl.trim(),
        latitude: form.latitude,
        longitude: form.longitude,
        city: form.city,
        state: form.state || "WEST BENGAL",
        postal_code: form.postalCode.trim(),
        address_tag: form.addressTag,
        country: "IN",
        email: form.email.trim() || user?.email,
        gstin: gstin.trim() || undefined,
        delivery_instructions: fullInstructions || undefined,
      };

      const attemptId =
        checkoutAttemptIdRef.current ||
        (typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `chk_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`);
      checkoutAttemptIdRef.current = attemptId;

      if (isZeroPayable) {
        const response = await fetch("/api/orders/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: user?.id,
            email: form.email.trim() || user?.email,
            shippingAddress,
            paymentMethod: "WALLET",
            paymentStatus: "paid",
            shippingMethod: selectedCityRule ? `${selectedCityRule.name} Delivery` : `${form.city || "Standard"} Delivery`,
            shippingCost: calculatedDeliveryFee,
            cityRuleName: selectedCityRule?.name || form.city,
            items: checkoutItems,
            couponCode: appliedCoupon ? appliedCoupon.code : null,
            idempotencyKey: attemptId,
            walletAmountApplied,
            estimatedDeliveryDate: deliveryEstimate.maxDateFormatted,
            scheduledDeliveryDate: scheduledDeliveryDate || undefined,
          }),
        });

        const result = await response.json();
        if (!result.success) {
          throw new Error(result.message || "Failed to process wallet order.");
        }

        if (isBuyNow) clearBuyNowItem(); else clearCart();
        if (typeof window !== "undefined") sessionStorage.removeItem("vendosmith_checkout_draft");
        await saveAddressAfterOrderSuccess();

        router.push(`/checkout/success?order=${result.order_number}`);
        return;
      }

      if (form.paymentMethod === "COD") {
        const response = await fetch("/api/orders/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: user?.id,
            email: form.email.trim() || user?.email,
            shippingAddress,
            paymentMethod: "COD",
            paymentStatus: "pending",
            shippingMethod: selectedCityRule ? `${selectedCityRule.name} Delivery` : `${form.city || "Standard"} Delivery`,
            shippingCost: calculatedDeliveryFee,
            cityRuleName: selectedCityRule?.name || form.city,
            items: checkoutItems,
            couponCode: appliedCoupon ? appliedCoupon.code : null,
            idempotencyKey: attemptId,
            walletAmountApplied: walletAmountApplied > 0 ? walletAmountApplied : undefined,
            estimatedDeliveryDate: deliveryEstimate.maxDateFormatted,
            scheduledDeliveryDate: scheduledDeliveryDate || undefined,
          }),
        });

        const result = await response.json();

        if (!result.success) {
          throw new Error(result.message || "Failed to process order.");
        }

        if (isBuyNow) {
          clearBuyNowItem();
        } else {
          clearCart();
        }

        if (typeof window !== "undefined") {
          sessionStorage.removeItem("vendosmith_checkout_draft");
        }

        await saveAddressAfterOrderSuccess();

        checkoutAttemptIdRef.current =
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : `chk_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

        router.push(`/checkout/success?order=${result.order_number}`);
      } else {
        // ONLINE PAYMENT via Cashfree Payment Gateway
        const createCfOrderRes = await fetch("/api/payment/cashfree/create-order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: checkoutItems,
            shippingAddress,
            couponCode: appliedCoupon ? appliedCoupon.code : null,
            shippingCost: calculatedDeliveryFee,
            cityRuleName: selectedCityRule?.name || form.city,
            idempotencyKey: attemptId,
            userId: user?.id,
            email: form.email.trim() || user?.email,
            walletAmountApplied: walletAmountApplied > 0 ? walletAmountApplied : undefined,
            estimatedDeliveryDate: deliveryEstimate.maxDateFormatted,
            scheduledDeliveryDate: scheduledDeliveryDate || undefined,
            customerDetails: {
              customerId: user?.id,
              name: form.fullName.trim(),
              email: form.email.trim() || user?.email,
              phone: form.phone.trim(),
            },
          }),
        });

        const cfOrderData = await createCfOrderRes.json();
        if (!cfOrderData.success || !cfOrderData.paymentSessionId) {
          throw new Error(cfOrderData.message || "Failed to initialize Cashfree payment session.");
        }

        // ISSUE-03: Persist active attempt to sessionStorage for recovery upon refresh
        if (typeof window !== "undefined") {
          try {
            sessionStorage.setItem(
              "vendosmith_active_checkout_attempt",
              JSON.stringify({
                attemptId,
                cfOrderId: cfOrderData.orderId,
                paymentSessionId: cfOrderData.paymentSessionId,
                createdAt: Date.now(),
              })
            );
          } catch {}
        }

        const mode = cfOrderData.environment === "production" ? "production" : "sandbox";
        const cashfree = await loadCashfreeSdk(mode);
        if (!cashfree) {
          throw new Error("Unable to load Cashfree payment gateway. Please check your internet connection.");
        }

        cashfree
          .checkout({
            paymentSessionId: cfOrderData.paymentSessionId,
            redirectTarget: "_modal",
          })
          .then(async (checkoutResult: { error?: { message?: string; code?: string } } | undefined) => {
            if (checkoutResult?.error) {
              console.warn("Cashfree checkout notice:", checkoutResult.error);
              if (typeof window !== "undefined") {
                sessionStorage.removeItem("vendosmith_active_checkout_attempt");
              }
              setIsProcessing(false);
              isSubmittingRef.current = false;
              addToast({
                title: "Payment Window Closed",
                description:
                  checkoutResult.error?.message ||
                  "The payment session was closed without completing. You can retry anytime.",
                type: "info",
              });
              return;
            }

            try {
              setIsProcessing(true);
              const verifyRes = await fetch("/api/payment/cashfree/verify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  cashfreeOrderId: cfOrderData.orderId,
                  orderPayload: {
                    idempotencyKey: attemptId,
                    orderId: cfOrderData.internalOrderId || null,
                    orderNumber: cfOrderData.internalOrderNumber || null,
                    userId: user?.id,
                    email: form.email.trim() || user?.email,
                    shippingAddress,
                    paymentMethod: "ONLINE",
                    shippingMethod: selectedCityRule ? `${selectedCityRule.name} Delivery` : `${form.city || "Standard"} Delivery`,
                    shippingCost: calculatedDeliveryFee,
                    cityRuleName: selectedCityRule?.name || form.city,
                    items: checkoutItems,
                    couponCode: appliedCoupon ? appliedCoupon.code : null,
                    walletAmountApplied: walletAmountApplied > 0 ? walletAmountApplied : undefined,
                  },
                }),
              });

              const verifyResult = await verifyRes.json();
              if (!verifyResult.success) {
                throw new Error(verifyResult.message || "Payment verification incomplete.");
              }

              if (isBuyNow) {
                clearBuyNowItem();
              } else {
                clearCart();
              }

              if (typeof window !== "undefined") {
                sessionStorage.removeItem("vendosmith_checkout_draft");
                sessionStorage.removeItem("vendosmith_active_checkout_attempt");
              }

              await saveAddressAfterOrderSuccess();

              checkoutAttemptIdRef.current =
                typeof crypto !== "undefined" && crypto.randomUUID
                  ? crypto.randomUUID()
                  : `chk_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

              const confirmedOrderNum = verifyResult.order_number || cfOrderData.internalOrderNumber || "";
              addToast({
                title: "Payment Confirmed!",
                description: confirmedOrderNum
                  ? `Order ${confirmedOrderNum} confirmed successfully!`
                  : "Order confirmed successfully!",
                type: "success",
              });

              router.push(`/checkout/success?order=${confirmedOrderNum}`);
            } catch (verifyErr: unknown) {
              const verifyMsg = verifyErr instanceof Error ? verifyErr.message : undefined;
              console.warn("Cashfree verification response:", verifyErr);
              setIsProcessing(false);
              isSubmittingRef.current = false;
              addToast({
                title: "Payment Status Notice",
                description:
                  verifyMsg ||
                  "Payment could not be verified immediately. If money was deducted, our team will verify and update your order.",
                type: "info",
              });
            }
          });
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : undefined;
      addToast({
        title: "Checkout Error",
        description: errMsg || "Failed to process order. Please try again.",
        type: "error",
      });
      setIsProcessing(false);
      isSubmittingRef.current = false;
    }
  };

  if (authLoading || !user) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (checkoutItems.length === 0 && !isProcessing) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6 bg-slate-50/50 rounded-3xl my-12 border border-dashed border-slate-300 mx-4 md:mx-16">
        <h1 className="text-3xl font-bold mb-4 text-slate-900">Your checkout is empty</h1>
        <p className="text-slate-500 mb-8">Add items to your cart before checking out.</p>
        <Button variant="primary" onClick={() => router.push("/products")}>
          Continue Shopping
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/60 pb-36">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 py-6 sm:py-10 w-full flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Checkout
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Review your delivery details, bill, and complete payment
            </p>
          </div>
          {isBuyNow && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold">
              <Zap className="w-3.5 h-3.5 text-amber-600 fill-amber-600" />
              <span>Buy Now</span>
            </div>
          )}
        </div>

        {/* Step Indicator */}
        <div className="flex items-center gap-3 bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-xs">
          <button
            type="button"
            onClick={() => setCheckoutStep("address")}
            className={`flex-1 flex items-center gap-2.5 p-2 rounded-xl text-left transition-colors ${
              checkoutStep === "address"
                ? "bg-blue-50 text-blue-700"
                : "text-slate-600 hover:bg-slate-50 cursor-pointer"
            }`}
          >
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                checkoutStep === "address"
                  ? "bg-blue-600 text-white"
                  : "bg-emerald-600 text-white"
              }`}
            >
              {checkoutStep === "payment" ? <CheckCircle2 className="w-4 h-4" /> : "1"}
            </div>
            <div>
              <p className="text-xs sm:text-sm font-bold leading-tight">1. Delivery Address</p>
              <p className="text-[11px] text-slate-500 hidden sm:block truncate max-w-[200px]">
                {form.addressLine1 ? `${form.city || "Tarkeswar"}, ${form.postalCode || ""}` : "Select destination"}
              </p>
            </div>
          </button>

          <div className="w-6 h-px bg-slate-200 shrink-0" />

          <button
            type="button"
            onClick={() => {
              if (validateAddressForm()) {
                setCheckoutStep("payment");
              } else {
                addToast({
                  title: "Incomplete Address",
                  description: "Please complete all required address fields before proceeding to payment.",
                  type: "error",
                });
              }
            }}
            className={`flex-1 flex items-center gap-2.5 p-2 rounded-xl text-left transition-colors ${
              checkoutStep === "payment"
                ? "bg-blue-50 text-blue-700"
                : "text-slate-400 hover:text-slate-600 cursor-pointer"
            }`}
          >
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                checkoutStep === "payment"
                  ? "bg-blue-600 text-white"
                  : "bg-slate-200 text-slate-600"
              }`}
            >
              2
            </div>
            <div>
              <p className="text-xs sm:text-sm font-bold leading-tight">2. Payment &amp; Review</p>
              <p className="text-[11px] text-slate-500 hidden sm:block">
                {form.paymentMethod ? (form.paymentMethod === "ONLINE" ? "Online Payment" : "Cash on Delivery") : "Select payment method"}
              </p>
            </div>
          </button>
        </div>

        {/* ============================================================== */}
        {/* STEP 1: ADDRESS / DELIVERY INFORMATION */}
        {/* ============================================================== */}
        {checkoutStep === "address" && (
        <section className="bg-white border border-slate-200 shadow-sm rounded-3xl p-5 sm:p-7 flex flex-col gap-5">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100 font-bold shrink-0">
                1
              </div>
              <div>
                <h2 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-blue-600" /> Delivery Address
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Search location, use GPS, or pin on interactive map
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleGetCurrentLocation}
              disabled={isLocating}
              className="flex items-center gap-2 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all active:scale-95 disabled:opacity-50 shrink-0"
            >
              {isLocating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <LocateFixed className="w-4 h-4" />
              )}
              <span>{isLocating ? "Locating..." : "Use My Current Location"}</span>
            </button>
          </div>

          {locationError && (
            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-2.5 text-xs text-amber-900">
              <MapPinOff className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="font-medium">{locationError}</p>
            </div>
          )}

          {/* Saved Addresses Section (Option A) */}
          {isLoadingAddresses && (
            <div className="flex items-center gap-2 text-xs text-slate-500 py-1.5 border-b border-slate-100">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
              <span>Loading saved addresses...</span>
            </div>
          )}
          {savedAddresses.length > 0 && (
            <div className="flex flex-col gap-3 pb-3 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Saved Delivery Addresses ({savedAddresses.length})
                </span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleOpenAddAddressModal}
                    className="text-xs font-bold text-blue-600 hover:text-blue-700 transition-colors flex items-center gap-1"
                  >
                    <span>+ Add New Address</span>
                  </button>
                  <span className="text-slate-300">|</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedAddressId("new");
                      setShowAddressForm(true);
                      setForm((prev) => ({
                        ...prev,
                        addressLine1: "",
                        addressLine2: "",
                        landmark: "",
                        googleMapsUrl: "",
                        postalCode: "",
                      }));
                    }}
                    className="text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors"
                  >
                    Manual Form
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {savedAddresses.map((addr) => {
                  const isSelected = selectedAddressId === addr.id;
                  const isPrimary = addr.is_default;
                  return (
                    <div
                      key={addr.id}
                      onClick={() => {
                        setSelectedAddressId(addr.id);
                        setForm((prev) => ({
                          ...prev,
                          fullName: addr.full_name || prev.fullName,
                          phone: addr.phone || prev.phone,
                          addressLine1: addr.address_line1 || addr.address_line2 || prev.addressLine1,
                          addressLine2: addr.address_line2 || addr.address_line1 || "",
                          landmark: addr.landmark || "",
                          city: addr.city || prev.city,
                          state: addr.state || "WEST BENGAL",
                          postalCode: addr.zip || prev.postalCode,
                          googleMapsUrl: addr.google_maps_url || prev.googleMapsUrl,
                        }));
                        setErrors({});
                        setShowAddressForm(false);
                      }}
                      className={`p-4 rounded-2xl cursor-pointer transition-all flex flex-col justify-between gap-2.5 relative ${
                        isPrimary
                          ? "rgb-border-glow shadow-md"
                          : isSelected
                          ? "border-2 border-blue-600 bg-blue-50/40 ring-2 ring-blue-500/20 shadow-xs"
                          : "border border-slate-200 bg-white hover:border-slate-300"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="savedAddressRadioGroup"
                            checked={isSelected}
                            onChange={() => {}}
                            className="w-4 h-4 text-blue-600 accent-blue-600"
                          />
                          <span className="text-xs font-bold text-slate-900">{addr.full_name}</span>
                        </div>
                        {addr.is_default && (
                          <span className="text-[10px] font-extrabold uppercase bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-2.5 py-0.5 rounded-full shadow-2xs">
                            Primary Address
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-slate-600 leading-relaxed pl-6">
                        {[
                          addr.address_line1,
                          addr.address_line2,
                          addr.landmark,
                          `${addr.city}, ${addr.state || "WEST BENGAL"} - ${addr.zip}`,
                        ]
                          .filter(Boolean)
                          .join(", ")}
                      </p>

                      <div className="flex items-center justify-between text-[11px] text-slate-500 pl-6 border-t border-slate-100 pt-2">
                        <span>Ph: {addr.phone || "N/A"}</span>
                        <div className="flex items-center gap-3">
                          {!addr.is_default && (
                            <button
                              type="button"
                              onClick={(e) => handleSetDefaultSavedAddress(e, addr.id)}
                              className="text-amber-600 font-semibold hover:underline flex items-center gap-1"
                              title="Set as Default Address"
                            >
                              <Star className="w-3 h-3" />
                              <span className="hidden sm:inline">Set Default</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={(e) => handleOpenEditAddressModal(addr, e)}
                            className="text-blue-600 font-semibold hover:underline flex items-center gap-1"
                          >
                            <Edit3 className="w-3 h-3" />
                            <span>Edit</span>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleDeleteSavedAddress(e, addr.id)}
                            className="text-red-500 font-semibold hover:underline hover:text-red-700 flex items-center gap-1"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Delete</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {!showAddressForm && selectedAddressId && selectedAddressId !== "new" && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs text-slate-700 mt-1">
                  <span>Delivering to: <strong className="text-slate-900">{form.fullName}</strong> ({form.city}, {form.postalCode})</span>
                  <button
                    type="button"
                    onClick={() => setShowAddressForm(true)}
                    className="text-blue-600 font-bold hover:underline"
                  >
                    Edit / Verify Form Details
                  </button>
                </div>
              )}
            </div>
          )}

          {(savedAddresses.length === 0 || showAddressForm || selectedAddressId === "new") && (
            <div className="flex flex-col gap-5">
              {/* Location Search Bar */}
          <div className="relative">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <Search className="w-3.5 h-3.5 text-blue-600" /> Search Location or Landmark
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="Search e.g. Station, Hospital, Main Market, Area..."
                value={locationSearch}
                onFocus={() => setShowSuggestions(true)}
                onChange={(e) => setLocationSearch(e.target.value)}
                className="w-full pl-4 pr-10 h-11 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 text-slate-900"
              />
              {isSearchingLocation && (
                <Loader2 className="w-4 h-4 absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 animate-spin" />
              )}
            </div>

            {showSuggestions && (searchResults.length > 0 || searchNotice) && (
              <div className="absolute top-full left-0 right-0 z-30 mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl max-h-64 overflow-y-auto divide-y divide-slate-100">
                {searchResults.length > 0 ? (
                  searchResults.map((res) => (
                    <button
                      key={res.place_id}
                      type="button"
                      onClick={() => handleSelectGeocodedLocation(res)}
                      className="w-full text-left px-4 py-2.5 text-xs font-medium hover:bg-blue-50/70 flex items-start gap-2 text-slate-800 transition-colors"
                    >
                      <Navigation className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                      <span className="line-clamp-2">{res.display_name}</span>
                    </button>
                  ))
                ) : searchNotice ? (
                  <div className="p-3 text-xs font-medium text-slate-600 space-y-1.5">
                    <div className="flex items-start gap-2 text-amber-800">
                      <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <span>{searchNotice}</span>
                    </div>
                    {suggestedAreas.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {suggestedAreas.map((area) => (
                          <button
                            key={area}
                            type="button"
                            onClick={() => setLocationSearch(area)}
                            className="text-[11px] bg-slate-100 hover:bg-slate-200 text-slate-800 px-2.5 py-0.5 rounded-lg"
                          >
                            {area}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            )}
          </div>

          {/* Interactive Map */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5 text-blue-600" /> Interactive Location Map
            </label>
            <InteractiveLocationMap
              latitude={form.latitude}
              longitude={form.longitude}
              accuracy={locationAccuracy}
              onLocationSelect={handleMapLocationSelect}
              addressLabel={selectedDisplayAddress || form.addressLine1 || form.addressLine2}
            />
          </div>

          {form.latitude && form.longitude && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-xs text-emerald-950">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="font-semibold">
                Pin Confirmed: {form.latitude.toFixed(5)}, {form.longitude.toFixed(5)}
              </span>
            </div>
          )}

          {/* Prominent City-First Selector */}
          <div className="p-4 bg-gradient-to-r from-blue-50/80 to-indigo-50/50 border-2 border-blue-200/90 rounded-2xl flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-blue-600" />
                <span>1. Select Delivery City / Town *</span>
              </label>
              {errors.city && <span className="text-red-500 text-[11px] font-bold">{errors.city}</span>}
            </div>
            <select
              id="city-input"
              value={form.city}
              onChange={(e) => {
                const val = e.target.value;
                setForm({ ...form, city: val });
                if (val && errors.city) {
                  setErrors((prev) => ({ ...prev, city: undefined }));
                }
              }}
              className="w-full h-11 px-3.5 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 cursor-pointer shadow-2xs"
            >
              <option value="">-- Select City / Delivery Area --</option>
              {cityRules.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name} (Delivery Fee: ₹{c.delivery_fee})
                </option>
              ))}
            </select>
            {form.city ? (
              <div className="flex items-center justify-between text-[11px] text-slate-600 px-1 pt-0.5">
                <span>Serviceable Zone: <strong className="text-blue-700 font-bold">{form.city}</strong></span>
                <span>Base Delivery Fee: <strong>₹{cityRules.find((c) => c.name.toLowerCase() === form.city.trim().toLowerCase())?.delivery_fee ?? 40}</strong></span>
              </div>
            ) : (
              <p className="text-[11px] text-amber-700 font-medium px-1">
                Please select your delivery town first to calculate accurate delivery charges and delivery timelines.
              </p>
            )}
          </div>

          {/* Address Input Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex justify-between">
                <span>Full Name *</span>
                {errors.fullName && <span className="text-red-500 text-[11px]">{errors.fullName}</span>}
              </label>
              <input
                id="fullName-input"
                type="text"
                placeholder="e.g. Ramtanu Mal"
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                className="w-full h-11 px-3.5 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm font-medium focus:ring-2 focus:ring-blue-500/20 text-slate-900"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex justify-between">
                <span>Mobile Number *</span>
                {errors.phone && <span className="text-red-500 text-[11px]">{errors.phone}</span>}
              </label>
              <input
                id="phone-input"
                type="tel"
                placeholder="e.g. +91 9876543210"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full h-11 px-3.5 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm font-medium focus:ring-2 focus:ring-blue-500/20 text-slate-900"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Flat / House No., Apartment & Building
            </label>
            <input
              type="text"
              placeholder="e.g. Flat 3B, Sunshine Apartments"
              value={form.addressLine1}
              onChange={(e) => setForm({ ...form, addressLine1: e.target.value })}
              className="w-full h-11 px-3.5 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm font-medium focus:ring-2 focus:ring-blue-500/20 text-slate-900"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex justify-between">
              <span>Street Address & Area *</span>
              {errors.addressLine2 && <span className="text-red-500 text-[11px]">{errors.addressLine2}</span>}
            </label>
            <input
              id="addressLine2-input"
              type="text"
              placeholder="e.g. Station Road, Sector 2"
              value={form.addressLine2}
              onChange={(e) => setForm({ ...form, addressLine2: e.target.value })}
              className="w-full h-11 px-3.5 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm font-medium focus:ring-2 focus:ring-blue-500/20 text-slate-900"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex justify-between">
              <span>Landmark *</span>
              {errors.landmark && <span className="text-red-500 text-[11px]">{errors.landmark}</span>}
            </label>
            <input
              id="landmark-input"
              type="text"
              placeholder="e.g. Near Railway Gate"
              value={form.landmark}
              onChange={(e) => setForm({ ...form, landmark: e.target.value })}
              className="w-full h-11 px-3.5 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm font-medium focus:ring-2 focus:ring-blue-500/20 text-slate-900"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex justify-between">
                <span>PIN Code *</span>
                {errors.postalCode && <span className="text-red-500 text-[11px]">{errors.postalCode}</span>}
              </label>
              <input
                id="postalCode-input"
                type="text"
                placeholder="e.g. 712410"
                value={form.postalCode}
                onChange={(e) => setForm({ ...form, postalCode: e.target.value })}
                className="w-full h-11 px-3.5 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm font-medium focus:ring-2 focus:ring-blue-500/20 text-slate-900"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                State / Region *
              </label>
              <input
                id="state-input"
                type="text"
                placeholder="e.g. WEST BENGAL"
                value={form.state}
                onChange={(e) => setForm({ ...form, state: e.target.value })}
                className="w-full h-11 px-3.5 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm font-bold text-slate-900 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Address Tag
              </label>
              <div className="flex gap-2">
                {(["Home", "Work", "Other"] as const).map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setForm({ ...form, addressTag: tag })}
                    className={`flex-1 h-11 rounded-xl text-xs font-bold transition-all border ${
                      form.addressTag === tag
                        ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                        : "bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100"
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

          {/* Save this address or update in address book */}
          {selectedAddressId && selectedAddressId !== "new" ? (
            <div className="pt-3 border-t border-slate-100 flex flex-col gap-1.5">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={updateSavedAddressInBook}
                  onChange={(e) => setUpdateSavedAddressInBook(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-xs sm:text-sm font-semibold text-slate-700">
                  Update this saved address in my address book for future orders
                </span>
              </label>
              <p className="text-[11px] text-slate-500 pl-6">
                If unchecked, edits apply to this order only while preserving your saved address book entry.
              </p>
            </div>
          ) : (
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={saveAddressForFuture}
                  onChange={(e) => setSaveAddressForFuture(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-xs sm:text-sm font-semibold text-slate-700">
                  Save this address for future orders
                </span>
              </label>
              <span className="text-[11px] text-slate-400 font-medium hidden sm:inline">
                Saved automatically after order confirmation
              </span>
            </div>
          )}

          {/* Delivery Estimate & Scheduling Card (Asia/Kolkata) */}
          <div className="mt-2 p-4 bg-emerald-50/70 border border-emerald-200/90 rounded-2xl flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Truck className="w-4 h-4 text-emerald-700 shrink-0" />
                <span className="text-xs font-bold text-emerald-950 uppercase tracking-wide">
                  Target Delivery: {formatReadableDateIST(deliveryEstimate.maxDate)}
                </span>
              </div>
              <span className="text-[10px] font-extrabold uppercase bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full self-start sm:self-auto">
                {deliveryEstimate.minDays}-{deliveryEstimate.maxDays} Calendar Days
              </span>
            </div>
            <p className="text-[11px] text-emerald-800 leading-relaxed">
              Calculated in India Standard Time (Asia/Kolkata). {deliveryEstimate.isPastCutoff ? "Orders placed after 6:00 PM IST begin processing on the following business day." : "Guaranteed fast dispatch from our local hub."}
            </p>

            {/* Customer Scheduled Delivery Selection */}
            {availableScheduledDates.length > 0 && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-emerald-200/70">
                <label htmlFor="scheduled-date-select" className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-emerald-700" />
                  <span>Choose Delivery Date (Optional):</span>
                </label>
                <select
                  id="scheduled-date-select"
                  value={scheduledDeliveryDate}
                  onChange={(e) => setScheduledDeliveryDate(e.target.value)}
                  className="text-xs font-bold bg-white border border-emerald-300 text-slate-900 rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs"
                >
                  <option value="">Earliest Delivery ({formatReadableDateIST(deliveryEstimate.maxDate)})</option>
                  {availableScheduledDates.map((d) => (
                    <option key={d.dateString} value={d.dateString}>
                      {d.readableString} {d.isWeekend ? "(Weekend Delivery)" : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Step 1 Completion / Continue to Payment CTA */}
          <div className="mt-2 pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 bg-blue-50/50 p-4 rounded-2xl border border-blue-100">
            <div className="text-xs text-slate-700">
              <span className="font-extrabold text-slate-900 block">Step 1 Completed</span>
              <span>Delivering to <strong>{form.fullName || "Customer"}</strong> ({form.city || "TARKESWAR"}, {form.state || "WEST BENGAL"} - {form.postalCode || "PIN"})</span>
            </div>
            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={handleContinueToPayment}
              className="w-full sm:w-auto px-6 py-2.5 text-xs sm:text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-md flex items-center justify-center gap-2 shrink-0 transition-transform active:scale-95"
            >
              <span>Continue to Payment</span>
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </section>
        )}

        {/* ============================================================== */}
        {/* STEP 2: PAYMENT & REVIEW FLOW */}
        {/* ============================================================== */}
        {checkoutStep === "payment" && (
          <>
            {/* Top Back Navigation & Confirmed Address Summary Card */}
            <div className="bg-white border border-slate-200 shadow-sm rounded-3xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setCheckoutStep("address");
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  className="p-2 -ml-1 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors flex items-center gap-1.5 text-xs font-bold shrink-0"
                  title="Back to delivery address"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Change Address</span>
                </button>
                <div className="border-l border-slate-200 pl-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-900">{form.fullName || "Customer"}</span>
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                      Delivery Address Confirmed
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-0.5 line-clamp-1">
                    {[
                      form.addressLine1,
                      form.landmark,
                      form.city,
                      `${form.state || "WEST BENGAL"} - ${form.postalCode}`,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setCheckoutStep("address");
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className="text-xs font-semibold self-end sm:self-auto shrink-0"
              >
                Edit Address
              </Button>
            </div>

        {/* ============================================================== */}
        {/* 2. BILL DETAILS / ORDER SUMMARY (Blinkit Order #2 - BEFORE Payment!) */}
        {/* ============================================================== */}
        <section className="bg-white border border-slate-200 shadow-sm rounded-3xl p-5 sm:p-7 flex flex-col gap-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100 font-bold shrink-0">
                2
              </div>
              <div>
                <h2 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-indigo-600" /> Bill Details &amp; Items
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {checkoutItems.length} item(s) in this order
                </p>
              </div>
            </div>
            <span className="text-xs font-bold px-2.5 py-1 bg-slate-100 rounded-lg text-slate-700">
              {checkoutItems.reduce((acc, i) => acc + i.quantity, 0)} Units
            </span>
          </div>

          {/* Cart Item Cards (Blinkit Compact Horizontal Style) */}
          <div className="flex flex-col divide-y divide-slate-100 border border-slate-100 rounded-2xl overflow-hidden">
            {checkoutItems.map((item) => {
              const itemMrp = item.mrp || item.price;
              const itemSavings = Math.max(0, itemMrp - item.price) * item.quantity;
              return (
                <div key={item.id} className="flex gap-3 p-3.5 bg-slate-50/40 hover:bg-slate-50 transition-colors">
                  <div className="relative w-14 h-16 rounded-xl bg-white border border-slate-200 overflow-hidden shrink-0">
                    <Image src={item.image} alt={item.title} fill className="object-cover" />
                    <div className="absolute bottom-0 right-0 px-1.5 py-0.2 bg-slate-900 text-white text-[10px] font-bold rounded-tl">
                      x{item.quantity}
                    </div>
                  </div>

                  <div className="flex-1 flex flex-col justify-center min-w-0">
                    <h3 className="font-bold text-xs sm:text-sm text-slate-900 truncate">{item.title}</h3>
                    {item.variantInfo && (
                      <span className="text-[11px] text-slate-500 mt-0.5 truncate">{item.variantInfo}</span>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs font-black text-slate-900">{formatCurrency(item.price)}</span>
                      {itemMrp > item.price && (
                        <span className="text-[11px] text-slate-400 line-through">
                          {formatCurrency(itemMrp)}
                        </span>
                      )}
                      {itemSavings > 0 && (
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                          Save {formatCurrency(itemSavings)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="text-right shrink-0 flex flex-col justify-center">
                    <span className="text-xs sm:text-sm font-black text-slate-900">
                      {formatCurrency(item.price * item.quantity)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bill Line Items Breakdown */}
          <div className="bg-slate-50/70 p-4 rounded-2xl border border-slate-200/80 flex flex-col gap-2.5 text-xs">
            <div className="flex justify-between text-slate-600">
              <span>Items Total (MRP)</span>
              <span className="font-semibold text-slate-800">{formatCurrency(itemsMRP)}</span>
            </div>

            {productDiscountTotal > 0 && (
              <div className="flex justify-between text-emerald-600 font-semibold">
                <span>Product Listing Discount</span>
                <span>-{formatCurrency(productDiscountTotal)}</span>
              </div>
            )}

            {appliedCoupon && couponDiscountAmount > 0 && (
              <div className="flex justify-between text-emerald-600 font-semibold">
                <span>Coupon ({appliedCoupon.code})</span>
                <span>-{formatCurrency(couponDiscountAmount)}</span>
              </div>
            )}

            <div className="flex justify-between text-slate-700 font-medium pt-1.5 border-t border-dashed border-slate-200">
              <span>Item Subtotal</span>
              <span className="font-bold text-slate-900">{formatCurrency(subtotalAfterCoupon)}</span>
            </div>

            <div className="flex justify-between items-center text-slate-600">
              <span>Delivery Charge {form.city ? `(${form.city})` : "(Select City)"}</span>
              <span className="font-semibold text-slate-900">
                {form.city ? (
                  calculatedDeliveryFee === 0 ? (
                    <span className="text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded">FREE</span>
                  ) : (
                    formatCurrency(calculatedDeliveryFee)
                  )
                ) : (
                  <span className="text-amber-600 text-xs font-semibold">Select city</span>
                )}
              </span>
            </div>

            <div className="flex justify-between text-slate-600">
              <span>Taxes &amp; Fees</span>
              <span className="font-semibold text-slate-900">{formatCurrency(calculatedTax)}</span>
            </div>

            {walletAmountApplied > 0 && (
              <div className="flex justify-between text-purple-700 font-bold bg-purple-50/60 p-2 rounded-lg border border-purple-200">
                <span>Wallet Balance Applied</span>
                <span>-{formatCurrency(walletAmountApplied)}</span>
              </div>
            )}

            <div className="flex justify-between items-center pt-2 border-t border-slate-300 text-sm font-extrabold text-slate-900">
              <span>To Pay</span>
              <span className="text-base sm:text-lg font-black text-slate-900">{formatCurrency(remainingPayable)}</span>
            </div>
          </div>
        </section>

        {/* ============================================================== */}
        {/* 3. SAVINGS & COUPONS (Blinkit Order #3) */}
        {/* ============================================================== */}
        <section className="bg-white border border-slate-200 shadow-sm rounded-3xl p-5 sm:p-7 flex flex-col gap-4">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100 font-bold shrink-0">
              3
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
                <TicketPercent className="w-5 h-5 text-emerald-600" /> Savings &amp; Offers
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Apply discount coupons or claim marketplace promos
              </p>
            </div>
          </div>

          {/* Prominent Savings Banner */}
          {totalSavings > 0 && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3.5 flex items-center gap-2.5 text-emerald-900 text-xs font-bold shadow-xs">
              <Sparkles className="w-4.5 h-4.5 text-emerald-600 shrink-0" />
              <span>🎉 You are saving {formatCurrency(totalSavings)} on this order!</span>
            </div>
          )}

          {appliedCoupon ? (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between text-xs">
              <div className="flex items-center gap-2.5">
                <Tag className="w-4 h-4 text-emerald-600 shrink-0" />
                <div>
                  <span className="font-mono font-bold text-emerald-950 text-sm block">
                    {appliedCoupon.code}
                  </span>
                  <span className="text-emerald-700 font-semibold text-[11px]">
                    Discount applied: {formatCurrency(couponDiscountAmount)}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={handleRemoveCoupon}
                className="p-1.5 hover:bg-emerald-100 rounded-lg text-emerald-800 transition-colors"
                title="Remove Coupon"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <form onSubmit={handleApplyCoupon} className="flex gap-2">
              <input
                type="text"
                placeholder="Enter Coupon Code (e.g. WELCOME10)"
                value={couponInput}
                onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                className="flex-1 px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-bold uppercase focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-slate-900"
              />
              <Button
                type="submit"
                variant="primary"
                disabled={isValidatingCoupon || !couponInput.trim()}
                className="px-4 py-2.5 text-xs font-bold shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {isValidatingCoupon ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Apply"}
              </Button>
            </form>
          )}

          {/* Available Coupons list */}
          {availableCoupons.length > 0 && !appliedCoupon && (
            <div className="flex flex-col gap-2 pt-2 border-t border-slate-100">
              <span className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
                Applicable Coupons
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {availableCoupons.map((c) => (
                  <div
                    key={c.id}
                    className="p-3 bg-slate-50 border border-emerald-200/80 rounded-xl flex items-center justify-between shadow-2xs hover:border-emerald-500 transition-all"
                  >
                    <div className="flex items-start gap-2">
                      <Tag className="w-3.5 h-3.5 text-emerald-600 mt-0.5 shrink-0" />
                      <div>
                        <span className="font-mono font-bold text-slate-900 text-xs">{c.code}</span>
                        <span className="text-[10px] text-slate-500 block">
                          {c.description || "Save on your order"}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleApplyCoupon(c.code)}
                      className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold shrink-0"
                    >
                      APPLY
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {couponMessage && (
            <p
              className={`text-xs font-semibold ${
                couponMessage.type === "success" ? "text-emerald-700" : "text-red-600"
              }`}
            >
              {couponMessage.text}
            </p>
          )}
        </section>

        {/* ============================================================== */}
        {/* 4. GSTIN (if applicable) (Blinkit Order #4) */}
        {/* ============================================================== */}
        <section className="bg-white border border-slate-200 shadow-sm rounded-3xl p-5 sm:p-7 flex flex-col gap-3">
          <button
            type="button"
            onClick={() => setShowGstinInput(!showGstinInput)}
            className="flex items-center justify-between w-full text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100 font-bold shrink-0">
                4
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-extrabold text-slate-900 flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-amber-600" /> Business GSTIN (Optional)
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Claim input tax credit on business purchases
                </p>
              </div>
            </div>
            {showGstinInput ? (
              <ChevronUp className="w-5 h-5 text-slate-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-slate-400" />
            )}
          </button>

          <AnimatePresence>
            {showGstinInput && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="pt-2 flex flex-col gap-1.5"
              >
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Enter 15-Digit GST Identification Number
                </label>
                <input
                  type="text"
                  placeholder="e.g. 19AAAAA0000A1Z5"
                  maxLength={15}
                  value={gstin}
                  onChange={(e) => setGstin(e.target.value.toUpperCase())}
                  className="w-full h-11 px-3.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-bold uppercase focus:ring-2 focus:ring-amber-500/20 text-slate-900"
                />
                <span className="text-[11px] text-slate-400 font-medium">
                  Your business GST invoice will be automatically generated upon order completion.
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {/* ============================================================== */}
        {/* 5. DELIVERY INSTRUCTIONS (Blinkit Order #5) */}
        {/* ============================================================== */}
        <section className="bg-white border border-slate-200 shadow-sm rounded-3xl p-5 sm:p-7 flex flex-col gap-4">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
            <div className="w-10 h-10 rounded-2xl bg-cyan-50 text-cyan-600 flex items-center justify-center border border-cyan-100 font-bold shrink-0">
              5
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
                <MessageSquareQuote className="w-5 h-5 text-cyan-600" /> Delivery Instructions
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Preferences for the delivery partner upon arrival
              </p>
            </div>
          </div>

          {/* Quick Instruction Chips */}
          <div className="flex flex-wrap gap-2">
            {DELIVERY_INSTRUCTION_CHIPS.map((chip) => {
              const isSelected = selectedInstructionChips.includes(chip);
              return (
                <button
                  key={chip}
                  type="button"
                  onClick={() => toggleInstructionChip(chip)}
                  className={`text-xs px-3 py-1.5 rounded-xl font-semibold transition-all border ${
                    isSelected
                      ? "bg-cyan-600 text-white border-cyan-600 shadow-xs"
                      : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  {isSelected ? `✓ ${chip}` : `+ ${chip}`}
                </button>
              );
            })}
          </div>

          <textarea
            placeholder="Add any specific instructions (e.g. Ring phone once at gate, drop on porch)"
            rows={2}
            value={deliveryInstructions}
            onChange={(e) => setDeliveryInstructions(e.target.value)}
            className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm font-medium focus:ring-2 focus:ring-cyan-500/20 text-slate-900 resize-none"
          />
        </section>

        {/* ============================================================== */}
        {/* 6. OPTIONAL DONATION / TIP SECTION (Blinkit Order #6) */}
        {/* ============================================================== */}
        <section className="bg-white border border-slate-200 shadow-sm rounded-3xl p-5 sm:p-7 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-100 font-bold shrink-0">
              6
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
                <HeartHandshake className="w-5 h-5 text-rose-600" /> Delivery Partner Support
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Thank your delivery partner for rain or shine service
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            {[
              { label: "Thank You Note", val: null },
              { label: "Give 5-Star Rating", val: 5 },
              { label: "Cold Water Bottle", val: 10 },
              { label: "Express Appreciation", val: 20 },
            ].map((tip) => {
              const active = selectedTip === tip.val;
              return (
                <button
                  key={tip.label}
                  type="button"
                  onClick={() => setSelectedTip(active ? null : tip.val)}
                  className={`text-xs px-3.5 py-1.5 rounded-xl font-bold transition-all border ${
                    active
                      ? "bg-rose-600 text-white border-rose-600 shadow-xs"
                      : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  {tip.label}
                </button>
              );
            })}
          </div>
        </section>

        {/* ============================================================== */}
        {/* 7. PAYMENT METHOD (Blinkit Order #7 - DEDICATED SECTION AFTER BILL) */}
        {/* ============================================================== */}
        <section
          id="payment-method-section"
          className={`bg-white border rounded-3xl p-5 sm:p-7 flex flex-col gap-5 transition-all duration-300 ${
            paymentHighlighted
              ? "border-blue-600 ring-4 ring-blue-500/30 shadow-xl"
              : "border-slate-200 shadow-sm"
          }`}
        >
          <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100 font-bold shrink-0">
              7
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-blue-600" /> Payment Method
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Select your preferred way to pay (Online or Cash on Delivery)
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            {/* Optional Wallet Balance Card */}
            <div className="p-4 rounded-2xl bg-purple-50/70 border border-purple-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-start sm:items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
                  <Banknote className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-sm text-purple-950">
                      Vendosmith Wallet
                    </span>
                    <span className="font-black text-purple-700 bg-white px-2 py-0.5 rounded-md border border-purple-200">
                      {formatCurrency(walletBalance)}
                    </span>
                  </div>
                  <p className="text-purple-700/80 text-[11px] mt-0.5">
                    {walletBalance > 0
                      ? `Apply up to ${formatCurrency(Math.min(walletBalance, grandTotal))} towards this order.`
                      : "No wallet funds available currently. Earn credits from refunds & returns."}
                  </p>
                </div>
              </div>

              {walletBalance > 0 && (
                <label className="flex items-center gap-2 cursor-pointer select-none bg-white px-3 py-2 rounded-xl border border-purple-300 font-bold text-purple-900 hover:bg-purple-50 transition-colors shadow-2xs">
                  <input
                    type="checkbox"
                    checked={useWalletBalance}
                    onChange={(e) => setUseWalletBalance(e.target.checked)}
                    className="w-4 h-4 accent-purple-600 rounded cursor-pointer"
                  />
                  <span>Use Wallet Balance</span>
                </label>
              )}
            </div>

            {isZeroPayable ? (
              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold flex items-center gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <span>
                  100% of order covered by your wallet balance! No external payment or COD needed.
                </span>
              </div>
            ) : null}

            {/* Online Payment via Cashfree */}
            <label
              onClick={() => setForm({ ...form, paymentMethod: "ONLINE" })}
              className={`flex items-start justify-between p-4 sm:p-5 border rounded-2xl cursor-pointer transition-all ${
                form.paymentMethod === "ONLINE"
                  ? "border-blue-600 bg-blue-50/40 ring-2 ring-blue-500/20 shadow-xs"
                  : "border-slate-200 hover:border-slate-300 bg-white"
              }`}
            >
              <div className="flex items-start gap-3.5">
                <input
                  type="radio"
                  name="paymentMethod"
                  checked={form.paymentMethod === "ONLINE"}
                  onChange={() => setForm({ ...form, paymentMethod: "ONLINE" })}
                  className="w-4 h-4 mt-1 accent-blue-600"
                />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-slate-900 text-sm sm:text-base flex items-center gap-2">
                      <CreditCard className="w-5 h-5 text-blue-600" /> Online Payment (UPI / QR / Cards / NetBanking)
                    </span>
                    <span className="text-[10px] font-bold bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
                      Recommended
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    Pay securely via Cashfree gateway. Supports Google Pay, PhonePe, Paytm, all Cards &amp; NetBanking.
                  </p>
                </div>
              </div>
            </label>

            {/* Cash on Delivery (COD) */}
            <label
              onClick={() => setForm({ ...form, paymentMethod: "COD" })}
              className={`flex items-start justify-between p-4 sm:p-5 border rounded-2xl cursor-pointer transition-all ${
                form.paymentMethod === "COD"
                  ? "border-blue-600 bg-blue-50/40 ring-2 ring-blue-500/20 shadow-xs"
                  : "border-slate-200 hover:border-slate-300 bg-white"
              }`}
            >
              <div className="flex items-start gap-3.5">
                <input
                  type="radio"
                  name="paymentMethod"
                  checked={form.paymentMethod === "COD"}
                  onChange={() => setForm({ ...form, paymentMethod: "COD" })}
                  className="w-4 h-4 mt-1 accent-blue-600"
                />
                <div>
                  <span className="font-extrabold text-slate-900 text-sm sm:text-base flex items-center gap-2">
                    <Banknote className="w-5 h-5 text-emerald-600" /> Cash on Delivery (COD)
                  </span>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    Pay cash in hand to the delivery partner when your package arrives at your doorstep.
                  </p>
                </div>
              </div>
            </label>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-400 pt-1">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>256-Bit SSL Encrypted &amp; Authoritative Server Verified Payment</span>
          </div>
        </section>
        </>
        )}
      </div>

      {/* ============================================================== */}
      {/* 8. FINAL STICKY PLACE ORDER / PAY CTA BAR (Blinkit Compact Style) */}
      {/* Strictly rendered ONLY during checkoutStep === 'payment' */}
      {/* ============================================================== */}
      {checkoutStep === "payment" && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-2xl py-3 px-4 sm:px-8 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto max-w-4xl flex items-center justify-between gap-4">
            <div className="flex flex-col">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                {isZeroPayable
                  ? "Paying 100% via Wallet"
                  : form.paymentMethod === "ONLINE"
                  ? "Paying via Online"
                  : form.paymentMethod === "COD"
                  ? "Paying via Cash on Delivery"
                  : "Select Payment Method"}
              </span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl sm:text-2xl font-black text-slate-900">
                  {formatCurrency(remainingPayable)}
                </span>
                <span className="text-[11px] text-slate-400 font-semibold hidden sm:inline">
                  (Inclusive of all taxes)
                </span>
              </div>
            </div>

            <Button
              variant="primary"
              size="lg"
              onClick={handlePlaceOrder}
              isLoading={isProcessing}
              disabled={isProcessing || (!isZeroPayable && !form.paymentMethod)}
              className="px-6 sm:px-10 py-3 sm:py-3.5 text-sm sm:text-base font-extrabold shadow-lg shadow-blue-500/25 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isProcessing
                ? "Processing..."
                : isZeroPayable
                ? "Pay ₹0 with Wallet & Place Order"
                : !form.paymentMethod
                ? "Select Payment Method to Proceed"
                : form.paymentMethod === "ONLINE"
                ? `Pay Now • ${formatCurrency(remainingPayable)}`
                : `Place Order • ${formatCurrency(remainingPayable)}`}
            </Button>
          </div>
        </div>
      )}

      {/* Add / Edit Address Modal */}
      <Modal
        isOpen={isAddressModalOpen}
        onClose={() => setIsAddressModalOpen(false)}
        title={editingModalAddress ? "Edit Delivery Address" : "Add New Delivery Address"}
      >
        <form onSubmit={handleSaveModalAddress} className="space-y-4 pt-1">
          {addressModalError && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-600 flex items-center gap-2">
              <span className="font-semibold">Error:</span> {addressModalError}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              Full Name *
            </label>
            <input
              type="text"
              required
              value={addressModalData.full_name}
              onChange={(e) => setAddressModalData({ ...addressModalData, full_name: e.target.value })}
              placeholder="e.g. John Doe"
              className="w-full h-10 px-3 rounded-xl border border-slate-300 text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              Contact Phone (Optional)
            </label>
            <input
              type="tel"
              value={addressModalData.phone}
              onChange={(e) => setAddressModalData({ ...addressModalData, phone: e.target.value })}
              placeholder="10-digit mobile number"
              className="w-full h-10 px-3 rounded-xl border border-slate-300 text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              Flat / House No. / Premises *
            </label>
            <input
              type="text"
              required
              value={addressModalData.address_line1}
              onChange={(e) => setAddressModalData({ ...addressModalData, address_line1: e.target.value })}
              placeholder="House/Flat number, Building name"
              className="w-full h-10 px-3 rounded-xl border border-slate-300 text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              Street Address & Area
            </label>
            <input
              type="text"
              value={addressModalData.address_line2}
              onChange={(e) => setAddressModalData({ ...addressModalData, address_line2: e.target.value })}
              placeholder="Street, Road, Colony, or Area"
              className="w-full h-10 px-3 rounded-xl border border-slate-300 text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              Landmark / Nearby Area *
            </label>
            <input
              type="text"
              required
              value={addressModalData.landmark}
              onChange={(e) => setAddressModalData({ ...addressModalData, landmark: e.target.value })}
              placeholder="e.g. Near Tarkeswar Station / Behind Kali Temple"
              className="w-full h-10 px-3 rounded-xl border border-slate-300 text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                City / Delivery Area *
              </label>
              <select
                required
                value={addressModalData.city}
                onChange={(e) => setAddressModalData({ ...addressModalData, city: e.target.value })}
                className="w-full h-10 px-3 rounded-xl border border-slate-300 text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer bg-white"
              >
                <option value="">-- Select City / Delivery Area --</option>
                {cityRules.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name} (Delivery: ₹{c.delivery_fee})
                  </option>
                ))}
                {addressModalData.city && !cityRules.some((c) => c.name.toLowerCase() === addressModalData.city.toLowerCase()) && (
                  <option value={addressModalData.city}>{addressModalData.city}</option>
                )}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                State *
              </label>
              <input
                type="text"
                required
                value={addressModalData.state}
                onChange={(e) => setAddressModalData({ ...addressModalData, state: e.target.value })}
                className="w-full h-10 px-3 rounded-xl border border-slate-300 text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                PIN Code *
              </label>
              <input
                type="text"
                required
                maxLength={6}
                value={addressModalData.zip}
                onChange={(e) => setAddressModalData({ ...addressModalData, zip: e.target.value.replace(/\D/g, "") })}
                placeholder="6-digit PIN"
                className="w-full h-10 px-3 rounded-xl border border-slate-300 text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                Country
              </label>
              <input
                type="text"
                readOnly
                value={addressModalData.country}
                className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-slate-100 text-xs sm:text-sm text-slate-600 focus:outline-none"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 pt-2 cursor-pointer">
            <input
              type="checkbox"
              checked={addressModalData.is_default}
              onChange={(e) => setAddressModalData({ ...addressModalData, is_default: e.target.checked })}
              className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-xs sm:text-sm font-semibold text-slate-700">
              Set as default delivery address
            </span>
          </label>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsAddressModalOpen(false)}
              disabled={isSavingModalAddress}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              isLoading={isSavingModalAddress}
              disabled={isSavingModalAddress}
            >
              {editingModalAddress ? "Update Address" : "Save Address"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

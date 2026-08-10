"use client";

import React, { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/context/AuthContext";
import { useCart } from "@/lib/context/CartContext";
import { formatCurrency } from "@/lib/utils";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/Button";
import {
  CircleCheckBig,
  MapPin,
  LocateFixed,
  Loader2,
  Search,
  CheckCircle2,
  CreditCard,
  Banknote,
  Navigation,
  ExternalLink,
  AlertTriangle,
  Info,
  Building2,
  PhoneCall,
  User,
  Mail,
  Home,
  Briefcase,
  MapPinOff,
  Compass,
} from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";

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

const STEPS = ["Shipping & Location", "Payment Method", "Review Order"];

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

export default function CheckoutPage() {
  const { items, subtotal, clearCart } = useCart();
  const [currentStep, setCurrentStep] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [locationAccuracy, setLocationAccuracy] = useState<number | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);

  // Idempotency Single Order Guard
  const isSubmittingRef = useRef(false);

  // Admin-controlled Rules State
  const [cityRules, setCityRules] = useState<CityRule[]>(DEFAULT_CITIES);
  const [productTaxMap, setProductTaxMap] = useState<Map<string, number>>(new Map());
  const [productDeliveryMap, setProductDeliveryMap] = useState<Map<string, number>>(new Map());
  const [globalTaxRate, setGlobalTaxRate] = useState(0);
  const [freeDeliveryThreshold, setFreeDeliveryThreshold] = useState(500);

  // Geocoding Search State
  const [locationSearch, setLocationSearch] = useState("");
  const [searchResults, setSearchResults] = useState<GeocodingSearchResult[]>([]);
  const [isSearchingLocation, setIsSearchingLocation] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchNotice, setSearchNotice] = useState<string | null>(null);
  const [suggestedAreas, setSuggestedAreas] = useState<string[]>([]);
  const [selectedDisplayAddress, setSelectedDisplayAddress] = useState<string>("");

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
    city: "TARKESWAR",
    postalCode: "",
    latitude: null as number | null,
    longitude: null as number | null,
    addressTag: "Home" as "Home" | "Work" | "Other",
    paymentMethod: "COD" as "COD" | "ONLINE",
  });

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login?redirect=/checkout");
    }
  }, [user, authLoading, router]);

  // Load Admin Configurations for Delivery Cities & Fees, Tax Rates, and Thresholds
  useEffect(() => {
    async function loadAdminConfiguration() {
      try {
        // 1. Active Delivery Cities & Fees
        const { data: citiesData } = await supabase
          .from("delivery_cities")
          .select("name, delivery_fee")
          .eq("is_active", true)
          .order("name", { ascending: true });

        if (citiesData && citiesData.length > 0) {
          const rules: CityRule[] = citiesData.map((c: any) => ({
            name: c.name,
            delivery_fee: Number(c.delivery_fee ?? 40),
          }));
          setCityRules(rules);
          if (!rules.some((r) => r.name === form.city)) {
            setForm((prev) => ({ ...prev, city: rules[0].name }));
          }
        }

        // 2. Product & Category Tax / Delivery Rules
        if (items.length > 0) {
          const productIds = items.map((i) => i.productId);
          const { data: prodsData } = await supabase
            .from("products")
            .select("id, tax_rate, delivery_fee, category_id, categories(tax_rate)")
            .in("id", productIds);

          const taxMap = new Map<string, number>();
          const delivMap = new Map<string, number>();

          (prodsData || []).forEach((p: any) => {
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

        // 3. Global Settings
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
  }, [items]);

  // Live Location Search via Geocoding (Nominatim API)
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
        // Primary Query: Exact user search query
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
          // Fallback Query: Query combined with selected city/area context
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
            // NO match found: Do NOT fabricate coordinates! Provide useful suggestions.
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

  // Calculate Admin-driven Tax & Delivery Charge
  const calculatedTax = items.reduce((acc, item) => {
    const rate = productTaxMap.get(item.productId) ?? globalTaxRate;
    const itemTotal = item.price * item.quantity;
    return acc + (itemTotal * rate) / 100;
  }, 0);

  const selectedCityRule = cityRules.find((c) => c.name === form.city) || {
    name: form.city,
    delivery_fee: 40,
  };

  let calculatedDeliveryFee = selectedCityRule.delivery_fee;

  if (subtotal >= freeDeliveryThreshold && freeDeliveryThreshold > 0) {
    calculatedDeliveryFee = 0;
  } else {
    let maxProductFee: number | null = null;
    items.forEach((item) => {
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

  const grandTotal = subtotal + calculatedTax + calculatedDeliveryFee;

  const validateAddressForm = (): boolean => {
    const newErrors: {
      fullName?: string;
      phone?: string;
      addressLine2?: string;
      landmark?: string;
      city?: string;
      postalCode?: string;
    } = {};

    if (!form.fullName.trim()) {
      newErrors.fullName = "Full Name is required";
    }
    if (!form.phone.trim()) {
      newErrors.phone = "Mobile Number is required";
    }
    if (!form.addressLine2.trim()) {
      newErrors.addressLine2 = "Street / Area is required";
    }
    if (!form.landmark.trim()) {
      newErrors.landmark = "Landmark is required";
    }
    if (!form.city.trim()) {
      newErrors.city = "City / Area is required";
    }
    if (!form.postalCode.trim()) {
      newErrors.postalCode = "Postal / PIN Code is required";
    }

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

  const nextStep = () => setCurrentStep((prev) => Math.min(prev + 1, STEPS.length - 1));
  const prevStep = () => setCurrentStep((prev) => Math.max(prev - 1, 0));

  const handleSaveAndContinue = () => {
    if (validateAddressForm()) {
      nextStep();
    } else {
      addToast({
        title: "Missing Required Fields",
        description: "Please fill in all required address fields marked with * before continuing.",
        type: "error",
      });
    }
  };

  // Reverse Geocode Helper Function
  const reverseGeocode = async (lat: number, lng: number) => {
    try {
      const revUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`;
      const res = await fetch(revUrl);
      if (res.ok) {
        const data = await res.json();
        if (data && data.display_name) {
          setSelectedDisplayAddress(data.display_name);

          // Pre-fill address fields if customer hasn't typed detailed line
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

          // Auto match city if present in address
          const upperDisplay = data.display_name.toUpperCase();
          const matched = cityRules.find((c) => upperDisplay.includes(c.name));
          if (matched) {
            setForm((prev) => ({ ...prev, city: matched.name }));
          }
        }
      }
    } catch (e) {
      console.warn("Reverse geocoding error:", e);
      // Even if reverse geocode fails, keep valid GPS coordinates!
    }
  };

  // Browser Geolocation Handler with High Accuracy
  const handleGetCurrentLocation = () => {
    setLocationError(null);

    if (!navigator.geolocation) {
      const msg = "Unable to determine your current location. Please search your address manually.";
      setLocationError(msg);
      addToast({
        title: "Location Unavailable",
        description: msg,
        type: "error",
      });
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

        // Perform reverse geocoding into readable address
        await reverseGeocode(lat, lng);

        addToast({
          title: accuracyMeters <= 500 ? "Location Captured via GPS" : "Location Captured (Approximate)",
          description: `Coordinates (${lat.toFixed(5)}, ${lng.toFixed(5)}). Please verify your street address & landmark below.`,
          type: accuracyMeters <= 500 ? "success" : "info",
        });
      },
      (error) => {
        setIsLocating(false);
        let errorMsg = "";

        if (error.code === error.PERMISSION_DENIED) {
          errorMsg = "Location permission was denied. Please allow location access or search your address manually.";
        } else {
          errorMsg = "Unable to determine your current location. Please search your address manually.";
        }

        setLocationError(errorMsg);
        addToast({
          title: "Location Error",
          description: errorMsg,
          type: "error",
        });
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  };

  // Geocoding Search Result Selection Handler
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

    // Auto-select city if name matches result
    const upperDisplay = result.display_name.toUpperCase();
    const matchedCity = cityRules.find((c) => upperDisplay.includes(c.name));
    if (matchedCity) {
      setForm((prev) => ({ ...prev, city: matchedCity.name }));
    }

    setLocationSearch("");
    setShowSuggestions(false);
    addToast({
      title: "Location Selected",
      description: "Coordinates set on map. You can edit street & landmark details below.",
      type: "info",
    });
  };

  // Map Click / Drag Position Select Handler
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

  // Single Order Creation Handler
  const handlePlaceOrder = async () => {
    if (isSubmittingRef.current || isProcessing) return;
    isSubmittingRef.current = true;
    setIsProcessing(true);

    try {
      if (!validateAddressForm()) {
        setCurrentStep(0);
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

      const shippingAddress = {
        first_name: firstName,
        last_name: lastName,
        full_name: form.fullName.trim() || `${firstName} ${lastName}`.trim(),
        phone: form.phone.trim(),
        mobile_number: form.phone.trim(),
        address_line1: form.addressLine1.trim(),
        address_line2: form.addressLine2.trim(),
        landmark: form.landmark.trim(),
        google_maps_url: form.googleMapsUrl.trim(),
        latitude: form.latitude,
        longitude: form.longitude,
        city: form.city,
        postal_code: form.postalCode.trim(),
        address_tag: form.addressTag,
        country: "IN",
      };

      const initialPaymentStatus = "pending";

      // Insert single order into Supabase
      const { data: orderData, error: orderError } = await supabase
        .from("orders")
        .insert({
          user_id: user?.id,
          email: form.email.trim() || user?.email,
          shipping_address: shippingAddress,
          billing_address: shippingAddress,
          shipping_method: `${selectedCityRule.name} Delivery`,
          shipping_cost: calculatedDeliveryFee,
          subtotal: subtotal,
          tax_amount: calculatedTax,
          total: grandTotal,
          payment_method: form.paymentMethod,
          payment_status: initialPaymentStatus,
          fulfillment_status: "pending",
          internal_status: "ORDERED",
        })
        .select()
        .single();

      if (orderError || !orderData) {
        throw new Error(orderError?.message || "Failed to create order record.");
      }

      const productIds = items.map((i) => i.productId);
      const { data: productsData } = await supabase
        .from("products")
        .select("id, store_id")
        .in("id", productIds);

      const productStoreMap = new Map(productsData?.map((p: any) => [p.id, p.store_id]) || []);

      const orderItems = items.map((item) => ({
        order_id: orderData.id,
        product_id: item.productId,
        store_id: productStoreMap.get(item.productId) || null,
        title: item.title,
        quantity: item.quantity,
        unit_price: item.price,
        line_total: item.price * item.quantity,
      }));

      await supabase.from("order_items").insert(orderItems);

      clearCart();
      router.push(`/checkout/success?order=${orderData.order_number}`);
    } catch (err: any) {
      addToast({
        title: "Checkout Error",
        description: err.message || "Failed to process order. Please try again.",
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

  if (items.length === 0 && currentStep === 0 && !isProcessing) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6 bg-slate-50/50 rounded-3xl my-12 border border-dashed border-slate-300 mx-4 md:mx-16">
        <h1 className="text-3xl font-bold mb-4 text-slate-900">Your cart is empty</h1>
        <p className="text-slate-500 mb-8">Add items before checking out.</p>
        <Button variant="primary" onClick={() => router.push("/products")}>
          Continue Shopping
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/40">
      <div className="mx-auto max-w-[1440px] px-4 sm:px-6 md:px-12 py-10 w-full flex flex-col lg:flex-row gap-12">
        {/* Left Column: Checkout Form */}
        <div className="w-full lg:w-2/3 flex flex-col pt-4">
          <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900 mb-6 tracking-tight">
            Checkout
          </h1>

          {/* Step Progress Bar */}
          <div className="flex items-center gap-3 mb-10 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            {STEPS.map((step, i) => (
              <React.Fragment key={step}>
                <div className="flex items-center gap-2">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                      currentStep > i
                        ? "bg-emerald-600 text-white"
                        : currentStep === i
                        ? "bg-blue-600 text-white ring-4 ring-blue-100"
                        : "bg-slate-100 text-slate-400"
                    }`}
                  >
                    {currentStep > i ? <CircleCheckBig className="w-4 h-4" /> : i + 1}
                  </div>
                  <span
                    className={`text-xs md:text-sm font-bold ${
                      currentStep >= i ? "text-slate-900" : "text-slate-400"
                    }`}
                  >
                    {step}
                  </span>
                </div>
                {i < STEPS.length - 1 && <div className="h-[2px] flex-1 bg-slate-200" />}
              </React.Fragment>
            ))}
          </div>

          <div className="flex-1 relative">
            <AnimatePresence mode="wait">
              {/* STEP 0: Premium Address & Location System */}
              {currentStep === 0 && (
                <motion.div
                  key="step0"
                  initial={{ opacity: 0, x: -15 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 15 }}
                  className="flex flex-col gap-6"
                >
                  {/* Master Address Card */}
                  <div className="bg-white border border-slate-200/90 shadow-xl rounded-3xl p-6 md:p-8 flex flex-col gap-6">
                    {/* Header & Geolocation Button */}
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 pb-5">
                      <div className="flex items-center gap-3">
                        <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl border border-blue-100">
                          <MapPin className="w-6 h-6" />
                        </div>
                        <div>
                          <h2 className="text-xl font-extrabold text-slate-900">
                            Delivery Address
                          </h2>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Search location, use current GPS, or verify pin on map
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={handleGetCurrentLocation}
                        disabled={isLocating}
                        className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
                      >
                        {isLocating ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <LocateFixed className="w-4 h-4" />
                        )}
                        <span>{isLocating ? "Locating..." : "Use My Current Location"}</span>
                      </button>
                    </div>

                    {/* Error Banner when Location fails */}
                    {locationError && (
                      <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3 text-xs text-amber-900 shadow-sm">
                        <MapPinOff className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                        <div className="flex-1 font-medium">
                          <p className="font-bold text-amber-950 mb-0.5">{locationError}</p>
                          <p className="text-amber-800 font-medium mt-1">
                            Location not found? No problem. Please enter your delivery address manually below.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Geocoding Location Search Box */}
                    <div className="relative">
                      <label className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <Search className="w-3.5 h-3.5 text-blue-600" /> Search for your location...
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="Search e.g. Haripal Station, Tarkeswar, Ramtanu Mal..."
                          value={locationSearch}
                          onFocus={() => setShowSuggestions(true)}
                          onChange={(e) => setLocationSearch(e.target.value)}
                          className="w-full pl-4 pr-10 h-12 bg-slate-50 border border-slate-300 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-all text-slate-900"
                        />
                        {isSearchingLocation && (
                          <Loader2 className="w-4 h-4 absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 animate-spin" />
                        )}
                      </div>

                      {/* Search Suggestions Dropdown */}
                      {showSuggestions && (searchResults.length > 0 || searchNotice) && (
                        <div className="absolute top-full left-0 right-0 z-30 mt-1 bg-white border border-slate-200 rounded-2xl shadow-2xl max-h-72 overflow-y-auto divide-y divide-slate-100">
                          {searchResults.length > 0 ? (
                            searchResults.map((res) => (
                              <button
                                key={res.place_id}
                                type="button"
                                onClick={() => handleSelectGeocodedLocation(res)}
                                className="w-full text-left px-4 py-3 text-xs font-medium hover:bg-blue-50/70 flex items-start gap-2.5 text-slate-800 transition-colors"
                              >
                                <Navigation className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                                <span className="line-clamp-2 leading-relaxed">{res.display_name}</span>
                              </button>
                            ))
                          ) : searchNotice ? (
                            <div className="p-4 text-xs font-medium text-slate-600 space-y-2">
                              <div className="flex items-start gap-2 text-amber-800 font-semibold">
                                <Info className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                                <div>
                                  <span>{searchNotice}</span>
                                  <p className="text-blue-700 font-bold mt-1">
                                    Location not found? No problem. Please enter your delivery address manually below.
                                  </p>
                                </div>
                              </div>
                              {suggestedAreas.length > 0 && (
                                <div className="pt-2 border-t border-slate-100">
                                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
                                    Suggested Delivery Areas:
                                  </span>
                                  <div className="flex flex-wrap gap-1.5">
                                    {suggestedAreas.map((area, idx) => (
                                      <button
                                        key={idx}
                                        type="button"
                                        onClick={() => {
                                          setLocationSearch(area.split(" ")[0]);
                                        }}
                                        className="px-2.5 py-1 bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 rounded-lg text-xs font-medium border border-slate-200 transition-colors"
                                      >
                                        {area}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : null}
                        </div>
                      )}
                    </div>

                    {/* Interactive Leaflet Map */}
                    <div className="flex flex-col gap-2">
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

                    {/* Location Confirmation Badge Card */}
                    {form.latitude && form.longitude && (
                      <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 text-xs text-emerald-950 shadow-sm">
                        <div className="flex items-start gap-3">
                          <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                          <div>
                            <span className="font-extrabold text-sm block text-emerald-900">
                              Selected Location Confirmed
                            </span>
                            <span className="text-emerald-800 font-semibold block mt-0.5">
                              Lat: {form.latitude.toFixed(6)}, Lng: {form.longitude.toFixed(6)}
                            </span>
                            {locationAccuracy && locationAccuracy > 500 && (
                              <span className="text-[11px] font-bold text-amber-700 flex items-center gap-1 mt-1">
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                                Approximate location (±{(locationAccuracy / 1000).toFixed(1)} km). Desktop network location is not exact GPS. Please verify your address details below.
                              </span>
                            )}
                          </div>
                        </div>

                        <a
                          href={form.googleMapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold flex items-center gap-1.5 shadow-sm transition-all hover:scale-105 active:scale-95 shrink-0"
                        >
                          <ExternalLink className="w-3.5 h-3.5" /> Open in Google Maps
                        </a>
                      </div>
                    )}

                    {/* Friendly Manual Fallback Reassurance Notice */}
                    {(!form.latitude || !form.longitude || locationError) && (
                      <div className="p-3.5 bg-blue-50/70 border border-blue-200/80 rounded-2xl flex items-center gap-2.5 text-xs text-blue-950 font-medium">
                        <Info className="w-4.5 h-4.5 text-blue-600 flex-shrink-0" />
                        <span>Location not found? No problem. Please enter your delivery address manually below.</span>
                      </div>
                    )}

                    {/* Contact Info Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
                          <span className="flex items-center gap-1">
                            <User className="w-3.5 h-3.5 text-slate-400" /> Full Name *
                          </span>
                          {errors.fullName && (
                            <span className="text-red-500 font-semibold text-[11px] normal-case">
                              {errors.fullName}
                            </span>
                          )}
                        </label>
                        <input
                          id="fullName-input"
                          type="text"
                          placeholder="e.g. Ramtanu Mal"
                          value={form.fullName}
                          onChange={(e) => {
                            setForm({ ...form, fullName: e.target.value });
                            if (errors.fullName) setErrors({ ...errors, fullName: "" });
                          }}
                          className={`w-full h-12 px-4 bg-white border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 transition-all text-slate-900 ${
                            errors.fullName
                              ? "border-red-500 ring-2 ring-red-500/20"
                              : "border-slate-300 focus:ring-blue-500/20 focus:border-blue-600"
                          }`}
                        />
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
                          <span className="flex items-center gap-1">
                            <PhoneCall className="w-3.5 h-3.5 text-slate-400" /> Mobile Number *
                          </span>
                          {errors.phone && (
                            <span className="text-red-500 font-semibold text-[11px] normal-case">
                              {errors.phone}
                            </span>
                          )}
                        </label>
                        <input
                          id="phone-input"
                          type="tel"
                          placeholder="e.g. +91 9876543210"
                          value={form.phone}
                          onChange={(e) => {
                            setForm({ ...form, phone: e.target.value });
                            if (errors.phone) setErrors({ ...errors, phone: "" });
                          }}
                          className={`w-full h-12 px-4 bg-white border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 transition-all text-slate-900 ${
                            errors.phone
                              ? "border-red-500 ring-2 ring-red-500/20"
                              : "border-slate-300 focus:ring-blue-500/20 focus:border-blue-600"
                          }`}
                        />
                      </div>
                    </div>

                    {/* Email */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
                        <Mail className="w-3.5 h-3.5 text-slate-400" /> Email Address (Optional)
                      </label>
                      <input
                        id="email-input"
                        type="email"
                        placeholder="e.g. user@example.com"
                        value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                        className="w-full h-12 px-4 bg-white border border-slate-300 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-all text-slate-900"
                      />
                    </div>

                    {/* Address Lines */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
                        <Home className="w-3.5 h-3.5 text-slate-400" /> House / Flat No. & Building
                      </label>
                      <input
                        id="addressLine1-input"
                        type="text"
                        placeholder="e.g. House No. 42, Green Park Apartments"
                        value={form.addressLine1}
                        onChange={(e) => setForm({ ...form, addressLine1: e.target.value })}
                        className="w-full h-12 px-4 bg-white border border-slate-300 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-all text-slate-900"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
                        <span>Street / Area *</span>
                        {errors.addressLine2 && (
                          <span className="text-red-500 font-semibold text-[11px] normal-case">
                            {errors.addressLine2}
                          </span>
                        )}
                      </label>
                      <input
                        id="addressLine2-input"
                        type="text"
                        placeholder="e.g. Station Road, Sector 2"
                        value={form.addressLine2}
                        onChange={(e) => {
                          setForm({ ...form, addressLine2: e.target.value });
                          if (errors.addressLine2) setErrors({ ...errors, addressLine2: "" });
                        }}
                        className={`w-full h-12 px-4 bg-white border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 transition-all text-slate-900 ${
                          errors.addressLine2
                            ? "border-red-500 ring-2 ring-red-500/20"
                            : "border-slate-300 focus:ring-blue-500/20 focus:border-blue-600"
                        }`}
                      />
                    </div>

                    {/* Landmark & City (Names ONLY) */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
                          <span>Landmark *</span>
                          {errors.landmark && (
                            <span className="text-red-500 font-semibold text-[11px] normal-case">
                              {errors.landmark}
                            </span>
                          )}
                        </label>
                        <input
                          id="landmark-input"
                          type="text"
                          placeholder="e.g. Near Main Road / Near School / Near Temple"
                          value={form.landmark}
                          onChange={(e) => {
                            setForm({ ...form, landmark: e.target.value });
                            if (errors.landmark) setErrors({ ...errors, landmark: "" });
                          }}
                          className={`w-full h-12 px-4 bg-white border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 transition-all text-slate-900 ${
                            errors.landmark
                              ? "border-red-500 ring-2 ring-red-500/20"
                              : "border-slate-300 focus:ring-blue-500/20 focus:border-blue-600"
                          }`}
                        />
                        <p className="text-[11px] text-slate-500 font-medium">
                          No specific landmark? Enter a nearby recognizable place (or "N/A" if none).
                        </p>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
                          <span className="flex items-center gap-1">
                            <Building2 className="w-3.5 h-3.5 text-slate-400" /> City / Area *
                          </span>
                          {errors.city && (
                            <span className="text-red-500 font-semibold text-[11px] normal-case">
                              {errors.city}
                            </span>
                          )}
                        </label>
                        <select
                          id="city-input"
                          value={form.city}
                          onChange={(e) => {
                            setForm({ ...form, city: e.target.value });
                            if (errors.city) setErrors({ ...errors, city: "" });
                          }}
                          className={`w-full h-12 px-4 bg-white border rounded-xl text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 cursor-pointer transition-all ${
                            errors.city
                              ? "border-red-500 ring-2 ring-red-500/20"
                              : "border-slate-300 focus:ring-blue-500/20 focus:border-blue-600"
                          }`}
                        >
                          {cityRules.map((c) => (
                            <option key={c.name} value={c.name}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* PIN Code & Address Tags */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
                          <span>Postal / PIN Code *</span>
                          {errors.postalCode && (
                            <span className="text-red-500 font-semibold text-[11px] normal-case">
                              {errors.postalCode}
                            </span>
                          )}
                        </label>
                        <input
                          id="postalCode-input"
                          type="text"
                          placeholder="e.g. 712410"
                          value={form.postalCode}
                          onChange={(e) => {
                            setForm({ ...form, postalCode: e.target.value });
                            if (errors.postalCode) setErrors({ ...errors, postalCode: "" });
                          }}
                          className={`w-full h-12 px-4 bg-white border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 transition-all text-slate-900 ${
                            errors.postalCode
                              ? "border-red-500 ring-2 ring-red-500/20"
                              : "border-slate-300 focus:ring-blue-500/20 focus:border-blue-600"
                          }`}
                        />
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                          Save Address As
                        </label>
                        <div className="flex gap-2">
                          {(["Home", "Work", "Other"] as const).map((tag) => (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => setForm({ ...form, addressTag: tag })}
                              className={`flex-1 h-12 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all border ${
                                form.addressTag === tag
                                  ? "bg-blue-600 text-white border-blue-600 shadow-md"
                                  : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                              }`}
                            >
                              {tag === "Home" && <Home className="w-3.5 h-3.5" />}
                              {tag === "Work" && <Briefcase className="w-3.5 h-3.5" />}
                              {tag === "Other" && <MapPin className="w-3.5 h-3.5" />}
                              {tag}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Google Maps URL (Auto / Editable) */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                        Google Maps Location Reference URL
                      </label>
                      <input
                        type="text"
                        placeholder="https://www.google.com/maps?q=..."
                        value={form.googleMapsUrl}
                        onChange={(e) => setForm({ ...form, googleMapsUrl: e.target.value })}
                        className="w-full h-12 px-4 bg-white border border-slate-300 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-all text-slate-900"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end mt-4">
                    <Button variant="primary" size="lg" onClick={handleSaveAndContinue} className="w-full md:w-auto min-w-[220px]">
                      Save & Continue to Payment
                    </Button>
                  </div>
                </motion.div>
              )}

              {/* STEP 1: Payment Method Selection */}
              {currentStep === 1 && (
                <motion.div
                  key="step1"
                  initial={{ opacity: 0, x: -15 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 15 }}
                  className="flex flex-col gap-6"
                >
                  <div className="bg-white border border-slate-200 shadow-xl rounded-3xl p-6 md:p-8 flex flex-col gap-6">
                    <div className="flex items-center gap-3 border-b border-slate-100 pb-5">
                      <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl border border-blue-100">
                        <CreditCard className="w-6 h-6" />
                      </div>
                      <div>
                        <h2 className="text-xl font-extrabold text-slate-900">Select Payment Method</h2>
                        <p className="text-xs text-slate-500">
                          Choose how you would like to pay for your order
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col gap-4">
                      <label
                        onClick={() => setForm({ ...form, paymentMethod: "COD" })}
                        className={`flex items-start justify-between p-5 border rounded-2xl cursor-pointer transition-all ${
                          form.paymentMethod === "COD"
                            ? "border-blue-600 bg-blue-50/40 ring-2 ring-blue-500/20"
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
                            <span className="font-bold text-slate-900 flex items-center gap-2 text-base">
                              <Banknote className="w-5 h-5 text-emerald-600" /> Cash on Delivery (COD)
                            </span>
                            <p className="text-xs text-slate-500 mt-1">
                              Pay with cash upon package delivery. Payment status remains <strong>COD Pending</strong> until collected.
                            </p>
                          </div>
                        </div>
                      </label>

                      <label
                        onClick={() => setForm({ ...form, paymentMethod: "ONLINE" })}
                        className={`flex items-start justify-between p-5 border rounded-2xl cursor-pointer transition-all ${
                          form.paymentMethod === "ONLINE"
                            ? "border-blue-600 bg-blue-50/40 ring-2 ring-blue-500/20"
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
                            <span className="font-bold text-slate-900 flex items-center gap-2 text-base">
                              <CreditCard className="w-5 h-5 text-blue-600" /> Online Payment (UPI / Card / NetBanking)
                            </span>
                            <p className="text-xs text-slate-500 mt-1">
                              Pay securely via online gateway. Order initiates as <strong>Pending</strong> and updates to <strong>Paid</strong> only upon verified gateway confirmation.
                            </p>
                          </div>
                        </div>
                      </label>
                    </div>
                  </div>

                  <div className="flex justify-between mt-4">
                    <Button variant="ghost" onClick={prevStep}>
                      Back to Location
                    </Button>
                    <Button variant="primary" size="lg" onClick={nextStep} className="w-full md:w-auto min-w-[200px]">
                      Review Order
                    </Button>
                  </div>
                </motion.div>
              )}

              {/* STEP 2: Review Order & Submit */}
              {currentStep === 2 && (
                <motion.div
                  key="step2"
                  initial={{ opacity: 0, x: -15 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 15 }}
                  className="flex flex-col gap-6"
                >
                  <div className="bg-white border border-slate-200 rounded-3xl p-6 md:p-8 flex flex-col gap-6 shadow-xl">
                    <h2 className="text-xl font-extrabold text-slate-900 border-b border-slate-100 pb-4">
                      Order Summary & Confirmation
                    </h2>

                    <div className="flex justify-between border-b border-slate-100 pb-4 text-xs">
                      <div>
                        <span className="text-slate-400 uppercase tracking-widest font-bold block mb-1">
                          Deliver To ({form.addressTag})
                        </span>
                        <span className="font-bold text-slate-900 block text-base">{form.fullName}</span>
                        <span className="text-slate-600 block mt-0.5">{form.phone}</span>
                        <span className="text-slate-600 block mt-0.5">
                          {[form.addressLine1, form.addressLine2, form.landmark].filter(Boolean).join(", ")}, {form.city} ({form.postalCode})
                        </span>
                        {form.latitude && form.longitude && (
                          <span className="text-emerald-700 font-semibold block mt-1">
                            📍 Coordinates: {form.latitude.toFixed(5)}, {form.longitude.toFixed(5)}
                          </span>
                        )}
                      </div>
                      <button onClick={() => setCurrentStep(0)} className="text-blue-600 font-bold underline">
                        Change
                      </button>
                    </div>

                    <div className="flex justify-between border-b border-slate-100 pb-4 text-xs">
                      <div>
                        <span className="text-slate-400 uppercase tracking-widest font-bold block mb-1">
                          Payment Method
                        </span>
                        <span className="font-bold text-slate-900 text-base">
                          {form.paymentMethod === "COD" ? "Cash on Delivery (COD)" : "Online Payment"}
                        </span>
                        <span className="text-slate-500 block mt-0.5">
                          {form.paymentMethod === "COD"
                            ? "Initial Status: COD Pending"
                            : "Initial Status: Pending gateway verification"}
                        </span>
                      </div>
                      <button onClick={() => setCurrentStep(1)} className="text-blue-600 font-bold underline">
                        Change
                      </button>
                    </div>
                  </div>

                  <div className="flex justify-between mt-4">
                    <Button variant="ghost" onClick={prevStep}>
                      Back to Payment
                    </Button>
                    <Button
                      variant="primary"
                      size="lg"
                      onClick={handlePlaceOrder}
                      isLoading={isProcessing}
                      disabled={isProcessing}
                      className="w-full md:w-auto min-w-[220px]"
                    >
                      Place Order - {formatCurrency(grandTotal)}
                    </Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Right Column: Order Summary (Delivery Charge Shown ONLY Here) */}
        <div className="w-full lg:w-1/3 flex flex-col pt-4">
          <div className="bg-white p-8 rounded-3xl sticky top-24 border border-slate-200 shadow-xl">
            <h2 className="text-xl font-extrabold mb-6 text-slate-900">Order Summary</h2>

            <div className="flex flex-col gap-4 mb-6 border-b border-slate-100 pb-6 max-h-[300px] overflow-y-auto pr-2">
              {items.map((item) => (
                <div key={item.id} className="flex gap-4">
                  <div className="relative w-16 h-20 rounded-xl bg-slate-100 overflow-hidden flex-shrink-0 border border-slate-200">
                    <Image src={item.image} alt={item.title} fill className="object-cover" />
                    <div className="absolute -top-2 -right-2 w-5 h-5 bg-slate-900 text-white text-[10px] rounded-full flex items-center justify-center font-bold z-10">
                      {item.quantity}
                    </div>
                  </div>
                  <div className="flex flex-col flex-1 justify-center">
                    <span className="font-bold text-sm text-slate-900 line-clamp-1">{item.title}</span>
                    {item.variantInfo && (
                      <span className="text-xs text-slate-500 mt-0.5">{item.variantInfo}</span>
                    )}
                    <span className="text-xs font-semibold text-slate-700 mt-1">
                      Qty: {item.quantity} × {formatCurrency(item.price)}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Delivery Fee & Taxes Shown Exclusively Here */}
            <div className="flex flex-col gap-3 text-sm border-b border-slate-100 pb-6 mb-6">
              <div className="flex justify-between">
                <span className="text-slate-500">Subtotal</span>
                <span className="font-semibold text-slate-900">{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Delivery Fee ({form.city})</span>
                <span className="font-semibold text-slate-900">
                  {calculatedDeliveryFee === 0 ? (
                    <span className="text-emerald-600 font-bold">FREE</span>
                  ) : (
                    formatCurrency(calculatedDeliveryFee)
                  )}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Calculated Tax</span>
                <span className="font-semibold text-slate-900">{formatCurrency(calculatedTax)}</span>
              </div>
            </div>

            <div className="flex justify-between items-end">
              <span className="text-lg font-extrabold text-slate-900">Grand Total</span>
              <div className="flex flex-col items-end gap-1">
                <span className="text-xs text-slate-500">INR</span>
                <span className="text-3xl font-black text-slate-900">{formatCurrency(grandTotal)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

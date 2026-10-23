"use client";

import React, { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Cake,
  Calendar,
  IndianRupee,
  Upload,
  X,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  Loader2,
  FileImage,
  MapPin,
  User,
} from "lucide-react";
import { useAuth } from "@/lib/context/AuthContext";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";

const CAKE_TYPES = [
  "Birthday",
  "Anniversary",
  "Wedding",
  "Engagement",
  "Baby Shower",
  "Theme Cake",
  "Photo Cake",
  "Festival",
  "Other",
];

const CAKE_FLAVORS = [
  "Chocolate",
  "Vanilla",
  "Red Velvet",
  "Butterscotch",
  "Black Forest",
  "Pineapple",
  "Custom",
];

const CAKE_WEIGHTS = [
  "0.5 kg (4-6 Servings)",
  "1 kg (8-10 Servings)",
  "1.5 kg (12-14 Servings)",
  "2 kg (16-20 Servings)",
  "3 kg (24-30 Servings)",
  "Custom Weight",
];

const DELIVERY_TIME_SLOTS = [
  "Morning (9:00 AM – 12:00 PM)",
  "Afternoon (12:00 PM – 4:00 PM)",
  "Evening (4:00 PM – 8:00 PM)",
  "Night Delivery (8:00 PM – 10:00 PM)",
];

export default function CustomizeCakePage() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const router = useRouter();

  // Multi-step state: 1: Design -> 2: Date & Budget -> 3: Contact & Delivery
  const [currentStep, setCurrentStep] = useState(1);

  // Form Fields
  const [cakeType, setCakeType] = useState("Birthday");
  const [customCakeType, setCustomCakeType] = useState("");
  const [flavor, setFlavor] = useState("Chocolate");
  const [customFlavor, setCustomFlavor] = useState("");
  const [weight, setWeight] = useState("1 kg (8-10 Servings)");
  const [customWeight, setCustomWeight] = useState("");
  const [servings, setServings] = useState("");
  const [themeDescription, setThemeDescription] = useState("");
  const [messageOnCake, setMessageOnCake] = useState("");
  const [dietaryPreference, setDietaryPreference] = useState<string>("Standard");

  // Delivery & Budget
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minDateStr = tomorrow.toISOString().split("T")[0];

  const [deliveryDate, setDeliveryDate] = useState("");
  const [deliveryTime, setDeliveryTime] = useState(DELIVERY_TIME_SLOTS[2]);
  const [budgetMax, setBudgetMax] = useState("");
  const [budgetMin, setBudgetMin] = useState("");

  // Uploaded Images: array of { path: string, previewUrl: string, name: string }
  const [images, setImages] = useState<{ path: string; previewUrl: string; name: string }[]>([]);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  // Contact & Address
  const [contactName, setContactName] = useState(user?.user_metadata?.full_name || "");
  const [contactPhone, setContactPhone] = useState(user?.user_metadata?.phone || "");
  const [streetAddress, setStreetAddress] = useState("");
  const [city, setCity] = useState("Kolkata");
  const [state, setState] = useState("West Bengal");
  const [postalCode, setPostalCode] = useState("");
  const [landmark, setLandmark] = useState("");
  const [additionalNotes, setAdditionalNotes] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Handle Image Upload to secure private bucket via API
  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (!user) {
      addToast({
        title: "Sign in Required",
        description: "Please sign in to upload reference images for your cake.",
        type: "error",
      });
      return;
    }

    if (images.length >= 4) {
      addToast({
        title: "Upload Limit",
        description: "You can upload a maximum of 4 reference images.",
        type: "error",
      });
      return;
    }

    const file = files[0];

    // Check size < 10MB
    if (file.size > 10 * 1024 * 1024) {
      addToast({
        title: "File Too Large",
        description: "Image size must be less than 10MB.",
        type: "error",
      });
      return;
    }

    // Check type
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      addToast({
        title: "Invalid Format",
        description: "Only JPG, PNG, and WEBP formats are accepted.",
        type: "error",
      });
      return;
    }

    setIsUploadingImage(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/customer/custom-cake-upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to upload image.");
      }

      // Create local preview blob URL for instant UI preview
      const localPreview = URL.createObjectURL(file);

      setImages((prev) => [
        ...prev,
        {
          path: data.filePath,
          previewUrl: localPreview,
          name: file.name,
        },
      ]);

      addToast({
        title: "Image Uploaded ✓",
        description: "Reference design added securely.",
        type: "success",
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to upload image.";
      addToast({ title: "Upload Failed", description: msg, type: "error" });
    } finally {
      setIsUploadingImage(false);
      e.target.value = "";
    }
  };

  const handleRemoveImage = (indexToRemove: number) => {
    setImages((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  // Step Validation
  const validateStep1 = () => {
    if (!themeDescription.trim()) {
      addToast({
        title: "Description Required",
        description: "Please describe your desired cake design or theme.",
        type: "error",
      });
      return false;
    }
    return true;
  };

  const validateStep2 = () => {
    if (!deliveryDate) {
      addToast({
        title: "Delivery Date Required",
        description: "Please select your preferred delivery date.",
        type: "error",
      });
      return false;
    }
    const numBudget = Number(budgetMax);
    if (!budgetMax || isNaN(numBudget) || numBudget <= 0) {
      addToast({
        title: "Budget Required",
        description: "Please specify your maximum budget in Rupees (₹).",
        type: "error",
      });
      return false;
    }
    return true;
  };

  const validateStep3 = () => {
    if (!contactName.trim()) {
      addToast({ title: "Name Required", description: "Please enter your name.", type: "error" });
      return false;
    }
    if (!contactPhone.trim() || contactPhone.trim().length < 10) {
      addToast({ title: "Valid Phone Required", description: "Please enter a valid 10-digit mobile number.", type: "error" });
      return false;
    }
    if (!streetAddress.trim() || !city.trim()) {
      addToast({ title: "Address Required", description: "Please enter your delivery street and city.", type: "error" });
      return false;
    }
    return true;
  };

  const handleNext = () => {
    if (currentStep === 1 && validateStep1()) {
      setCurrentStep(2);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else if (currentStep === 2 && validateStep2()) {
      setCurrentStep(3);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      addToast({
        title: "Please Sign In",
        description: "You must be signed in to submit a custom cake request.",
        type: "error",
      });
      router.push(`/login?redirect=${encodeURIComponent("/customize-cake")}`);
      return;
    }

    if (!validateStep1() || !validateStep2() || !validateStep3()) return;

    setIsSubmitting(true);

    try {
      const resolvedCakeType = cakeType === "Other" && customCakeType ? customCakeType : cakeType;
      const resolvedFlavor = flavor === "Custom" && customFlavor ? customFlavor : flavor;
      const resolvedWeight = weight.startsWith("Custom") && customWeight ? customWeight : weight;

      const payload = {
        cake_type: resolvedCakeType,
        flavor: resolvedFlavor,
        weight: resolvedWeight,
        servings: servings || null,
        theme_description: themeDescription,
        message_on_cake: messageOnCake || null,
        preferred_delivery_date: deliveryDate,
        preferred_delivery_time: deliveryTime,
        budget_max: Number(budgetMax),
        budget_min: budgetMin ? Number(budgetMin) : null,
        reference_images: images.map((img) => img.path),
        contact_name: contactName,
        contact_phone: contactPhone,
        delivery_address: {
          address_line1: streetAddress,
          city,
          state,
          postal_code: postalCode || "700001",
          landmark: landmark || null,
        },
        dietary_notes: dietaryPreference,
        additional_instructions: additionalNotes || null,
      };

      const res = await fetch("/api/customer/custom-cakes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to submit request.");
      }

      addToast({
        title: "Custom Cake Request Submitted! 🎂",
        description: "Our bakery partners are reviewing your request. You will receive a quote shortly.",
        type: "success",
      });

      router.push(`/account/custom-cakes/${data.request.id}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to submit request.";
      addToast({ title: "Submission Error", description: msg, type: "error" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        {/* HEADER / INTRO */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 text-xs font-bold uppercase tracking-wider mb-3">
            <Cake className="w-4 h-4" /> VENDOSMITH Bespoke Bakery
          </div>
          <h1 className="text-2xl sm:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Customize Your Cake
          </h1>
          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 mt-2 max-w-lg mx-auto">
            Tell us what cake you want and we&apos;ll help you create it. Our certified bakeries will craft and deliver your vision.
          </p>
        </div>

        {/* PROGRESS STEPPER */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-sm border border-slate-200/80 dark:border-slate-800 mb-8">
          <div className="grid grid-cols-3 gap-2">
            {[
              { step: 1, title: "1. Cake Design" },
              { step: 2, title: "2. Date & Budget" },
              { step: 3, title: "3. Delivery & Contact" },
            ].map((s) => (
              <div
                key={s.step}
                className={`flex flex-col items-center text-center p-2 rounded-xl transition-all ${
                  currentStep === s.step
                    ? "bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 font-bold"
                    : currentStep > s.step
                    ? "text-emerald-600 dark:text-emerald-400 font-semibold"
                    : "text-slate-400 font-medium"
                }`}
              >
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold mb-1 ${
                    currentStep === s.step
                      ? "bg-rose-600 text-white"
                      : currentStep > s.step
                      ? "bg-emerald-600 text-white"
                      : "bg-slate-200 dark:bg-slate-800 text-slate-500"
                  }`}
                >
                  {currentStep > s.step ? "✓" : s.step}
                </div>
                <span className="text-[11px] sm:text-xs truncate w-full">{s.title}</span>
              </div>
            ))}
          </div>
        </div>

        {/* FORM CONTENT */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <AnimatePresence mode="wait">
            {/* STEP 1: CAKE DESIGN */}
            {currentStep === 1 && (
              <motion.div
                key="step-1"
                initial={{ opacity: 0, x: -15 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 15 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-slate-200/80 dark:border-slate-800">
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                    <Cake className="w-5 h-5 text-rose-600" /> Cake Type & Occasion
                  </h2>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mb-4">
                    {CAKE_TYPES.map((t) => (
                      <button
                        type="button"
                        key={t}
                        onClick={() => setCakeType(t)}
                        className={`p-3 rounded-xl text-xs font-bold border transition-all text-left flex items-center justify-between ${
                          cakeType === t
                            ? "bg-rose-50 dark:bg-rose-950/60 border-rose-500 text-rose-700 dark:text-rose-300 shadow-xs"
                            : "border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                        }`}
                      >
                        <span>{t}</span>
                        {cakeType === t && <CheckCircle2 className="w-4 h-4 text-rose-600 shrink-0" />}
                      </button>
                    ))}
                  </div>

                  {cakeType === "Other" && (
                    <input
                      type="text"
                      placeholder="Specify your cake occasion or type..."
                      value={customCakeType}
                      onChange={(e) => setCustomCakeType(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-rose-500 outline-none mb-4"
                    />
                  )}

                  {/* FLAVOR SELECTION */}
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white mt-6 mb-3">
                    Select Preferred Flavor
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                    {CAKE_FLAVORS.map((f) => (
                      <button
                        type="button"
                        key={f}
                        onClick={() => setFlavor(f)}
                        className={`p-2.5 rounded-xl text-xs font-bold border transition-all text-center ${
                          flavor === f
                            ? "bg-rose-50 dark:bg-rose-950/60 border-rose-500 text-rose-700 dark:text-rose-300 shadow-xs"
                            : "border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                        }`}
                      >
                        {f}
                      </button>
                    ))}
                  </div>

                  {flavor === "Custom" && (
                    <input
                      type="text"
                      placeholder="Specify custom flavor (e.g. Belgian Hazelnut Mousse)..."
                      value={customFlavor}
                      onChange={(e) => setCustomFlavor(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-rose-500 outline-none mb-4"
                    />
                  )}

                  {/* WEIGHT & SERVINGS */}
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white mt-6 mb-3">
                    Select Cake Weight / Size
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
                    {CAKE_WEIGHTS.map((w) => (
                      <button
                        type="button"
                        key={w}
                        onClick={() => setWeight(w)}
                        className={`p-3 rounded-xl text-xs font-bold border transition-all text-left flex items-center justify-between ${
                          weight === w
                            ? "bg-rose-50 dark:bg-rose-950/60 border-rose-500 text-rose-700 dark:text-rose-300 shadow-xs"
                            : "border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                        }`}
                      >
                        <span>{w}</span>
                        {weight === w && <CheckCircle2 className="w-4 h-4 text-rose-600 shrink-0" />}
                      </button>
                    ))}
                  </div>

                  {weight.startsWith("Custom") && (
                    <input
                      type="text"
                      placeholder="Specify weight (e.g. 5 kg multi-tier)..."
                      value={customWeight}
                      onChange={(e) => setCustomWeight(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-rose-500 outline-none mb-4"
                    />
                  )}

                  {/* SERVINGS / QUANTITY (Section E.4) */}
                  <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Expected Guest Count / Servings (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 15-20 guests, 20-25 slices"
                      value={servings}
                      onChange={(e) => setServings(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs focus:ring-2 focus:ring-rose-500 outline-none"
                    />
                  </div>
                </div>

                {/* THEME DESCRIPTION & MESSAGE */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-slate-200/80 dark:border-slate-800 space-y-4">
                  <div>
                    <label className="block text-sm font-bold text-slate-900 dark:text-white mb-1.5">
                      Describe exactly how you want your cake <span className="text-rose-600">*</span>
                    </label>
                    <textarea
                      rows={4}
                      placeholder="Provide specific details about your desired theme, colors, frosting type, tier layout, fondant figurines, or toppers..."
                      value={themeDescription}
                      onChange={(e) => setThemeDescription(e.target.value)}
                      className="w-full p-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-rose-500 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-slate-900 dark:text-white mb-1.5">
                      Name / Message on Cake (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Happy 25th Birthday Rhea! 💖"
                      value={messageOnCake}
                      onChange={(e) => setMessageOnCake(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-rose-500 outline-none"
                    />
                  </div>

                  {/* DIETARY PREFERENCE */}
                  <div>
                    <label className="block text-sm font-bold text-slate-900 dark:text-white mb-1.5">
                      Dietary Preference
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {["Standard (With Egg)", "100% Eggless", "Sugar-Free", "Vegan"].map((d) => (
                        <button
                          type="button"
                          key={d}
                          onClick={() => setDietaryPreference(d)}
                          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                            dietaryPreference === d
                              ? "bg-rose-50 dark:bg-rose-950/60 border-rose-500 text-rose-700 dark:text-rose-300"
                              : "border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400"
                          }`}
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* STEP 1 NAVIGATION */}
                <div className="flex justify-end">
                  <Button
                    type="button"
                    onClick={handleNext}
                    className="bg-rose-600 hover:bg-rose-700 text-white font-bold px-6 py-3 rounded-xl flex items-center gap-2 text-sm shadow-md"
                  >
                    <span>Continue to Date & Budget</span>
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>
              </motion.div>
            )}

            {/* STEP 2: DATE, BUDGET & REFERENCE IMAGES */}
            {currentStep === 2 && (
              <motion.div
                key="step-2"
                initial={{ opacity: 0, x: -15 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 15 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                {/* DELIVERY DATE & TIME */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-slate-200/80 dark:border-slate-800">
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-rose-600" /> Delivery Schedule
                  </h2>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1.5">
                        Preferred Delivery Date <span className="text-rose-600">*</span>
                      </label>
                      <input
                        type="date"
                        min={minDateStr}
                        value={deliveryDate}
                        onChange={(e) => setDeliveryDate(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-rose-500 outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1.5">
                        Preferred Delivery Time Slot <span className="text-rose-600">*</span>
                      </label>
                      <select
                        value={deliveryTime}
                        onChange={(e) => setDeliveryTime(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-rose-500 outline-none"
                      >
                        {DELIVERY_TIME_SLOTS.map((slot) => (
                          <option key={slot} value={slot}>
                            {slot}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* BUDGET (REQUIRED) */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-slate-200/80 dark:border-slate-800">
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <IndianRupee className="w-5 h-5 text-emerald-600" /> Your Budget (Required)
                    </h2>
                    <span className="text-xs font-extrabold text-rose-600 uppercase tracking-wider bg-rose-50 dark:bg-rose-950 px-2.5 py-0.5 rounded-full">
                      Mandatory
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                    Our bakeries tailor materials, tiers, and handcrafted decor to match your budget accurately.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1.5">
                        Maximum Budget (₹) <span className="text-rose-600">*</span>
                      </label>
                      <div className="relative">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 font-bold">₹</span>
                        <input
                          type="number"
                          min="100"
                          step="50"
                          placeholder="e.g. 1500"
                          value={budgetMax}
                          onChange={(e) => setBudgetMax(e.target.value)}
                          className="w-full pl-8 pr-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-bold focus:ring-2 focus:ring-rose-500 outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1.5">
                        Minimum Budget (₹) (Optional)
                      </label>
                      <div className="relative">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 font-bold">₹</span>
                        <input
                          type="number"
                          min="100"
                          step="50"
                          placeholder="e.g. 800"
                          value={budgetMin}
                          onChange={(e) => setBudgetMin(e.target.value)}
                          className="w-full pl-8 pr-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-bold focus:ring-2 focus:ring-rose-500 outline-none"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* REFERENCE IMAGE UPLOAD (PRIVATE & SECURE) */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-slate-200/80 dark:border-slate-800">
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
                    <FileImage className="w-5 h-5 text-indigo-600" /> Reference Design Images (Optional)
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                    Upload photos of cake designs you like. Images are stored securely in a private bucket and only inspected by authorized bakery partners.
                  </p>

                  {/* PREVIEWS */}
                  {images.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                      {images.map((img, idx) => (
                        <div
                          key={idx}
                          className="relative aspect-square rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 group bg-slate-100 dark:bg-slate-800"
                        >
                          <Image
                            src={img.previewUrl}
                            alt={img.name}
                            fill
                            className="object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveImage(idx)}
                            className="absolute top-1.5 right-1.5 p-1 rounded-full bg-black/60 hover:bg-black/90 text-white transition-opacity opacity-90 group-hover:opacity-100"
                            aria-label="Remove image"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* UPLOAD BUTTON */}
                  {images.length < 4 && (
                    <label className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-rose-500 dark:hover:border-rose-500 rounded-2xl p-6 flex flex-col items-center justify-center cursor-pointer transition-colors bg-slate-50/50 dark:bg-slate-800/40">
                      {isUploadingImage ? (
                        <div className="flex flex-col items-center gap-2">
                          <Loader2 className="w-6 h-6 text-rose-600 animate-spin" />
                          <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                            Uploading image securely...
                          </span>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center text-center">
                          <Upload className="w-6 h-6 text-slate-400 mb-2" />
                          <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                            Click to upload reference image
                          </span>
                          <span className="text-[11px] text-slate-400 mt-1">
                            PNG, JPG or WEBP up to 10MB ({images.length}/4 images)
                          </span>
                        </div>
                      )}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={handleImageFileChange}
                        disabled={isUploadingImage}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>

                {/* STEP 2 NAVIGATION */}
                <div className="flex justify-between items-center">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleBack}
                    className="font-bold px-5 py-2.5 rounded-xl flex items-center gap-2 text-sm"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Back</span>
                  </Button>
                  <Button
                    type="button"
                    onClick={handleNext}
                    className="bg-rose-600 hover:bg-rose-700 text-white font-bold px-6 py-3 rounded-xl flex items-center gap-2 text-sm shadow-md"
                  >
                    <span>Continue to Delivery Info</span>
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>
              </motion.div>
            )}

            {/* STEP 3: CONTACT & DELIVERY */}
            {currentStep === 3 && (
              <motion.div
                key="step-3"
                initial={{ opacity: 0, x: -15 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 15 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-slate-200/80 dark:border-slate-800 space-y-4">
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
                    <User className="w-5 h-5 text-rose-600" /> Contact Details
                  </h2>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1.5">
                        Your Full Name <span className="text-rose-600">*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Rahul Sharma"
                        value={contactName}
                        onChange={(e) => setContactName(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-rose-500 outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1.5">
                        Contact Phone Number <span className="text-rose-600">*</span>
                      </label>
                      <input
                        type="tel"
                        placeholder="10-digit mobile number"
                        value={contactPhone}
                        onChange={(e) => setContactPhone(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-rose-500 outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* DELIVERY ADDRESS */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-slate-200/80 dark:border-slate-800 space-y-4">
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-rose-600" /> Delivery Address
                  </h2>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1.5">
                      Street Address / Flat / Floor <span className="text-rose-600">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 42 Park Street, Flat 3B"
                      value={streetAddress}
                      onChange={(e) => setStreetAddress(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-rose-500 outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1.5">
                        City <span className="text-rose-600">*</span>
                      </label>
                      <input
                        type="text"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-rose-500 outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1.5">
                        State
                      </label>
                      <input
                        type="text"
                        value={state}
                        onChange={(e) => setState(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-rose-500 outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1.5">
                        PIN Code
                      </label>
                      <input
                        type="text"
                        placeholder="700001"
                        value={postalCode}
                        onChange={(e) => setPostalCode(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-rose-500 outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1.5">
                      Nearby Landmark (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Near City Center Mall"
                      value={landmark}
                      onChange={(e) => setLandmark(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-rose-500 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1.5">
                      Special Delivery Instructions (Optional)
                    </label>
                    <textarea
                      rows={2}
                      placeholder="e.g. Please ring bell twice, fragile cake handling required..."
                      value={additionalNotes}
                      onChange={(e) => setAdditionalNotes(e.target.value)}
                      className="w-full p-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-rose-500 outline-none"
                    />
                  </div>
                </div>

                {/* TRUST BADGE */}
                <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/80 dark:border-emerald-900/40 flex items-center gap-3">
                  <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
                  <p className="text-xs text-emerald-800 dark:text-emerald-300">
                    No charge is taken now. You will receive an itemized quote from an approved local bakery with final cake and delivery pricing before confirming.
                  </p>
                </div>

                {/* STEP 3 NAVIGATION */}
                <div className="flex justify-between items-center">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleBack}
                    className="font-bold px-5 py-2.5 rounded-xl flex items-center gap-2 text-sm"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Back</span>
                  </Button>
                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-8 py-3 rounded-xl flex items-center gap-2 text-sm shadow-lg shadow-emerald-600/30"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Submitting Request...</span>
                      </>
                    ) : (
                      <>
                        <span>Submit Custom Cake Request</span>
                        <CheckCircle2 className="w-4 h-4" />
                      </>
                    )}
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </form>
      </div>
    </div>
  );
}

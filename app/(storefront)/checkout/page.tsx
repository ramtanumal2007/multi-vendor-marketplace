"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/context/AuthContext";
import { useCart } from "@/lib/context/CartContext";
import { formatCurrency } from "@/lib/utils";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { CircleCheckBig, ChevronRight, Lock } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";

const STEPS = ["Shipping", "Payment", "Review"];

const SHIPPING_METHODS = [
  { id: "standard", name: "Standard Delivery", price: 50.00, time: "2-3 business days" },
  { id: "express", name: "Express Local", price: 150.00, time: "Within 45 minutes" },
];

export default function CheckoutPage() {
  const { items, subtotal, clearCart } = useCart();
  const [currentStep, setCurrentStep] = useState(0);
  const [shippingMethod, setShippingMethod] = useState(SHIPPING_METHODS[0]);
  const [isProcessing, setIsProcessing] = useState(false);
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const supabase = createClient();
  const { addToast } = useToast();

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    addressLine1: "",
    addressLine2: "",
    landmark: "",
    googleMapsUrl: "",
    city: "",
    postalCode: "",
  });

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login?redirect=/checkout");
    }
  }, [user, authLoading, router]);

  const tax = subtotal * 0.18; // 18% GST
  const total = subtotal + shippingMethod.price + tax;

  const nextStep = () => setCurrentStep((prev) => Math.min(prev + 1, STEPS.length - 1));
  const prevStep = () => setCurrentStep((prev) => Math.max(prev - 1, 0));

  const handlePlaceOrder = async () => {
    setIsProcessing(true);
    
    // Create order payload
    const shippingAddress = {
      first_name: form.firstName,
      last_name: form.lastName,
      address_line1: form.addressLine1,
      address_line2: form.addressLine2,
      landmark: form.landmark,
      google_maps_url: form.googleMapsUrl,
      city: form.city,
      postal_code: form.postalCode,
      country: "IN",
    };

    const { data: orderData, error: orderError } = await supabase.from("orders").insert({
      user_id: user?.id,
      email: form.email || user?.email,
      shipping_address: shippingAddress,
      billing_address: shippingAddress,
      shipping_method: shippingMethod.name,
      shipping_cost: shippingMethod.price,
      subtotal: subtotal,
      tax_amount: tax,
      total: total,
      payment_status: "paid", // Simulating paid
      fulfillment_status: "pending"
    }).select().single();

    if (orderError || !orderData) {
      addToast({ title: "Checkout Error", description: orderError?.message || "Failed to place order.", type: "error" });
      setIsProcessing(false);
      return;
    }

    // Fetch store_id for products to associate order items with sellers
    const productIds = items.map(i => i.productId);
    const { data: productsData } = await supabase.from("products").select("id, store_id").in("id", productIds);
    const productStoreMap = new Map(productsData?.map(p => [p.id, p.store_id]) || []);

    // Insert order items
    const orderItems = items.map(item => ({
      order_id: orderData.id,
      product_id: item.productId,
      store_id: productStoreMap.get(item.productId) || null,
      title: item.title,
      quantity: item.quantity,
      unit_price: item.price,
      line_total: item.price * item.quantity
    }));

    await supabase.from("order_items").insert(orderItems);
    await supabase.from("order_timeline").insert({
      order_id: orderData.id,
      status: "ORDERED",
      note: "Order placed successfully",
      created_by: user?.id
    });

    setIsProcessing(false);
    clearCart();
    router.push(`/checkout/success?order=${orderData.order_number}`);
  };

  if (authLoading || !user) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (items.length === 0 && currentStep === 0 && !isProcessing) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6 bg-background-secondary/30 rounded-3xl my-12 border border-dashed border-border mx-4 md:mx-16">
        <h1 className="text-3xl font-bold mb-4">Your cart is empty</h1>
        <p className="text-foreground-secondary mb-8">Add some items before checking out.</p>
        <Button variant="primary" onClick={() => router.push("/products")}>Continue Shopping</Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1440px] px-6 md:px-16 py-12 w-full flex flex-col lg:flex-row gap-16">
      
      {/* Left Column: Flow */}
      <div className="w-full lg:w-2/3 flex flex-col pt-[60px] md:pt-[100px]">
        <h1 className="text-3xl md:text-4xl font-bold mb-8">Checkout</h1>
        
        {/* Step Indicator */}
        <div className="flex items-center gap-4 mb-12">
          {STEPS.map((step, i) => (
            <React.Fragment key={step}>
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${currentStep > i ? "bg-success text-white" : currentStep === i ? "bg-accent text-white" : "bg-background-secondary text-foreground-secondary"}`}>
                  {currentStep > i ? <CircleCheckBig className="w-5 h-5" /> : i + 1}
                </div>
                <span className={`font-medium ${currentStep >= i ? "text-foreground" : "text-foreground-secondary"}`}>{step}</span>
              </div>
              {i < STEPS.length - 1 && <div className="h-[2px] flex-1 bg-border" />}
            </React.Fragment>
          ))}
        </div>

        <div className="flex-1 min-h-[400px] relative">
          <AnimatePresence mode="wait">
            {currentStep === 0 && (
              <motion.div
                key="step0"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="flex flex-col gap-8"
              >
                <div className="grid grid-cols-2 gap-4">
                  <Input label="First Name" value={form.firstName} onChange={e => setForm({...form, firstName: e.target.value})} />
                  <Input label="Last Name" value={form.lastName} onChange={e => setForm({...form, lastName: e.target.value})} />
                </div>
                <Input label="Email Address" type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} />
                <Input label="Address Line 1" value={form.addressLine1} onChange={e => setForm({...form, addressLine1: e.target.value})} />
                <Input label="Address Line 2 (Optional)" value={form.addressLine2} onChange={e => setForm({...form, addressLine2: e.target.value})} />
                <div className="grid grid-cols-2 gap-4">
                  <Input label="Landmark (Optional)" placeholder="e.g. Near Metro Station / Opp Bank" value={form.landmark} onChange={e => setForm({...form, landmark: e.target.value})} />
                  <Input label="Google Maps Link / URL (Optional)" placeholder="https://maps.google.com/..." value={form.googleMapsUrl} onChange={e => setForm({...form, googleMapsUrl: e.target.value})} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Input label="City" value={form.city} onChange={e => setForm({...form, city: e.target.value})} />
                  <Input label="Postal Code" value={form.postalCode} onChange={e => setForm({...form, postalCode: e.target.value})} />
                </div>

                <div className="mt-4">
                  <h3 className="font-serif text-xl mb-4">Shipping Method</h3>
                  <div className="flex flex-col gap-4">
                    {SHIPPING_METHODS.map(method => (
                      <label key={method.id} className={`flex items-center justify-between p-4 border rounded-lg cursor-pointer transition-colors ${shippingMethod.id === method.id ? "border-accent bg-accent/5" : "border-border hover:border-foreground"}`}>
                        <div className="flex items-center gap-3">
                          <input type="radio" name="shipping" checked={shippingMethod.id === method.id} onChange={() => setShippingMethod(method)} className="w-4 h-4 accent-accent" />
                          <div className="flex flex-col">
                            <span className="font-medium">{method.name}</span>
                            <span className="text-sm text-foreground-secondary">{method.time}</span>
                          </div>
                        </div>
                        <span className="font-medium">{formatCurrency(method.price)}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end mt-4">
                  <Button variant="primary" size="lg" onClick={nextStep} className="w-full md:w-auto min-w-[200px]">
                    Continue to Payment
                  </Button>
                </div>
              </motion.div>
            )}

            {currentStep === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="flex flex-col gap-8"
              >
                <div className="bg-background-secondary p-6 rounded-lg flex flex-col gap-4">
                  <div className="flex items-center gap-3 text-accent mb-2">
                    <Lock className="w-5 h-5" />
                    <span className="font-medium">Secure Payment</span>
                  </div>
                  <p className="text-foreground-secondary text-sm">
                    All transactions are secure and encrypted. We use Razorpay to process your payment securely.
                  </p>
                  
                  {/* Placeholder for Razorpay Elements */}
                  <div className="h-[200px] bg-white border border-border rounded-lg mt-4 flex items-center justify-center text-foreground-secondary">
                    Razorpay Payment Element will be rendered here
                  </div>
                </div>

                <div className="flex justify-between mt-4">
                  <Button variant="ghost" onClick={prevStep}>Back to Shipping</Button>
                  <Button variant="primary" size="lg" onClick={nextStep} className="w-full md:w-auto min-w-[200px]">
                    Review Order
                  </Button>
                </div>
              </motion.div>
            )}

            {currentStep === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="flex flex-col gap-8"
              >
                <div className="border border-border rounded-lg p-6 flex flex-col gap-6">
                  <div className="flex justify-between border-b border-border pb-6">
                    <div className="flex flex-col gap-1">
                      <span className="text-sm text-foreground-secondary uppercase tracking-widest">Contact</span>
                      <span className="font-medium">{form.email || "No email"}</span>
                    </div>
                    <button onClick={() => setCurrentStep(0)} className="text-sm text-accent underline">Change</button>
                  </div>
                  <div className="flex justify-between border-b border-border pb-6">
                    <div className="flex flex-col gap-1">
                      <span className="text-sm text-foreground-secondary uppercase tracking-widest">Ship to</span>
                      <span className="font-medium">{form.addressLine1}, {form.city} {form.postalCode}</span>
                    </div>
                    <button onClick={() => setCurrentStep(0)} className="text-sm text-accent underline">Change</button>
                  </div>
                  <div className="flex justify-between">
                    <div className="flex flex-col gap-1">
                      <span className="text-sm text-foreground-secondary uppercase tracking-widest">Method</span>
                      <span className="font-medium">{shippingMethod.name} ({formatCurrency(shippingMethod.price)})</span>
                    </div>
                    <button onClick={() => setCurrentStep(0)} className="text-sm text-accent underline">Change</button>
                  </div>
                </div>

                <div className="flex justify-between mt-4">
                  <Button variant="ghost" onClick={prevStep}>Back to Payment</Button>
                  <Button variant="primary" size="lg" onClick={handlePlaceOrder} isLoading={isProcessing} className="w-full md:w-auto min-w-[200px] overflow-hidden group">
                    <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]" />
                    <span className="relative">Place Order - {formatCurrency(total)}</span>
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Right Column: Summary */}
      <div className="w-full lg:w-1/3 flex flex-col pt-[60px] md:pt-[100px]">
        <div className="bg-background-secondary/50 p-8 rounded-2xl sticky top-24 border border-border shadow-sm">
          <h2 className="text-xl font-bold mb-6">Order Summary</h2>
          
          <div className="flex flex-col gap-4 mb-6 border-b border-border pb-6 max-h-[300px] overflow-y-auto pr-2">
            {items.map(item => (
              <div key={item.id} className="flex gap-4">
                <div className="relative w-16 h-20 rounded bg-white overflow-hidden flex-shrink-0 border border-border">
                  <Image src={item.image} alt={item.title} fill className="object-cover" />
                  <div className="absolute -top-2 -right-2 w-5 h-5 bg-foreground text-background text-[10px] rounded-full flex items-center justify-center font-bold z-10">
                    {item.quantity}
                  </div>
                </div>
                <div className="flex flex-col flex-1 justify-center">
                  <span className="font-medium text-sm line-clamp-1">{item.title}</span>
                  {item.variantInfo && <span className="text-xs text-foreground-secondary mt-1">{item.variantInfo}</span>}
                  <span className="text-sm mt-1">{formatCurrency(item.price)}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-3 text-sm border-b border-border pb-6 mb-6">
            <div className="flex justify-between">
              <span className="text-foreground-secondary">Subtotal</span>
              <span className="font-medium">{formatCurrency(subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-foreground-secondary">Shipping</span>
              <span className="font-medium">{formatCurrency(shippingMethod.price)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-foreground-secondary">Estimated Tax</span>
              <span className="font-medium">{formatCurrency(tax)}</span>
            </div>
          </div>

          <div className="flex justify-between items-end">
            <span className="text-lg font-medium">Total</span>
            <div className="flex flex-col items-end gap-1">
              <span className="text-xs text-foreground-secondary">INR</span>
              <span className="text-3xl font-bold">{formatCurrency(total)}</span>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}

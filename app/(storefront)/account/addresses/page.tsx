"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Plus, MapPin, Trash2, Edit3, Star, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/lib/context/AuthContext";
import { createClient } from "@/lib/supabase";

export interface AddressItem {
  id: string;
  user_id: string;
  full_name: string;
  phone?: string | null;
  address_line1: string;
  address_line2?: string | null;
  city: string;
  state: string;
  zip: string;
  country: string;
  is_default: boolean;
  created_at?: string;
}

export default function AccountAddressesPage() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const supabase = createClient();

  const [addresses, setAddresses] = useState<AddressItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [isSettingDefault, setIsSettingDefault] = useState<string | null>(null);
  const [editingAddress, setEditingAddress] = useState<AddressItem | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    full_name: "",
    phone: "",
    address_line1: "",
    address_line2: "",
    city: "",
    state: "",
    zip: "",
    country: "India",
    is_default: false,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchAddresses = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("addresses")
        .select("*")
        .eq("user_id", user.id)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) throw error;
      setAddresses(data || []);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load addresses.";
      addToast({ title: "Error", description: message, type: "error" });
    } finally {
      setIsLoading(false);
    }
  }, [user, supabase, addToast]);

  useEffect(() => {
    fetchAddresses();
  }, [fetchAddresses]);

  const handleOpenAdd = () => {
    setEditingAddress(null);
    setFormData({
      full_name: user?.user_metadata?.full_name || "",
      phone: "",
      address_line1: "",
      address_line2: "",
      city: "",
      state: "",
      zip: "",
      country: "India",
      is_default: addresses.length === 0, // auto-default if first address
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (addr: AddressItem) => {
    setEditingAddress(addr);
    setFormData({
      full_name: addr.full_name,
      phone: addr.phone || "",
      address_line1: addr.address_line1,
      address_line2: addr.address_line2 || "",
      city: addr.city,
      state: addr.state,
      zip: addr.zip,
      country: addr.country || "India",
      is_default: addr.is_default,
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!formData.full_name.trim()) {
      setFormError("Recipient full name is required.");
      return;
    }
    if (!formData.address_line1.trim()) {
      setFormError("Street address is required.");
      return;
    }
    if (!formData.city.trim() || !formData.state.trim() || !formData.zip.trim()) {
      setFormError("City, State, and Postal Code are required.");
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      // If setting this address as default, unset any previous defaults first
      if (formData.is_default) {
        await supabase
          .from("addresses")
          .update({ is_default: false })
          .eq("user_id", user.id);
      }

      if (editingAddress) {
        const { error } = await supabase
          .from("addresses")
          .update({
            full_name: formData.full_name.trim(),
            phone: formData.phone.trim() || null,
            address_line1: formData.address_line1.trim(),
            address_line2: formData.address_line2.trim() || null,
            city: formData.city.trim(),
            state: formData.state.trim(),
            zip: formData.zip.trim(),
            country: formData.country.trim() || "India",
            is_default: formData.is_default,
          })
          .eq("id", editingAddress.id)
          .eq("user_id", user.id);

        if (error) throw error;
        addToast({ title: "Address Updated", description: "Your delivery address was updated.", type: "success" });
      } else {
        const { error } = await supabase
          .from("addresses")
          .insert({
            user_id: user.id,
            full_name: formData.full_name.trim(),
            phone: formData.phone.trim() || null,
            address_line1: formData.address_line1.trim(),
            address_line2: formData.address_line2.trim() || null,
            city: formData.city.trim(),
            state: formData.state.trim(),
            zip: formData.zip.trim(),
            country: formData.country.trim() || "India",
            is_default: formData.is_default || addresses.length === 0,
          });

        if (error) throw error;
        addToast({ title: "Address Added", description: "New delivery address saved to your account.", type: "success" });
      }

      setIsModalOpen(false);
      fetchAddresses();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to save address.";
      setFormError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!user || isDeleting) return;
    if (!window.confirm("Are you sure you want to remove this saved address?")) return;

    setIsDeleting(id);
    try {
      const { error } = await supabase
        .from("addresses")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);

      if (error) throw error;
      addToast({ title: "Address Removed", type: "success" });
      fetchAddresses();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to delete address.";
      addToast({ title: "Error", description: message, type: "error" });
    } finally {
      setIsDeleting(null);
    }
  };

  const handleSetDefault = async (id: string) => {
    if (!user || isSettingDefault) return;
    setIsSettingDefault(id);
    try {
      // Unset previous defaults
      await supabase
        .from("addresses")
        .update({ is_default: false })
        .eq("user_id", user.id);

      // Set new default
      const { error } = await supabase
        .from("addresses")
        .update({ is_default: true })
        .eq("id", id)
        .eq("user_id", user.id);

      if (error) throw error;
      addToast({ title: "Default Address Updated", type: "success" });
      fetchAddresses();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to update default address.";
      addToast({ title: "Error", description: message, type: "error" });
    } finally {
      setIsSettingDefault(null);
    }
  };

  return (
    <div className="flex flex-col gap-8 w-full max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
        <div>
          <h2 className="text-2xl font-serif font-bold text-foreground">Saved Addresses</h2>
          <p className="text-sm text-foreground-secondary mt-1">
            Manage your delivery destinations for fast, one-click checkout.
          </p>
        </div>
        <Button
          variant="primary"
          onClick={handleOpenAdd}
          className="flex items-center gap-2 self-start sm:self-auto font-semibold shadow-sm"
        >
          <Plus className="w-4 h-4" /> Add New Address
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2].map((n) => (
            <div key={n} className="h-44 rounded-2xl bg-background-secondary/60 animate-pulse border border-border" />
          ))}
        </div>
      ) : addresses.length === 0 ? (
        <div className="p-12 text-center bg-background-secondary/30 rounded-3xl border border-dashed border-border flex flex-col items-center">
          <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center mb-4 text-accent">
            <MapPin className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-foreground">No Saved Addresses</h3>
          <p className="text-sm text-foreground-secondary max-w-sm mt-1 mb-6">
            You have not added any delivery addresses yet. Add one now to streamline your orders.
          </p>
          <Button variant="primary" onClick={handleOpenAdd} className="flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add Address
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {addresses.map((addr) => (
            <div
              key={addr.id}
              className={`p-5 rounded-2xl border transition-all flex flex-col justify-between relative bg-card ${
                addr.is_default
                  ? "border-accent ring-1 ring-accent/20 shadow-sm"
                  : "border-border hover:border-border-secondary shadow-xs"
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span className="font-bold text-base text-foreground flex items-center gap-2">
                    {addr.full_name}
                  </span>
                  {addr.is_default && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-extrabold uppercase tracking-wider text-accent bg-accent/10 border border-accent/20 px-2.5 py-0.5 rounded-full">
                      <Star className="w-3 h-3 fill-current" /> Default
                    </span>
                  )}
                </div>

                <div className="text-sm text-foreground-secondary space-y-0.5 mt-2 leading-relaxed">
                  <p className="text-foreground">{addr.address_line1}</p>
                  {addr.address_line2 && <p>{addr.address_line2}</p>}
                  <p>
                    {addr.city}, {addr.state} - <strong className="text-foreground font-semibold">{addr.zip}</strong>
                  </p>
                  <p className="text-xs uppercase tracking-wider text-foreground-secondary/80">{addr.country}</p>
                  {addr.phone && (
                    <p className="text-xs text-foreground font-medium pt-1">
                      Phone: <span className="text-foreground-secondary">{addr.phone}</span>
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-5 pt-3 border-t border-border/70 flex items-center justify-between text-xs">
                <div>
                  {!addr.is_default && (
                    <button
                      onClick={() => handleSetDefault(addr.id)}
                      disabled={isSettingDefault === addr.id}
                      className="font-medium text-accent hover:underline flex items-center gap-1 transition-colors"
                    >
                      {isSettingDefault === addr.id ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin" /> Setting...
                        </>
                      ) : (
                        "Set as Default"
                      )}
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleOpenEdit(addr)}
                    className="p-1.5 text-foreground-secondary hover:text-accent hover:bg-background-secondary rounded-lg transition-colors flex items-center gap-1"
                    title="Edit Address"
                  >
                    <Edit3 className="w-4 h-4" />
                    <span>Edit</span>
                  </button>
                  <button
                    onClick={() => handleDelete(addr.id)}
                    disabled={isDeleting === addr.id}
                    className="p-1.5 text-foreground-secondary hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors flex items-center gap-1"
                    title="Delete Address"
                  >
                    {isDeleting === addr.id ? (
                      <Loader2 className="w-4 h-4 animate-spin text-destructive" />
                    ) : (
                      <>
                        <Trash2 className="w-4 h-4" />
                        <span>Delete</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Address Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingAddress ? "Edit Delivery Address" : "Add Delivery Address"}
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-2">
          {formError && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-xl text-destructive text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-foreground">Recipient Name *</label>
              <input
                type="text"
                required
                value={formData.full_name}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                placeholder="Full Name"
                className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-foreground">Contact Phone</label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="10-digit mobile number"
                className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-foreground">Street Address / House No. *</label>
            <input
              type="text"
              required
              value={formData.address_line1}
              onChange={(e) => setFormData({ ...formData, address_line1: e.target.value })}
              placeholder="House, Flat number, Building, Street"
              className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-foreground">Apartment, Landmark, Area (Optional)</label>
            <input
              type="text"
              value={formData.address_line2}
              onChange={(e) => setFormData({ ...formData, address_line2: e.target.value })}
              placeholder="Near park, Behind school, etc."
              className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-foreground">City / Town *</label>
              <input
                type="text"
                required
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                placeholder="e.g. New Delhi"
                className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-foreground">State *</label>
              <input
                type="text"
                required
                value={formData.state}
                onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                placeholder="e.g. Delhi"
                className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-foreground">PIN Code *</label>
              <input
                type="text"
                required
                maxLength={6}
                value={formData.zip}
                onChange={(e) => setFormData({ ...formData, zip: e.target.value })}
                placeholder="6-digit PIN"
                className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer mt-2 select-none">
            <input
              type="checkbox"
              checked={formData.is_default}
              onChange={(e) => setFormData({ ...formData, is_default: e.target.checked })}
              className="w-4 h-4 rounded text-accent focus:ring-accent"
            />
            <span className="text-xs font-medium text-foreground">Set as default delivery address</span>
          </label>

          <div className="flex justify-end gap-3 mt-4 pt-3 border-t border-border">
            <Button variant="outline" type="button" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" /> Saving...
                </>
              ) : editingAddress ? (
                "Save Changes"
              ) : (
                "Save Address"
              )}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

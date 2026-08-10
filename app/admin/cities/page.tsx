"use client";

import React, { useState, useEffect } from "react";
import { Search, Plus, MapPin, CheckCircle2, XCircle, Power, Trash2, Loader2, RefreshCw, Save, IndianRupee } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase";
import { useToast } from "@/components/ui/Toast";
import { formatCurrency } from "@/lib/utils";

interface DeliveryCity {
  id: string;
  name: string;
  delivery_fee: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const DEFAULT_CITIES = [
  { name: "TARKESWAR", fee: 40 },
  { name: "LOKNATH", fee: 40 },
  { name: "KAIKALA", fee: 40 },
  { name: "HARIPAL", fee: 50 },
  { name: "MALIYA HALT", fee: 40 },
  { name: "NALIKUL", fee: 30 },
  { name: "KAMARKUNDU", fee: 40 },
  { name: "SINGUR", fee: 40 },
  { name: "NASHIBPUR", fee: 40 },
  { name: "DIARA", fee: 40 },
  { name: "SHEORAAPHULI", fee: 45 },
  { name: "MADHUSUDANPUR", fee: 40 },
];

export default function AdminCitiesPage() {
  const [cities, setCities] = useState<DeliveryCity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [newCityName, setNewCityName] = useState("");
  const [newCityFee, setNewCityFee] = useState("40");
  const [isAdding, setIsAdding] = useState(false);

  const [editingFees, setEditingFees] = useState<{ [id: string]: string }>({});
  const [savingFeeId, setSavingFeeId] = useState<string | null>(null);

  const supabase = createClient();
  const { addToast } = useToast();

  useEffect(() => {
    fetchCities();
  }, []);

  async function fetchCities() {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("delivery_cities")
        .select("*")
        .order("name", { ascending: true });

      if (error) throw error;

      if (data && data.length > 0) {
        const formatted = data.map((c: any) => ({
          ...c,
          delivery_fee: Number(c.delivery_fee ?? 40),
        }));
        setCities(formatted);
      } else {
        const initialSeed = DEFAULT_CITIES.map((c) => ({
          name: c.name,
          delivery_fee: c.fee,
          is_active: true,
        }));
        const { data: seeded, error: seedErr } = await supabase
          .from("delivery_cities")
          .insert(initialSeed)
          .select();

        if (!seedErr && seeded) {
          setCities(seeded.map((c: any) => ({ ...c, delivery_fee: Number(c.delivery_fee || 40) })));
        } else {
          setCities(
            DEFAULT_CITIES.map((c, index) => ({
              id: String(index + 1),
              name: c.name,
              delivery_fee: c.fee,
              is_active: true,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }))
          );
        }
      }
    } catch (err: any) {
      console.error("Error fetching delivery cities:", err);
      addToast({
        title: "Error fetching cities",
        description: err.message || "Failed to fetch city list.",
        type: "error",
      });
    } finally {
      setIsLoading(false);
    }
  }

  const handleAddCity = async (e: React.FormEvent) => {
    e.preventDefault();
    const formattedName = newCityName.trim().toUpperCase();
    const feeNum = parseFloat(newCityFee) || 40;

    if (!formattedName) return;

    if (cities.some((c) => c.name.toUpperCase() === formattedName)) {
      addToast({
        title: "City already exists",
        description: `${formattedName} is already present in the city management list.`,
        type: "error",
      });
      return;
    }

    setIsAdding(true);

    try {
      const { data, error } = await supabase
        .from("delivery_cities")
        .insert({ name: formattedName, delivery_fee: feeNum, is_active: true })
        .select()
        .single();

      if (error) throw error;

      addToast({
        title: "City Added",
        description: `${formattedName} (Fee: ₹${feeNum}) added to active customer delivery areas.`,
        type: "success",
      });

      setNewCityName("");
      setNewCityFee("40");
      if (data) {
        setCities((prev) =>
          [...prev, { ...data, delivery_fee: Number(data.delivery_fee || feeNum) }].sort((a, b) =>
            a.name.localeCompare(b.name)
          )
        );
      }
    } catch (err: any) {
      addToast({
        title: "Failed to add city",
        description: err.message || "Could not insert new city.",
        type: "error",
      });
    } finally {
      setIsAdding(false);
    }
  };

  const handleSaveDeliveryFee = async (city: DeliveryCity) => {
    const feeVal = editingFees[city.id];
    if (feeVal === undefined) return;

    const newFee = parseFloat(feeVal);
    if (isNaN(newFee) || newFee < 0) {
      addToast({
        title: "Invalid Delivery Fee",
        description: "Delivery fee must be a positive number.",
        type: "error",
      });
      return;
    }

    setSavingFeeId(city.id);

    try {
      const { error } = await supabase
        .from("delivery_cities")
        .update({ delivery_fee: newFee, updated_at: new Date().toISOString() })
        .eq("id", city.id);

      if (error) throw error;

      setCities((prev) =>
        prev.map((c) => (c.id === city.id ? { ...c, delivery_fee: newFee } : c))
      );

      addToast({
        title: "Delivery Fee Saved",
        description: `Delivery charge for ${city.name} updated to ${formatCurrency(newFee)}.`,
        type: "success",
      });

      const copy = { ...editingFees };
      delete copy[city.id];
      setEditingFees(copy);
    } catch (err: any) {
      addToast({
        title: "Save Failed",
        description: err.message || "Failed to update delivery fee.",
        type: "error",
      });
    } finally {
      setSavingFeeId(null);
    }
  };

  const handleToggleActive = async (city: DeliveryCity) => {
    const newStatus = !city.is_active;

    try {
      const { error } = await supabase
        .from("delivery_cities")
        .update({ is_active: newStatus, updated_at: new Date().toISOString() })
        .eq("id", city.id);

      if (error) throw error;

      setCities((prev) =>
        prev.map((c) => (c.id === city.id ? { ...c, is_active: newStatus } : c))
      );

      addToast({
        title: newStatus ? "City Enabled" : "City Disabled",
        description: newStatus
          ? `${city.name} will now appear in NEW customer address dropdowns.`
          : `${city.name} will NO LONGER appear in NEW customer address dropdowns. Existing orders remain unaffected.`,
        type: newStatus ? "success" : "info",
      });
    } catch (err: any) {
      addToast({
        title: "Update Failed",
        description: err.message || "Failed to update city status.",
        type: "error",
      });
    }
  };

  const handleDeleteCity = async (city: DeliveryCity) => {
    if (
      !window.confirm(
        `Are you sure you want to remove ${city.name}? Disabling is preferred over deleting to preserve audit history.`
      )
    ) {
      return;
    }

    try {
      const { error } = await supabase.from("delivery_cities").delete().eq("id", city.id);

      if (error) throw error;

      setCities((prev) => prev.filter((c) => c.id !== city.id));
      addToast({
        title: "City Removed",
        description: `${city.name} removed from city management list. Historical orders remain intact.`,
        type: "success",
      });
    } catch (err: any) {
      addToast({
        title: "Delete Failed",
        description: err.message || "Could not delete city record.",
        type: "error",
      });
    }
  };

  const filteredCities = cities.filter((c) =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const activeCount = cities.filter((c) => c.is_active).length;
  const disabledCount = cities.length - activeCount;

  return (
    <div className="flex flex-col gap-6 w-full max-w-7xl mx-auto h-full pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <MapPin className="w-6 h-6 text-accent" /> City & Area Delivery Management
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Configure delivery areas, active customer visibility, and city-specific delivery charges.
          </p>
        </div>

        <button
          onClick={fetchCities}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-sm self-start md:self-auto"
        >
          <RefreshCw className="w-4 h-4 text-slate-500" /> Refresh List
        </button>
      </div>

      {/* Add City & Stats Card */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900 mb-1">Add New Delivery Area & Fee</h2>
            <p className="text-xs text-slate-500 mb-4">
              Specify city name and custom delivery fee to make it available for customer orders.
            </p>
          </div>

          <form onSubmit={handleAddCity} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              type="text"
              placeholder="CITY NAME (e.g. BANDEL)"
              value={newCityName}
              onChange={(e) => setNewCityName(e.target.value)}
              className="sm:col-span-2 px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold uppercase focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
            />
            <div className="flex gap-2">
              <input
                type="number"
                placeholder="Fee (₹)"
                value={newCityFee}
                onChange={(e) => setNewCityFee(e.target.value)}
                className="w-24 px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
              />
              <Button variant="primary" type="submit" isLoading={isAdding} disabled={!newCityName.trim()} className="flex-1">
                <Plus className="w-4 h-4 mr-1" /> Add
              </Button>
            </div>
          </form>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col justify-between">
          <h2 className="text-base font-bold text-slate-900 mb-2">City Directory Summary</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 flex flex-col items-center">
              <span className="text-2xl font-extrabold text-emerald-700">{activeCount}</span>
              <span className="text-xs font-semibold text-emerald-800 mt-0.5">Active Cities</span>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex flex-col items-center">
              <span className="text-2xl font-extrabold text-slate-600">{disabledCount}</span>
              <span className="text-xs font-semibold text-slate-600 mt-0.5">Disabled Cities</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex justify-between items-center gap-4 bg-slate-50/50">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search cities..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all"
            />
          </div>
          <span className="text-xs font-bold text-slate-500">
            Total: {filteredCities.length} Cities
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[11px] tracking-wider sticky top-0 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3.5">City / Area Name</th>
                <th className="px-6 py-3.5">Configured Delivery Fee</th>
                <th className="px-6 py-3.5">Status</th>
                <th className="px-6 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-medium">
              {isLoading ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                    <div className="flex justify-center mb-3">
                      <Loader2 className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                    </div>
                    Loading city directory...
                  </td>
                </tr>
              ) : filteredCities.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                    No cities found matching &quot;{searchTerm}&quot;.
                  </td>
                </tr>
              ) : (
                filteredCities.map((city) => {
                  const currentEditVal = editingFees[city.id] ?? String(city.delivery_fee);
                  const isDirty = editingFees[city.id] !== undefined && parseFloat(editingFees[city.id]) !== city.delivery_fee;

                  return (
                    <tr key={city.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-6 py-4 font-bold text-slate-900">{city.name}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-500">₹</span>
                          <input
                            type="number"
                            value={currentEditVal}
                            onChange={(e) =>
                              setEditingFees({ ...editingFees, [city.id]: e.target.value })
                            }
                            className="w-20 px-2 py-1 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-900 focus:ring-2 focus:ring-accent/20 focus:border-accent"
                          />
                          {isDirty && (
                            <button
                              onClick={() => handleSaveDeliveryFee(city)}
                              disabled={savingFeeId === city.id}
                              className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-1"
                            >
                              {savingFeeId === city.id ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Save className="w-3 h-3" />
                              )}
                              Save
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {city.is_active ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">
                            <XCircle className="w-3.5 h-3.5 text-slate-400" /> Disabled
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleToggleActive(city)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                              city.is_active
                                ? "bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200"
                                : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200"
                            }`}
                          >
                            <Power className="w-3.5 h-3.5" />
                            {city.is_active ? "Disable" : "Enable"}
                          </button>
                          <button
                            onClick={() => handleDeleteCity(city)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Remove City"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

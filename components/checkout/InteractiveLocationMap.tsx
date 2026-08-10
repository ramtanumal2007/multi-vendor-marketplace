"use client";

import React, { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface InteractiveLocationMapProps {
  latitude: number | null;
  longitude: number | null;
  accuracy?: number | null;
  onLocationSelect: (lat: number, lng: number) => void;
  addressLabel?: string;
}

export default function InteractiveLocationMap({
  latitude,
  longitude,
  accuracy,
  onLocationSelect,
  addressLabel,
}: InteractiveLocationMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);

  // Default fallback center (Tarkeswar, West Bengal, India)
  const defaultLat = latitude ?? 22.8856;
  const defaultLng = longitude ?? 87.9734;

  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      // Create Leaflet map instance
      const map = L.map(mapContainerRef.current, {
        center: [defaultLat, defaultLng],
        zoom: latitude && longitude ? 16 : 13,
        zoomControl: true,
        attributionControl: false,
      });

      // Add OpenStreetMap tiles
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
      }).addTo(map);

      // Handle map click to move marker
      map.on("click", (e: L.LeafletMouseEvent) => {
        onLocationSelect(e.latlng.lat, e.latlng.lng);
      });

      mapInstanceRef.current = map;
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update map view, marker, and accuracy circle when props change
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const hasCoords = latitude !== null && longitude !== null;
    const targetLat = hasCoords ? latitude! : defaultLat;
    const targetLng = hasCoords ? longitude! : defaultLng;

    // Custom pulse pin icon
    const customIcon = L.divIcon({
      className: "custom-map-pin-wrapper",
      html: `
        <div class="relative flex items-center justify-center -translate-x-1/2 -translate-y-full">
          <div class="w-9 h-9 bg-red-600 rounded-full flex items-center justify-center shadow-lg border-2 border-white text-white transform transition-transform hover:scale-110">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
              <circle cx="12" cy="10" r="3"/>
            </svg>
          </div>
          <div class="absolute -bottom-1 w-3 h-1.5 bg-slate-900/40 rounded-full blur-[1px]"></div>
        </div>
      `,
      iconSize: [36, 36],
      iconAnchor: [18, 36],
    });

    if (hasCoords) {
      map.flyTo([targetLat, targetLng], Math.max(map.getZoom(), 15), {
        animate: true,
        duration: 1.2,
      });

      // Update or create marker
      if (markerRef.current) {
        markerRef.current.setLatLng([targetLat, targetLng]);
      } else {
        const marker = L.marker([targetLat, targetLng], {
          icon: customIcon,
          draggable: true,
        }).addTo(map);

        marker.on("dragend", () => {
          const position = marker.getLatLng();
          onLocationSelect(position.lat, position.lng);
        });

        markerRef.current = marker;
      }

      // Update or create accuracy circle
      if (accuracy && accuracy > 0) {
        if (circleRef.current) {
          circleRef.current.setLatLng([targetLat, targetLng]);
          circleRef.current.setRadius(accuracy);
        } else {
          const circle = L.circle([targetLat, targetLng], {
            radius: accuracy,
            color: "#2563eb",
            fillColor: "#3b82f6",
            fillOpacity: 0.15,
            weight: 1.5,
          }).addTo(map);
          circleRef.current = circle;
        }
      } else if (circleRef.current) {
        circleRef.current.remove();
        circleRef.current = null;
      }
    } else {
      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }
      if (circleRef.current) {
        circleRef.current.remove();
        circleRef.current = null;
      }
    }
  }, [latitude, longitude, accuracy]);

  return (
    <div className="relative w-full rounded-2xl overflow-hidden border border-slate-200 shadow-md bg-slate-100">
      <div ref={mapContainerRef} className="w-full h-72 sm:h-80 z-10" />

      {/* Helper notice banner on map */}
      <div className="absolute top-3 left-3 right-3 z-20 pointer-events-none flex justify-center">
        <div className="bg-slate-900/80 backdrop-blur-md text-white px-3 py-1.5 rounded-full text-xs font-semibold shadow-lg flex items-center gap-1.5">
          <span>📍 Click on map or drag pin to adjust location</span>
        </div>
      </div>

      {/* Location label overlay */}
      {addressLabel && (
        <div className="p-3 bg-white border-t border-slate-200 text-xs font-medium text-slate-800 flex items-start gap-2">
          <span className="font-bold text-red-600 shrink-0">Selected:</span>
          <span className="line-clamp-2 text-slate-700">{addressLabel}</span>
        </div>
      )}
    </div>
  );
}

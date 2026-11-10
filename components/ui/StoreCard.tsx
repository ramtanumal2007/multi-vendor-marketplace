import React from "react";
import Image from "next/image";
import Link from "next/link";
import { Star, MapPin } from "lucide-react";

interface StoreCardProps {
  id: string;
  name: string;
  rating: number;
  reviews: number;
  location: string;
  distance: string;
  bannerImage: string;
  logoImage: string;
}

export function StoreCard({
  id,
  name,
  rating,
  reviews,
  location,
  distance,
  bannerImage,
  logoImage,
}: StoreCardProps) {
  return (
    <Link href={`/stores/${id}`} className="block w-full group">
      <div className="bg-card rounded-2xl overflow-hidden flex flex-col h-full border border-border/10 hover:border-border/30 transition-colors relative shadow-md">
        
        {/* Banner Image */}
        <div className="relative h-32 w-full overflow-hidden">
          <Image
            src={bannerImage}
            alt={`${name} banner`}
            fill
            className="object-cover transition-transform duration-700 group-hover:scale-105"
            sizes="(max-width: 768px) 100vw, 33vw"
          />
          <div className="absolute inset-0 bg-black/40" />
          
          {/* Rating Badge */}
          <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-sm text-white px-2 py-1 rounded flex items-center gap-1 text-[11px] font-medium border border-white/10">
             <Star className="w-3 h-3 fill-yellow-500 text-yellow-500" /> {rating.toFixed(1)} ({reviews})
          </div>
        </div>

        {/* Content */}
        <div className="p-4 pt-8 relative flex-1 flex flex-col">
          {/* Logo */}
          <div className="absolute -top-6 left-4 bg-card rounded-full p-1 border-2 border-border shadow-lg">
             <div className="relative w-12 h-12 rounded-full overflow-hidden bg-white">
               <Image
                 src={logoImage}
                 alt={`${name} logo`}
                 fill
                 className="object-contain"
               />
             </div>
             <div className="absolute bottom-0 right-0 w-3 h-3 bg-brand-green rounded-full border-2 border-card"></div>
          </div>
          
          <h3 className="font-sans text-[16px] text-white font-semibold leading-tight truncate">
            {name}
          </h3>
          
          <div className="flex items-center justify-between text-foreground-secondary text-[12px] mt-2">
            <div className="flex items-center gap-1 truncate max-w-[70%]">
              <MapPin className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">{location}</span>
            </div>
            <span className="text-brand-green font-medium flex-shrink-0">{distance}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MapPin, Truck } from 'lucide-react';
import { apiJson } from 'core';
import { StoreLocationDialog } from './StoreLocationDialog';

/**
 * Shown to sellers whose store has no location. Delivery (the seller's own or Opus) only works for sellers with a Lusaka location, so
 * until it is set their items are pick-up only.
 */
export const LocationNudge: React.FC<{ className?: string }> = ({ className = '' }) => {
    const [open, setOpen] = useState(false);
    const { data } = useQuery({
        queryKey: ['marketplace', 'my-location'],
        queryFn: () => apiJson<{ city: string; province: string; country: string }>('/marketplace/my-location'),
        staleTime: 5 * 60_000,
    });
    if (!data || data.city?.trim()) return null;
    return (
        <>
            <div className={`flex flex-wrap items-center gap-3 rounded-2xl bg-[#FEF7E0] px-4 py-3 text-sm text-[#3C4043] ${className}`}>
                <Truck size={18} className="flex-shrink-0 text-[#B06000]" />
                <p className="min-w-0 flex-1"><span className="font-bold text-[#1F1F1F]">Set your store location.</span> Buyers in Lusaka can only get delivery, and see how far you are, once your area is set. Until then your items are pick-up only.</p>
                <button type="button" onClick={() => setOpen(true)} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#0B57D0] px-4 text-xs font-semibold text-white hover:bg-[#0842A0]"><MapPin size={13} /> Set location</button>
            </div>
            <StoreLocationDialog open={open} onClose={() => setOpen(false)} />
        </>
    );
};

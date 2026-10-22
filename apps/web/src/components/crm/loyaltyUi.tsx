import React from 'react';
import type { LoyaltySegment } from '../../services/crm.service';

export const SEGMENT_STYLE: Record<LoyaltySegment, { label: string; badge: string; dot: string }> = {
    CHAMPION: { label: 'Champion', badge: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500' },
    LOYAL: { label: 'Loyal', badge: 'bg-emerald-100 text-emerald-800', dot: 'bg-emerald-500' },
    NEW: { label: 'New', badge: 'bg-sky-100 text-sky-800', dot: 'bg-sky-500' },
    OCCASIONAL: { label: 'Occasional', badge: 'bg-slate-100 text-slate-700', dot: 'bg-slate-400' },
    AT_RISK: { label: 'At risk', badge: 'bg-orange-100 text-orange-800', dot: 'bg-orange-500' },
    LAPSED: { label: 'Lapsed', badge: 'bg-red-100 text-red-800', dot: 'bg-red-500' },
    PROSPECT: { label: 'No purchases yet', badge: 'bg-gray-100 text-gray-500', dot: 'bg-gray-300' },
};

export const SegmentBadge: React.FC<{ segment: LoyaltySegment; className?: string }> = ({ segment, className = '' }) => {
    const s = SEGMENT_STYLE[segment];
    return (
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold inline-flex items-center gap-1.5 ${s.badge} ${className}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
            {s.label}
        </span>
    );
};

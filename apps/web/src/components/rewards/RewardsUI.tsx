import React, { useEffect, useState } from 'react';
import { Building2 } from 'lucide-react';
import type { RewardCard } from 'core';

export const fmtPoints = (n: number) => Math.round(n).toLocaleString('en-US');

/** The app's rewards progress bar (same track and fill as the mobile Rewards screen); fills in on first paint. */
export const RewardsProgress: React.FC<{ progress: number }> = ({ progress }) => {
    const [width, setWidth] = useState(0);
    const target = Math.round(Math.min(1, Math.max(0, progress)) * 100);
    useEffect(() => { const id = setTimeout(() => setWidth(target), 60); return () => clearTimeout(id); }, [target]);
    return (
        <div className="h-1.5 bg-[#E5E5E5] rounded-xl overflow-hidden" role="progressbar" aria-valuenow={target} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full bg-[#3B82F6] rounded-full transition-[width] duration-700 ease-out" style={{ width: `${width}%` }} />
        </div>
    );
};

/** A business's logo, MoneyWise's own mark, or a neutral building when it hasn't uploaded one. */
export const ProgrammeLogo: React.FC<{ card: Pick<RewardCard, 'logoUrl' | 'isPlatform' | 'name'>; size: number }> = ({ card, size }) => {
    const style = { width: size, height: size };
    if (card.isPlatform) return <img src="/logo-mark.svg" alt="" style={style} className="rounded-full bg-white border border-gray-200 p-1.5 flex-shrink-0" />;
    if (card.logoUrl) return <img src={card.logoUrl} alt="" style={style} className="rounded-full object-cover bg-white border border-gray-200 flex-shrink-0" />;
    return (
        <span style={style} className="rounded-full bg-[#F3D2D4] border border-black flex items-center justify-center flex-shrink-0">
            <Building2 size={size * 0.5} className="text-black" />
        </span>
    );
};

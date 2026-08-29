import { ArrowUpRight, ArrowDownRight, ArrowRight } from 'lucide-react';

export const BucketLegend = ({ 
    label, 
    amount, 
    color, 
    isNetAsset 
}: { 
    label: string, 
    amount: number, 
    color: string, 
    isNetAsset: boolean
}) => {
    // If it's a net asset account, show directional arrows. Otherwise, simple right arrow.
    const isPositive = amount >= 0;
    const absAmount = Math.abs(amount);

    return (
        <div className="inline-flex justify-center items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
            <div className="justify-end text-neutral-500 text-[10px] font-normal font-['DM_Sans']">{label}</div>
            
            {isNetAsset ? (
                isPositive ? <ArrowUpRight size={12} className="text-emerald-500" /> : <ArrowDownRight size={12} className="text-red-400" />
            ) : (
                <ArrowRight size={12} className="text-slate-400" />
            )}
            
            <div className="justify-end text-neutral-500 text-[10px] font-bold font-['DM_Sans'] whitespace-nowrap">
                {isNetAsset && amount !== 0 && (isPositive ? '+' : '-')}
                {absAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
        </div>
    );
};

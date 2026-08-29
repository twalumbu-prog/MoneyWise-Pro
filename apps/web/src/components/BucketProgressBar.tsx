import { calculateBuckets } from '../utils/bucketUtils';
import { BucketLegend } from './BucketLegend';

const BUCKET_COLORS = {
    year: '#D9DCE5',
    quarter: '#8E8FA3',
    month: '#D85BB5',
    week: '#7657E8',
    today: '#006AFF'
};

const BUCKET_LABELS = {
    year: 'YTD',
    quarter: 'This Qtr',
    month: 'This Month',
    week: 'This Week',
    today: 'Today'
};

const BUCKET_ORDER = ['year', 'quarter', 'month', 'week', 'today'] as const;

export const BucketProgressBar = ({ items, currTotal, groupId }: { items: any[], currTotal: number, groupId: string }) => {
    const buckets = calculateBuckets(items || []);
    const isNetAsset = ['ASSET', 'LIABILITY', 'EQUITY'].includes(groupId);
    
    // For widths, we use absolute values so negative buckets still show proportion of activity
    const absBuckets = {
        today: Math.abs(buckets.today),
        week: Math.abs(buckets.week),
        month: Math.abs(buckets.month),
        quarter: Math.abs(buckets.quarter),
        year: Math.abs(buckets.year),
    };
    
    const totalActivity = absBuckets.today + absBuckets.week + absBuckets.month + absBuckets.quarter + absBuckets.year;
    // Fallback to currTotal if items are empty/loading, or 1 to avoid division by zero
    const denominator = totalActivity > 0 ? totalActivity : Math.max(Math.abs(currTotal), 1);

    const renderSegment = (key: keyof typeof buckets) => {
        const val = absBuckets[key];
        if (val === 0) return null;
        const pct = (val / denominator) * 100;
        return (
            <div 
                key={key} 
                style={{ width: `${pct}%`, backgroundColor: BUCKET_COLORS[key] }} 
                className="h-full" 
            />
        );
    };

    return (
        <div className="w-full flex flex-col gap-2">
            {/* The stacked progress bar */}
            <div className="w-full h-1.5 rounded-full bg-zinc-100 overflow-hidden flex">
                {totalActivity > 0 ? (
                    <>
                        {BUCKET_ORDER.map(renderSegment)}
                    </>
                ) : (
                    <div className={`w-full h-full bg-gray-300 ${!items.length && currTotal !== 0 ? 'animate-pulse' : ''}`} />
                )}
            </div>

            {/* The legend */}
            {totalActivity > 0 && (
                <div className="w-full flex flex-wrap items-center gap-x-4 gap-y-2 mt-1">
                    {BUCKET_ORDER.map((k) => {
                        const key = k as keyof typeof buckets;
                        if (absBuckets[key] === 0) return null;
                        
                        return (
                            <BucketLegend 
                                key={key}
                                label={BUCKET_LABELS[key]}
                                amount={buckets[key]} // Pass original signed amount for legend
                                color={BUCKET_COLORS[key]}
                                isNetAsset={isNetAsset}
                            />
                        );
                    })}
                </div>
            )}
        </div>
    );
};

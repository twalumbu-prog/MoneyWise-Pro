import React from 'react';
import { CheckCircle, AlertCircle, Clock, FileCheck, ShieldCheck } from 'lucide-react';

interface AuditScoreBreakdownProps {
    score?: number;
    breakdown?: {
        timing: number;
        compliance: number;
        accuracy: number;
    };
    accountedAt?: string;
    createdAt: string;
    status: string;
}

export const AuditScoreBreakdown: React.FC<AuditScoreBreakdownProps> = ({ score: savedScore, breakdown: savedBreakdown, accountedAt, createdAt, status }) => {
    const isFinalized = status === 'ACCOUNTED';
    
    // Calculate live timing if not finalized
    const draftDate = new Date(createdAt);
    const endDate = accountedAt ? new Date(accountedAt) : new Date();
    const diffHours = (endDate.getTime() - draftDate.getTime()) / (1000 * 60 * 60);
    
    let liveTimingScore = 0;
    if (diffHours < 24) liveTimingScore = 100;
    else if (diffHours < 48) liveTimingScore = 50;
    else liveTimingScore = 0;

    // Use saved values if finalized, otherwise calculate/estimate
    const timingScore = isFinalized ? (savedBreakdown?.timing ?? liveTimingScore) : liveTimingScore;
    const complianceScore = isFinalized ? (savedBreakdown?.compliance ?? 0) : (savedBreakdown?.compliance ?? 0);
    const accuracyScore = isFinalized ? (savedBreakdown?.accuracy ?? 100) : 100;

    const displayScore = isFinalized 
        ? (savedScore ?? ((timingScore + complianceScore + accuracyScore) / 3))
        : ((timingScore + complianceScore + accuracyScore) / 3);

    const getRating = (s: number, type?: 'TIMING' | 'COMPLIANCE' | 'ACCURACY') => {
        if (!isFinalized) {
            if (type === 'COMPLIANCE' && status !== 'CHANGE_SUBMITTED' && status !== 'EXPENSED') {
                return { label: 'Upcoming', color: 'text-gray-400', bg: 'bg-gray-50', icon: Clock };
            }
            if (type === 'ACCURACY' && status !== 'ACCOUNTED') {
                return { label: 'Pending', color: 'text-gray-400', bg: 'bg-gray-50', icon: Clock };
            }
        }

        if (s >= 85) return { label: 'Brilliant', color: 'text-emerald-600', bg: 'bg-emerald-50', icon: CheckCircle };
        if (s >= 50) return { label: 'Average', color: 'text-amber-600', bg: 'bg-amber-50', icon: AlertCircle };
        return { label: 'Bad', color: 'text-red-600', bg: 'bg-red-50', icon: AlertCircle };
    };

    const overallRating = getRating(displayScore);
    const RatingIcon = overallRating.icon;

    const items = [
        { 
            label: 'Time Efficiency', 
            score: timingScore, 
            description: 'Draft to Accounted timing.',
            icon: Clock,
            type: 'TIMING' as const,
            details: isFinalized 
                ? `Finalized in ${Math.round(diffHours)} hours` 
                : `Active for ${Math.round(diffHours)} hours...`
        },
        { 
            label: 'Documentation Compliance', 
            score: complianceScore, 
            description: 'Receipt upload and OCR validation.',
            icon: FileCheck,
            type: 'COMPLIANCE' as const,
            details: isFinalized 
                ? (complianceScore === 100 ? 'All receipts matched' : 'Documentation gaps found')
                : (['EXPENSED', 'CHANGE_SUBMITTED'].includes(status) ? 'Analyzing receipts...' : 'Waiting for expense stage')
        },
        { 
            label: 'Financial Accuracy', 
            score: accuracyScore, 
            description: 'Zero discrepancy in reconciliation.',
            icon: ShieldCheck,
            type: 'ACCURACY' as const,
            details: isFinalized 
                ? (accuracyScore === 100 ? 'No discrepancies found' : 'Discrepancy detected')
                : 'Pending finalization'
        }
    ];

    return (
        <div className="space-y-6 py-4">
            {/* Header Summary */}
            <div className={`p-6 rounded-2xl ${overallRating.bg} flex items-center justify-between border border-white/50 shadow-sm transition-all duration-500`}>
                <div className="flex items-center space-x-4">
                    <div className={`p-3 rounded-xl bg-white shadow-sm ${overallRating.color}`}>
                        <RatingIcon className="h-8 w-8" />
                    </div>
                    <div>
                        <div className="flex items-center space-x-2">
                            <h4 className={`text-xl font-black ${overallRating.color}`}>{overallRating.label}</h4>
                            {!isFinalized && (
                                <span className="flex items-center space-x-1 px-2 py-0.5 rounded-full bg-blue-100 text-[10px] font-black text-blue-600 uppercase tracking-widest animate-pulse">
                                    <span className="w-1 h-1 bg-blue-600 rounded-full" />
                                    <span>Live</span>
                                </span>
                            )}
                        </div>
                        <p className="text-gray-500 text-sm">Overall Audit Performance</p>
                    </div>
                </div>
                <div className="text-right">
                    <span className="text-4xl font-black text-gray-900">{Math.round(displayScore)}%</span>
                </div>
            </div>

            {/* Breakdown Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {items.map((item, idx) => {
                    const itemRating = getRating(item.score, item.type);
                    const ItemIcon = item.icon;
                    return (
                        <div key={idx} className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all flex flex-col min-h-[160px]">
                            <div className="flex items-center justify-between mb-3">
                                <div className={`p-2 rounded-lg ${itemRating.bg} ${itemRating.color}`}>
                                    <ItemIcon className="h-5 w-5" />
                                </div>
                                <span className={`text-xs font-bold px-2 py-1 rounded-full ${itemRating.bg} ${itemRating.color}`}>
                                    {itemRating.label}
                                </span>
                            </div>
                            <h5 className="font-bold text-gray-900 mb-1">{item.label}</h5>
                            <p className="text-xs text-gray-500 mb-3">{item.description}</p>
                            <div className="mt-auto pt-4 border-t border-gray-50">
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Status</p>
                                <p className="text-xs font-bold text-gray-700 line-clamp-1">{item.details}</p>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

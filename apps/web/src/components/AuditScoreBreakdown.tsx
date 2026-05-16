import React from 'react';
import { CheckCircle, AlertCircle, Clock, FileCheck, ShieldCheck } from 'lucide-react';

interface AuditScoreBreakdownProps {
    score: number;
    breakdown: {
        timing: number;
        compliance: number;
        accuracy: number;
    };
    accountedAt?: string;
    createdAt: string;
}

export const AuditScoreBreakdown: React.FC<AuditScoreBreakdownProps> = ({ score, breakdown, accountedAt, createdAt }) => {
    const getRating = (s: number) => {
        if (s >= 85) return { label: 'Brilliant', color: 'text-emerald-600', bg: 'bg-emerald-50', icon: CheckCircle };
        if (s >= 50) return { label: 'Average', color: 'text-amber-600', bg: 'bg-amber-50', icon: AlertCircle };
        return { label: 'Bad', color: 'text-red-600', bg: 'bg-red-50', icon: AlertCircle };
    };

    const rating = getRating(score);
    const RatingIcon = rating.icon;

    const items = [
        { 
            label: 'Time Efficiency', 
            score: breakdown.timing, 
            description: 'Draft to Accounted timing.',
            icon: Clock,
            details: accountedAt ? `Finalized in ${Math.round((new Date(accountedAt).getTime() - new Date(createdAt).getTime()) / (1000 * 60 * 60))} hours` : 'Pending finalization'
        },
        { 
            label: 'Documentation Compliance', 
            score: breakdown.compliance, 
            description: 'Receipt upload and OCR validation.',
            icon: FileCheck,
            details: breakdown.compliance === 100 ? 'All receipts uploaded and matched' : (breakdown.compliance === 50 ? 'Receipts uploaded but some mismatches' : 'No receipts uploaded')
        },
        { 
            label: 'Financial Accuracy', 
            score: breakdown.accuracy, 
            description: 'Zero discrepancy between expected and actual change.',
            icon: ShieldCheck,
            details: breakdown.accuracy === 100 ? 'No discrepancies found' : 'Discrepancy detected in disbursement'
        }
    ];

    return (
        <div className="space-y-6 py-4">
            <div className={`p-6 rounded-2xl ${rating.bg} flex items-center justify-between border border-white/50 shadow-sm`}>
                <div className="flex items-center space-x-4">
                    <div className={`p-3 rounded-xl bg-white shadow-sm ${rating.color}`}>
                        <RatingIcon className="h-8 w-8" />
                    </div>
                    <div>
                        <h4 className={`text-xl font-black ${rating.color}`}>{rating.label}</h4>
                        <p className="text-gray-500 text-sm">Overall Audit Performance</p>
                    </div>
                </div>
                <div className="text-right">
                    <span className="text-4xl font-black text-gray-900">{Math.round(score)}%</span>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {items.map((item, idx) => {
                    const itemRating = getRating(item.score);
                    const ItemIcon = item.icon;
                    return (
                        <div key={idx} className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all">
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
                            <div className="mt-auto">
                                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Details</p>
                                <p className="text-sm font-semibold text-gray-700">{item.details}</p>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

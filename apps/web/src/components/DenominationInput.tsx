
import React from 'react';

interface Denomination {
    value: number;
    count: number;
}

interface DenominationInputProps {
    denominations: Denomination[];
    onChange: (denominations: Denomination[]) => void;
    label?: string;
}

export const DenominationInput: React.FC<DenominationInputProps> = ({
    denominations,
    onChange,
    label = "Cash Denominations"
}) => {
    const handleCountChange = (value: number, count: number) => {
        const next = denominations.map(d => d.value === value ? { ...d, count: Math.max(0, count) } : d);
        onChange(next);
    };

    const total = denominations.reduce((sum, d) => sum + (d.value * d.count), 0);

    return (
        <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
            <h4 className="text-sm font-semibold text-gray-700 mb-3">{label}</h4>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                {denominations.map((d) => (
                    <div key={d.value} className="bg-white p-2 rounded border border-gray-200 shadow-sm flex flex-col items-center">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">K{d.value} Note</label>
                        <div className="flex items-center space-x-2">
                            <span className="text-xs text-gray-400">×</span>
                            <input
                                type="number"
                                min="0"
                                placeholder="0"
                                className="w-16 text-center text-sm font-medium focus:ring-indigo-500 focus:border-indigo-500 border-gray-300 rounded px-1 py-1 border"
                                value={d.count === 0 ? '' : d.count}
                                onChange={(e) => handleCountChange(d.value, parseInt(e.target.value) || 0)}
                            />
                        </div>
                        <span className="text-[10px] text-indigo-600 font-medium mt-1">
                            = K{(d.value * d.count).toFixed(2)}
                        </span>
                    </div>
                ))}
            </div>
            <div className="mt-4 flex justify-between items-center border-t border-gray-200 pt-3">
                <span className="text-sm font-medium text-gray-500">Total Denominations:</span>
                <span className="text-lg font-bold text-gray-900">K{total.toFixed(2)}</span>
            </div>
        </div>
    );
};

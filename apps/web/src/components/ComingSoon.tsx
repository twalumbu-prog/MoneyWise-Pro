import React from 'react';
import { Construction, Sparkles } from 'lucide-react';

export const ComingSoon: React.FC<{ featureName: string }> = ({ featureName }) => {
    return (
        <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center p-8 bg-white rounded-3xl border border-gray-100 shadow-sm border-dashed">
            <div className="relative mb-6">
                <div className="h-20 w-20 bg-brand-navy rounded-2xl flex items-center justify-center text-white shadow-xl rotate-3">
                    <Construction size={40} />
                </div>
                <div className="absolute -top-2 -right-2 h-8 w-8 bg-[#006AFF] rounded-full flex items-center justify-center text-white shadow-lg animate-bounce">
                    <Sparkles size={16} />
                </div>
            </div>
            <h2 className="text-2xl font-bold text-brand-navy mb-3">
                {featureName} is Coming Soon
            </h2>
            <p className="text-gray-500 max-w-md mx-auto leading-relaxed">
                We're hard at work building this advanced feature to help you manage your organization's finances more effectively. Stay tuned for updates!
            </p>
            <div className="mt-8 flex items-center space-x-2 text-[#006AFF] font-bold text-sm bg-blue-50 px-4 py-2 rounded-full">
                <div className="h-1.5 w-1.5 rounded-full bg-[#006AFF] animate-pulse" />
                <span>Under Development</span>
            </div>
        </div>
    );
};

import React from 'react';
import { Loader2 } from 'lucide-react';

interface LoadingSpinnerProps {
    className?: string;
    size?: number;
    text?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ className = '', size = 24, text }) => {
    return (
        <div className={`flex flex-col items-center justify-center ${className}`}>
            <Loader2 className={`animate-spin text-[#0B57D0]`} size={size} />
            {text && <span className="mt-2 text-sm text-[#5F6368] font-medium">{text}</span>}
        </div>
    );
};

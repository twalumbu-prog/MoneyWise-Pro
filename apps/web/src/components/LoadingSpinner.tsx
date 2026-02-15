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
            <Loader2 className={`animate-spin text-brand-green`} size={size} />
            {text && <span className="mt-2 text-sm text-gray-500 font-medium">{text}</span>}
        </div>
    );
};

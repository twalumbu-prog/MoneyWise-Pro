import React, { useEffect } from 'react';
import { X } from 'lucide-react';

/**
 * A Material-style dialog: scrim, 28px-radius sheet, close button. Used by the newer pages (Savings, Budgets, Rewards) so they share
 * one look instead of each building its own overlay.
 */
export const Dialog: React.FC<{
    open: boolean;
    title: string;
    onClose: () => void;
    children: React.ReactNode;
    /** Narrow (default) or wide dialogs. */
    size?: 'sm' | 'md' | 'lg';
}> = ({ open, title, onClose, children, size = 'sm' }) => {
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    if (!open) return null;
    const width = size === 'lg' ? 'max-w-2xl' : size === 'md' ? 'max-w-lg' : 'max-w-md';
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
            <div className="absolute inset-0 bg-[rgba(32,33,36,0.4)]" onClick={onClose} aria-hidden="true" />
            <div className={`relative flex max-h-[90vh] w-full ${width} flex-col overflow-hidden rounded-[28px] bg-[#F8FAFD] shadow-xl`}>
                <div className="flex items-center justify-between px-6 pb-2 pt-5">
                    <h2 className="text-lg font-bold text-[#1F1F1F]">{title}</h2>
                    <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-full text-[#5F6368] hover:bg-[#E9EEF6]">
                        <X size={18} />
                    </button>
                </div>
                <div className="overflow-y-auto px-6 pb-6 pt-2">{children}</div>
            </div>
        </div>
    );
};

export const fieldClass = 'h-12 w-full rounded-xl border border-[#C4C7C5] bg-white px-4 text-sm text-[#1F1F1F] placeholder:text-[#9AA0A6] focus:border-[#0B57D0] focus:outline-none focus:ring-1 focus:ring-[#0B57D0]';
export const labelClass = 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[#5F6368]';

/** The one filled button per area. */
export const PrimaryButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean }> = ({ busy, children, className = '', disabled, ...rest }) => (
    <button
        type="button"
        disabled={disabled || busy}
        className={`inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#0B57D0] px-6 text-sm font-semibold text-white transition hover:bg-[#0842A0] disabled:opacity-50 ${className}`}
        {...rest}
    >
        {busy ? 'Please wait…' : children}
    </button>
);

export const TonalButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ children, className = '', ...rest }) => (
    <button
        type="button"
        className={`inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[#D3E3FD] px-5 text-sm font-semibold text-[#041E49] transition hover:bg-[#C2D7FA] disabled:opacity-50 ${className}`}
        {...rest}
    >
        {children}
    </button>
);

export const ErrorNote: React.FC<{ text?: string | null }> = ({ text }) =>
    text ? <p role="alert" className="mb-4 rounded-xl bg-[#FCE8E6] px-4 py-3 text-sm text-[#B31412]">{text}</p> : null;

export const ProgressBar: React.FC<{ value: number; tone?: 'blue' | 'green' | 'amber' | 'red' }> = ({ value, tone = 'blue' }) => {
    const pct = Math.min(100, Math.max(0, Math.round(value * 100)));
    const fill = { blue: 'bg-[#0B57D0]', green: 'bg-[#34A853]', amber: 'bg-[#FBBC04]', red: 'bg-[#EA4335]' }[tone];
    return (
        <div className="h-1.5 overflow-hidden rounded-full bg-[#E9EEF6]" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className={`h-full rounded-full transition-all duration-700 ${pct >= 100 && tone === 'blue' ? 'bg-[#34A853]' : fill}`} style={{ width: `${pct}%` }} />
        </div>
    );
};

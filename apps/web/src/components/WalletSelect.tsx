import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';

interface WalletSelectProps {
    wallets: any[];
    value: string | null;
    onChange: (walletId: string) => void;
    placeholder?: string;
    /** Trigger button classes — lets each screen keep its own pill/rounded look. */
    triggerClassName?: string;
}

const formatBalance = (balance: any) =>
    balance === null || balance === undefined || Number.isNaN(Number(balance))
        ? null
        : `K${Number(balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Wallet picker that shows each wallet's available balance under its name.
 * A native <select> can only render single-line options, so this is a custom
 * dropdown — same value/onChange contract as the <select> it replaces.
 *
 * The menu is rendered via a portal at fixed coordinates (not absolutely
 * positioned inside the trigger) so it isn't clipped by a modal's
 * overflow-hidden/scroll container.
 */
export default function WalletSelect({
    wallets,
    value,
    onChange,
    placeholder = 'Select Wallet',
    triggerClassName = 'w-full h-14 px-5 bg-white border border-gray-100 rounded-2xl text-[15px] font-bold text-gray-900 shadow-sm',
}: WalletSelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [menuRect, setMenuRect] = useState<{ top: number; left: number; width: number } | null>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    const updateMenuRect = () => {
        const rect = triggerRef.current?.getBoundingClientRect();
        if (!rect) return;
        setMenuRect({ top: rect.bottom + 8, left: rect.left, width: rect.width });
    };

    useLayoutEffect(() => {
        if (isOpen) updateMenuRect();
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (
                triggerRef.current && !triggerRef.current.contains(e.target as Node) &&
                menuRef.current && !menuRef.current.contains(e.target as Node)
            ) {
                setIsOpen(false);
            }
        };
        const handleReposition = () => updateMenuRect();
        document.addEventListener('mousedown', handleClickOutside);
        window.addEventListener('scroll', handleReposition, true);
        window.addEventListener('resize', handleReposition);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            window.removeEventListener('scroll', handleReposition, true);
            window.removeEventListener('resize', handleReposition);
        };
    }, [isOpen]);

    const selected = wallets.find((w: any) => w.id === value);
    const selectedBalance = selected ? formatBalance(selected.balance) : null;

    return (
        <>
            <button
                type="button"
                ref={triggerRef}
                onClick={() => setIsOpen(o => !o)}
                className={`${triggerClassName} flex items-center justify-between text-left focus:outline-none transition-all cursor-pointer`}
            >
                <span className="flex flex-col min-w-0">
                    <span className="truncate">{selected ? selected.name : placeholder}</span>
                    {selectedBalance && (
                        <span className="text-[11px] font-semibold text-gray-400 tracking-tight">
                            {selectedBalance} available
                        </span>
                    )}
                </span>
                <ChevronDown
                    size={18}
                    className={`text-gray-400 flex-shrink-0 ml-3 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                />
            </button>

            {isOpen && menuRect && createPortal(
                <div
                    ref={menuRef}
                    style={{ position: 'fixed', top: menuRect.top, left: menuRect.left, width: menuRect.width }}
                    className="z-[9999] max-h-64 overflow-y-auto bg-white border border-gray-100 rounded-2xl shadow-xl py-2 animate-in fade-in slide-in-from-top-1 duration-150"
                >
                    {wallets.map((w: any) => {
                        const balance = formatBalance(w.balance);
                        const isSelected = w.id === value;
                        return (
                            <button
                                key={w.id}
                                type="button"
                                onClick={() => {
                                    onChange(w.id);
                                    setIsOpen(false);
                                }}
                                className={`w-full flex items-center justify-between px-5 py-3 text-left hover:bg-gray-50 transition-colors ${isSelected ? 'bg-gray-50' : ''}`}
                            >
                                <span className="flex flex-col min-w-0">
                                    <span className="text-[14px] font-bold text-gray-900 truncate">{w.name}</span>
                                    <span className="text-[11px] font-semibold text-gray-400 tracking-tight">
                                        {balance ? `${balance} available` : 'Balance unavailable'}
                                    </span>
                                </span>
                                {isSelected && <Check size={16} className="text-[#006AFF] flex-shrink-0 ml-3" />}
                            </button>
                        );
                    })}
                </div>,
                document.body
            )}
        </>
    );
}

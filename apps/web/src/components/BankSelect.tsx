/**
 * BankSelect — drop-in replacement for the native <select> bank picker.
 *
 * Shows each bank with its Clearbit logo (falling back to a coloured initial
 * badge) in a searchable custom dropdown that matches the visual style of
 * whatever container it's placed in via the `className` prop.
 *
 * Usage (mirrors the <select> API):
 *   <BankSelect
 *     banks={banks}
 *     value={bankId}
 *     onChange={v => setBankId(v)}
 *     className="w-full h-12 bg-white border border-gray-200 rounded-xl ..."
 *     placeholder="Select Bank"
 *   />
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { getBankColor, getBankInitials, getBankLogoUrls } from '../utils/bankLogos';

// ── Logo avatar ────────────────────────────────────────────────────────────

interface BankAvatarProps {
    name: string;
    size?: number; // px — logo/badge diameter
}

export const BankAvatar: React.FC<BankAvatarProps> = ({ name, size = 28 }) => {
    const urls = getBankLogoUrls(name);
    const [urlIndex, setUrlIndex] = useState(0);

    const style: React.CSSProperties = {
        width:  size,
        height: size,
        flexShrink: 0,
        borderRadius: 6,
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    };

    if (urls.length > 0 && urlIndex < urls.length) {
        return (
            <div style={style} className="bg-white border border-gray-100 shadow-sm">
                <img
                    src={urls[urlIndex]}
                    alt={name}
                    style={{ width: size - 4, height: size - 4, objectFit: 'contain' }}
                    onError={() => setUrlIndex(i => i + 1)}
                />
            </div>
        );
    }

    // Coloured initials badge (all URLs exhausted or bank unrecognised)
    const color = getBankColor(name);
    const initials = getBankInitials(name);
    const fontSize = size <= 20 ? 7 : size <= 28 ? 9 : 11;

    return (
        <div
            style={{ ...style, background: color }}
            className="shadow-sm"
        >
            <span style={{ color: '#fff', fontSize, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1 }}>
                {initials}
            </span>
        </div>
    );
};

// ── BankSelect ──────────────────────────────────────────────────────────────

export interface BankOption {
    id: string;
    name: string;
    code?: string;
}

interface BankSelectProps {
    banks: BankOption[];
    value: string;
    onChange: (value: string) => void;
    /** Tailwind classes to apply to the trigger button — mirrors the old <select> className */
    className?: string;
    placeholder?: string;
    /** When true, renders a compact single-line trigger suitable for tight payroll rows */
    compact?: boolean;
    disabled?: boolean;
    loading?: boolean;
}

const BankSelect: React.FC<BankSelectProps> = ({
    banks,
    value,
    onChange,
    className = '',
    placeholder = 'Select Bank',
    compact = false,
    disabled = false,
    loading = false,
}) => {
    const [open, setOpen]         = useState(false);
    const [query, setQuery]       = useState('');
    const containerRef            = useRef<HTMLDivElement>(null);
    const searchRef               = useRef<HTMLInputElement>(null);

    const selected = banks.find(b => b.id === value || b.code === value);

    // ── Filter ──────────────────────────────────────────────────────────────
    const filtered = query.trim()
        ? banks.filter(b => b.name.toLowerCase().includes(query.toLowerCase()))
        : banks;

    // ── Close on outside click ──────────────────────────────────────────────
    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
                setQuery('');
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    // ── Auto-focus search on open ───────────────────────────────────────────
    useEffect(() => {
        if (open) setTimeout(() => searchRef.current?.focus(), 40);
    }, [open]);

    const handleSelect = useCallback((b: BankOption) => {
        onChange(b.id || b.code || '');
        setOpen(false);
        setQuery('');
    }, [onChange]);

    // ── Trigger classes ─────────────────────────────────────────────────────
    // Strip appearance-none from className so we can control the caret ourselves
    const triggerClass = [
        'relative flex items-center gap-2 w-full text-left transition-all',
        'focus:outline-none cursor-pointer',
        className,
    ].join(' ');

    // ── Avatar size ─────────────────────────────────────────────────────────
    const avatarSize = compact ? 20 : 28;

    return (
        <div ref={containerRef} className="relative w-full">
            {/* ── Trigger ── */}
            <button
                type="button"
                disabled={disabled || loading}
                onClick={() => setOpen(v => !v)}
                className={triggerClass}
                aria-haspopup="listbox"
                aria-expanded={open}
            >
                {loading ? (
                    <span className="flex-1 text-gray-400 text-sm">Loading banks…</span>
                ) : selected ? (
                    <>
                        <BankAvatar name={selected.name} size={avatarSize} />
                        <span className="flex-1 truncate font-semibold text-gray-900">{selected.name}</span>
                    </>
                ) : (
                    <span className="flex-1 text-gray-400">{placeholder}</span>
                )}
                <ChevronDown
                    size={compact ? 12 : 14}
                    className={`flex-shrink-0 text-gray-400 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
                />
            </button>

            {/* ── Dropdown ── */}
            {open && (
                <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white border border-gray-200 rounded-2xl shadow-xl shadow-black/10 overflow-hidden">
                    {/* Search */}
                    {banks.length > 6 && (
                        <div className="px-3 pt-3 pb-2 border-b border-gray-100">
                            <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2">
                                <Search size={12} className="text-gray-400 flex-shrink-0" />
                                <input
                                    ref={searchRef}
                                    type="text"
                                    value={query}
                                    onChange={e => setQuery(e.target.value)}
                                    placeholder="Search banks…"
                                    className="flex-1 bg-transparent text-sm text-gray-900 placeholder-gray-400 focus:outline-none"
                                />
                            </div>
                        </div>
                    )}

                    {/* List */}
                    <ul
                        role="listbox"
                        className="max-h-60 overflow-y-auto py-1.5"
                    >
                        {filtered.length === 0 ? (
                            <li className="px-4 py-3 text-sm text-gray-400 text-center">No banks found</li>
                        ) : filtered.map(b => (
                            <li
                                key={b.id || b.code}
                                role="option"
                                aria-selected={b.id === value || b.code === value}
                                onClick={() => handleSelect(b)}
                                className={`flex items-center gap-3 px-3 py-2 mx-1.5 rounded-xl cursor-pointer transition-colors duration-100 ${
                                    (b.id === value || b.code === value)
                                        ? 'bg-[#006AFF]/8 text-[#006AFF]'
                                        : 'hover:bg-gray-50 text-gray-900'
                                }`}
                            >
                                <BankAvatar name={b.name} size={28} />
                                <span className="text-sm font-semibold truncate">{b.name}</span>
                                {(b.id === value || b.code === value) && (
                                    <span className="ml-auto text-[#006AFF] text-xs font-bold">✓</span>
                                )}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
};

export default BankSelect;

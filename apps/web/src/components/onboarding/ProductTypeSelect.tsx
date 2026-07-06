import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { ProductType, PRODUCT_TYPE_OPTIONS } from '../../services/product.service';
import { useAnchoredPopover } from './useAnchoredPopover';

interface Props {
    value: ProductType;
    onChange: (type: ProductType) => void;
}

const POPOVER_WIDTH = 320;

/**
 * Product-type picker for the onboarding product modal. Replaces a bare
 * native <select> — which can only show one plain-text line per option — with
 * a portaled dropdown (safe from clipping inside the modal's own
 * overflow-hidden, same fix as the country pickers) so every option can show
 * its short description right there in the list, helping merchants pick the
 * right type before they commit instead of only after.
 */
export const ProductTypeSelect: React.FC<Props> = ({ value, onChange }) => {
    const [open, setOpen] = useState(false);
    const { coords, buttonRef, popoverRef } = useAnchoredPopover(open, POPOVER_WIDTH, () => setOpen(false));
    const selected = PRODUCT_TYPE_OPTIONS.find(o => o.value === value) || PRODUCT_TYPE_OPTIONS[0];

    return (
        <div>
            <label htmlFor="product-type" className="block text-sm font-bold text-gray-800 mb-1">Type</label>
            <button
                ref={buttonRef}
                id="product-type"
                type="button"
                onClick={() => setOpen(o => !o)}
                aria-haspopup="listbox"
                aria-expanded={open}
                className="w-full px-4 py-3 border border-gray-200 rounded-2xl bg-white text-left flex items-center justify-between gap-3 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-all"
            >
                <span className="min-w-0">
                    <span className="block text-sm font-semibold text-gray-800 truncate">{selected.label}</span>
                    <span className="block text-xs text-gray-400 truncate">{selected.hint}</span>
                </span>
                <ChevronDown className={`h-4 w-4 text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && coords && createPortal(
                <div
                    ref={popoverRef}
                    role="listbox"
                    aria-label="Product type"
                    className="fixed z-[60] w-80 max-w-[calc(100vw-2rem)] bg-white shadow-xl shadow-gray-200/60 rounded-2xl border border-gray-100 overflow-hidden mw-anim"
                    style={{ top: coords.top, left: coords.left, animation: 'mw-fade-up 0.15s ease-out both' }}
                >
                    <ul className="max-h-80 overflow-auto py-1">
                        {PRODUCT_TYPE_OPTIONS.map(option => {
                            const isSelected = option.value === value;
                            return (
                                <li
                                    key={option.value}
                                    role="option"
                                    aria-selected={isSelected}
                                    onClick={() => { onChange(option.value); setOpen(false); }}
                                    className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors ${
                                        isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'
                                    }`}
                                >
                                    <span className="flex-1 min-w-0">
                                        <span className={`block text-sm font-semibold ${isSelected ? 'text-blue-700' : 'text-gray-800'}`}>
                                            {option.label}
                                        </span>
                                        <span className="block text-xs text-gray-400 mt-0.5 leading-relaxed">
                                            {option.hint}
                                        </span>
                                    </span>
                                    {isSelected && <Check className="h-4 w-4 text-blue-700 flex-shrink-0 mt-0.5" strokeWidth={3} />}
                                </li>
                            );
                        })}
                    </ul>
                </div>,
                document.body
            )}
        </div>
    );
};

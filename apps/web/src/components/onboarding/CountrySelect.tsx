import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { PhoneCountry, PHONE_COUNTRIES, flagEmoji } from './phoneCountryCodes';
import { useAnchoredPopover } from './useAnchoredPopover';
import { CountryOptionList, filterCountries } from './CountryOptionList';

interface Props {
    label: string;
    value: PhoneCountry;
    onChange: (country: PhoneCountry) => void;
}

const POPOVER_WIDTH = 288;

/**
 * Full-width country field for the address step: flag + country name on the
 * left, ISO code + chevron on the right — the whole pill opens the same
 * searchable country popover the phone-number chip uses (see
 * PhoneCountrySelect / CountryOptionList).
 */
export const CountrySelect: React.FC<Props> = ({ label, value, onChange }) => {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const { coords, buttonRef, popoverRef, searchRef } = useAnchoredPopover(open, POPOVER_WIDTH, () => setOpen(false));

    const filtered = useMemo(() => filterCountries(PHONE_COUNTRIES, query), [query]);

    return (
        <div>
            <label className="block text-sm font-semibold text-gray-800 mb-2">{label}</label>
            <button
                ref={buttonRef}
                type="button"
                onClick={() => { setOpen(o => !o); setQuery(''); }}
                aria-label={`${label}: ${value.name}`}
                aria-expanded={open}
                className="w-full min-h-12 p-3 bg-white rounded-full border border-slate-300 flex items-center gap-3 hover:border-slate-400 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-600/20"
            >
                <span className="flex-1 flex items-center gap-2 min-w-0">
                    <span className="text-2xl leading-none flex-shrink-0" aria-hidden>{flagEmoji(value.iso2)}</span>
                    <span className="flex-1 text-left text-gray-600 text-base truncate">{value.name}</span>
                </span>
                <span className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-gray-600 text-base font-semibold">{value.iso2}</span>
                    <ChevronDown className={`h-5 w-5 text-gray-600 transition-transform ${open ? 'rotate-180' : ''}`} />
                </span>
            </button>

            {open && coords && createPortal(
                <div
                    ref={popoverRef}
                    className="fixed z-50 w-72 bg-white shadow-xl shadow-gray-200/60 rounded-2xl border border-gray-100 overflow-hidden mw-anim"
                    style={{ top: coords.top, left: coords.left, animation: 'mw-fade-up 0.15s ease-out both' }}
                >
                    <CountryOptionList
                        countries={filtered}
                        query={query}
                        onQueryChange={setQuery}
                        selectedIso2={value.iso2}
                        onSelect={(country) => { onChange(country); setOpen(false); }}
                        renderRight={(c) => c.iso2}
                        searchRef={searchRef}
                    />
                </div>,
                document.body
            )}
        </div>
    );
};

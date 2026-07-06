import React from 'react';
import { PhoneCountry, flagEmoji } from './phoneCountryCodes';

interface Props {
    countries: PhoneCountry[];
    query: string;
    onQueryChange: (q: string) => void;
    selectedIso2: string;
    onSelect: (country: PhoneCountry) => void;
    /** Right-aligned label per row — dial code ("+260") for the phone picker,
     *  ISO code ("ZM") for the country picker. */
    renderRight: (country: PhoneCountry) => React.ReactNode;
    searchRef: React.RefObject<HTMLInputElement>;
}

/**
 * The search box + scrollable country list shared by PhoneCountrySelect (small
 * chip trigger, shows dial codes) and CountrySelect (full-width pill trigger,
 * shows ISO codes) — same interaction, same list, different trigger visuals
 * and a different right-hand label per row.
 */
export const CountryOptionList: React.FC<Props> = ({
    countries, query, onQueryChange, selectedIso2, onSelect, renderRight, searchRef,
}) => (
    <>
        <div className="p-2 border-b border-gray-100">
            <input
                ref={searchRef}
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                placeholder="Search country or code…"
                aria-label="Search country"
                className="w-full px-3 py-2 text-sm rounded-xl bg-gray-50 outline-none focus:ring-2 focus:ring-blue-600/20"
            />
        </div>
        <ul role="listbox" className="max-h-64 overflow-auto py-1">
            {countries.length === 0 ? (
                <li className="py-3 px-4 text-sm text-gray-400 text-center">No matches</li>
            ) : (
                countries.map(country => (
                    <li
                        key={country.iso2}
                        role="option"
                        aria-selected={country.iso2 === selectedIso2}
                        onClick={() => onSelect(country)}
                        className={`flex items-center gap-2.5 px-4 py-2 text-sm cursor-pointer hover:bg-blue-50 transition-colors ${
                            country.iso2 === selectedIso2 ? 'bg-blue-50 text-blue-700 font-bold' : 'text-gray-800'
                        }`}
                    >
                        <span className="text-2xl leading-none flex-shrink-0" aria-hidden>
                            {flagEmoji(country.iso2)}
                        </span>
                        <span className="flex-1 truncate">{country.name}</span>
                        <span className="text-gray-400">{renderRight(country)}</span>
                    </li>
                ))
            )}
        </ul>
    </>
);

/** Filter helper shared by both pickers. */
export function filterCountries(countries: PhoneCountry[], query: string): PhoneCountry[] {
    const q = query.trim().toLowerCase();
    if (!q) return countries;
    return countries.filter(c => c.name.toLowerCase().includes(q) || c.dial.includes(q) || c.iso2.toLowerCase().includes(q));
}

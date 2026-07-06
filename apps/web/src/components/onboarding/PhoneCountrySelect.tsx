import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { PhoneCountry, PHONE_COUNTRIES, flagEmoji } from './phoneCountryCodes';
import { useAnchoredPopover } from './useAnchoredPopover';
import { CountryOptionList, filterCountries } from './CountryOptionList';

interface Props {
    value: PhoneCountry;
    onChange: (country: PhoneCountry) => void;
}

const POPOVER_WIDTH = 256; // matches w-64

/**
 * The flag + dial-code chip on the left of the phone field. Tapping it opens a
 * searchable popover of countries (flag, name, dial code) — portaled to
 * document.body (see useAnchoredPopover) so it always renders on top,
 * unclipped by the phone pill's `overflow-hidden`.
 */
export const PhoneCountrySelect: React.FC<Props> = ({ value, onChange }) => {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const { coords, buttonRef, popoverRef, searchRef } = useAnchoredPopover(open, POPOVER_WIDTH, () => setOpen(false));

    const filtered = useMemo(() => filterCountries(PHONE_COUNTRIES, query), [query]);

    return (
        <>
            <button
                ref={buttonRef}
                type="button"
                onClick={() => { setOpen(o => !o); setQuery(''); }}
                aria-label={`Country calling code: ${value.name} +${value.dial}`}
                aria-expanded={open}
                className="flex-shrink-0 self-stretch px-3 bg-slate-50 border-r border-slate-300 flex items-center gap-1.5 hover:bg-slate-100 transition-colors"
            >
                {/* Flag emoji glyphs render clipped/squished below ~24px in some
                    browsers' emoji fonts, so this is sized at 24px with normal
                    (unconstrained) line-height rather than boxed into a tight
                    w-5 h-5 leading-none span — that tighter box was cropping the
                    glyph's actual paint bounds. */}
                <span className="text-2xl leading-none" aria-hidden>
                    {flagEmoji(value.iso2)}
                </span>
                <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && coords && createPortal(
                <div
                    ref={popoverRef}
                    className="fixed z-50 w-64 bg-white shadow-xl shadow-gray-200/60 rounded-2xl border border-gray-100 overflow-hidden mw-anim"
                    style={{ top: coords.top, left: coords.left, animation: 'mw-fade-up 0.15s ease-out both' }}
                >
                    <CountryOptionList
                        countries={filtered}
                        query={query}
                        onQueryChange={setQuery}
                        selectedIso2={value.iso2}
                        onSelect={(country) => { onChange(country); setOpen(false); }}
                        renderRight={(c) => `+${c.dial}`}
                        searchRef={searchRef}
                    />
                </div>,
                document.body
            )}
        </>
    );
};

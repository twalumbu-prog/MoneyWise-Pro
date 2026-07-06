import React, { useState } from 'react';
import { Lock } from 'lucide-react';
import { BusinessProfile } from '../../services/onboarding.service';
import { StepFooter, ErrorBanner } from './ui';
import { PhoneCountrySelect } from './PhoneCountrySelect';
import { PhoneCountry, PHONE_COUNTRIES, DEFAULT_PHONE_COUNTRY } from './phoneCountryCodes';

interface Props {
    profile: BusinessProfile | null;
    onSave: (patch: Partial<BusinessProfile>) => Promise<void>;
    onBack: () => void;
    saving: boolean;
}

/** Split a stored "+<dial> <national>" phone string back into its parts, for
 *  resuming an in-progress step. Falls back to the default country if the
 *  stored value doesn't start with a recognised dial code. */
const parseStoredPhone = (phone: string | null): { country: PhoneCountry; national: string } => {
    const trimmed = (phone || '').trim();
    if (trimmed.startsWith('+')) {
        const digits = trimmed.slice(1);
        // Longest dial-code match first so '+27...' isn't mistaken for '+2...'.
        const match = [...PHONE_COUNTRIES].sort((a, b) => b.dial.length - a.dial.length)
            .find(c => digits.startsWith(c.dial));
        if (match) {
            return { country: match, national: trimmed.slice(1 + match.dial.length).trim() };
        }
    }
    return { country: DEFAULT_PHONE_COUNTRY, national: trimmed };
};

/** Step 3 — business phone number. A single, focused question. */
export const StepContact: React.FC<Props> = ({ profile, onSave, onBack, saving }) => {
    const initial = parseStoredPhone(profile?.phone ?? null);
    const [country, setCountry] = useState<PhoneCountry>(initial.country);
    const [national, setNational] = useState(initial.national);
    const [fieldError, setFieldError] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        const digitsOnly = national.replace(/\D/g, '');
        if (digitsOnly.length < 7) {
            setFieldError('Enter a valid phone number.');
            return;
        }
        setFieldError(null);

        try {
            await onSave({ phone: `+${country.dial} ${national.trim()}` });
        } catch (err: any) {
            setError(err.message || 'Failed to save your phone number.');
        }
    };

    return (
        <form onSubmit={handleSubmit} noValidate>
            <ErrorBanner message={error} />

            <div className="flex flex-col items-center gap-6">
                <div className="w-full">
                    <label htmlFor="business-phone" className="block text-sm font-semibold text-gray-800 mb-2">
                        Phone Number
                    </label>
                    <div
                        className={`min-h-12 bg-white rounded-full border flex items-stretch overflow-hidden transition-all focus-within:ring-2 ${
                            fieldError
                                ? 'border-red-300 focus-within:ring-red-100'
                                : 'border-slate-300 focus-within:ring-blue-600/20 focus-within:border-blue-600'
                        }`}
                    >
                        <PhoneCountrySelect value={country} onChange={setCountry} />
                        <div className="flex-1 flex items-center gap-1.5 px-3">
                            <span className="text-gray-600 text-base font-semibold">+{country.dial}</span>
                            <input
                                id="business-phone"
                                type="tel"
                                inputMode="tel"
                                autoComplete="tel-national"
                                autoFocus
                                placeholder="(077) 725-3009"
                                value={national}
                                onChange={(e) => { setNational(e.target.value); setFieldError(null); }}
                                className="flex-1 min-w-0 bg-transparent outline-none text-base text-gray-800 placeholder-gray-400"
                            />
                        </div>
                    </div>
                    {fieldError && <p className="mt-1.5 text-xs font-bold text-red-600 text-center">{fieldError}</p>}
                </div>

                <div className="flex flex-col items-center gap-3.5 text-center">
                    <Lock className="h-6 w-6 text-slate-400" strokeWidth={1.5} />
                    <p className="mw-font-dmsans text-gray-600 text-sm leading-6 max-w-xs">
                        Your phone number will be kept private and we don't share to anyone.
                    </p>
                </div>
            </div>

            <StepFooter onBack={onBack} loading={saving} submit />
        </form>
    );
};

import React, { useState } from 'react';
import { Flag, MapPin, Building2, Pencil, LocateFixed, Loader2 } from 'lucide-react';
import { BusinessProfile } from '../../services/onboarding.service';
import { StepFooter, ErrorBanner } from './ui';
import { CountrySelect } from './CountrySelect';
import { PhoneCountry, PHONE_COUNTRIES, DEFAULT_PHONE_COUNTRY } from './phoneCountryCodes';

const GOOGLE_KEY: string | undefined = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

interface AddressFields {
    country: PhoneCountry;
    stateProvince: string;
    street: string;
    plotSuite: string;
    latitude: number | null;
    longitude: number | null;
}

interface Props {
    profile: BusinessProfile | null;
    onSave: (patch: Partial<BusinessProfile>) => Promise<void>;
    onBack: () => void;
    saving: boolean;
}

// ── Google Maps loader (only when a key is configured) ───────────────────────
let googlePromise: Promise<any> | null = null;
const loadGoogle = (): Promise<any> => {
    if (!GOOGLE_KEY) return Promise.reject(new Error('no key'));
    const w = window as any;
    if (w.google?.maps) return Promise.resolve(w.google);
    if (!googlePromise) {
        googlePromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_KEY}&libraries=places`;
            script.async = true;
            script.onload = () => resolve((window as any).google);
            script.onerror = () => reject(new Error('Failed to load Google Maps'));
            document.head.appendChild(script);
        });
    }
    return googlePromise;
};

interface ParsedAddress {
    countryName?: string;
    stateProvince?: string;
    street?: string;
    plotSuite?: string;
}

/** Map Google address_components onto our fields. The "State/Province" slot is
 *  intentionally filled with the city when one exists (falling back to the
 *  administrative area) — this form only has one region field. */
const parseGoogleComponents = (components: any[]): ParsedAddress => {
    const get = (type: string) => components.find((x: any) => x.types.includes(type))?.long_name || '';
    const city = get('locality') || get('postal_town') || get('sublocality');
    const admin = get('administrative_area_level_1');
    return {
        countryName: get('country'),
        stateProvince: city || admin,
        street: [get('route'), get('sublocality_level_1')].filter(Boolean).join(', '),
        plotSuite: get('street_number'),
    };
};

/** Reverse geocode: Google when configured, OpenStreetMap Nominatim otherwise. */
const reverseGeocode = async (lat: number, lon: number): Promise<ParsedAddress> => {
    if (GOOGLE_KEY) {
        try {
            const google = await loadGoogle();
            const geocoder = new google.maps.Geocoder();
            const { results } = await geocoder.geocode({ location: { lat, lng: lon } });
            if (results?.[0]) return parseGoogleComponents(results[0].address_components);
        } catch {
            // fall through to Nominatim
        }
    }
    const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&accept-language=en`,
        { headers: { Accept: 'application/json' } }
    );
    if (!res.ok) throw new Error('Reverse geocoding failed');
    const data = await res.json();
    const a = data.address || {};
    return {
        countryName: a.country || '',
        stateProvince: a.city || a.town || a.village || a.suburb || a.state || a.region || '',
        street: a.road || a.neighbourhood || '',
        plotSuite: a.house_number || '',
    };
};

const findCountryByName = (name: string | undefined): PhoneCountry | null => {
    if (!name) return null;
    const q = name.trim().toLowerCase();
    return PHONE_COUNTRIES.find(c => c.name.toLowerCase() === q) || null;
};

/** Step 4 — business address: Country, State/Province, Street, Apartment/Suite. */
export const StepAddress: React.FC<Props> = ({ profile, onSave, onBack, saving }) => {
    const [fields, setFields] = useState<AddressFields>({
        country: findCountryByName(profile?.country ?? undefined) || DEFAULT_PHONE_COUNTRY,
        stateProvince: profile?.province || profile?.city || '',
        street: profile?.street || '',
        plotSuite: profile?.plot_number || '',
        latitude: profile?.latitude ?? null,
        longitude: profile?.longitude ?? null,
    });
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [error, setError] = useState<string | null>(null);
    const [locating, setLocating] = useState(false);
    const [located, setLocated] = useState(false);

    const set = (field: 'stateProvince' | 'street' | 'plotSuite') => (e: React.ChangeEvent<HTMLInputElement>) => {
        setFields(f => ({ ...f, [field]: e.target.value }));
        setErrors(({ [field]: _, ...rest }) => rest);
    };

    const useCurrentLocation = () => {
        setError(null);
        if (!navigator.geolocation) {
            setError('Your browser does not support location access. Please enter your address manually.');
            return;
        }
        setLocating(true);
        navigator.geolocation.getCurrentPosition(
            async ({ coords }) => {
                try {
                    const parsed = await reverseGeocode(coords.latitude, coords.longitude);
                    setFields(f => ({
                        ...f,
                        country: findCountryByName(parsed.countryName) || f.country,
                        stateProvince: parsed.stateProvince || f.stateProvince,
                        street: parsed.street || f.street,
                        plotSuite: parsed.plotSuite || f.plotSuite,
                        latitude: coords.latitude,
                        longitude: coords.longitude,
                    }));
                    setErrors({});
                    setLocated(true);
                    setTimeout(() => setLocated(false), 2500);
                } catch {
                    setError('We found your location but could not look up the address. Please fill it in manually.');
                } finally {
                    setLocating(false);
                }
            },
            () => {
                setLocating(false);
                setError('Location access was denied. You can enter your address manually below.');
            },
            { enableHighAccuracy: true, timeout: 12000 }
        );
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const next: Record<string, string> = {};
        if (!fields.stateProvince.trim()) next.stateProvince = 'State/Province is required';
        if (!fields.street.trim()) next.street = 'Street address is required';
        setErrors(next);
        if (Object.keys(next).length > 0) return;

        try {
            setError(null);
            await onSave({
                country: fields.country.name,
                province: fields.stateProvince.trim(),
                street: fields.street.trim(),
                plot_number: fields.plotSuite.trim() || null,
                latitude: fields.latitude,
                longitude: fields.longitude,
            });
        } catch (err: any) {
            setError(err.message || 'Failed to save the address.');
        }
    };

    return (
        <form onSubmit={handleSubmit} noValidate>
            <ErrorBanner message={error} />

            <div className="flex flex-col gap-6">
                <button
                    type="button"
                    onClick={useCurrentLocation}
                    disabled={locating}
                    className={`w-full inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-full text-sm font-bold border transition-all active:scale-[0.98] ${
                        located
                            ? 'border-green-200 bg-green-50 text-green-700'
                            : 'border-blue-600/30 text-blue-700 hover:bg-blue-50'
                    } disabled:opacity-60`}
                >
                    {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
                    {located ? 'Location found!' : 'Use Current Location'}
                </button>

                <CountrySelect
                    label="Country"
                    value={fields.country}
                    onChange={(country) => setFields(f => ({ ...f, country }))}
                />

                <div>
                    <label htmlFor="state-province" className="block text-sm font-semibold text-gray-800 mb-2">
                        State/Province
                    </label>
                    <div className={`min-h-12 p-3 bg-white rounded-full border flex items-center gap-2 transition-all focus-within:ring-2 ${
                        errors.stateProvince ? 'border-red-300 focus-within:ring-red-100' : 'border-slate-300 focus-within:ring-blue-600/20'
                    }`}>
                        <Flag className="h-5 w-5 text-gray-600 flex-shrink-0" strokeWidth={1.75} />
                        <input
                            id="state-province"
                            placeholder="London"
                            value={fields.stateProvince}
                            onChange={set('stateProvince')}
                            className="flex-1 min-w-0 bg-transparent outline-none text-base text-gray-800 placeholder-gray-400"
                        />
                    </div>
                    {errors.stateProvince && <p className="mt-1.5 text-xs font-bold text-red-600">{errors.stateProvince}</p>}
                </div>

                <div>
                    <label htmlFor="street-address" className="block text-sm font-semibold text-gray-800 mb-2">
                        Street Address
                    </label>
                    <div className={`min-h-12 p-3 bg-white rounded-full border flex items-center gap-2 transition-all focus-within:ring-2 ${
                        errors.street ? 'border-red-300 focus-within:ring-red-100' : 'border-slate-300 focus-within:ring-blue-600/20'
                    }`}>
                        <MapPin className="h-5 w-5 text-gray-600 flex-shrink-0" strokeWidth={1.75} />
                        <input
                            id="street-address"
                            placeholder="Great East Road"
                            value={fields.street}
                            onChange={set('street')}
                            className="flex-1 min-w-0 bg-transparent outline-none text-base text-gray-800 placeholder-gray-400"
                        />
                        <Pencil className="h-5 w-5 text-gray-600 flex-shrink-0" strokeWidth={1.75} aria-hidden />
                    </div>
                    {errors.street && <p className="mt-1.5 text-xs font-bold text-red-600">{errors.street}</p>}
                </div>

                <div>
                    <label htmlFor="plot-suite" className="block text-sm font-semibold text-gray-800 mb-2">
                        Apartment/Suite or House/Plot No.
                    </label>
                    <div className="min-h-12 p-3 bg-white rounded-full border border-slate-300 flex items-center gap-2 transition-all focus-within:ring-2 focus-within:ring-blue-600/20">
                        <Building2 className="h-5 w-5 text-gray-600 flex-shrink-0" strokeWidth={1.75} />
                        <input
                            id="plot-suite"
                            placeholder="Plot 254"
                            value={fields.plotSuite}
                            onChange={set('plotSuite')}
                            className="flex-1 min-w-0 bg-transparent outline-none text-base text-gray-800 placeholder-gray-400"
                        />
                        <Pencil className="h-5 w-5 text-gray-600 flex-shrink-0" strokeWidth={1.75} aria-hidden />
                    </div>
                </div>
            </div>

            <StepFooter onBack={onBack} loading={saving} submit />
        </form>
    );
};

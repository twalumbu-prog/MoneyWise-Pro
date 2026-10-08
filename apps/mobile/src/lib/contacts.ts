import { Linking } from 'react-native';

/**
 * Device contacts for "Send money → Mobile Money": search by name, get Zambian mobile numbers.
 *
 * `expo-contacts` is a native module, so it is loaded lazily and defensively — a build that doesn't
 * include it (an older dev client) just reports "unavailable" instead of crashing the app at import.
 * Contacts are read on the device only; nothing is sent anywhere.
 */

export interface ContactNumber {
    /** Stable key for lists. */
    id: string;
    name: string;
    /** Local format the app uses everywhere: 0971234567. */
    number: string;
    /** "mobile", "home"… as labelled in the phone's contacts. */
    label: string;
}

export type ContactsAccess = 'granted' | 'denied' | 'unavailable';

let nativeModule: any | null | undefined;
function contactsModule(): any | null {
    if (nativeModule !== undefined) return nativeModule;
    try { nativeModule = require('expo-contacts'); } catch { nativeModule = null; }
    return nativeModule;
}

/** 0971234567 / +260 97 123 4567 / 260971234567 / 971234567 → 0971234567; anything else → null. */
export function toZambianMobile(raw: string): string | null {
    let d = (raw || '').replace(/[^0-9]/g, '');
    if (d.startsWith('260')) d = d.slice(3);
    if (d.length === 9) d = `0${d}`;
    return /^0(7[5-7]|9[5-7])\d{7}$/.test(d) ? d : null;
}

let cache: ContactNumber[] | null = null;

/** Asks for access (once; the OS remembers) and reports the result. */
export async function requestContactsAccess(): Promise<ContactsAccess> {
    const mod = contactsModule();
    if (!mod) return 'unavailable';
    try {
        const current = await mod.getPermissionsAsync();
        if (current.status === 'granted') return 'granted';
        if (current.canAskAgain === false) return 'denied';
        const asked = await mod.requestPermissionsAsync();
        return asked.status === 'granted' ? 'granted' : 'denied';
    } catch { return 'unavailable'; }
}

/** Every contact number that is a Zambian mobile number, sorted by name. Loaded once per session. */
export async function loadContactNumbers(): Promise<ContactNumber[]> {
    if (cache) return cache;
    const mod = contactsModule();
    if (!mod) return [];
    const { data } = await mod.getContactsAsync({ fields: [mod.Fields.Name, mod.Fields.PhoneNumbers], sort: mod.SortTypes?.FirstName });
    const out: ContactNumber[] = [];
    for (const c of data || []) {
        const name = String(c.name || '').trim();
        if (!name) continue;
        const seen = new Set<string>();
        for (const p of c.phoneNumbers || []) {
            const number = toZambianMobile(String(p.number || p.digits || ''));
            if (!number || seen.has(number)) continue;
            seen.add(number);
            out.push({ id: `${c.id}:${number}`, name, number, label: String(p.label || 'mobile').toLowerCase() });
        }
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    cache = out;
    return out;
}

export function searchContactNumbers(all: ContactNumber[], query: string, limit = 25): ContactNumber[] {
    const q = query.trim().toLowerCase();
    if (!q) return all.slice(0, limit);
    const digits = q.replace(/[^0-9]/g, '');
    return all
        .filter((c) => c.name.toLowerCase().includes(q) || (digits.length >= 3 && c.number.includes(digits)))
        .slice(0, limit);
}

export const openAppSettings = () => Linking.openSettings().catch(() => undefined);

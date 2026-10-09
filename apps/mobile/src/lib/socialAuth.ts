import { Platform } from 'react-native';
import * as Crypto from 'expo-crypto';
import { apiJson } from 'core';
import { supabase } from './supabase';

/**
 * Sign in / sign up with Apple and Google.
 *
 * Both end in a normal Supabase session, so the rest of the app (AuthContext, the org gate) needs no
 * special casing. If the email already belongs to an email/password account, Supabase links the new
 * Google/Apple identity to that SAME account (it only does so when the email is verified on both sides),
 * so nobody ends up with two accounts.
 *
 *  - Apple (iOS): the native sheet → an identity token → supabase.signInWithIdToken. Apple shares the
 *    person's name only on the very first sign-in, so it is saved to their profile straight away.
 *  - Google (and Apple on Android): Supabase's OAuth page in the system browser, returning to the app
 *    through the moneywise:// link with the session tokens.
 *
 * Native modules are loaded lazily so a build without them reports "unavailable" instead of crashing.
 */

export type SocialProvider = 'google' | 'apple';
export class SocialAuthCancelled extends Error { constructor() { super('cancelled'); } }

const REDIRECT = 'moneywise://auth/callback';

function load<T>(name: string): T | null {
    try { return require(name) as T; } catch { return null; }
}

/** Whether the native Apple sheet exists on this device/build. */
export async function appleNativeAvailable(): Promise<boolean> {
    if (Platform.OS !== 'ios') return false;
    const mod = load<any>('expo-apple-authentication');
    if (!mod) return false;
    try { return await mod.isAvailableAsync(); } catch { return false; }
}

const randomNonce = () => {
    const bytes = Crypto.getRandomBytes(16);
    return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
};

async function signInWithAppleNative(): Promise<void> {
    const Apple = load<any>('expo-apple-authentication');
    if (!Apple) throw new Error('Sign in with Apple isn’t available in this version of the app.');
    const rawNonce = randomNonce();
    const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
    let credential: any;
    try {
        credential = await Apple.signInAsync({
            requestedScopes: [Apple.AppleAuthenticationScope.FULL_NAME, Apple.AppleAuthenticationScope.EMAIL],
            nonce: hashed,
        });
    } catch (e: any) {
        if (e?.code === 'ERR_REQUEST_CANCELED') throw new SocialAuthCancelled();
        throw e;
    }
    if (!credential?.identityToken) throw new Error('Apple did not return a sign-in token. Please try again.');

    const { error } = await supabase.auth.signInWithIdToken({ provider: 'apple', token: credential.identityToken, nonce: rawNonce });
    if (error) throw error;

    // Apple only shares the name this once — keep it.
    const n = credential.fullName;
    const fullName = [n?.givenName, n?.familyName].filter(Boolean).join(' ').trim();
    if (fullName) {
        await supabase.auth.updateUser({ data: { full_name: fullName, name: fullName } }).catch(() => undefined);
        await apiJson('/auth/social-profile', { method: 'POST', body: JSON.stringify({ name: fullName }) }).catch(() => undefined);
    }
}

/** Reads the session tokens Supabase puts after the # in the redirect link. */
function tokensFromUrl(url: string): { access_token?: string; refresh_token?: string; error?: string } {
    const parts = url.split('#')[1] ?? url.split('?')[1] ?? '';
    const p = new URLSearchParams(parts);
    return {
        access_token: p.get('access_token') ?? undefined,
        refresh_token: p.get('refresh_token') ?? undefined,
        error: p.get('error_description') ?? p.get('error') ?? undefined,
    };
}

async function signInWithBrowser(provider: SocialProvider): Promise<void> {
    const Browser = load<any>('expo-web-browser');
    if (!Browser) throw new Error('This sign-in method isn’t available in this version of the app.');

    const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: REDIRECT, skipBrowserRedirect: true, queryParams: provider === 'google' ? { prompt: 'select_account' } : undefined },
    });
    if (error || !data?.url) throw error ?? new Error('Could not start sign-in.');

    const result = await Browser.openAuthSessionAsync(data.url, REDIRECT);
    if (result.type !== 'success' || !result.url) throw new SocialAuthCancelled();

    const t = tokensFromUrl(result.url);
    if (t.error) throw new Error(t.error);
    if (!t.access_token || !t.refresh_token) throw new Error('Sign-in didn’t complete. Please try again.');
    const { error: sessionError } = await supabase.auth.setSession({ access_token: t.access_token, refresh_token: t.refresh_token });
    if (sessionError) throw sessionError;
}

/** Signs in (or up — a new Google/Apple login simply creates the account). Throws SocialAuthCancelled if the person backs out. */
export async function signInWithSocial(provider: SocialProvider): Promise<void> {
    if (provider === 'apple' && (await appleNativeAvailable())) return signInWithAppleNative();
    return signInWithBrowser(provider);
}


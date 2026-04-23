import { supabase } from './supabase';

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');

export async function apiFetch(path: string, options: RequestInit = {}) {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    const headers = {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        ...options.headers,
    };

    const response = await fetch(`${API_URL}${path.startsWith('/') ? path : `/${path}`}`, {
        ...options,
        headers,
    });

    if (response.status === 401) {
        // Token is invalid or expired. Force a sign out to clear state and redirect to login.
        console.warn('Unauthorized (401) detected. Signing out...');
        await supabase.auth.signOut();
        // The onAuthStateChange listener in AuthContext will handle the state update and redirect.
        throw new Error('Unauthorized');
    }

    return response;
}

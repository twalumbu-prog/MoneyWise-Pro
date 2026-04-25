import { supabase } from './supabase';

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');

export async function apiFetch(path: string, options: RequestInit = {}) {
    console.log(`[API Client] Fetching: ${path}`);
    
    // Add a timeout to getSession to prevent endless hanging if Supabase is unresponsive
    const sessionPromise = supabase.auth.getSession();
    const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Session fetch timeout')), 5000)
    );

    let session = null;
    try {
        const result: any = await Promise.race([sessionPromise, timeoutPromise]);
        session = result.data?.session;
    } catch (err) {
        console.warn('[API Client] Session fetch failed or timed out:', err);
        // Continue without session, let the backend handle auth failure
    }
    
    const token = session?.access_token;

    const headers = {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        ...options.headers,
    };

    console.log(`[API Client] Fetching: ${path}`);
    const response = await fetch(`${API_URL}${path.startsWith('/') ? path : `/${path}`}`, {
        ...options,
        headers,
    });
    console.log(`[API Client] Response status: ${response.status} for ${path}`);

    if (response.status === 401) {
        // Token is invalid or expired. Force a sign out to clear state and redirect to login.
        console.warn('Unauthorized (401) detected. Signing out...');
        await supabase.auth.signOut();
        // The onAuthStateChange listener in AuthContext will handle the state update and redirect.
        throw new Error('Unauthorized');
    }

    if (!response.ok) {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            const errorData = await response.json();
            throw new Error(errorData.error || errorData.message || `API Error: ${response.status}`);
        } else {
            const text = await response.text();
            console.error('[API Client] Non-JSON error response:', text.slice(0, 500));
            throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }
    }

    return response;
}

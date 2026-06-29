import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { apiGet, ApiError, getSessionSafe } from '../lib/api';

interface AdminAuthContextType {
    session: Session | null;
    user: User | null;
    /** null = unknown/checking, true = allowlisted super-admin, false = denied. */
    isSuperAdmin: boolean | null;
    loading: boolean;
    signIn: (email: string, password: string) => Promise<void>;
    signOut: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthContextType | undefined>(undefined);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
    const [session, setSession] = useState<Session | null>(null);
    const [user, setUser] = useState<User | null>(null);
    const [isSuperAdmin, setIsSuperAdmin] = useState<boolean | null>(null);
    const [loading, setLoading] = useState(true);
    // Ensures the /admin/me gate check runs at most once per session — without this, a
    // token refresh during a slow page load re-triggers verify → getSession → refresh,
    // an infinite loop that remounts the page and refetches endlessly.
    const checkedRef = useRef(false);

    // Verify super-admin allowlisting by hitting /admin/me (403 => not allowed).
    async function verifySuperAdmin() {
        if (checkedRef.current) return;
        checkedRef.current = true;
        try {
            await apiGet('/admin/me', 20000); // fast gate; short timeout
            setIsSuperAdmin(true);
        } catch (err) {
            if (err instanceof ApiError && (err.status === 403 || err.status === 401)) {
                setIsSuperAdmin(false); // definitively denied
            } else {
                checkedRef.current = false; // transient/network — allow a later retry
                setIsSuperAdmin(false);
            }
        }
    }

    useEffect(() => {
        let cancelled = false;
        // Safety valve: a stalled getSession()/auth must never pin the spinner forever.
        const failsafe = setTimeout(() => { if (!cancelled) setLoading(false); }, 8000);

        getSessionSafe().then(async (session) => {
            if (cancelled) return;
            setSession(session);
            setUser(session?.user ?? null);
            if (session) await verifySuperAdmin();
            setLoading(false);
        });

        // IMPORTANT: this callback must be synchronous and must NOT await — Supabase waits
        // for it to finish before signInWithPassword resolves, and calling the API (which
        // calls getSession) inside it while the auth lock is held DEADLOCKS the sign-in
        // (the button spins forever). So we set state synchronously and defer the API check
        // to a macrotask, which runs after the auth lock is released.
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
            setSession(newSession);
            setUser(newSession?.user ?? null);
            setLoading(false);
            if (!newSession) {
                checkedRef.current = false;
                setIsSuperAdmin(null);
                return;
            }
            // Only (re)check super-admin on an actual sign-in / first load — NOT on
            // TOKEN_REFRESHED / USER_UPDATED, which fire periodically and would otherwise
            // re-trigger verify → getSession → refresh → an infinite loop that remounts
            // the page and refetches endlessly.
            if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && !checkedRef.current) {
                setIsSuperAdmin(null);
                setTimeout(() => { void verifySuperAdmin(); }, 0);
            }
        });

        return () => { cancelled = true; clearTimeout(failsafe); subscription.unsubscribe(); };
    }, []);

    const signIn = async (email: string, password: string) => {
        // Hard timeout so the sign-in button can never spin forever if the auth client stalls.
        const result: any = await Promise.race([
            supabase.auth.signInWithPassword({ email, password }),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Sign-in timed out — please refresh the page and try again.')), 15000),
            ),
        ]);
        if (result?.error) throw result.error;
    };

    const signOut = async () => {
        checkedRef.current = false;
        await supabase.auth.signOut();
        setIsSuperAdmin(null);
    };

    return (
        <AdminAuthContext.Provider value={{ session, user, isSuperAdmin, loading, signIn, signOut }}>
            {children}
        </AdminAuthContext.Provider>
    );
}

export function useAdminAuth() {
    const ctx = useContext(AdminAuthContext);
    if (!ctx) throw new Error('useAdminAuth must be used within AdminAuthProvider');
    return ctx;
}

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { clearCache } from '../platform/storage';

import type { UserRole } from 'core';
export type { UserRole };

interface AuthContextValue {
    user: User | null;
    session: Session | null;
    loading: boolean;
    userName: string | null;
    userRole: UserRole | null;
    userStatus: string | null;
    organizationId: string | null;
    organizationName: string | null;
    signInWithPassword: (identifier: string, password: string) => Promise<void>;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [session, setSession] = useState<Session | null>(null);
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [userName, setUserName] = useState<string | null>(null);
    const [userRole, setUserRole] = useState<UserRole | null>(null);
    const [userStatus, setUserStatus] = useState<string | null>(null);
    const [organizationId, setOrganizationId] = useState<string | null>(null);
    const [organizationName, setOrganizationName] = useState<string | null>(null);

    const mounted = useRef(true);

    // Supabase's auto-refresh runs on a timer, which iOS and Android suspend in
    // the background. Without this the token is stale on resume and the first
    // request after unlocking eats a 401 round-trip — the web app never needs
    // it because a tab is either alive or gone.
    useEffect(() => {
        const sub = AppState.addEventListener('change', (state) => {
            if (state === 'active') supabase.auth.startAutoRefresh();
            else supabase.auth.stopAutoRefresh();
        });
        supabase.auth.startAutoRefresh();
        return () => sub.remove();
    }, []);

    useEffect(() => {
        mounted.current = true;

        const loadProfile = async (userId: string) => {
            // Same query the web AuthContext runs — one of only two places any
            // client reads Supabase directly instead of going through the API.
            const { data, error } = await supabase
                .from('users')
                .select('role, status, name, organization_id, organizations(name)')
                .eq('id', userId)
                .single();

            if (!mounted.current) return;
            if (error || !data) return;

            const row = data as any;
            setUserName(row.name ?? null);
            setUserRole(row.role ?? null);
            setUserStatus(row.status ?? null);
            setOrganizationId(row.organization_id ?? null);
            setOrganizationName(row.organizations?.name ?? null);
        };

        supabase.auth.getSession().then(async ({ data }) => {
            if (!mounted.current) return;
            setSession(data.session);
            setUser(data.session?.user ?? null);
            if (data.session?.user) await loadProfile(data.session.user.id);
            if (mounted.current) setLoading(false);
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, next) => {
            if (!mounted.current) return;
            setSession(next);
            setUser(next?.user ?? null);
            if (next?.user) {
                await loadProfile(next.user.id);
            } else {
                setUserName(null);
                setUserRole(null);
                setUserStatus(null);
                setOrganizationId(null);
                setOrganizationName(null);
            }
            if (mounted.current) setLoading(false);
        });

        return () => {
            mounted.current = false;
            subscription.unsubscribe();
        };
    }, []);

    const signInWithPassword = async (identifier: string, password: string) => {
        let email = identifier.trim();

        // Staff sign in with a username as often as an email, so resolve it the
        // same way the web app does before handing Supabase an address.
        if (!email.includes('@')) {
            const { getCore } = await import('core');
            const apiUrl = getCore().env.apiUrl;
            const res = await fetch(`${apiUrl}/auth/resolve-username`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: email }),
            });
            const body = await res.json();
            if (!res.ok) throw new Error(body.error || 'Username not found');
            email = body.email;
        }

        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
    };

    const signOut = async () => {
        await supabase.auth.signOut();
        // Financial data must never outlive the session on a shared device.
        clearCache();
    };

    return (
        <AuthContext.Provider
            value={{
                user, session, loading, userName, userRole, userStatus,
                organizationId, organizationName, signInWithPassword, signOut,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = (): AuthContextValue => {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
    return ctx;
};

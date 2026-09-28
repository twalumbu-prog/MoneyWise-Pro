import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { clearCache, cacheStore } from '../platform/storage';
import { queryClient } from '../lib/queryClient';
import { registerForPushNotificationsAsync } from '../lib/pushNotifications';
import { userService } from 'core';

import type { UserRole } from 'core';
export type { UserRole };

export interface UserOrganization {
    role: UserRole;
    status: string;
    employee_id: string | null;
    organization: { id: string; name: string; slug?: string; logo_url?: string | null };
}

interface AuthContextValue {
    user: User | null;
    session: Session | null;
    loading: boolean;
    userName: string | null;
    userRole: UserRole | null;
    userStatus: string | null;
    organizationId: string | null;
    organizationName: string | null;
    userOrganizations: UserOrganization[];
    refreshUserOrganizations: () => Promise<void>;
    switchOrganization: (organizationId: string) => Promise<void>;
    signInWithPassword: (identifier: string, password: string, preferredAccountType?: 'INDIVIDUAL' | 'BUSINESS') => Promise<void>;
    signUp: (email: string, password: string, name: string, organizationName: string, username: string) => Promise<void>;
    joinOrganization: (email: string, password: string, name: string, organizationId: string, username: string) => Promise<void>;
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
    const [userOrganizations, setUserOrganizations] = useState<UserOrganization[]>([]);

    const mounted = useRef(true);

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
            const activeOrgId = row.organization_id ?? null;
            setOrganizationId(activeOrgId);
            if (activeOrgId) {
                await cacheStore.set('last_active_organization_id', activeOrgId);
            }
            const orgObj: any = row.organizations;
            const fetchedOrgName = Array.isArray(orgObj) ? orgObj[0]?.name : orgObj?.name;
            setOrganizationName(fetchedOrgName ?? null);
            await refreshUserOrganizations();

            registerForPushNotificationsAsync().then((result) => {
                if (!result || !mounted.current) return;
                userService.registerPushToken(result.token, result.platform)
                    .catch((err) => console.warn('[Push] Failed to register token with backend:', err));
            });
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
                setUserOrganizations([]);
            }
            if (mounted.current) setLoading(false);
        });

        return () => {
            mounted.current = false;
            subscription.unsubscribe();
        };
    }, []);

    const isPersonalOrg = (name?: string) => {
        if (!name) return false;
        const n = name.toLowerCase();
        return n.includes('workspace') || n.includes('personal') || n.includes('individual');
    };

    const signInWithPassword = async (identifier: string, password: string, preferredAccountType?: 'INDIVIDUAL' | 'BUSINESS') => {
        let email = identifier.trim();

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

        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;

        if (preferredAccountType && data.session) {
            try {
                const { getCore } = await import('core');
                const apiUrl = getCore().env.apiUrl;
                const res = await fetch(`${apiUrl}/auth/my-organizations`, {
                    headers: { Authorization: `Bearer ${data.session.access_token}` },
                });

                let orgs: UserOrganization[] = [];
                if (res.ok) {
                    orgs = (await res.json()) || [];
                    setUserOrganizations(orgs);
                }

                if (preferredAccountType === 'INDIVIDUAL') {
                    const personalOrgs = orgs.filter((o) => isPersonalOrg(o.organization?.name));
                    if (personalOrgs.length === 0) {
                        await signOut();
                        throw new Error(
                            "You do not have a Personal Account associated with this email. Please switch to 'For Businesses' or create a Personal Account using 'Sign Up Now'."
                        );
                    }
                    if (personalOrgs.length === 1) {
                        await switchOrganization(personalOrgs[0].organization.id);
                    }
                } else if (preferredAccountType === 'BUSINESS') {
                    const bizOrgs = orgs.filter((o) => !isPersonalOrg(o.organization?.name));
                    if (bizOrgs.length === 0) {
                        await signOut();
                        throw new Error(
                            "You do not have a Business Account associated with this email. Please switch to 'For Individuals' or create a Business Account using 'Sign Up Now'."
                        );
                    }
                    if (bizOrgs.length === 1) {
                        await switchOrganization(bizOrgs[0].organization.id);
                    }
                }
            } catch (err: any) {
                if (err.message?.includes('You do not have a')) {
                    throw err;
                }
                console.warn('[AuthContext] Strict account verification error:', err);
                throw err;
            }
        }
    };

    const signUp = async (email: string, password: string, name: string, organizationName: string, username: string) => {
        const { getCore } = await import('core');
        const apiUrl = getCore().env.apiUrl;
        const res = await fetch(`${apiUrl}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, name, organizationName, username }),
        });
        const data = await res.json();
        if (!res.ok) {
            if (data.suggestion) throw new Error(JSON.stringify(data));
            throw new Error(data.error || 'Registration failed');
        }
    };

    const joinOrganization = async (email: string, password: string, name: string, organizationId: string, username: string) => {
        const { getCore } = await import('core');
        const apiUrl = getCore().env.apiUrl;
        const res = await fetch(`${apiUrl}/auth/join-request`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, name, organizationId, username }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Join request failed');
    };

    const refreshUserOrganizations = async () => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;
            const { getCore } = await import('core');
            const apiUrl = getCore().env.apiUrl;
            const res = await fetch(`${apiUrl}/auth/my-organizations`, {
                headers: { Authorization: `Bearer ${session.access_token}` },
            });
            if (res.ok) setUserOrganizations((await res.json()) || []);
        } catch (err) {
            console.error('Failed to fetch user organizations:', err);
        }
    };

    const switchOrganization = async (orgId: string) => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('No active session');
        const { getCore } = await import('core');
        const apiUrl = getCore().env.apiUrl;
        const res = await fetch(`${apiUrl}/auth/switch-organization`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
            body: JSON.stringify({ organizationId: orgId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to switch organization');

        queryClient.clear();
        clearCache();
        if (orgId) {
            await cacheStore.set('last_active_organization_id', orgId);
        }
        setUserRole(data.user.role);
        setUserStatus(data.user.status);
        setOrganizationId(data.user.organization_id);
        const targetOrg = userOrganizations.find((uo) => uo.organization?.id === orgId);
        setOrganizationName(targetOrg?.organization?.name || 'Selected Organization');
    };

    const signOut = async () => {
        Promise.race([
            (async () => {
                const result = await registerForPushNotificationsAsync();
                if (result) await userService.unregisterPushToken(result.token);
            })(),
            new Promise((resolve) => setTimeout(resolve, 1000)),
        ]).catch((err) => console.warn('[Push] Unregister on sign-out background warning:', err));

        setSession(null);
        setUser(null);
        setUserName(null);
        setUserRole(null);
        setUserStatus(null);
        setOrganizationId(null);
        setOrganizationName(null);
        setUserOrganizations([]);

        try {
            await supabase.auth.signOut();
        } catch (err) {
            console.warn('[Auth] Supabase signOut error:', err);
        }

        queryClient.clear();
        clearCache();
        await cacheStore.remove('last_active_organization_id');
    };

    return (
        <AuthContext.Provider
            value={{
                user, session, loading, userName, userRole, userStatus,
                organizationId, organizationName, userOrganizations, refreshUserOrganizations, switchOrganization,
                signInWithPassword, signUp, joinOrganization, signOut,
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

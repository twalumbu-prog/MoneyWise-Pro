import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { clearCache, cacheStore, secureStore } from '../platform/storage';
import { queryClient } from '../lib/queryClient';
import { registerForPushNotificationsAsync } from '../lib/pushNotifications';
import { userService, setActiveOrganizationId } from 'core';

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
    /** True once the organizations list has really been fetched (or restored), so "no organizations" can be trusted. */
    organizationsLoaded: boolean;
    refreshUserOrganizations: () => Promise<UserOrganization[] | void>;
    switchOrganization: (organizationId: string) => Promise<void>;
    signInWithPassword: (identifier: string, password: string, preferredAccountType?: 'INDIVIDUAL' | 'BUSINESS') => Promise<void>;
    signUp: (email: string, password: string, name: string, organizationName: string, username: string) => Promise<void>;
    joinOrganization: (email: string, password: string, name: string, organizationId: string, username: string) => Promise<void>;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * Offline-first startup. Opening the app must never wait on the network: every request here has a
 * time limit, and the last known profile + organisations are kept on the device so the app can open
 * (showing its saved data) without a connection and refresh itself once one is back.
 */
const SNAPSHOT_KEY = 'auth_snapshot_v1';
interface AuthSnapshot {
    userId: string;
    userName: string | null;
    userRole: UserRole | null;
    userStatus: string | null;
    organizationId: string | null;
    organizationName: string | null;
    userOrganizations: UserOrganization[];
}
/** This DEVICE's own active organization. The server-side default is shared by every device the user is signed in on. */
const DEVICE_ORG_KEY = 'device_active_org_v1';
async function readDeviceOrg(userId: string): Promise<string | null> {
    try {
        const raw = await cacheStore.get(DEVICE_ORG_KEY);
        if (!raw) return null;
        const v = JSON.parse(raw) as { userId: string; orgId: string };
        return v.userId === userId ? v.orgId : null;
    } catch { return null; }
}
const writeDeviceOrg = (userId: string, orgId: string) =>
    cacheStore.set(DEVICE_ORG_KEY, JSON.stringify({ userId, orgId })).catch(() => undefined);

const withTimeout = <T,>(promise: PromiseLike<T>, ms: number): Promise<T> =>
    Promise.race([
        Promise.resolve(promise),
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
    ]);

async function readSnapshot(userId?: string): Promise<AuthSnapshot | null> {
    try {
        const raw = await cacheStore.get(SNAPSHOT_KEY);
        if (!raw) return null;
        const snap = JSON.parse(raw) as AuthSnapshot;
        return !userId || snap.userId === userId ? snap : null;
    } catch { return null; }
}

/** The session Supabase persisted on this device, read straight from the Keychain (no network, no refresh). */
async function readStoredSession(): Promise<Session | null> {
    try {
        const key = (supabase.auth as any).storageKey as string | undefined;
        if (!key) return null;
        const raw = await secureStore.get(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed?.access_token && parsed?.user ? (parsed as Session) : null;
    } catch { return null; }
}

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
    const [organizationsLoaded, setOrganizationsLoaded] = useState(false);

    const mounted = useRef(true);
    const loadingRef = useRef(true);
    loadingRef.current = loading;

    // Keep the last known profile on the device for offline starts.
    useEffect(() => {
        if (!user || !userRole) return;
        const snap: AuthSnapshot = { userId: user.id, userName, userRole, userStatus, organizationId, organizationName, userOrganizations };
        cacheStore.set(SNAPSHOT_KEY, JSON.stringify(snap)).catch(() => undefined);
    }, [user?.id, userName, userRole, userStatus, organizationId, organizationName, userOrganizations]);

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

        const applySnapshot = (snap: AuthSnapshot) => {
            setUserName(snap.userName);
            setUserRole(snap.userRole);
            setUserStatus(snap.userStatus);
            setOrganizationId(snap.organizationId);
            setOrganizationName(snap.organizationName);
            setUserOrganizations(snap.userOrganizations ?? []);
            setOrganizationsLoaded((snap.userOrganizations ?? []).length > 0);
            setActiveOrganizationId(snap.organizationId);
        };

        const loadProfile = async (userId: string) => {
            // Announce this device's own organization from the very first request.
            const preferredOrgId = await readDeviceOrg(userId);
            if (preferredOrgId) setActiveOrganizationId(preferredOrgId);

            let row: any = null;
            try {
                const { data, error } = await withTimeout(
                    supabase
                        .from('users')
                        .select('role, status, name, organization_id, organizations(name)')
                        .eq('id', userId)
                        .single(),
                    5000,
                );
                if (!error && data) row = data;
            } catch { /* offline or slow — fall back to what this device last knew */ }

            if (!mounted.current) return;
            if (!row) {
                const snap = await readSnapshot(userId);
                if (snap && mounted.current) applySnapshot(snap);
                return;
            }

            const orgObj: any = row.organizations;
            const fetchedOrgName = Array.isArray(orgObj) ? orgObj[0]?.name : orgObj?.name;
            let eff = {
                role: (row.role ?? null) as UserRole | null,
                status: (row.status ?? null) as string | null,
                orgId: (row.organization_id ?? null) as string | null,
                name: (fetchedOrgName ?? null) as string | null,
            };
            const orgs = await withTimeout(refreshUserOrganizations(), 5000).catch(() => [] as UserOrganization[]);
            // If this device was last working in a different organization and the user still belongs to
            // it, stay there — another device's switch must not move this one.
            if (preferredOrgId && preferredOrgId !== eff.orgId) {
                const m = orgs.find((o) => o.organization?.id === preferredOrgId && (o.status === 'ACTIVE' || !o.status));
                if (m) eff = { role: m.role, status: 'ACTIVE', orgId: preferredOrgId, name: m.organization?.name ?? null };
            }
            if (!mounted.current) return;
            setActiveOrganizationId(eff.orgId);
            if (eff.orgId) void writeDeviceOrg(userId, eff.orgId);
            setUserName(row.name ?? null);
            setUserRole(eff.role);
            setUserStatus(eff.status);
            setOrganizationId(eff.orgId);
            setOrganizationName(eff.name);

            registerForPushNotificationsAsync().then((result) => {
                if (!result || !mounted.current) return;
                userService.registerPushToken(result.token, result.platform)
                    .catch((err) => console.warn('[Push] Failed to register token with backend:', err));
            });
        };

        const bootstrap = async () => {
            let found: Session | null = null;
            let timedOut = false;
            try {
                found = (await withTimeout(supabase.auth.getSession(), 3500)).data.session;
            } catch { timedOut = true; }
            if (!mounted.current) return;

            if (timedOut) {
                // getSession is waiting on the network (an expired token being refreshed with no signal).
                // Open the app with the session saved on the device instead of making the user wait.
                const stored = await readStoredSession();
                if (!mounted.current) return;
                if (stored?.user) {
                    setSession(stored);
                    setUser(stored.user);
                    const snap = await readSnapshot(stored.user.id);
                    if (snap && mounted.current) applySnapshot(snap);
                    setLoading(false);
                    void loadProfile(stored.user.id); // refresh in the background when the network answers
                    return;
                }
                setLoading(false);
                return;
            }

            if (!found) {
                // Supabase says "no session" — but if the device still holds one, it is only that the
                // expired token can't be refreshed without a connection. Keep the user signed in.
                const stored = await readStoredSession();
                if (stored?.user && mounted.current) {
                    found = stored;
                    const snap = await readSnapshot(stored.user.id);
                    if (snap) applySnapshot(snap);
                }
            }
            setSession(found);
            setUser(found?.user ?? null);
            if (found?.user) await loadProfile(found.user.id);
            if (mounted.current) setLoading(false);
        };
        void bootstrap();

        // Last line of defence: whatever is still hanging, the app opens after 9 s.
        const watchdog = setTimeout(async () => {
            if (!mounted.current || !loadingRef.current) return;
            const stored = await readStoredSession();
            if (!mounted.current || !loadingRef.current) return;
            if (stored?.user) {
                setSession((cur) => cur ?? stored);
                setUser((cur) => cur ?? stored.user);
                const snap = await readSnapshot(stored.user.id);
                if (snap && mounted.current) applySnapshot(snap);
            }
            setLoading(false);
        }, 9000);

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
          // Never await Supabase calls inside this callback: setSession() (used by the Google/Apple browser
          // sign-in) holds the auth lock while listeners run, so getSession()/queries here would deadlock
          // until their timeouts and leave the profile and organizations empty. Defer to the next tick.
          setTimeout(async () => {
            if (!mounted.current) return;
            if (!next) {
                // A signed-out event only counts when nothing is stored any more (signOut clears the
                // Keychain first). While a session is still saved, this is just a failed refresh.
                const stored = await readStoredSession();
                if (stored) return;
            }
            setSession(next);
            setUser(next?.user ?? null);
            if (next?.user) {
                await loadProfile(next.user.id);
            } else {
                cacheStore.remove(SNAPSHOT_KEY).catch(() => undefined);
                setOrganizationsLoaded(false);
                setUserName(null);
                setUserRole(null);
                setUserStatus(null);
                setOrganizationId(null);
                setOrganizationName(null);
                setUserOrganizations([]);
            }
            if (mounted.current) setLoading(false);
          }, 0);
        });

        return () => {
            mounted.current = false;
            clearTimeout(watchdog);
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
            if (!session) return [] as UserOrganization[];
            const { getCore } = await import('core');
            const apiUrl = getCore().env.apiUrl;
            const res = await fetch(`${apiUrl}/auth/my-organizations`, {
                headers: { Authorization: `Bearer ${session.access_token}` },
            });
            if (res.ok) {
                const list = ((await res.json()) || []) as UserOrganization[];
                setUserOrganizations(list);
                setOrganizationsLoaded(true);
                return list;
            }
        } catch (err) {
            console.error('Failed to fetch user organizations:', err);
        }
        return [] as UserOrganization[];
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
            // Remember it for THIS device only and announce it on every request from now on.
            await writeDeviceOrg(session.user.id, orgId);
            setActiveOrganizationId(orgId);
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

        setActiveOrganizationId(null);
        setOrganizationsLoaded(false);
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
                organizationId, organizationName, userOrganizations, organizationsLoaded, refreshUserOrganizations, switchOrganization,
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

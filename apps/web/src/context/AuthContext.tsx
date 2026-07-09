import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { apiFetch } from '../lib/api';
import posthog from '../lib/posthog';
import { trackEvent } from '../lib/analytics';

// Best-effort mapping of backend/Supabase error strings to stable categories.
// Note: Supabase's "Invalid login credentials" deliberately does not
// distinguish wrong password from unknown user (anti account-enumeration) —
// both land under 'invalid_credentials'.
function categorizeAuthError(message: string): string {
    const m = (message || '').toLowerCase();
    if (m.includes('username') && m.includes('taken')) return 'duplicate_username';
    if (m.includes('username not found') || m.includes('username') && m.includes('not found')) return 'username_not_found';
    if (m.includes('password') && m.includes('character')) return 'weak_password';
    if (m.includes('invalid password') || m.includes('invalid login credentials')) return 'invalid_credentials';
    if (m.includes('email not confirmed')) return 'email_not_confirmed';
    if (m.includes('organization') && (m.includes('already exists') || m.includes('taken'))) return 'duplicate_organization_name';
    if (m.includes('organization not found')) return 'organization_not_found';
    if (m.includes('missing required fields')) return 'validation_error';
    if (m.includes('failed to create user account') || m.includes('auth error')) return 'auth_provider_error';
    if (m.includes('failed to create organization') || m.includes('failed to create user profile') || m.includes('failed to link user')) return 'database_error';
    if (m.includes('internal server error')) return 'server_error';
    if (m.includes('failed to fetch') || m.includes('networkerror') || m.includes('network request failed')) return 'network_error';
    return 'unknown';
}

export interface NotificationCounts {
    requisitions: number;
    approvals: number;
    vouchers: number;
    disbursements: number;
    settings: number;
}

interface AuthContextType {
    user: User | null;
    userName: string | null;
    userRole: string | null;
    userStatus: string | null;
    organizationId: string | null;
    organizationName: string | null;
    organizationLogoUrl: string | null;
    session: Session | null;
    loading: boolean;
    notificationCounts: NotificationCounts;
    refreshNotifications: () => Promise<void>;
    userOrganizations: any[];
    refreshUserOrganizations: () => Promise<void>;
    switchOrganization: (organizationId: string) => Promise<void>;
    signIn: (email: string) => Promise<void>;
    signInWithPassword: (email: string, password: string) => Promise<void>;
    signUpWithPassword: (email: string, password: string) => Promise<void>;
    joinOrganization: (email: string, password: string, name: string, organizationId: string, username: string) => Promise<void>;
    signUp: (email: string, password: string, name: string, organizationName: string, username: string) => Promise<void>;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);
    const [userRole, setUserRole] = useState<string | null>(null);
    const [userStatus, setUserStatus] = useState<string | null>(null);
    const [organizationId, setOrganizationId] = useState<string | null>(null);
    const [organizationName, setOrganizationName] = useState<string | null>(null);
    const [organizationLogoUrl, setOrganizationLogoUrl] = useState<string | null>(null);
    const [userName, setUserName] = useState<string | null>(null);

    // Warm the browser cache for a logo so dependent UI (share modals, receipts)
    // can paint it instantly instead of fetching it cold on first render.
    const preloadImage = (url: string | null | undefined) => {
        if (!url) return;
        const img = new Image();
        img.src = url;
    };
    const [userOrganizations, setUserOrganizations] = useState<any[]>([]);
    const [notificationCounts, setNotificationCounts] = useState<NotificationCounts>({
        requisitions: 0, approvals: 0, vouchers: 0, disbursements: 0, settings: 0
    });

    // Live session for interval callbacks: the 30s poll below closes over the
    // first render, so it must read the session through a ref, not state.
    const sessionRef = useRef<Session | null>(null);

    const refreshNotifications = async () => {
        // Never poll signed-out — the login page and public payment pages mount
        // this provider too, and each unauthenticated tick is a guaranteed 401
        // (wasted mobile data + junk api_fetch_failed analytics events).
        if (!sessionRef.current) return;
        try {
            // Route through apiFetch so this inherits the resilient token
            // refresh/retry. This runs on a 30s background interval, so a transient
            // 401 must NOT sign the user out — apiFetch only signs out when the
            // session is genuinely invalid, and otherwise throws (caught below).
            const response = await apiFetch('/users/notifications');
            const data = await response.json();
            setNotificationCounts(data);
        } catch (error) {
            console.error('Failed to fetch notifications:', error);
        }
    };

    useEffect(() => {
        const fetchRoleAndOrg = async (userId: string, email?: string) => {
            let { data, error } = await supabase
                .from('users')
                .select('role, status, name, organization_id, organizations(name, logo_url)')
                .eq('id', userId)
                .single();

            // A 406 here (PostgREST "0 rows" under RLS) usually means this query
            // raced a token refresh - the request went out with a not-yet-valid
            // token. Retry once after a short delay rather than leaving the
            // navbar/org context blank for the rest of the session.
            if (error) {
                await new Promise(resolve => setTimeout(resolve, 1000));
                ({ data, error } = await supabase
                    .from('users')
                    .select('role, status, name, organization_id, organizations(name, logo_url)')
                    .eq('id', userId)
                    .single());
            }

            if (data && !error) {
                const userData = data as any;
                setUserRole(userData.role);
                setUserStatus(userData.status);
                setUserName(userData.name);
                setOrganizationId(userData.organization_id);
                setOrganizationName(userData.organizations?.name || null);
                const logo = userData.organizations?.logo_url || null;
                setOrganizationLogoUrl(logo);
                preloadImage(logo);
                posthog.identify(userId, {
                    email,
                    name: userData.name,
                    role: userData.role,
                    organization_id: userData.organization_id,
                    organization_name: userData.organizations?.name,
                });
                refreshNotifications();
                refreshUserOrganizations();
            }
        };

        supabase.auth.getSession().then(({ data: { session } }) => {
            sessionRef.current = session;
            setSession(session);
            setUser(session?.user ?? null);
            if (session?.user) {
                fetchRoleAndOrg(session.user.id, session.user.email ?? undefined);
            } else {
                setLoading(false);
            }
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            sessionRef.current = session;
            setSession(session);
            setUser(session?.user ?? null);
            if (session?.user) {
                fetchRoleAndOrg(session.user.id, session.user.email ?? undefined).then(() => setLoading(false));
            } else {
                setUserRole(null);
                setUserStatus(null);
                setOrganizationId(null);
                setOrganizationName(null);
                setOrganizationLogoUrl(null);
                setLoading(false);
            }
        });

        const numInterval = window.setInterval(refreshNotifications, 30000);

        return () => {
            subscription.unsubscribe();
            window.clearInterval(numInterval);
        };
    }, []);

    const signIn = async (email: string) => {
        const { error } = await supabase.auth.signInWithOtp({
            email,
            options: {
                emailRedirectTo: window.location.origin,
            },
        });
        if (error) throw error;
    };

    const signInWithPassword = async (loginIdentifier: string, password: string) => {
        let email = loginIdentifier;
        const loginStartedAt = Date.now();
        const workflowId = crypto.randomUUID();
        trackEvent('auth', 'login', 'started', { workflow_id: workflowId });

        // Check if input is likely a username (no @ symbol)
        if (!loginIdentifier.includes('@')) {
            const apiUrl = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');
            try {
                const response = await fetch(`${apiUrl}/auth/resolve-username`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: loginIdentifier }),
                });

                if (!response.ok) {
                    const data = await response.json();
                    throw new Error(data.error || 'Username not found');
                }

                const data = await response.json();
                email = data.email;
            } catch (error: any) {
                trackEvent('auth', 'login', 'failed', {
                    workflow_id: workflowId,
                    error_code: categorizeAuthError(error?.message || ''),
                    error_message: error?.message,
                    duration_ms: Date.now() - loginStartedAt,
                });
                throw error;
            }
        }

        const { error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });
        if (error) {
            trackEvent('auth', 'login', 'failed', {
                workflow_id: workflowId,
                error_code: categorizeAuthError(error.message),
                error_message: error.message,
                duration_ms: Date.now() - loginStartedAt,
            });
            throw error;
        }
        trackEvent('auth', 'login', 'succeeded', {
            workflow_id: workflowId,
            duration_ms: Date.now() - loginStartedAt,
        });
        posthog.capture('user_signed_in', { email });
    };

    const signUpWithPassword = async (email: string, password: string) => {
        const apiUrl = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');
        const response = await fetch(`${apiUrl}/auth/signup`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                email,
                password,
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Signup failed');
        }
    };

    const signUp = async (email: string, password: string, name: string, organizationName: string, username: string) => {
        const workflowId = crypto.randomUUID();
        const startedAt = Date.now();
        trackEvent('organization_creation', 'signup', 'started', { workflow_id: workflowId, organization_name: organizationName });

        const apiUrl = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');
        const response = await fetch(`${apiUrl}/auth/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                email,
                password,
                name,
                organizationName,
                username
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            const errorMessage: string = data.suggestion ? JSON.stringify(data) : (data.error || 'Registration failed');
            trackEvent('organization_creation', 'signup', 'failed', {
                workflow_id: workflowId,
                organization_name: organizationName,
                error_code: categorizeAuthError(data.error || ''),
                error_message: data.error || errorMessage,
                duration_ms: Date.now() - startedAt,
            });
            // If the error contains a suggestion, stringify the whole thing so the caller can parse it
            if (data.suggestion) {
                throw new Error(JSON.stringify(data));
            }
            throw new Error(data.error || 'Registration failed');
        }

        trackEvent('organization_creation', 'signup', 'succeeded', {
            workflow_id: workflowId,
            organization_name: organizationName,
            duration_ms: Date.now() - startedAt,
        });
        posthog.capture('organization_created', { email, organization_name: organizationName });
        return data;
    };

    const joinOrganization = async (email: string, password: string, name: string, organizationId: string, username: string) => {
        const workflowId = crypto.randomUUID();
        const startedAt = Date.now();
        trackEvent('organization_join', 'request', 'started', { workflow_id: workflowId, organization_id: organizationId });

        const apiUrl = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');
        const response = await fetch(`${apiUrl}/auth/join-request`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                email,
                password,
                name,
                organizationId,
                username
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            trackEvent('organization_join', 'request', 'failed', {
                workflow_id: workflowId,
                organization_id: organizationId,
                error_code: categorizeAuthError(data.error || ''),
                error_message: data.error,
                duration_ms: Date.now() - startedAt,
            });
            throw new Error(data.error || 'Join request failed');
        }

        trackEvent('organization_join', 'request', 'succeeded', {
            workflow_id: workflowId,
            organization_id: organizationId,
            duration_ms: Date.now() - startedAt,
        });
        posthog.capture('organization_join_requested', { email, organization_id: organizationId });
        return data;
    };

    const refreshUserOrganizations = async () => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;
            const apiUrl = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');
            const response = await fetch(`${apiUrl}/auth/my-organizations`, {
                headers: { 'Authorization': `Bearer ${session.access_token}` }
            });

            if (response.ok) {
                const data = await response.json();
                setUserOrganizations(data || []);
            }
        } catch (error) {
            console.error('Failed to fetch user organizations:', error);
        }
    };

    const switchOrganization = async (orgId: string) => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error('No active session');
            const apiUrl = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');
            const response = await fetch(`${apiUrl}/auth/switch-organization`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({ organizationId: orgId })
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || 'Failed to switch organization');
            }

            const data = await response.json();
            setUserRole(data.user.role);
            setUserStatus(data.user.status);
            setOrganizationId(data.user.organization_id);
            
            // Find name of switched organization
            const targetOrg = userOrganizations.find(uo => uo.organization?.id === orgId);
            setOrganizationName(targetOrg?.organization?.name || 'Selected Organization');
            const switchedLogo = targetOrg?.organization?.logo_url || null;
            setOrganizationLogoUrl(switchedLogo);
            preloadImage(switchedLogo);

            await refreshNotifications();
        } catch (error) {
            console.error('Error switching organization:', error);
            throw error;
        }
    };

    const signOut = async () => {
        posthog.capture('user_signed_out');
        posthog.reset();
        await supabase.auth.signOut();
        setUser(null);
        setSession(null);
        setUserRole(null);
        setOrganizationId(null);
        setOrganizationName(null);
        setOrganizationLogoUrl(null);
        setUserOrganizations([]);
    };

    return (
        <AuthContext.Provider value={{
            user, userName, session, userRole, userStatus, organizationId, organizationName, organizationLogoUrl, loading,
            notificationCounts, refreshNotifications,
            userOrganizations, refreshUserOrganizations, switchOrganization,
            signIn, signInWithPassword, signUpWithPassword, joinOrganization, signUp, signOut
        }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export interface NotificationCounts {
    requisitions: number;
    approvals: number;
    vouchers: number;
    disbursements: number;
    settings: number;
}

interface AuthContextType {
    user: User | null;
    userRole: string | null;
    userStatus: string | null;
    organizationId: string | null;
    organizationName: string | null;
    session: Session | null;
    loading: boolean;
    notificationCounts: NotificationCounts;
    refreshNotifications: () => Promise<void>;
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
    const [notificationCounts, setNotificationCounts] = useState<NotificationCounts>({
        requisitions: 0, approvals: 0, vouchers: 0, disbursements: 0, settings: 0
    });

    const refreshNotifications = async () => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;
            const apiUrl = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');
            const response = await fetch(`${apiUrl}/users/notifications`, {
                headers: { 'Authorization': `Bearer ${session.access_token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setNotificationCounts(data);
            }
        } catch (error) {
            console.error('Failed to fetch notifications:', error);
        }
    };

    useEffect(() => {
        const fetchRoleAndOrg = async (userId: string) => {
            const { data, error } = await supabase
                .from('users')
                .select('role, status, organization_id, organizations(name)')
                .eq('id', userId)
                .single();

            if (data && !error) {
                const userData = data as any;
                setUserRole(userData.role);
                setUserStatus(userData.status);
                setOrganizationId(userData.organization_id);
                setOrganizationName(userData.organizations?.name || null);
                refreshNotifications();
            }
        };

        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            setUser(session?.user ?? null);
            if (session?.user) {
                fetchRoleAndOrg(session.user.id);
            } else {
                setLoading(false);
            }
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
            setUser(session?.user ?? null);
            if (session?.user) {
                fetchRoleAndOrg(session.user.id).then(() => setLoading(false));
            } else {
                setUserRole(null);
                setUserStatus(null);
                setOrganizationId(null);
                setOrganizationName(null);
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
            } catch (error) {
                throw error;
            }
        }

        const { error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });
        if (error) throw error;
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
            throw new Error(data.error || 'Registration failed');
        }

        return data;
    };

    const joinOrganization = async (email: string, password: string, name: string, organizationId: string, username: string) => {
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
            throw new Error(data.error || 'Join request failed');
        }

        return data;
    };

    const signOut = async () => {
        await supabase.auth.signOut();
        setUser(null);
        setSession(null);
        setUserRole(null);
        setOrganizationId(null);
        setOrganizationName(null);
    };

    return (
        <AuthContext.Provider value={{
            user, session, userRole, userStatus, organizationId, organizationName, loading,
            notificationCounts, refreshNotifications,
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

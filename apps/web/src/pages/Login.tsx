import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Loader2, Search, Eye, EyeOff, Mail } from 'lucide-react';
import { supabase } from '../lib/supabase';

export const Login: React.FC = () => {
    const [isSignup, setIsSignup] = useState(false);
    const [signupMode, setSignupMode] = useState<'CREATE' | 'JOIN'>('CREATE');
    const [forgotMode, setForgotMode] = useState(false);
    const [forgotEmail, setForgotEmail] = useState('');
    const [forgotSent, setForgotSent] = useState(false);

    const [loginIdentifier, setLoginIdentifier] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [username, setUsername] = useState('');
    const [organizationName, setOrganizationName] = useState('');
    const [organizationId, setOrganizationId] = useState('');

    // Organization Search State
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [showDropdown, setShowDropdown] = useState(false);

    const [message, setMessage] = useState('');
    const [suggestion, setSuggestion] = useState('');
    const [loading, setLoading] = useState(false);
    const [loadingOrg, setLoadingOrg] = useState<string | null>(null);
    const [showOrgSelector, setShowOrgSelector] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const { signInWithPassword, signUp, joinOrganization, user, userStatus, userOrganizations, switchOrganization, loading: authLoading, signOut } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        if (!authLoading && user && userStatus !== 'PENDING_APPROVAL') {
            const activeOrgs = userOrganizations.filter(uo => uo.status === 'ACTIVE');
            if (activeOrgs.length > 1) {
                setShowOrgSelector(true);
            } else {
                navigate('/');
            }
        }
    }, [user, userStatus, userOrganizations, authLoading, navigate]);

    const handleSelectOrg = async (orgId: string) => {
        setLoadingOrg(orgId);
        try {
            await switchOrganization(orgId);
            navigate('/');
        } catch (err: any) {
            setMessage('Error switching organization: ' + (err.message || 'Unknown error'));
        } finally {
            setLoadingOrg(null);
        }
    };

    // Debounced Search Effect
    useEffect(() => {
        const searchOrgs = async () => {
            if (searchQuery.length < 2) {
                setSearchResults([]);
                setShowDropdown(false);
                return;
            }

            setIsSearching(true);
            try {
                const apiUrl = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');
                const res = await fetch(`${apiUrl}/auth/organizations/search?query=${encodeURIComponent(searchQuery)}`);
                if (res.ok) {
                    const data = await res.json();
                    setSearchResults(data);
                    setShowDropdown(true);
                }
            } catch (err) {
                console.error("Failed to search orgs", err);
            } finally {
                setIsSearching(false);
            }
        };

        const timer = setTimeout(searchOrgs, 400);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    const [socialBusy, setSocialBusy] = useState<'google' | 'apple' | null>(null);
    const handleSocial = async (provider: 'google' | 'apple') => {
        setSocialBusy(provider);
        setMessage('');
        const { error } = await supabase.auth.signInWithOAuth({
            provider,
            options: { redirectTo: `${window.location.origin}/`, ...(provider === 'google' ? { queryParams: { prompt: 'select_account' } } : {}) },
        });
        if (error) {
            setMessage(`Couldn't sign in with ${provider === 'apple' ? 'Apple' : 'Google'}: ${error.message}`);
            setSocialBusy(null);
        } // otherwise the browser is already on its way to the provider
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setMessage('');
        try {
            await signInWithPassword(loginIdentifier, password);
        } catch (error: any) {
            setMessage('Error logging in: ' + (error.message || 'Unknown error'));
        } finally {
            setLoading(false);
        }
    };

    const handleForgotPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setMessage('');
        try {
            const apiUrl = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');
            const res = await fetch(`${apiUrl}/auth/forgot-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: forgotEmail }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data.error || 'Failed to send reset link');
            }
            // Endpoint returns a generic message whether or not the account exists.
            setForgotSent(true);
        } catch (error: any) {
            setMessage('Error: ' + (error.message || 'Unknown error'));
        } finally {
            setLoading(false);
        }
    };

    const handleSignup = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setMessage('');

        if (signupMode === 'JOIN' && !organizationId) {
            setMessage('Error: Please select an organization to join.');
            setLoading(false);
            return;
        }

        try {
            if (signupMode === 'CREATE') {
                await signUp(loginIdentifier, password, name, organizationName, username);
                setSuggestion('');
                // Sign the user straight in — the home redirect then routes new
                // organizations into the onboarding wizard automatically, so the
                // user never returns to this login page.
                setMessage('Account created! Setting up your workspace…');
                await signInWithPassword(loginIdentifier, password);
            } else {
                await joinOrganization(loginIdentifier, password, name, organizationId, username);
                setMessage('Join request submitted! An admin must approve your account.');
                setSuggestion('');
                setPassword('');
            }
        } catch (error: any) {
            let errorMsg = error.message || 'Unknown error';
            try {
                const parsed = JSON.parse(errorMsg);
                if (parsed.suggestion) {
                    setSuggestion(parsed.suggestion);
                    errorMsg = parsed.error || errorMsg;
                }
            } catch (e) {
                // Not JSON
            }
            if (error.suggestion) {
                setSuggestion(error.suggestion);
            }
            setMessage('Error signing up: ' + errorMsg);
        } finally {
            setLoading(false);
        }
    };

    if (showOrgSelector) {
        const activeOrgs = userOrganizations.filter(uo => uo.status === 'ACTIVE');
        return (
            <div className="min-h-screen bg-brand-gray flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans relative">
                <div className="absolute top-0 left-0 w-full p-6 sm:p-8">
                    <div className="flex items-center space-x-3">
                        <img src="/logo.png" alt="MoneyWise" className="h-8 w-8" />
                        <h1 className="text-xl font-bold text-brand-navy tracking-tight leading-tight">MoneyWise Pro</h1>
                    </div>
                </div>

                <div className="sm:mx-auto sm:w-full sm:max-w-md mt-24 sm:mt-8">
                    <h2 className="text-center text-xl font-bold text-brand-navy mb-2">
                        Welcome back!
                    </h2>
                    <p className="text-center text-sm text-gray-500 mb-8">
                        Select which organization you want to access today
                    </p>
                </div>

                <div className="sm:mx-auto sm:w-full sm:max-w-md">
                    <div className="bg-white py-10 px-6 rounded-2xl border border-gray-100 sm:px-12 shadow-xl shadow-gray-100">
                        {message && (
                            <div className="rounded-xl p-4 flex items-center bg-red-50 text-red-700 border border-red-100 mb-6">
                                <p className="text-sm font-bold">{message}</p>
                            </div>
                        )}

                        <div className="space-y-4">
                            {activeOrgs.map((uo: any) => (
                                <button
                                    key={uo.organization.id}
                                    type="button"
                                    onClick={() => handleSelectOrg(uo.organization.id)}
                                    disabled={loadingOrg !== null}
                                    className="w-full text-left p-4 border border-gray-200 rounded-2xl hover:border-[#006AFF] hover:bg-[#006AFF]/5 transition-all flex items-center justify-between group transform hover:-translate-y-0.5 active:translate-y-0"
                                >
                                    <div className="flex items-center space-x-4">
                                        <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center font-bold text-brand-navy group-hover:bg-[#006AFF] group-hover:text-white transition-colors">
                                            {uo.organization.name.charAt(0).toUpperCase()}
                                        </div>
                                        <div>
                                            <div className="font-bold text-brand-navy group-hover:text-[#006AFF] transition-colors">
                                                {uo.organization.name}
                                            </div>
                                            <div className="text-xs text-gray-400 capitalize">
                                                Role: {uo.role.toLowerCase()}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-gray-400 group-hover:text-[#006AFF] transition-colors">
                                        {loadingOrg === uo.organization.id ? (
                                            <Loader2 className="h-5 w-5 animate-spin" />
                                        ) : (
                                            <span className="text-sm font-bold">Enter &rarr;</span>
                                        )}
                                    </div>
                                </button>
                            ))}
                        </div>

                        <div className="mt-8 pt-6 border-t border-gray-100 text-center">
                            <button
                                type="button"
                                onClick={async () => {
                                    await signOut();
                                    setShowOrgSelector(false);
                                }}
                                className="text-sm font-bold text-gray-500 hover:text-gray-700 transition-colors"
                            >
                                Log out of account
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (forgotMode) {
        const backToLogin = () => {
            setForgotMode(false);
            setForgotSent(false);
            setForgotEmail('');
            setMessage('');
        };
        return (
            <div className="min-h-screen bg-brand-gray flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans relative">
                <div className="absolute top-0 left-0 w-full p-6 sm:p-8">
                    <div className="flex items-center space-x-3">
                        <img src="/logo.png" alt="MoneyWise" className="h-8 w-8" />
                        <h1 className="text-xl font-bold text-brand-navy tracking-tight leading-tight">MoneyWise Pro</h1>
                    </div>
                </div>

                <div className="sm:mx-auto sm:w-full sm:max-w-md mt-24 sm:mt-8">
                    <h2 className="text-center text-xl font-bold text-brand-navy mb-2">
                        Reset your password
                    </h2>
                    <p className="text-center text-sm text-gray-500 mb-8">
                        Enter your account email and we'll send you a link to reset your password.
                    </p>
                </div>

                <div className="sm:mx-auto sm:w-full sm:max-w-md">
                    <div className="bg-white py-10 px-6 rounded-2xl border border-gray-100 sm:px-12">
                        {forgotSent ? (
                            <div className="text-center">
                                <div className="mx-auto w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mb-5">
                                    <Mail className="h-7 w-7 text-green-600" />
                                </div>
                                <h3 className="text-lg font-bold text-brand-navy mb-2">Check your inbox</h3>
                                <p className="text-sm text-gray-500 mb-8">
                                    If an account exists for <span className="font-bold text-brand-navy">{forgotEmail}</span>, a password reset link is on its way. It expires in 1 hour.
                                </p>
                                <button
                                    type="button"
                                    onClick={backToLogin}
                                    className="w-full flex justify-center py-3 px-4 border border-gray-200 rounded-xl shadow-sm text-sm font-bold text-gray-700 bg-white hover:bg-gray-50 transition-all"
                                >
                                    Back to sign in
                                </button>
                            </div>
                        ) : (
                            <form className="space-y-6" onSubmit={handleForgotPassword}>
                                <div>
                                    <label htmlFor="forgot-email" className="block text-sm font-bold text-brand-navy mb-1">
                                        Email address
                                    </label>
                                    <div className="mt-1">
                                        <input
                                            id="forgot-email"
                                            name="forgot-email"
                                            type="email"
                                            autoComplete="email"
                                            required
                                            className="appearance-none block w-full px-4 py-3 border border-gray-200 rounded-xl shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#006AFF]/20 focus:border-[#006AFF] sm:text-sm transition-all"
                                            value={forgotEmail}
                                            onChange={(e) => setForgotEmail(e.target.value)}
                                            placeholder="you@example.com"
                                        />
                                    </div>
                                </div>

                                {message && (
                                    <div className="rounded-xl p-4 flex items-center bg-red-50 text-red-700 border border-red-100">
                                        <p className="text-sm font-bold">{message}</p>
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full flex justify-center py-3.5 px-4 border border-transparent rounded-xl text-sm font-bold text-white bg-[#006AFF] hover:bg-[#0052CC] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#006AFF] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                >
                                    {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Send reset link'}
                                </button>

                                <button
                                    type="button"
                                    onClick={backToLogin}
                                    className="w-full text-center text-sm font-bold text-gray-500 hover:text-gray-700 transition-colors"
                                >
                                    Back to sign in
                                </button>
                            </form>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-brand-gray flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans relative">
            {/* Navbar-style Branding */}
            {/* Navbar-style Branding */}
            <div className="absolute top-0 left-0 w-full p-6 sm:p-8">
                <div className="flex items-center space-x-3">
                    <img src="/logo.png" alt="MoneyWise" className="h-8 w-8" />
                    <div>
                        <h1 className="text-xl font-bold text-brand-navy tracking-tight leading-tight">MoneyWise Pro</h1>
                    </div>
                </div>
            </div>

            <div className="sm:mx-auto sm:w-full sm:max-w-md mt-24 sm:mt-8">
                <h2 className="text-center text-xl font-bold text-brand-navy mb-8">
                    {isSignup ? 'Create your account' : 'Sign in to continue'}
                </h2>
            </div>

            <div className="sm:mx-auto sm:w-full sm:max-w-md">
                <div className="bg-white py-10 px-6 rounded-2xl border border-gray-100 sm:px-12">
                    {isSignup && (
                        <div className="flex bg-gray-100 p-1 rounded-xl mb-6">
                            <button
                                type="button"
                                onClick={() => setSignupMode('CREATE')}
                                className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${signupMode === 'CREATE' ? 'bg-white shadow-sm text-brand-navy' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                Create New Org
                            </button>
                            <button
                                type="button"
                                onClick={() => setSignupMode('JOIN')}
                                className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${signupMode === 'JOIN' ? 'bg-white shadow-sm text-brand-navy' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                Join Existing Org
                            </button>
                        </div>
                    )}

                    <form className="space-y-6" onSubmit={isSignup ? handleSignup : handleLogin}>
                        {isSignup && (
                            <>
                                <div>
                                    <label htmlFor="name" className="block text-sm font-bold text-brand-navy mb-1">
                                        Full Name
                                    </label>
                                    <div className="mt-1">
                                        <input
                                            id="name"
                                            name="name"
                                            type="text"
                                            required
                                            className="appearance-none block w-full px-4 py-3 border border-gray-200 rounded-xl shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#006AFF]/20 focus:border-[#006AFF] sm:text-sm transition-all"
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label htmlFor="username" className="block text-sm font-bold text-brand-navy mb-1">
                                        Username
                                    </label>
                                    <div className="mt-1">
                                        <input
                                            id="username"
                                            name="username"
                                            type="text"
                                            required
                                            className="appearance-none block w-full px-4 py-3 border border-gray-200 rounded-xl shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#006AFF]/20 focus:border-[#006AFF] sm:text-sm transition-all"
                                            value={username}
                                            onChange={(e) => setUsername(e.target.value)}
                                            placeholder="unique_username"
                                        />
                                    </div>
                                </div>

                                {signupMode === 'CREATE' ? (
                                    <div>
                                        <label htmlFor="org-name" className="block text-sm font-bold text-brand-navy mb-1">
                                            Organization Name
                                        </label>
                                        <div className="mt-1">
                                            <input
                                                id="org-name"
                                                name="organizationName"
                                                type="text"
                                                required={signupMode === 'CREATE'}
                                                className="appearance-none block w-full px-4 py-3 border border-gray-200 rounded-xl shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#006AFF]/20 focus:border-[#006AFF] sm:text-sm transition-all"
                                                value={organizationName}
                                                onChange={(e) => {
                                                    setOrganizationName(e.target.value);
                                                    setSuggestion('');
                                                }}
                                                placeholder="e.g. Acme Corp"
                                            />
                                        </div>
                                        {suggestion && (
                                            <div className="mt-2 p-3 bg-[#006AFF]/5 border border-[#006AFF]/20 rounded-xl flex items-center justify-between">
                                                <div className="text-sm">
                                                    <span className="text-gray-500 font-medium">Suggestion: </span>
                                                    <span className="text-[#006AFF] font-bold">{suggestion}</span>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setOrganizationName(suggestion);
                                                        setSuggestion('');
                                                    }}
                                                    className="text-xs font-bold text-[#006AFF] hover:bg-[#006AFF]/10 px-2 py-1 rounded-md transition-colors"
                                                >
                                                    Use this
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="relative">
                                        <label htmlFor="org-search" className="block text-sm font-bold text-brand-navy mb-1">
                                            Search Organization
                                        </label>
                                        <div className="mt-1 relative">
                                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                                <Search className="h-4 w-4 text-gray-400" />
                                            </div>
                                            <input
                                                id="org-search"
                                                type="text"
                                                required={signupMode === 'JOIN'}
                                                className="appearance-none block w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#006AFF]/20 focus:border-[#006AFF] sm:text-sm transition-all"
                                                placeholder="Type to search..."
                                                value={searchQuery}
                                                onChange={(e) => {
                                                    setSearchQuery(e.target.value);
                                                    setOrganizationId(''); // Reset selection when typing
                                                }}
                                                onFocus={() => {
                                                    if (searchResults.length > 0) setShowDropdown(true);
                                                }}
                                            />
                                            {isSearching && (
                                                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                                                    <Loader2 className="h-4 w-4 text-[#006AFF] animate-spin" />
                                                </div>
                                            )}
                                        </div>

                                        {/* Dropdown for search results */}
                                        {showDropdown && (
                                            <div className="absolute z-10 mt-1 w-full bg-white shadow-lg max-h-60 rounded-xl py-1 text-base overflow-auto focus:outline-none sm:text-sm border border-gray-100">
                                                {searchResults.length === 0 ? (
                                                    <div className="cursor-default select-none relative py-2 pl-3 pr-9 text-gray-500 text-center">
                                                        No organizations found
                                                    </div>
                                                ) : (
                                                    searchResults.map((org) => (
                                                        <div
                                                            key={org.id}
                                                            className="cursor-pointer select-none relative py-2 pl-3 pr-9 hover:bg-[#006AFF]/10 hover:text-[#006AFF] text-gray-900 transition-colors"
                                                            onClick={() => {
                                                                setOrganizationId(org.id);
                                                                setSearchQuery(org.name); // Set input text to selected org
                                                                setShowDropdown(false);
                                                            }}
                                                        >
                                                            <div className="flex items-center">
                                                                <span className="font-bold block truncate">
                                                                    {org.name}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </>
                        )}

                        <div>
                            <label htmlFor="email" className="block text-sm font-bold text-brand-navy mb-1">
                                {isSignup ? 'Email address' : 'Email or Username'}
                            </label>
                            <div className="mt-1">
                                <input
                                    id="email"
                                    name="email"
                                    type={isSignup ? "email" : "text"}
                                    autoComplete={isSignup ? "email" : "username"}
                                    required
                                    className="appearance-none block w-full px-4 py-3 border border-gray-200 rounded-xl shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#006AFF]/20 focus:border-[#006AFF] sm:text-sm transition-all"
                                    value={loginIdentifier}
                                    onChange={(e) => setLoginIdentifier(e.target.value)}
                                />
                            </div>
                        </div>

                        <div>
                            <label htmlFor="password" className="block text-sm font-bold text-brand-navy mb-1">
                                Password
                            </label>
                            <div className="mt-1 relative">
                                <input
                                    id="password"
                                    name="password"
                                    type={showPassword ? 'text' : 'password'}
                                    autoComplete="current-password"
                                    required
                                    minLength={6}
                                    className="appearance-none block w-full px-4 py-3 pr-11 border border-gray-200 rounded-xl shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#006AFF]/20 focus:border-[#006AFF] sm:text-sm transition-all"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(v => !v)}
                                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
                                    tabIndex={-1}
                                >
                                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                            {!isSignup && (
                                <div className="mt-2 text-right">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setForgotEmail(loginIdentifier.includes('@') ? loginIdentifier : '');
                                            setForgotMode(true);
                                            setMessage('');
                                        }}
                                        className="text-sm font-bold text-[#006AFF] hover:text-[#0052CC] transition-colors"
                                    >
                                        Forgot password?
                                    </button>
                                </div>
                            )}
                        </div>

                        {message && (
                            <div className={`rounded-xl p-4 flex items-center ${message.includes('Error') ? 'bg-red-50 text-red-700 border border-red-100' : 'bg-green-50 text-green-700 border border-green-100'}`}>
                                <p className="text-sm font-bold">{message}</p>
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full flex justify-center py-3.5 px-4 border border-transparent rounded-xl text-sm font-bold text-white bg-[#006AFF] hover:bg-[#0052CC] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#006AFF] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        >
                            {loading ? (
                                <Loader2 className="h-5 w-5 animate-spin" />
                            ) : (
                                isSignup ? 'Create Account' : 'Sign In'
                            )}
                        </button>
                    </form>

                    {/* Google / Apple. One button both signs a returning person in and a new one up; an email
                        already registered with a password is merged into that same account by Supabase. */}
                    <div className="mt-6">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="flex-1 h-px bg-gray-200" />
                            <span className="text-xs text-gray-400 font-medium">or continue with</span>
                            <div className="flex-1 h-px bg-gray-200" />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            {(['google', 'apple'] as const).map((provider) => (
                                <button
                                    key={provider}
                                    type="button"
                                    disabled={!!socialBusy}
                                    onClick={() => handleSocial(provider)}
                                    className={`flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-60 ${provider === 'apple' ? 'bg-black text-white hover:bg-neutral-800' : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'}`}
                                >
                                    {socialBusy === provider ? <Loader2 className="h-4 w-4 animate-spin" /> : provider === 'apple'
                                        ? <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M16.37 1.43c0 1.14-.46 2.22-1.2 3-.78.84-2.06 1.5-3.1 1.41-.13-1.1.42-2.25 1.15-3 .8-.86 2.17-1.5 3.15-1.41zM20.9 17.1c-.55 1.27-.81 1.84-1.52 2.96-1 1.56-2.4 3.5-4.13 3.51-1.55.02-1.95-1-4.05-.99-2.1.01-2.54 1.01-4.09.99-1.73-.02-3.06-1.77-4.06-3.33C-.25 15.6-.54 10.5 1.2 7.9c1.24-1.85 3.2-2.94 5.04-2.94 1.87 0 3.05 1.02 4.6 1.02 1.5 0 2.41-1.02 4.58-1.02 1.64 0 3.37.9 4.6 2.44-4.04 2.2-3.38 7.95.88 9.7z"/></svg>
                                        : <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/><path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 12-2.1 16-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.5 2.3-6.3 0-11.6-4.1-13.5-9.9l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>}
                                    {provider === 'apple' ? 'Apple' : 'Google'}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="mt-8 pt-6 border-t border-gray-100">
                        <div className="relative">
                            <div className="absolute inset-0 flex items-center">
                                {/* Transparent spacing layer to prevent overlap */}
                            </div>
                            <div className="relative flex justify-center text-sm mb-4">
                                <span className="bg-white px-3 text-gray-500 font-medium">
                                    {isSignup ? 'Already have an account?' : 'New to MoneyWise Pro?'}
                                </span>
                            </div>
                        </div>

                        <button
                            onClick={() => {
                                setIsSignup(!isSignup);
                                setMessage('');
                            }}
                            className="w-full flex justify-center py-3 px-4 border border-gray-200 rounded-xl shadow-sm text-sm font-bold text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-200 transition-all"
                        >
                            {isSignup ? 'Sign in instead' : 'Create an account'}
                        </button>
                    </div>
                </div>
                <div className="mt-8 text-center text-xs text-brand-navy/40 font-medium">
                    &copy; {new Date().getFullYear()} MoneyWise Pro. All rights reserved.
                </div>
                <div className="mt-4 flex justify-center space-x-4 text-[10px] text-gray-400">
                    <a href="/privacy" className="hover:text-brand-navy transition-colors">Privacy Policy</a>
                    <span className="text-gray-300">|</span>
                    <a href="/terms" className="hover:text-brand-navy transition-colors">Terms of Service</a>
                    <span className="text-gray-300">|</span>
                    <a href="mailto:stephe@blueopus.cloud" className="hover:text-brand-navy transition-colors">Contact Support</a>
                </div>
            </div>
        </div>
    );
};

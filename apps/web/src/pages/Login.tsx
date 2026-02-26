import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Loader2, Search } from 'lucide-react';

export const Login: React.FC = () => {
    const [isSignup, setIsSignup] = useState(false);
    const [signupMode, setSignupMode] = useState<'CREATE' | 'JOIN'>('CREATE');

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
    const [loading, setLoading] = useState(false);
    const { signInWithPassword, signUp, joinOrganization, user, userStatus } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        if (user && userStatus !== 'PENDING_APPROVAL') {
            navigate('/');
        }
    }, [user, userStatus, navigate]);

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
                setMessage('Account & Organization created! You are now signed in.');
            } else {
                await joinOrganization(loginIdentifier, password, name, organizationId, username);
                setMessage('Join request submitted! An admin must approve your account.');
                // Clear sensitive/specific fields so they don't try to log in immediately and fail
                setPassword('');
            }
            // setIsSignup(false); // Can stay on screen to see success message
        } catch (error: any) {
            setMessage('Error signing up: ' + (error.message || 'Unknown error'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-brand-gray flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans relative">
            {/* Navbar-style Branding */}
            {/* Navbar-style Branding */}
            <div className="absolute top-0 left-0 w-full p-6 sm:p-8">
                <div className="flex items-center space-x-3">
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
                                            className="appearance-none block w-full px-4 py-3 border border-gray-200 rounded-xl shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-green/20 focus:border-brand-green sm:text-sm transition-all"
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
                                            className="appearance-none block w-full px-4 py-3 border border-gray-200 rounded-xl shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-green/20 focus:border-brand-green sm:text-sm transition-all"
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
                                                className="appearance-none block w-full px-4 py-3 border border-gray-200 rounded-xl shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-green/20 focus:border-brand-green sm:text-sm transition-all"
                                                value={organizationName}
                                                onChange={(e) => setOrganizationName(e.target.value)}
                                                placeholder="e.g. Acme Corp"
                                            />
                                        </div>
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
                                                className="appearance-none block w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-green/20 focus:border-brand-green sm:text-sm transition-all"
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
                                                    <Loader2 className="h-4 w-4 text-brand-green animate-spin" />
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
                                                            className="cursor-pointer select-none relative py-2 pl-3 pr-9 hover:bg-brand-green/10 hover:text-brand-green text-gray-900 transition-colors"
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
                                    className="appearance-none block w-full px-4 py-3 border border-gray-200 rounded-xl shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-green/20 focus:border-brand-green sm:text-sm transition-all"
                                    value={loginIdentifier}
                                    onChange={(e) => setLoginIdentifier(e.target.value)}
                                />
                            </div>
                        </div>

                        <div>
                            <label htmlFor="password" className="block text-sm font-bold text-brand-navy mb-1">
                                Password
                            </label>
                            <div className="mt-1">
                                <input
                                    id="password"
                                    name="password"
                                    type="password"
                                    autoComplete="current-password"
                                    required
                                    minLength={6}
                                    className="appearance-none block w-full px-4 py-3 border border-gray-200 rounded-xl shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-green/20 focus:border-brand-green sm:text-sm transition-all"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                />
                            </div>
                        </div>

                        {message && (
                            <div className={`rounded-xl p-4 flex items-center ${message.includes('Error') ? 'bg-red-50 text-red-700 border border-red-100' : 'bg-green-50 text-green-700 border border-green-100'}`}>
                                <p className="text-sm font-bold">{message}</p>
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full flex justify-center py-3.5 px-4 border border-transparent rounded-xl shadow-lg shadow-green-200 text-sm font-bold text-white bg-brand-green hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-green disabled:opacity-50 disabled:cursor-not-allowed transition-all transform hover:-translate-y-0.5 active:translate-y-0"
                        >
                            {loading ? (
                                <Loader2 className="h-5 w-5 animate-spin" />
                            ) : (
                                isSignup ? 'Create Account' : 'Sign In'
                            )}
                        </button>
                    </form>

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
                    <a href="mailto:smkapambwe9@gmail.com" className="hover:text-brand-navy transition-colors">Contact Support</a>
                </div>
            </div>
        </div>
    );
};

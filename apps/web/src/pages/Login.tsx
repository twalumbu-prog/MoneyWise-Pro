import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Loader2 } from 'lucide-react';

export const Login: React.FC = () => {
    const [isSignup, setIsSignup] = useState(false);
    const [loginIdentifier, setLoginIdentifier] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [username, setUsername] = useState('');
    const [organizationName, setOrganizationName] = useState('');
    const [message, setMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const { signInWithPassword, signUp, user } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        if (user) {
            navigate('/');
        }
    }, [user, navigate]);

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
        try {
            await signUp(loginIdentifier, password, name, organizationName, username);
            setMessage('Account created! You can now sign in.');
            setIsSignup(false);
            // Clear sensitive/specific fields
            setPassword('');
            setName('');
            setOrganizationName('');
            setUsername('');
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
                                <div>
                                    <label htmlFor="org-name" className="block text-sm font-bold text-brand-navy mb-1">
                                        Organization Name
                                    </label>
                                    <div className="mt-1">
                                        <input
                                            id="org-name"
                                            name="organizationName"
                                            type="text"
                                            required
                                            className="appearance-none block w-full px-4 py-3 border border-gray-200 rounded-xl shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-green/20 focus:border-brand-green sm:text-sm transition-all"
                                            value={organizationName}
                                            onChange={(e) => setOrganizationName(e.target.value)}
                                            placeholder="e.g. Acme Corp"
                                        />
                                    </div>
                                </div>
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
            </div>
        </div>
    );
};

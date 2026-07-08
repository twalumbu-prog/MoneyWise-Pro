import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { CheckCircle2, Loader2, Eye, EyeOff } from 'lucide-react';

export const ResetPassword: React.FC = () => {
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [checking, setChecking] = useState(true);
    const [status, setStatus] = useState<'IDLE' | 'SUCCESS' | 'ERROR'>('IDLE');
    const [error, setError] = useState<string | null>(null);
    const [userEmail, setUserEmail] = useState<string | null>(null);
    const navigate = useNavigate();

    useEffect(() => {
        // The recovery link puts the token in the URL hash; supabase-js
        // (detectSessionInUrl: true) consumes it and establishes a session.
        // We wait for that to settle, then confirm we have a recovery session.
        const checkSession = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user) {
                setUserEmail(session.user.email || null);
            } else {
                setError('This password reset link is invalid or has expired. Please request a new one.');
                setStatus('ERROR');
            }
            setChecking(false);
        };

        // Supabase fires PASSWORD_RECOVERY once it parses the hash — listen so we
        // don't race the initial getSession() call on a fresh page load.
        const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'PASSWORD_RECOVERY' && session?.user) {
                setUserEmail(session.user.email || null);
                setStatus('IDLE');
                setError(null);
                setChecking(false);
            }
        });

        checkSession();
        return () => authListener.subscription.unsubscribe();
    }, []);

    const handleReset = async (e: React.FormEvent) => {
        e.preventDefault();
        if (password !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }

        if (password.length < 6) {
            setError('Password must be at least 6 characters');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const { error: authError } = await supabase.auth.updateUser({ password });
            if (authError) throw authError;

            setStatus('SUCCESS');

            // Sign out of the recovery session and send them back to a clean login,
            // so they log in fresh with the new password.
            await supabase.auth.signOut();
            setTimeout(() => {
                navigate('/login');
            }, 3000);
        } catch (err: any) {
            console.error('Reset password error:', err);
            setError(err.message || 'Failed to reset password. The link may have expired.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-brand-gray flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans relative">
            {/* Navbar-style Branding */}
            <div className="absolute top-0 left-0 w-full p-6 sm:p-8">
                <div className="flex items-center space-x-3">
                    <img src="/logo.png" alt="MoneyWise" className="h-8 w-8" />
                    <h1 className="text-xl font-bold text-brand-navy tracking-tight leading-tight">MoneyWise Pro</h1>
                </div>
            </div>

            <div className="sm:mx-auto sm:w-full sm:max-w-md mt-24 sm:mt-8">
                <h2 className="text-center text-xl font-bold text-brand-navy mb-2">
                    {status === 'SUCCESS' ? 'Password updated' : 'Reset your password'}
                </h2>
                {status !== 'SUCCESS' && (
                    <p className="text-center text-sm text-gray-500 mb-8">
                        {userEmail
                            ? <>Choose a new password for <span className="font-bold text-brand-navy">{userEmail}</span></>
                            : 'Choose a new password for your account'}
                    </p>
                )}
            </div>

            <div className="sm:mx-auto sm:w-full sm:max-w-md">
                <div className="bg-white py-10 px-6 rounded-2xl border border-gray-100 sm:px-12">
                    {status === 'SUCCESS' ? (
                        <div className="text-center">
                            <div className="mx-auto w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mb-5">
                                <CheckCircle2 className="h-7 w-7 text-green-600" />
                            </div>
                            <h3 className="text-lg font-bold text-brand-navy mb-2">You're all set</h3>
                            <p className="text-sm text-gray-500">
                                Your password has been reset successfully. Redirecting you to sign in…
                            </p>
                        </div>
                    ) : checking ? (
                        <div className="flex items-center justify-center py-8 text-[#006AFF]">
                            <Loader2 className="h-6 w-6 animate-spin" />
                        </div>
                    ) : status === 'ERROR' ? (
                        <div>
                            <div className="rounded-xl p-4 flex items-center bg-red-50 text-red-700 border border-red-100 mb-6">
                                <p className="text-sm font-bold">{error}</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => navigate('/login')}
                                className="w-full flex justify-center py-3.5 px-4 border border-transparent rounded-xl text-sm font-bold text-white bg-[#006AFF] hover:bg-[#0052CC] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#006AFF] transition-all"
                            >
                                Return to sign in
                            </button>
                        </div>
                    ) : (
                        <form className="space-y-6" onSubmit={handleReset}>
                            <div>
                                <label htmlFor="new-password" className="block text-sm font-bold text-brand-navy mb-1">
                                    New password
                                </label>
                                <div className="mt-1 relative">
                                    <input
                                        id="new-password"
                                        name="new-password"
                                        type={showPassword ? 'text' : 'password'}
                                        autoComplete="new-password"
                                        required
                                        minLength={6}
                                        className="appearance-none block w-full px-4 py-3 pr-11 border border-gray-200 rounded-xl shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#006AFF]/20 focus:border-[#006AFF] sm:text-sm transition-all"
                                        placeholder="Min. 6 characters"
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
                            </div>

                            <div>
                                <label htmlFor="confirm-password" className="block text-sm font-bold text-brand-navy mb-1">
                                    Confirm password
                                </label>
                                <div className="mt-1">
                                    <input
                                        id="confirm-password"
                                        name="confirm-password"
                                        type={showPassword ? 'text' : 'password'}
                                        autoComplete="new-password"
                                        required
                                        minLength={6}
                                        className="appearance-none block w-full px-4 py-3 border border-gray-200 rounded-xl shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#006AFF]/20 focus:border-[#006AFF] sm:text-sm transition-all"
                                        placeholder="Re-enter your new password"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                    />
                                </div>
                            </div>

                            {error && (
                                <div className="rounded-xl p-4 flex items-center bg-red-50 text-red-700 border border-red-100">
                                    <p className="text-sm font-bold">{error}</p>
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full flex justify-center py-3.5 px-4 border border-transparent rounded-xl text-sm font-bold text-white bg-[#006AFF] hover:bg-[#0052CC] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#006AFF] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                            >
                                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Update password'}
                            </button>
                        </form>
                    )}
                </div>

                <div className="mt-8 text-center text-xs text-brand-navy/40 font-medium">
                    &copy; {new Date().getFullYear()} MoneyWise Pro. All rights reserved.
                </div>
            </div>
        </div>
    );
};

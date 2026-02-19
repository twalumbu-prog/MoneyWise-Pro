import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Shield, Lock, CheckCircle2, Loader2 } from 'lucide-react';

export const Join: React.FC = () => {
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState<'IDLE' | 'SUCCESS' | 'ERROR'>('IDLE');
    const [error, setError] = useState<string | null>(null);
    const [userEmail, setUserEmail] = useState<string | null>(null);
    const navigate = useNavigate();

    useEffect(() => {
        // Check if we have a session (Supabase handles the Hash automatically)
        const checkSession = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user) {
                setUserEmail(session.user.email || null);
            } else {
                // If no session, maybe they are not logged in or link expired
                setError('Invalid or expired invitation link.');
                setStatus('ERROR');
            }
        };
        checkSession();
    }, []);

    const handleJoin = async (e: React.FormEvent) => {
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
            // 1. Update password in Supabase Auth
            const { error: authError } = await supabase.auth.updateUser({
                password: password
            });

            if (authError) throw authError;

            // 2. Update status in public.users to ACTIVE
            // We use the API to ensure this is done securely if needed, 
            // but for now we try via Supabase client (assuming RLS allows or handles it)
            // Actually, better to call our API to be safe
            const { data: { session } } = await supabase.auth.getSession();
            const apiUrl = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');

            const response = await fetch(`${apiUrl}/auth/complete-invitation`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${session?.access_token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || 'Failed to complete registration');
            }

            setStatus('SUCCESS');

            // Auto-redirect after 3 seconds
            setTimeout(() => {
                navigate('/');
            }, 3000);

        } catch (err: any) {
            console.error('Join error:', err);
            setError(err.message);
            setStatus('ERROR');
        } finally {
            setLoading(false);
        }
    };

    if (status === 'SUCCESS') {
        return (
            <div className="min-h-screen bg-brand-light flex items-center justify-center p-4">
                <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-10 text-center animate-in zoom-in-95 duration-300">
                    <div className="mx-auto w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-6">
                        <CheckCircle2 className="w-10 h-10 text-green-600" />
                    </div>
                    <h1 className="text-3xl font-bold text-brand-navy mb-4">Welcome to the Team!</h1>
                    <p className="text-gray-600 mb-8">
                        Your account has been successfully verified. You now have access to your organization's workspace.
                    </p>
                    <p className="text-sm text-gray-400">Redirecting to dashboard...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-brand-light flex items-center justify-center p-4 py-12">
            <div className="max-w-md w-full bg-white rounded-3xl shadow-xl overflow-hidden animate-in slide-in-from-bottom-8 duration-500">
                <div className="bg-brand-navy p-8 text-white relative">
                    <div className="absolute top-0 right-0 p-4 opacity-10">
                        <Shield className="w-24 h-24" />
                    </div>
                    <h2 className="text-2xl font-bold">Complete Registration</h2>
                    <p className="text-brand-light/70 text-sm mt-2">Setting up your secure account for {userEmail}</p>
                </div>

                <div className="p-8">
                    {error && (
                        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm mb-6 animate-in fade-in slide-in-from-top-2">
                            {error}
                        </div>
                    )}

                    {status === 'ERROR' ? (
                        <button
                            onClick={() => navigate('/login')}
                            className="w-full py-4 bg-gray-100 text-brand-navy font-bold rounded-2xl hover:bg-gray-200 transition-all shadow-sm"
                        >
                            Return to Login
                        </button>
                    ) : (
                        <form onSubmit={handleJoin} className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Set Password</label>
                                <div className="relative group">
                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 group-focus-within:text-brand-green transition-colors">
                                        <Lock className="h-5 w-5" />
                                    </div>
                                    <input
                                        type="password"
                                        required
                                        className="block w-full pl-12 pr-4 py-4 bg-gray-50 border-2 border-transparent focus:border-brand-green focus:bg-white rounded-2xl text-brand-navy font-medium transition-all outline-none"
                                        placeholder="Min. 6 characters"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Confirm Password</label>
                                <div className="relative group">
                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 group-focus-within:text-brand-green transition-colors">
                                        <Lock className="h-5 w-5" />
                                    </div>
                                    <input
                                        type="password"
                                        required
                                        className="block w-full pl-12 pr-4 py-4 bg-gray-50 border-2 border-transparent focus:border-brand-green focus:bg-white rounded-2xl text-brand-navy font-medium transition-all outline-none"
                                        placeholder="Confirm your password"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                    />
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full py-4 bg-brand-green text-white font-bold rounded-2xl hover:bg-green-600 transition-all shadow-lg shadow-brand-green/30 active:scale-[0.98] disabled:opacity-70 disabled:active:scale-100 flex items-center justify-center gap-2"
                            >
                                {loading && <Loader2 className="w-5 h-5 animate-spin" />}
                                {loading ? 'Joining...' : 'Finalize & Join Organization'}
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
};

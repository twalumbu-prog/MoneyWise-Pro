import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Loader2 } from 'lucide-react';

export const Login: React.FC = () => {
    const [isSignup, setIsSignup] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [employeeId, setEmployeeId] = useState('');
    const [role, setRole] = useState('REQUESTOR');
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
            await signInWithPassword(email, password);
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
            await signUp(email, password, employeeId, name, role);
            setMessage('Account created! You can now sign in.');
            setIsSignup(false);
            // Clear sensitive/specific fields
            setPassword('');
            setEmployeeId('');
            setName('');
            setRole('REQUESTOR');
        } catch (error: any) {
            setMessage('Error signing up: ' + (error.message || 'Unknown error'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-md w-full space-y-8">
                <div>
                    <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
                        {isSignup ? 'Create your account' : 'Sign in to your account'}
                    </h2>
                    <p className="mt-2 text-center text-sm text-gray-600">
                        Automated Expenditure & Cashflow Management
                    </p>
                </div>

                <form className="mt-8 space-y-6" onSubmit={isSignup ? handleSignup : handleLogin}>
                    <div className="rounded-md shadow-sm -space-y-px">
                        {isSignup && (
                            <>
                                <div>
                                    <label htmlFor="name" className="sr-only">
                                        Full Name
                                    </label>
                                    <input
                                        id="name"
                                        name="name"
                                        type="text"
                                        required
                                        className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                                        placeholder="Full Name"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label htmlFor="employee-id" className="sr-only">
                                        Employee ID
                                    </label>
                                    <input
                                        id="employee-id"
                                        name="employeeId"
                                        type="text"
                                        required
                                        className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                                        placeholder="Employee ID"
                                        value={employeeId}
                                        onChange={(e) => setEmployeeId(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label htmlFor="role" className="sr-only">
                                        Role
                                    </label>
                                    <select
                                        id="role"
                                        name="role"
                                        required
                                        className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                                        value={role}
                                        onChange={(e) => setRole(e.target.value)}
                                    >
                                        <option value="REQUESTOR">Requestor</option>
                                        <option value="AUTHORISER">Authoriser</option>
                                        <option value="ACCOUNTANT">Accountant</option>
                                        <option value="CASHIER">Cashier</option>
                                        <option value="ADMIN">Admin</option>
                                    </select>
                                </div>
                            </>
                        )}
                        <div>
                            <label htmlFor="email-address" className="sr-only">
                                Email address
                            </label>
                            <input
                                id="email-address"
                                name="email"
                                type="email"
                                autoComplete="email"
                                required
                                className={`appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 ${isSignup ? '' : 'rounded-t-md'} focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm`}
                                placeholder="Email address"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>
                        <div>
                            <label htmlFor="password" className="sr-only">
                                Password
                            </label>
                            <input
                                id="password"
                                name="password"
                                type="password"
                                autoComplete="current-password"
                                required
                                minLength={6}
                                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                                placeholder="Password (min 6 characters)"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </div>
                    </div>

                    {message && (
                        <div className={`rounded-md p-4 ${message.includes('Error') ? 'bg-red-50 text-red-800' : 'bg-green-50 text-green-800'}`}>
                            <p className="text-sm">{message}</p>
                        </div>
                    )}

                    <div>
                        <button
                            type="submit"
                            disabled={loading}
                            className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                        >
                            {loading ? (
                                <Loader2 className="h-5 w-5 animate-spin" />
                            ) : (
                                isSignup ? 'Sign Up' : 'Sign In'
                            )}
                        </button>
                    </div>

                    <div className="text-center">
                        <button
                            type="button"
                            onClick={() => {
                                setIsSignup(!isSignup);
                                setMessage('');
                            }}
                            className="text-sm text-indigo-600 hover:text-indigo-500"
                        >
                            {isSignup ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

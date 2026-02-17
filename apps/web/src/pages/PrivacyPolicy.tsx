
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export const PrivacyPolicy = () => {
    return (
        <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8 font-sans">
            <div className="max-w-3xl mx-auto bg-white p-8 shadow rounded-lg">
                <div className="mb-6">
                    <Link to="/" className="text-brand-navy hover:text-brand-green flex items-center gap-2 transition-colors">
                        <ArrowLeft size={16} /> Back to Home
                    </Link>
                </div>
                <h1 className="text-3xl font-bold text-brand-navy mb-2">Privacy Policy</h1>
                <p className="text-sm text-gray-500 mb-8">Last Updated: February 16, 2026</p>

                <div className="prose prose-indigo max-w-none space-y-6 text-gray-700">
                    <section>
                        <h2 className="text-xl font-bold text-brand-navy mb-3">1. Introduction</h2>
                        <p className="mb-4">
                            Money Wise Pro ("Service") is owned and operated by Stephen Kapambwe, located in Chongwe, Lusaka, Zambia.
                        </p>
                        <p className="mb-4">
                            We are committed to protecting your privacy and handling your data transparently and securely. This Privacy Policy explains how we collect, use, store, and protect your information when you use Money Wise Pro, including when you connect your QuickBooks Online account.
                        </p>
                        <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
                            <p className="font-bold text-brand-navy mb-1">Contact:</p>
                            <p className="text-sm">Email: <a href="mailto:smkapambwe9@gmail.com" className="text-brand-green hover:underline">smkapambwe9@gmail.com</a></p>
                            <p className="text-sm">Location: Chongwe, Lusaka, Zambia</p>
                        </div>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold text-brand-navy mb-3">2. Information We Collect</h2>
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">2.1 Identity Information</h3>
                        <ul className="list-disc pl-5 mb-4 space-y-1">
                            <li>Name</li>
                            <li>Email address</li>
                            <li>Authentication credentials (managed via Supabase Auth)</li>
                        </ul>

                        <h3 className="text-lg font-semibold text-gray-900 mb-2">2.2 Internal Business Data</h3>
                        <ul className="list-disc pl-5 mb-4 space-y-1">
                            <li>Requisition details</li>
                            <li>Expense descriptions</li>
                            <li>Expense amounts</li>
                            <li>Account category mappings</li>
                        </ul>

                        <h3 className="text-lg font-semibold text-gray-900 mb-2">2.3 QuickBooks Online Data</h3>
                        <p className="mb-2">When you authorize integration with QuickBooks Online, we request the following OAuth scopes:</p>
                        <ul className="list-disc pl-5 mb-4 space-y-1">
                            <li><code className="bg-gray-100 px-1 rounded text-xs">com.intuit.quickbooks.accounting</code></li>
                            <li><code className="bg-gray-100 px-1 rounded text-xs">openid</code></li>
                            <li><code className="bg-gray-100 px-1 rounded text-xs">profile</code></li>
                            <li><code className="bg-gray-100 px-1 rounded text-xs">email</code></li>
                        </ul>
                        <p className="mb-2">We access only the minimum data required to provide the Service:</p>
                        <ul className="list-disc pl-5 mb-4 space-y-1">
                            <li>Chart of Accounts (read-only access)</li>
                            <li>Creation of Expense transactions (write-only access)</li>
                        </ul>
                        <div className="bg-red-50 p-4 rounded-lg border border-red-100 text-red-800 text-sm">
                            <span className="font-bold">We do not:</span>
                            <ul className="list-disc pl-5 mt-1 space-y-1">
                                <li>Modify existing QuickBooks transactions</li>
                                <li>Delete QuickBooks data</li>
                                <li>Access payroll data</li>
                                <li>Access bank login credentials</li>
                                <li>Access credit card numbers</li>
                            </ul>
                        </div>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold text-brand-navy mb-3">3. How We Use Your Data</h2>
                        <p className="mb-2">We use your data solely to:</p>
                        <ul className="list-disc pl-5 mb-4 space-y-1">
                            <li>Synchronize approved requisitions as Expense transactions in QuickBooks Online</li>
                            <li>Map expense categories to your QuickBooks Chart of Accounts</li>
                            <li>Maintain integration status</li>
                            <li>Provide internal reporting functionality</li>
                        </ul>
                        <p className="mb-4">
                            We do not sell, rent, trade, or commercially distribute your data.<br />
                            We do not use QuickBooks financial data for advertising or profiling.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold text-brand-navy mb-3">4. OAuth Token Security</h2>
                        <p className="mb-2">When you connect QuickBooks Online:</p>
                        <ul className="list-disc pl-5 mb-4 space-y-1">
                            <li>Access tokens and refresh tokens are stored in encrypted form.</li>
                            <li>We use <strong>AES-256-GCM encryption</strong> at rest.</li>
                            <li>Tokens are decrypted only at runtime when securely communicating with QuickBooks APIs.</li>
                            <li>Tokens are permanently deleted upon disconnection.</li>
                            <li>All data in transit is protected using HTTPS/TLS 1.2+ encryption.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold text-brand-navy mb-3">5. Data Retention</h2>
                        <p className="mb-2">We retain:</p>
                        <ul className="list-disc pl-5 mb-4 space-y-1">
                            <li>Internal requisition and expense mapping data permanently unless deleted by the user.</li>
                            <li>QuickBooks integration tokens until the user disconnects the integration.</li>
                        </ul>
                        <p className="mb-2">When you disconnect QuickBooks:</p>
                        <ul className="list-disc pl-5 mb-4 space-y-1">
                            <li>All stored OAuth tokens are permanently deleted immediately.</li>
                        </ul>
                        <p className="mt-4 text-sm">
                            To request full account deletion, contact: <a href="mailto:smkapambwe9@gmail.com" className="text-brand-green hover:underline">smkapambwe9@gmail.com</a>
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold text-brand-navy mb-3">6. Infrastructure & Hosting</h2>
                        <ul className="list-disc pl-5 mb-4 space-y-1">
                            <li><strong>Vercel</strong> (application hosting)</li>
                            <li><strong>Supabase</strong> (PostgreSQL database)</li>
                        </ul>
                        <p className="mb-4">
                            Hosting infrastructure is located in the United States.<br />
                            All data is encrypted in transit and stored on encrypted cloud infrastructure.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold text-brand-navy mb-3">7. Third-Party Services</h2>
                        <p className="mb-2">Money Wise Pro integrates with:</p>
                        <ul className="list-disc pl-5 mb-4 space-y-1">
                            <li>QuickBooks Online (Intuit Inc.)</li>
                            <li>Supabase (authentication and database)</li>
                            <li>Vercel (application hosting)</li>
                            <li>Google Gemini (used only for internal requisition processing; not for training on QuickBooks financial data)</li>
                            <li>Resend (transactional email service)</li>
                        </ul>
                        <p className="mb-4">
                            We share only the minimum required data with these services to operate the application.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold text-brand-navy mb-3">8. Your Rights</h2>
                        <p className="mb-2">You have the right to:</p>
                        <ul className="list-disc pl-5 mb-4 space-y-1">
                            <li>Disconnect QuickBooks at any time</li>
                            <li>Request deletion of stored data</li>
                            <li>Request access to your stored information</li>
                            <li>Request correction of inaccurate data</li>
                        </ul>
                        <p className="mt-4 text-sm">
                            Requests can be submitted to: <a href="mailto:smkapambwe9@gmail.com" className="text-brand-green hover:underline">smkapambwe9@gmail.com</a>
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold text-brand-navy mb-3">9. Changes to This Policy</h2>
                        <p>
                            We may update this Privacy Policy periodically. Updates will be reflected by a revised "Last Updated" date.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold text-brand-navy mb-3">10. Governing Law</h2>
                        <p>
                            This Privacy Policy is governed by the laws of Zambia.
                        </p>
                    </section>
                </div>
            </div>
        </div>
    );
};

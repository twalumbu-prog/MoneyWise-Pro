
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export const PrivacyPolicy = () => {
    return (
        <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto bg-white p-8 shadow rounded-lg">
                <div className="mb-6">
                    <Link to="/" className="text-indigo-600 hover:text-indigo-500 flex items-center gap-2">
                        <ArrowLeft size={16} /> Back to Home
                    </Link>
                </div>
                <h1 className="text-3xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
                <p className="text-sm text-gray-500 mb-8">Last Updated: February 16, 2026</p>

                <div className="prose prose-indigo max-w-none space-y-6 text-gray-700">
                    <section>
                        <h2 className="text-xl font-semibold text-gray-900">1. Introduction</h2>
                        <p>
                            Money Wise Pro ("we," "our," or "us") respects your privacy and is committed to protecting your personal data.
                            This privacy policy explains how we look after your personal data when you use our application and tells you about your privacy rights.
                        </p>
                        <p className="mt-2">
                            <strong>Owner:</strong> Stephen Kapambwe<br />
                            <strong>Location:</strong> Chongwe, Lusaka, Zambia<br />
                            <strong>Contact Email:</strong> smkapambwe9@gmail.com
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900">2. Data We Collect</h2>
                        <p>We collect and process the following data:</p>
                        <ul className="list-disc pl-5 mt-2 space-y-1">
                            <li><strong>Identity Data:</strong> Name, email address, and authentication credentials via Supabase.</li>
                            <li><strong>Financial Data:</strong> Requisition details, expense amounts, and chart of accounts mapping.</li>
                            <li><strong>QuickBooks Data:</strong> We access your QuickBooks Online "Accounts" (read-only) and create "Expenses" (write-only).</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900">3. QuickBooks Integration & Data Security</h2>
                        <p>
                            Money Wise Pro integrates with QuickBooks Online via OAuth 2.0.
                        </p>
                        <ul className="list-disc pl-5 mt-2 space-y-1">
                            <li><strong>Token Storage:</strong> Your QuickBooks OAuth access and refresh tokens are stored securely in our database. We use <strong>AES-256-GCM encryption</strong> to encrypt these tokens at rest. They are decrypted only when performing authorized sync operations.</li>
                            <li><strong>No External Transfer:</strong> We do not sell, trade, or transfer your QuickBooks financial data to outside parties.</li>
                            <li><strong>No AI Training:</strong> While we use Google Gemini for processing internal requisitions, your QuickBooks financial data is <strong>never</strong> used to train AI models.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900">4. Data Retention & Deletion</h2>
                        <p>
                            We retain your data for as long as you maintain an active account or as required by law.
                        </p>
                        <p className="mt-2">
                            <strong>Disconnecting QuickBooks:</strong> You can disconnect your QuickBooks account at any time via the Settings page or the <Link to="/disconnect" className="text-indigo-600 underline">Disconnect page</Link>. Upon disconnection, all stored OAuth tokens associated with that integration are <strong>permanently deleted</strong> from our database immediately.
                        </p>
                        <p className="mt-2">
                            <strong>Account Deletion:</strong> To request full deletion of your account and all associated data, please contact us at <a href="mailto:smkapambwe9@gmail.com" className="text-indigo-600 underline">smkapambwe9@gmail.com</a>.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900">5. Infrastructure</h2>
                        <p>
                            Our service is hosted on Vercel (Frontend/API) and Supabase (Database) in the United States. All data in transit is protected via HTTPS/TLS 1.2+.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900">6. Governing Law</h2>
                        <p>
                            This policy is governed by the laws of Zambia.
                        </p>
                    </section>
                </div>
            </div>
        </div>
    );
};

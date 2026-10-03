
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
                <p className="text-sm text-gray-500 mb-8">Last Updated: October 3, 2026</p>

                <div className="prose prose-indigo max-w-none space-y-6 text-gray-700">
                    <section>
                        <h2 className="text-xl font-bold text-brand-navy mb-3">1. Introduction</h2>
                        <p className="mb-4">
                            Money Wise Pro ("Service") is owned and operated by Stephen Kapambwe, located in Chongwe, Lusaka, Zambia.
                        </p>
                        <p className="mb-4">
                            We are committed to protecting your privacy and handling your data transparently and securely. This Privacy Policy explains how we collect, use, store, and protect your information when you use Money Wise Pro, including on our website and mobile apps (iOS and Android), and when you connect third-party services such as QuickBooks Online.
                        </p>
                        <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
                            <p className="font-bold text-brand-navy mb-1">Contact:</p>
                            <p className="text-sm">Email: <a href="mailto:stephe@blueopus.cloud" className="text-brand-green hover:underline">stephe@blueopus.cloud</a></p>
                            <p className="text-sm">Location: Chongwe, Lusaka, Zambia</p>
                        </div>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold text-brand-navy mb-3">2. Information We Collect</h2>
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">2.1 Identity Information</h3>
                        <ul className="list-disc pl-5 mb-4 space-y-1">
                            <li>Name</li>
                            <li>Email address</li>
                            <li>Phone number and username, where you provide them</li>
                            <li>Authentication credentials (managed via Supabase Auth; we never see your password in readable form)</li>
                            <li>Your organisation and role within it</li>
                        </ul>

                        <h3 className="text-lg font-semibold text-gray-900 mb-2">2.1a Payment and Payout Details</h3>
                        <ul className="list-disc pl-5 mb-4 space-y-1">
                            <li>Bank account and mobile-money details you save so you can be paid (bank, account number, account name, mobile-money provider and number)</li>
                            <li>Transaction records for payments, payouts, wallets and payment links processed through our payment partner, Lenco</li>
                            <li>We do not store full card numbers or PINs</li>
                        </ul>

                        <h3 className="text-lg font-semibold text-gray-900 mb-2">2.2 Internal Business Data</h3>
                        <ul className="list-disc pl-5 mb-4 space-y-1">
                            <li>Requisition details</li>
                            <li>Expense descriptions</li>
                            <li>Expense amounts</li>
                            <li>Account category mappings</li>
                            <li>Ledger, cashbook, budget, invoice, payroll and reporting data you or your organisation enter</li>
                            <li>Receipts, photos and documents you attach</li>
                        </ul>

                        <h3 className="text-lg font-semibold text-gray-900 mb-2">2.2a Device Permissions and Usage</h3>
                        <ul className="list-disc pl-5 mb-4 space-y-1">
                            <li><strong>Camera and photo library</strong> &ndash; only when you choose to photograph or attach a receipt or document. Images are not accessed in the background.</li>
                            <li><strong>Microphone and speech recognition</strong> &ndash; only when you tap dictate in the Assistant, to turn your speech into text.</li>
                            <li><strong>Face ID / biometrics</strong> &ndash; optional app unlock, handled by your device; we never receive your biometric data.</li>
                            <li><strong>Push notifications</strong> &ndash; to tell you about approvals and payments; your device push token is stored for this purpose.</li>
                            <li><strong>Usage and diagnostic information</strong> &ndash; basic product analytics and error logs used to keep the service reliable and secure. We do not track you across other companies&apos; apps or websites.</li>
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
                            <li>Process payments, payouts and payment links, and keep each organisation&apos;s books accurate</li>
                            <li>Provide AI Assistant features such as categorising expenses and answering questions about your own data</li>
                            <li>Send service notifications (approvals, payments, security alerts)</li>
                            <li>Prevent fraud and keep the service secure</li>
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
                            <li>Financial and audit records (payments, ledger entries, approvals) for as long as your organisation needs them for its books and as required by law. When you delete your account these records are kept but are no longer linked to your name or contact details.</li>
                        </ul>
                        <p className="mb-2">When you disconnect QuickBooks:</p>
                        <ul className="list-disc pl-5 mb-4 space-y-1">
                            <li>All stored OAuth tokens are permanently deleted immediately.</li>
                        </ul>
                        <p className="mt-4 text-sm">
                            You can delete your account at any time in the MoneyWise mobile app under Menu &rarr; Delete my account. Doing so removes your login and personal details; financial records your organisation keeps for its books are retained without your name. You can also request deletion by contacting: <a href="mailto:stephe@blueopus.cloud" className="text-brand-green hover:underline">stephe@blueopus.cloud</a>
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
                            <li>Lenco (payment processing, wallets and payouts)</li>
                            <li>AI model providers, accessed through OpenRouter (used to power the Assistant and expense categorisation; your data is not used to train models and QuickBooks financial data is not used for training)</li>
                            <li>Resend (transactional email service)</li>
                            <li>WhatsApp messaging provider (payment confirmations, where enabled)</li>
                            <li>Expo / Apple / Google push notification services (delivering notifications)</li>
                            <li>PostHog (product analytics and diagnostics)</li>
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
                            <li>Delete your account yourself in the mobile app: Menu &rarr; Delete my account</li>
                        </ul>
                        <p className="mt-2 text-sm">
                            Children: Money Wise Pro is not directed at children under 18 and we do not knowingly collect their data.
                        </p>
                        <p className="mt-4 text-sm">
                            Requests can be submitted to: <a href="mailto:stephe@blueopus.cloud" className="text-brand-green hover:underline">stephe@blueopus.cloud</a>
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

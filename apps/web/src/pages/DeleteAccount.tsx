import React, { useState } from 'react';
import { ArrowLeft, CheckCircle2, AlertTriangle, ShieldCheck, Mail, Smartphone, Globe } from 'lucide-react';
import { Link } from 'react-router-dom';

export const DeleteAccount = () => {
    const [email, setEmail] = useState('');
    const [notes, setNotes] = useState('');
    const [submitted, setSubmitted] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        // Direct mailto fallback or submission feedback
        const subject = encodeURIComponent('MoneyWise Pro - Account Deletion Request');
        const body = encodeURIComponent(
            `Hello,\n\nPlease delete my MoneyWise Pro account and associated personal data.\n\nRegistered Email: ${email}\nReason / Additional Notes: ${notes || 'None'}\n\nI understand that my login and personal identifiers will be permanently deleted and that organization financial ledger entries will be anonymized for statutory compliance.\n\nThank you.`
        );
        window.location.href = `mailto:stephe@blueopus.cloud?subject=${subject}&body=${body}`;
        setSubmitting(false);
        setSubmitted(true);
    };

    return (
        <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8 font-sans">
            <div className="max-w-2xl mx-auto bg-white p-8 sm:p-10 shadow rounded-2xl border border-gray-100">
                <div className="mb-6 flex items-center justify-between">
                    <Link to="/" className="text-brand-navy hover:text-brand-green flex items-center gap-2 transition-colors font-medium">
                        <ArrowLeft size={16} /> Back to MoneyWise
                    </Link>
                    <Link to="/privacy" className="text-xs text-gray-500 hover:text-brand-navy transition-colors">
                        Privacy Policy &rarr;
                    </Link>
                </div>

                <div className="text-center mb-8">
                    <div className="mx-auto w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-3">
                        <AlertTriangle className="w-6 h-6 text-red-600" />
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-brand-navy">Account &amp; Data Deletion</h1>
                    <p className="text-sm text-gray-600 mt-2">
                        MoneyWise Pro &bull; Blue Opus (Stephen Kapambwe)
                    </p>
                </div>

                <div className="space-y-6 text-gray-700 text-sm sm:text-base leading-relaxed">
                    <section className="bg-gray-50 p-5 rounded-xl border border-gray-200">
                        <h2 className="text-base font-semibold text-brand-navy mb-2 flex items-center gap-2">
                            <ShieldCheck className="w-5 h-5 text-brand-green" />
                            Our Commitment to User Data Control
                        </h2>
                        <p className="text-sm text-gray-600">
                            In accordance with Google Play and Apple App Store policies, you have complete control over your account and personal data. You can delete your MoneyWise account at any time either from inside the mobile app or through this external web portal.
                        </p>
                    </section>

                    <section className="space-y-3">
                        <h2 className="text-lg font-bold text-brand-navy">What happens when you delete your account?</h2>
                        <ul className="list-disc pl-5 space-y-1.5 text-sm text-gray-600">
                            <li><strong>Permanent Credential Removal:</strong> Your login authentication record, email, phone number, and password hashes are permanently deleted from Supabase Auth.</li>
                            <li><strong>Personal Identity Deletion:</strong> Your name, username, and contact details are permanently removed from our user profiles.</li>
                            <li><strong>Session &amp; Token Revocation:</strong> All active sessions, mobile push notification tokens, and OAuth tokens are permanently invalidated.</li>
                            <li><strong>Statutory Financial Records Anonymization:</strong> In compliance with Zambian financial, tax, and bookkeeping laws, accounting records (requisitions, vouchers, cashbook logs) must be retained by your organization for its audit trail. However, your personal details are completely scrubbed and replaced with an anonymous placeholder ("Deleted User").</li>
                        </ul>
                    </section>

                    <hr className="border-gray-200" />

                    <section className="space-y-4">
                        <h2 className="text-lg font-bold text-brand-navy">How to Delete Your Account</h2>

                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="p-4 rounded-xl border border-blue-100 bg-blue-50/50">
                                <div className="flex items-center gap-2 font-semibold text-brand-navy mb-1.5">
                                    <Smartphone className="w-4 h-4 text-brand-blue" />
                                    <span>Method 1: In the Mobile App (Instant)</span>
                                </div>
                                <ol className="list-decimal pl-5 text-xs text-gray-600 space-y-1">
                                    <li>Open <strong>MoneyWise Pro</strong>.</li>
                                    <li>Tap the <strong>Menu</strong> tab at the bottom.</li>
                                    <li>Scroll to <strong>Legal &amp; account</strong>.</li>
                                    <li>Tap <strong>Delete my account</strong>.</li>
                                    <li>Confirm your decision. Deletion takes effect immediately.</li>
                                </ol>
                            </div>

                            <div className="p-4 rounded-xl border border-gray-200 bg-gray-50/50">
                                <div className="flex items-center gap-2 font-semibold text-brand-navy mb-1.5">
                                    <Globe className="w-4 h-4 text-gray-700" />
                                    <span>Method 2: In the Web App</span>
                                </div>
                                <ol className="list-decimal pl-5 text-xs text-gray-600 space-y-1">
                                    <li>Sign in at <a href="https://moneywise.blueopus.cloud" className="text-brand-green hover:underline">moneywise.blueopus.cloud</a>.</li>
                                    <li>Go to <strong>Settings</strong>.</li>
                                    <li>Navigate to <strong>General &rarr; Organization / Account</strong>.</li>
                                    <li>Select delete account or remove organization.</li>
                                </ol>
                            </div>
                        </div>

                        <div className="p-5 rounded-xl border border-gray-200 bg-white">
                            <div className="flex items-center gap-2 font-semibold text-brand-navy mb-2">
                                <Mail className="w-4 h-4 text-brand-green" />
                                <span>Method 3: Submit Web Deletion Request</span>
                            </div>
                            <p className="text-xs text-gray-600 mb-4">
                                If you no longer have access to the mobile app or have uninstalled it, you can submit your deletion request below. We will verify and permanently process your deletion request within 30 days.
                            </p>

                            {submitted ? (
                                <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-start gap-3">
                                    <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                                    <div>
                                        <p className="font-semibold text-green-900 text-sm">Request Prepared</p>
                                        <p className="text-xs text-green-800 mt-1">
                                            Your email client has been launched with your deletion request addressed to <code className="bg-green-100 px-1 rounded">stephe@blueopus.cloud</code>. If your email client did not open automatically, please send an email directly to <a href="mailto:stephe@blueopus.cloud" className="underline font-medium">stephe@blueopus.cloud</a> from your registered address.
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <form onSubmit={handleSubmit} className="space-y-3">
                                    <div>
                                        <label htmlFor="del-email" className="block text-xs font-semibold text-gray-700 mb-1">
                                            Registered Account Email Address *
                                        </label>
                                        <input
                                            id="del-email"
                                            type="email"
                                            required
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            placeholder="you@company.com"
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-green"
                                        />
                                    </div>
                                    <div>
                                        <label htmlFor="del-notes" className="block text-xs font-semibold text-gray-700 mb-1">
                                            Additional Information (Optional)
                                        </label>
                                        <textarea
                                            id="del-notes"
                                            rows={2}
                                            value={notes}
                                            onChange={(e) => setNotes(e.target.value)}
                                            placeholder="Organization name or reason for leaving (optional)"
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-green"
                                        />
                                    </div>
                                    <button
                                        type="submit"
                                        disabled={submitting || !email}
                                        className="w-full py-2.5 px-4 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-medium rounded-lg text-sm transition-colors shadow-sm"
                                    >
                                        Submit Account Deletion Request
                                    </button>
                                </form>
                            )}
                        </div>
                    </section>

                    <section className="text-xs text-gray-500 pt-4 border-t border-gray-100 text-center">
                        <p>
                            For any inquiries regarding this policy or data protection, contact our Data Privacy Point of Contact at <a href="mailto:stephe@blueopus.cloud" className="text-brand-green hover:underline">stephe@blueopus.cloud</a>.
                        </p>
                    </section>
                </div>
            </div>
        </div>
    );
};

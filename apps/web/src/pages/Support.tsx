import React, { useState } from 'react';
import { ArrowLeft, Mail, MessageSquare, HelpCircle, CheckCircle2, ShieldCheck, Clock } from 'lucide-react';
import { Link } from 'react-router-dom';

export const Support = () => {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [topic, setTopic] = useState('General Inquiry');
    const [message, setMessage] = useState('');
    const [submitted, setSubmitted] = useState(false);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const subject = encodeURIComponent(`MoneyWise Pro Support: [${topic}] from ${name || email}`);
        const body = encodeURIComponent(
            `Hello Support Team,\n\nName: ${name}\nEmail: ${email}\nTopic: ${topic}\n\nMessage:\n${message}\n\nApp: MoneyWise Pro (iOS / Android / Web)`
        );
        window.location.href = `mailto:stephe@blueopus.cloud?subject=${subject}&body=${body}`;
        setSubmitted(true);
    };

    return (
        <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8 font-sans">
            <div className="max-w-3xl mx-auto bg-white p-8 sm:p-10 shadow rounded-2xl border border-gray-100">
                <div className="mb-6 flex items-center justify-between">
                    <Link to="/" className="text-brand-navy hover:text-brand-green flex items-center gap-2 transition-colors font-medium text-sm">
                        <ArrowLeft size={16} /> Back to MoneyWise
                    </Link>
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                        <Link to="/privacy" className="hover:text-brand-navy transition-colors">Privacy</Link>
                        <span>&bull;</span>
                        <Link to="/terms" className="hover:text-brand-navy transition-colors">Terms</Link>
                    </div>
                </div>

                <div className="text-center mb-8">
                    <div className="mx-auto w-12 h-12 bg-blue-50 text-brand-blue rounded-full flex items-center justify-center mb-3">
                        <HelpCircle className="w-6 h-6 text-[#006AFF]" />
                    </div>
                    <h1 className="text-3xl font-bold text-brand-navy">MoneyWise Pro Support</h1>
                    <p className="text-sm text-gray-600 mt-2 max-w-xl mx-auto">
                        We are here to help you get the most out of MoneyWise Pro. Reach out to our technical team for assistance with accounts, integrations, payments, and app features.
                    </p>
                </div>

                {/* Direct Contact Cards */}
                <div className="grid gap-4 sm:grid-cols-3 mb-8">
                    <div className="p-4 rounded-xl border border-gray-200 bg-gray-50 text-center">
                        <Mail className="w-5 h-5 text-[#006AFF] mx-auto mb-2" />
                        <h3 className="text-xs font-bold text-brand-navy uppercase tracking-wider mb-1">Email Support</h3>
                        <a href="mailto:stephe@blueopus.cloud" className="text-xs font-medium text-brand-green hover:underline break-all">
                            stephe@blueopus.cloud
                        </a>
                        <p className="text-[11px] text-gray-400 mt-1">24–48 hour response time</p>
                    </div>

                    <div className="p-4 rounded-xl border border-gray-200 bg-gray-50 text-center">
                        <Clock className="w-5 h-5 text-emerald-600 mx-auto mb-2" />
                        <h3 className="text-xs font-bold text-brand-navy uppercase tracking-wider mb-1">Business Hours</h3>
                        <p className="text-xs text-gray-700 font-medium">Mon &ndash; Fri: 08:00 &ndash; 17:00</p>
                        <p className="text-[11px] text-gray-400 mt-1">Central Africa Time (CAT)</p>
                    </div>

                    <div className="p-4 rounded-xl border border-gray-200 bg-gray-50 text-center">
                        <ShieldCheck className="w-5 h-5 text-purple-600 mx-auto mb-2" />
                        <h3 className="text-xs font-bold text-brand-navy uppercase tracking-wider mb-1">Developer &amp; HQ</h3>
                        <p className="text-xs text-gray-700 font-medium">Blue Opus</p>
                        <p className="text-[11px] text-gray-400 mt-1">Chongwe, Lusaka, Zambia</p>
                    </div>
                </div>

                {/* FAQ Quick Links */}
                <div className="mb-8">
                    <h2 className="text-base font-bold text-brand-navy mb-3">Frequently Asked Questions</h2>
                    <div className="space-y-3">
                        <details className="p-3.5 rounded-lg border border-gray-200 bg-white text-sm">
                            <summary className="font-semibold text-gray-800 cursor-pointer">How do I connect my QuickBooks Online account?</summary>
                            <p className="mt-2 text-xs text-gray-600 leading-relaxed">
                                Log in to the web app or mobile app, navigate to <strong>Menu &rarr; Integrations</strong>, select <strong>QuickBooks Online</strong>, and authenticate via Intuit's secure OAuth portal. Your Chart of Accounts will sync automatically.
                            </p>
                        </details>

                        <details className="p-3.5 rounded-lg border border-gray-200 bg-white text-sm">
                            <summary className="font-semibold text-gray-800 cursor-pointer">How do payments and Mobile Money payouts work?</summary>
                            <p className="mt-2 text-xs text-gray-600 leading-relaxed">
                                Payments, wallets, and disbursements are processed securely via our licensed payment partner, Lenco. When disbursing funds or mobile money, enter or select the recipient number to initiate a real-time payout.
                            </p>
                        </details>

                        <details className="p-3.5 rounded-lg border border-gray-200 bg-white text-sm">
                            <summary className="font-semibold text-gray-800 cursor-pointer">How do I delete my account and associated data?</summary>
                            <p className="mt-2 text-xs text-gray-600 leading-relaxed">
                                You can delete your account instantly in the mobile app under <strong>Menu &rarr; Legal &amp; account &rarr; Delete my account</strong>, or use our dedicated <Link to="/delete-account" className="text-brand-green underline">Account Deletion Portal</Link>.
                            </p>
                        </details>
                    </div>
                </div>

                {/* Contact Form */}
                <div className="p-6 rounded-xl border border-gray-200 bg-gray-50/50">
                    <div className="flex items-center gap-2 mb-3">
                        <MessageSquare className="w-5 h-5 text-[#006AFF]" />
                        <h2 className="text-base font-bold text-brand-navy">Send us a Support Message</h2>
                    </div>

                    {submitted ? (
                        <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-start gap-3">
                            <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                            <div>
                                <p className="font-semibold text-green-900 text-sm">Message Ready in Email Client</p>
                                <p className="text-xs text-green-800 mt-1">
                                    Your email client has opened with your inquiry addressed to <code className="bg-green-100 px-1 rounded">stephe@blueopus.cloud</code>. If it did not open automatically, please send your email directly to that address.
                                </p>
                            </div>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor="sup-name" className="block text-xs font-semibold text-gray-700 mb-1">Your Name</label>
                                    <input
                                        id="sup-name"
                                        type="text"
                                        required
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        placeholder="Stephen"
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-green"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="sup-email" className="block text-xs font-semibold text-gray-700 mb-1">Your Email *</label>
                                    <input
                                        id="sup-email"
                                        type="email"
                                        required
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="you@company.com"
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-green"
                                    />
                                </div>
                            </div>

                            <div>
                                <label htmlFor="sup-topic" className="block text-xs font-semibold text-gray-700 mb-1">Inquiry Topic</label>
                                <select
                                    id="sup-topic"
                                    value={topic}
                                    onChange={(e) => setTopic(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-green"
                                >
                                    <option value="General Inquiry">General Inquiry</option>
                                    <option value="Login & Account Access">Login &amp; Account Access</option>
                                    <option value="Payments & Disbursements">Payments &amp; Disbursements</option>
                                    <option value="QuickBooks Integration">QuickBooks Integration</option>
                                    <option value="Bug Report">Bug Report</option>
                                </select>
                            </div>

                            <div>
                                <label htmlFor="sup-msg" className="block text-xs font-semibold text-gray-700 mb-1">Message *</label>
                                <textarea
                                    id="sup-msg"
                                    rows={4}
                                    required
                                    value={message}
                                    onChange={(e) => setMessage(e.target.value)}
                                    placeholder="Please describe how we can help you..."
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-green"
                                />
                            </div>

                            <button
                                type="submit"
                                className="w-full py-2.5 px-4 bg-[#006AFF] hover:bg-blue-700 text-white font-semibold rounded-lg text-sm transition-colors shadow-sm"
                            >
                                Contact Support
                            </button>
                        </form>
                    )}
                </div>

                <div className="mt-8 pt-4 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between text-xs text-gray-400 gap-2">
                    <p>&copy; {new Date().getFullYear()} MoneyWise Pro &bull; Blue Opus</p>
                    <div className="flex gap-4">
                        <Link to="/privacy" className="hover:text-brand-navy">Privacy Policy</Link>
                        <Link to="/terms" className="hover:text-brand-navy">Terms of Service</Link>
                        <Link to="/delete-account" className="hover:text-brand-navy">Delete Account</Link>
                    </div>
                </div>
            </div>
        </div>
    );
};

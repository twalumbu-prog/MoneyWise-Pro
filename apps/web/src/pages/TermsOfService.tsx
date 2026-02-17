
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export const TermsOfService = () => {
    return (
        <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8 font-sans">
            <div className="max-w-3xl mx-auto bg-white p-8 shadow rounded-lg">
                <div className="mb-6">
                    <Link to="/" className="text-brand-navy hover:text-brand-green flex items-center gap-2 transition-colors">
                        <ArrowLeft size={16} /> Back to Home
                    </Link>
                </div>
                <h1 className="text-3xl font-bold text-brand-navy mb-2">Terms of Service</h1>
                <p className="text-sm text-gray-500 mb-8">Last Updated: February 16, 2026</p>

                <div className="prose prose-indigo max-w-none space-y-6 text-gray-700">
                    <section>
                        <h2 className="text-xl font-bold text-brand-navy mb-3">1. Acceptance of Terms</h2>
                        <p>
                            By accessing or using Money Wise Pro ("Service"), you agree to be bound by these Terms of Service.
                            If you do not agree, you must discontinue use immediately.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold text-brand-navy mb-3">2. License Grant</h2>
                        <p>
                            Money Wise Pro grants you a limited, non-exclusive, non-transferable, revocable license to use the Service solely for internal business operations.
                        </p>
                        <p className="mt-2 text-sm font-semibold">You may not:</p>
                        <ul className="list-disc pl-5 mt-1 space-y-1">
                            <li>Reverse engineer the Service</li>
                            <li>Resell or sublicense the Service</li>
                            <li>Use the Service for unlawful purposes</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold text-brand-navy mb-3">3. QuickBooks Integration</h2>
                        <p className="mb-2">
                            Money Wise Pro integrates with QuickBooks Online, a product of Intuit Inc.<br />
                            QuickBooks is a trademark of Intuit Inc.
                        </p>
                        <div className="bg-orange-50 p-4 rounded-lg border border-orange-100 text-sm">
                            <span className="font-bold text-orange-800">You acknowledge that:</span>
                            <ul className="list-disc pl-5 mt-2 space-y-1 text-orange-800">
                                <li>You are responsible for verifying the accuracy of accounting records.</li>
                                <li>You are responsible for reviewing Expense transactions created through synchronization.</li>
                                <li>We are not responsible for accounting discrepancies, tax liabilities, penalties, or financial loss arising from use of the Service.</li>
                            </ul>
                        </div>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold text-brand-navy mb-3">4. User Responsibilities</h2>
                        <p className="mb-2">You agree to:</p>
                        <ul className="list-disc pl-5 mt-1 space-y-1">
                            <li>Provide accurate information</li>
                            <li>Maintain confidentiality of login credentials</li>
                            <li>Review financial transactions before filing tax reports</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold text-brand-navy mb-3">5. Disclaimer of Warranties</h2>
                        <div className="bg-gray-100 p-4 rounded-lg text-sm font-medium text-gray-700">
                            <p className="uppercase mb-2">The Service is provided "AS IS" and "AS AVAILABLE."</p>
                            <p className="uppercase">
                                We disclaim all warranties, including merchantability, fitness for a particular purpose, and non-infringement. We do not guarantee uninterrupted or error-free operation.
                            </p>
                        </div>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold text-brand-navy mb-3">6. Limitation of Liability</h2>
                        <div className="bg-gray-100 p-4 rounded-lg text-sm font-medium text-gray-700">
                            <p className="uppercase mb-2">
                                To the maximum extent permitted by law, Stephen Kapambwe shall not be liable for:
                            </p>
                            <ul className="list-disc pl-5 mt-1 space-y-1 uppercase">
                                <li>Indirect damages</li>
                                <li>Loss of profits</li>
                                <li>Business interruption</li>
                                <li>Data loss</li>
                                <li>Tax penalties</li>
                                <li>Financial misstatements</li>
                            </ul>
                            <p className="mt-2 uppercase">Total liability shall not exceed the amount paid for the Service (if any).</p>
                        </div>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold text-brand-navy mb-3">7. Termination</h2>
                        <p>
                            We reserve the right to suspend or terminate access if:
                        </p>
                        <ul className="list-disc pl-5 mt-1 space-y-1">
                            <li>Terms are violated</li>
                            <li>The Service is misused</li>
                            <li>Security risks arise</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold text-brand-navy mb-3">8. Governing Law</h2>
                        <p>
                            These Terms are governed by the laws of Zambia.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold text-brand-navy mb-3">9. Contact</h2>
                        <p>
                            For questions regarding these Terms: <a href="mailto:smkapambwe9@gmail.com" className="text-brand-green hover:underline">smkapambwe9@gmail.com</a>
                        </p>
                    </section>
                </div>
            </div>
        </div>
    );
};

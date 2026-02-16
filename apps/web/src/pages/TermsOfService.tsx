import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export const TermsOfService = () => {
    return (
        <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto bg-white p-8 shadow rounded-lg">
                <div className="mb-6">
                    <Link to="/" className="text-indigo-600 hover:text-indigo-500 flex items-center gap-2">
                        <ArrowLeft size={16} /> Back to Home
                    </Link>
                </div>
                <h1 className="text-3xl font-bold text-gray-900 mb-2">Terms of Service</h1>
                <p className="text-sm text-gray-500 mb-8">Last Updated: February 16, 2026</p>

                <div className="prose prose-indigo max-w-none space-y-6 text-gray-700">
                    <section>
                        <h2 className="text-xl font-semibold text-gray-900">1. Acceptance of Terms</h2>
                        <p>
                            By accessing or using Money Wise Pro ("Service"), you agree to be bound by these Terms of Service.
                            If you do not agree to these terms, please do not use the Service.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900">2. Internal Use License</h2>
                        <p>
                            Money Wise Pro is granted to you under a limited, non-exclusive, non-transferable, revocable license solely for internal business operations within your organization.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900">3. QuickBooks Integration</h2>
                        <p>
                            Our Service integrates with QuickBooks Online. QuickBooks is a trademark of Intuit Inc.
                            You acknowledge that verify accurate accounting records is your responsibility. We are not responsible for any accounting errors, tax penalties, or financial losses resulting from the synchronization of data between Money Wise Pro and QuickBooks.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900">4. Disclaimer of Warranties</h2>
                        <p>
                            THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED.
                            WE DISCLAIM ALL WARRANTIES, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900">5. Limitation of Liability</h2>
                        <p>
                            TO THE MAXIMUM EXTENT PERMITTED BY LAW, WE SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS OR REVENUES, WHETHER INCURRED DIRECTLY OR INDIRECTLY.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900">6. Termination</h2>
                        <p>
                            We reserve the right to suspend or terminate your access to the Service at any time, without notice, for conduct that we believe violates these Terms or is harmful to other users of the Service, us, or third parties, or for any other reason.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900">7. Governing Law</h2>
                        <p>
                            These Terms shall be governed by and construed in accordance with the laws of Zambia.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900">8. Contact</h2>
                        <p>
                            If you have questions about these Terms, please contact us at <a href="mailto:smkapambwe9@gmail.com" className="text-indigo-600 underline">smkapambwe9@gmail.com</a>.
                        </p>
                    </section>
                </div>
            </div>
        </div>
    );
};

import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export const PrivacyPolicy = () => {
    return (
        <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8 font-sans">
            <div className="max-w-3xl mx-auto bg-white p-8 shadow rounded-lg">
                <div className="mb-6 flex items-center justify-between">
                    <Link to="/" className="text-brand-navy hover:text-brand-green flex items-center gap-2 transition-colors font-medium">
                        <ArrowLeft size={16} /> Back to Home
                    </Link>
                    <Link to="/delete-account" className="text-xs text-gray-500 hover:text-brand-navy transition-colors">
                        Account Deletion Portal &rarr;
                    </Link>
                </div>
                <h1 className="text-3xl font-bold text-brand-navy mb-2">Privacy Policy</h1>
                <p className="text-sm text-gray-500 mb-8">Last Updated: October 14, 2026 &bull; Effective Date: October 14, 2026</p>

                <div className="prose prose-indigo max-w-none space-y-6 text-gray-700">
                    <section>
                        <h2 className="text-xl font-bold text-brand-navy mb-3">1. Introduction &amp; Entity Identification</h2>
                        <p className="mb-4">
                            This Privacy Policy applies to the <strong>MoneyWise Pro</strong> application (also known as "MoneyWise", "Service", "App"), available on the web at <a href="https://moneywise.blueopus.cloud" className="text-brand-green hover:underline">moneywise.blueopus.cloud</a>, on Android via Google Play, and on iOS via the Apple App Store.
                        </p>
                        <p className="mb-4">
                            MoneyWise Pro is developed, owned, and operated by <strong>Stephen Kapambwe</strong> trading as <strong>Blue Opus</strong>, located in Chongwe, Lusaka, Zambia.
                        </p>
                        <p className="mb-4">
                            We are committed to maintaining user trust, transparency, and data privacy. This Policy explains how we collect, handle, use, process, and protect your personal and sensitive user data, the third-party integrations we use, and your rights regarding data access, rectification, and deletion.
                        </p>
                        <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
                            <p className="font-bold text-brand-navy mb-1">Developer &amp; Privacy Contact:</p>
                            <p className="text-sm">Entity: Stephen Kapambwe / Blue Opus</p>
                            <p className="text-sm">Primary Privacy Email: <a href="mailto:stephe@blueopus.cloud" className="text-brand-green hover:underline">stephe@blueopus.cloud</a></p>
                            <p className="text-sm">Physical Address: Chongwe, Lusaka, Zambia</p>
                            <p className="text-sm">Web Portal: <a href="https://moneywise.blueopus.cloud" className="text-brand-green hover:underline">https://moneywise.blueopus.cloud</a></p>
                        </div>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold text-brand-navy mb-3">2. Information We Collect and Access</h2>
                        <p className="mb-3">
                            We only collect data necessary to provide and operate the core financial, expense-tracking, payment, and accounting services of MoneyWise Pro. We do not collect extraneous data beyond what is required for app functionality.
                        </p>

                        <h3 className="text-lg font-semibold text-gray-900 mb-2">2.1 Personal &amp; Identity Information</h3>
                        <ul className="list-disc pl-5 mb-4 space-y-1">
                            <li><strong>Name:</strong> To identify you within your organization, approvals, and transaction logs.</li>
                            <li><strong>Email Address:</strong> For login credentials, account recovery, security notices, and transaction notifications.</li>
                            <li><strong>Phone Number &amp; Username:</strong> Where provided, for authentication, mobile money transaction recipient matching, and team coordination.</li>
                            <li><strong>Authentication Credentials:</strong> Password hashes and session tokens securely managed via Supabase Auth. We never receive or store your password in plain text.</li>
                            <li><strong>Organization &amp; Role Details:</strong> Your designated role (e.g., Requestor, Authoriser, Cashier, Accountant, Admin) to enforce strict role-based access control.</li>
                        </ul>

                        <h3 className="text-lg font-semibold text-gray-900 mb-2">2.2 Financial and Payment Information</h3>
                        <ul className="list-disc pl-5 mb-4 space-y-1">
                            <li><strong>Payout and Receiving Details:</strong> Bank name, account number, account holder name, and mobile money details (provider and registered phone number) saved to facilitate payouts and disbursements.</li>
                            <li><strong>Transaction and Ledger Records:</strong> Vouchers, requisitions, expense descriptions, payment amounts, invoice details, cashbook entries, and budgets entered by you or your organization.</li>
                            <li><strong>Payment Processing:</strong> Card and mobile money payments are processed securely through our licensed payment partner, <strong>Lenco</strong>. We <strong>never</strong> collect, handle, or store full credit/debit card numbers or card PINs.</li>
                        </ul>

                        <h3 className="text-lg font-semibold text-gray-900 mb-2">2.3 Device Permissions &amp; Hardware Access</h3>
                        <p className="mb-2">The mobile app requests device permissions strictly with prominent user context and runtime consent:</p>
                        <ul className="list-disc pl-5 mb-4 space-y-2">
                            <li>
                                <strong>Contacts (Address Book):</strong>
                                <br />
                                <em>Why accessed:</em> When you use the "Send Money &rarr; Mobile Money" feature, you can optionally choose to search your phone's address book to select a recipient rather than manually typing their phone number.
                                <br />
                                <em>Handling &amp; Privacy:</em> Contacts are read locally on your device in real-time solely to fill in the recipient's phone number. <strong>Your contacts are never uploaded to our servers, never stored, never synced, and never shared with or sold to third parties.</strong>
                            </li>
                            <li>
                                <strong>Camera &amp; Photo Library:</strong>
                                <br />
                                <em>Why accessed:</em> Only when you choose to photograph or attach paper receipts, invoices, or supporting documents to an expense requisition, or when uploading proof-of-identity documents for investment verification.
                                <br />
                                <em>Handling &amp; Privacy:</em> Images are uploaded to secure, encrypted cloud storage. Camera and photo library access is never triggered in the background.
                            </li>
                            <li>
                                <strong>Microphone &amp; Speech Recognition:</strong>
                                <br />
                                <em>Why accessed:</em> Only when you explicitly tap the dictate button in the AI Assistant to ask questions via voice.
                                <br />
                                <em>Handling &amp; Privacy:</em> Voice input is converted to text on your device or via native speech recognition APIs. Raw audio recordings are not saved on our servers and are never used to train machine learning models.
                            </li>
                            <li>
                                <strong>Biometrics (Face ID / Fingerprint):</strong>
                                <br />
                                <em>Why accessed:</em> For convenient and secure app unlock on supported devices.
                                <br />
                                <em>Handling &amp; Privacy:</em> Biometric authentication is handled entirely by the secure enclave of your operating system. MoneyWise Pro never receives, accesses, or stores biometric data.
                            </li>
                            <li>
                                <strong>Push Notifications:</strong>
                                <br />
                                <em>Why accessed:</em> To deliver timely alerts for pending requisition approvals, disbursement confirmations, and critical security events.
                                <br />
                                <em>Handling &amp; Privacy:</em> Device push tokens are stored securely and used solely to route notifications to your device.
                            </li>
                        </ul>

                        <h3 className="text-lg font-semibold text-gray-900 mb-2">2.4 Persistent Device Identifiers &amp; Tracking Restrictions</h3>
                        <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 text-sm mb-4">
                            <p className="font-semibold text-brand-navy mb-1">Strict Commitment Against Device Identifier Tracking:</p>
                            <p className="mb-2">
                                In strict adherence to the Google Play User Data Policy:
                            </p>
                            <ul className="list-disc pl-5 space-y-1">
                                <li>MoneyWise Pro does <strong>NOT</strong> collect, access, or record persistent hardware identifiers, such as IMEI, IMSI, SIM serial numbers, or MAC addresses.</li>
                                <li>We do <strong>NOT</strong> link persistent device identifiers to any personal user data or resettable device identifiers (such as the Android Advertising ID).</li>
                                <li>We do <strong>NOT</strong> track you across other companies&apos; applications, websites, or services.</li>
                            </ul>
                        </div>

                        <h3 className="text-lg font-semibold text-gray-900 mb-2">2.5 App Set ID &amp; Diagnostics</h3>
                        <p className="mb-4">
                            If an App Set ID is generated by the operating system, it is used strictly for non-advertising, essential functionality such as fraud prevention, security verification, and aggregate internal app analytics. It is never linked to personal data or advertising identifiers, nor is it used for advertising personalization or ad measurement. We do not display third-party advertisements in MoneyWise Pro.
                        </p>

                        <h3 className="text-lg font-semibold text-gray-900 mb-2">2.6 QuickBooks Online Data</h3>
                        <p className="mb-2">If your organization chooses to connect QuickBooks Online, we request the following OAuth scopes:</p>
                        <ul className="list-disc pl-5 mb-2 space-y-1">
                            <li><code className="bg-gray-100 px-1 rounded text-xs">com.intuit.quickbooks.accounting</code></li>
                            <li><code className="bg-gray-100 px-1 rounded text-xs">openid</code></li>
                            <li><code className="bg-gray-100 px-1 rounded text-xs">profile</code></li>
                            <li><code className="bg-gray-100 px-1 rounded text-xs">email</code></li>
                        </ul>
                        <p className="mb-2">We adhere to the principle of least privilege:</p>
                        <ul className="list-disc pl-5 mb-4 space-y-1">
                            <li>Read-only access to Chart of Accounts for account mapping.</li>
                            <li>Write-only access to create Expense transactions from approved requisitions.</li>
                            <li>We never modify or delete existing QuickBooks data, access payroll records, or access your bank login credentials.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold text-brand-navy mb-3">3. How We Use Your Data</h2>
                        <p className="mb-2">We process your information exclusively to provide, maintain, and secure the Service, including to:</p>
                        <ul className="list-disc pl-5 mb-4 space-y-1">
                            <li>Process, route, and record financial requisitions, approvals, and vouchers.</li>
                            <li>Disburse payments and mobile money transfers through licensed partner Lenco.</li>
                            <li>Maintain accurate ledger, cashbook, and financial reporting records for your organization.</li>
                            <li>Synchronize approved requisitions into QuickBooks Online when connected.</li>
                            <li>Provide AI-powered expense categorisation and financial assistant queries based strictly on your organization&apos;s data.</li>
                            <li>Deliver real-time transactional alerts and security notifications.</li>
                            <li>Verify authorization, detect potential fraud, and protect system integrity.</li>
                        </ul>
                        <div className="bg-green-50 p-4 rounded-lg border border-green-100 text-sm">
                            <p className="font-bold text-green-900 mb-1">No Sale of Personal Data:</p>
                            <p className="text-green-800">
                                We do <strong>NOT</strong> sell, rent, lease, trade, or monetize personal or sensitive user data to any third party for monetary consideration or any other commercial benefit.
                            </p>
                        </div>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold text-brand-navy mb-3">4. Third-Party Service Providers</h2>
                        <p className="mb-2">We share only the minimum necessary data with trusted service providers to operate our application infrastructure:</p>
                        <div className="overflow-x-auto mb-4">
                            <table className="min-w-full text-sm text-left border border-gray-200 divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-4 py-2 font-semibold text-gray-900">Partner / SDK</th>
                                        <th className="px-4 py-2 font-semibold text-gray-900">Purpose</th>
                                        <th className="px-4 py-2 font-semibold text-gray-900">Data Shared</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 bg-white">
                                    <tr>
                                        <td className="px-4 py-2 font-medium text-gray-900">Supabase</td>
                                        <td className="px-4 py-2">Database hosting, storage &amp; authentication</td>
                                        <td className="px-4 py-2">User profiles, auth credentials, application records</td>
                                    </tr>
                                    <tr>
                                        <td className="px-4 py-2 font-medium text-gray-900">Lenco (Lenco Tech)</td>
                                        <td className="px-4 py-2">Payment processing, collections &amp; payouts</td>
                                        <td className="px-4 py-2">Account numbers, mobile money numbers, payment amounts</td>
                                    </tr>
                                    <tr>
                                        <td className="px-4 py-2 font-medium text-gray-900">Intuit (QuickBooks Online)</td>
                                        <td className="px-4 py-2">Accounting ledger synchronization (optional)</td>
                                        <td className="px-4 py-2">Approved expense transactions and account categories</td>
                                    </tr>
                                    <tr>
                                        <td className="px-4 py-2 font-medium text-gray-900">OpenRouter / AI Providers</td>
                                        <td className="px-4 py-2">AI Assistant &amp; receipt text recognition</td>
                                        <td className="px-4 py-2">User queries and receipt text (not used for model training)</td>
                                    </tr>
                                    <tr>
                                        <td className="px-4 py-2 font-medium text-gray-900">PostHog</td>
                                        <td className="px-4 py-2">Product analytics &amp; crash diagnostics</td>
                                        <td className="px-4 py-2">Aggregated usage patterns, feature interactions, error logs</td>
                                    </tr>
                                    <tr>
                                        <td className="px-4 py-2 font-medium text-gray-900">Resend</td>
                                        <td className="px-4 py-2">Transactional email delivery</td>
                                        <td className="px-4 py-2">Email address, notification message content</td>
                                    </tr>
                                    <tr>
                                        <td className="px-4 py-2 font-medium text-gray-900">Apple APNs &amp; Google FCM</td>
                                        <td className="px-4 py-2">Push notification delivery</td>
                                        <td className="px-4 py-2">Device push notification tokens</td>
                                    </tr>
                                    <tr>
                                        <td className="px-4 py-2 font-medium text-gray-900">Vercel</td>
                                        <td className="px-4 py-2">Web application hosting &amp; API routing</td>
                                        <td className="px-4 py-2">Standard web server request headers and IP addresses</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                        <p className="text-sm text-gray-600">
                            All third-party service providers are bound by strict contractual data-protection agreements and are prohibited from using your data for any independent or advertising purposes.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold text-brand-navy mb-3">5. Data Security &amp; Cryptography</h2>
                        <ul className="list-disc pl-5 mb-4 space-y-1">
                            <li><strong>Encryption in Transit:</strong> All data transmitted between your device, our servers, and third-party APIs is encrypted using modern cryptography over <strong>HTTPS with TLS 1.2 or TLS 1.3</strong>.</li>
                            <li><strong>Encryption at Rest:</strong> Database records and file attachments are stored in encrypted cloud storage using <strong>AES-256</strong>.</li>
                            <li><strong>OAuth Token Security:</strong> QuickBooks integration tokens are encrypted using <strong>AES-256-GCM</strong> and decrypted only at runtime when securely communicating with QuickBooks APIs.</li>
                            <li><strong>Access Isolation:</strong> Row-Level Security (RLS) policies enforce multi-tenant isolation so organizations can only access their own data.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold text-brand-navy mb-3">6. Data Retention and Account Deletion Policy</h2>
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">6.1 Retention Period</h3>
                        <p className="mb-2">We retain your information as follows:</p>
                        <ul className="list-disc pl-5 mb-4 space-y-1">
                            <li><strong>User Account &amp; Profile Data:</strong> Retained for the lifetime of your active account.</li>
                            <li><strong>Statutory Financial &amp; Accounting Records:</strong> In compliance with Zambian tax, corporate, and financial reporting laws, transaction records (vouchers, ledgers, disbursements, and approvals) must be retained for the statutory accounting period required for your organization's books.</li>
                            <li><strong>QuickBooks Integration Tokens:</strong> Retained only until you disconnect the integration, at which point tokens are permanently deleted immediately.</li>
                        </ul>

                        <h3 className="text-lg font-semibold text-gray-900 mb-2">6.2 Account Deletion (In-App &amp; Web Resource)</h3>
                        <p className="mb-3">
                            In compliance with Google Play and Apple App Store policies, users have a straightforward, permanent method to delete their account and associated personal data both from within the mobile app and externally on the web:
                        </p>
                        <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 space-y-3 mb-4">
                            <div>
                                <p className="font-semibold text-brand-navy">Option 1: In-App Account Deletion</p>
                                <p className="text-sm text-gray-700">
                                    Open the MoneyWise Pro mobile app &rarr; Navigate to <strong>Menu</strong> tab &rarr; Under <strong>Legal &amp; account</strong>, tap <strong>Delete my account</strong> &rarr; Confirm deletion.
                                </p>
                            </div>
                            <div>
                                <p className="font-semibold text-brand-navy">Option 2: External Web Resource</p>
                                <p className="text-sm text-gray-700">
                                    Visit our dedicated web deletion resource at <a href="/delete-account" className="text-brand-green hover:underline font-medium">https://moneywise.blueopus.cloud/delete-account</a> where you can initiate account deletion online without the mobile app.
                                </p>
                            </div>
                            <div>
                                <p className="font-semibold text-brand-navy">Option 3: Written Request via Email</p>
                                <p className="text-sm text-gray-700">
                                    Send an email from your registered account address to <a href="mailto:stephe@blueopus.cloud" className="text-brand-green hover:underline">stephe@blueopus.cloud</a> with the subject line "Account Deletion Request". Requests are verified and processed promptly within 30 days.
                                </p>
                            </div>
                        </div>
                        <div className="bg-amber-50 p-4 rounded-lg border border-amber-100 text-sm text-amber-900">
                            <p className="font-bold mb-1">What happens when your account is deleted:</p>
                            <p className="mb-2">
                                We permanently delete your authentication login credentials, personal profile details (name, email, phone number, username), session tokens, and device push tokens. We do <strong>not</strong> merely freeze or deactivate your account.
                            </p>
                            <p>
                                Any financial transaction records that your organization must maintain for statutory bookkeeping, audit, or tax compliance are preserved, but are permanently disassociated and anonymized from your personal identity (recorded as "Deleted User").
                            </p>
                        </div>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold text-brand-navy mb-3">7. Children&apos;s Privacy</h2>
                        <p className="mb-4">
                            MoneyWise Pro is intended strictly for professional, business, and adult financial management. The Service is not directed to children under the age of 18 (or the age of majority in your jurisdiction). We do not knowingly collect, solicit, or process personal data from children. No third-party SDKs used in the app are directed at children. If we become aware that a child has provided us with personal information, we immediately delete that data from our servers.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold text-brand-navy mb-3">8. Your Rights and Choices</h2>
                        <p className="mb-2">Depending on your jurisdiction (including the Zambian Data Protection Act, No. 3 of 2021, and the GDPR / UK GDPR), you have the right to:</p>
                        <ul className="list-disc pl-5 mb-4 space-y-1">
                            <li><strong>Access:</strong> Request a copy of the personal data we hold about you.</li>
                            <li><strong>Rectification:</strong> Correct inaccurate or incomplete personal information.</li>
                            <li><strong>Erasure (Right to be Forgotten):</strong> Request the permanent deletion of your account and personal data.</li>
                            <li><strong>Restriction &amp; Objection:</strong> Object to or request restriction of certain processing activities.</li>
                            <li><strong>Revocation of Integration:</strong> Disconnect third-party services (such as QuickBooks Online) at any time.</li>
                            <li><strong>Permission Management:</strong> Revoke app permissions (Camera, Photos, Contacts, Microphone, Notifications) at any time through your device&apos;s system settings.</li>
                        </ul>
                        <p className="text-sm">
                            To exercise any of these rights, contact us at: <a href="mailto:stephe@blueopus.cloud" className="text-brand-green hover:underline">stephe@blueopus.cloud</a>
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold text-brand-navy mb-3">9. International Data Transfers</h2>
                        <p className="mb-4">
                            Our application infrastructure and databases are hosted in certified cloud facilities in the United States and the European Union via Vercel and Supabase. Where personal data is transferred across borders, we ensure adequate data protection safeguards are implemented in accordance with applicable data protection laws.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold text-brand-navy mb-3">10. Changes to This Privacy Policy</h2>
                        <p className="mb-4">
                            We may update this Privacy Policy periodically to reflect enhancements to our service, changes in legal obligations, or updates to Google Play and Apple App Store policies. Any changes will be published on this page with an updated "Last Updated" date. We encourage you to review this policy periodically.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold text-brand-navy mb-3">11. Governing Law &amp; Inquiries</h2>
                        <p className="mb-4">
                            This Privacy Policy is governed by the laws of Zambia, including the <strong>Data Protection Act, No. 3 of 2021</strong>, without regard to conflict of law principles.
                        </p>
                        <div className="bg-gray-50 p-4 rounded-lg border border-gray-100 text-sm">
                            <p className="font-bold text-brand-navy mb-1">Privacy Point of Contact:</p>
                            <p>Stephen Kapambwe / Blue Opus</p>
                            <p>Email: <a href="mailto:stephe@blueopus.cloud" className="text-brand-green hover:underline">stephe@blueopus.cloud</a></p>
                            <p>Location: Chongwe, Lusaka, Zambia</p>
                            <p className="mt-2 text-xs text-gray-500">For security-related disclosures, data deletion requests, or regulatory queries, please include "Privacy Policy Inquiry" in your subject line.</p>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
};

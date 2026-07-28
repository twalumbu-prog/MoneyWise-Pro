import React, { useState, useEffect, useRef } from 'react';
import { X, Check, Copy, Link2, ExternalLink, Download, Store, Zap } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import { organizationService } from '../services/organization.service';
import { useAuth } from '../context/AuthContext';
import { SegmentedControl } from './AnimatedTabs';

interface ShareWalletLinkModalProps {
    isOpen: boolean;
    onClose: () => void;
    walletName: string;
    shareUrl: string;
    /** Opens the invoice builder (New Sale in link mode) to generate a one-time link. */
    onGenerateInvoiceLink?: () => void;
}

const ShareWalletLinkModal: React.FC<ShareWalletLinkModalProps> = ({
    isOpen,
    onClose,
    walletName,
    shareUrl,
    onGenerateInvoiceLink
}) => {
    const { organizationLogoUrl } = useAuth();
    // "Store" is the existing full product-catalog portal (shareUrl); "Quick Pay"
    // is the amount-only Quick Link. Same QR/copy/open layout below, just fed by
    // whichever tab is active.
    const [activeTab, setActiveTab] = useState<'store' | 'quickpay'>('store');
    const [copied, setCopied] = useState(false);
    // Seed from the auth context (already loaded + preloaded at login) so the logo
    // paints immediately; only fall back to a fetch if it isn't there yet.
    const [logoUrl, setLogoUrl] = useState<string | null>(organizationLogoUrl);
    const qrRef = useRef<HTMLDivElement>(null);

    // Quick Pay — a simple amount-only payment link keyed by the org's clean
    // public username (generated on first request).
    const [quickLinkUsername, setQuickLinkUsername] = useState<string | null>(null);
    const [quickLinkLoading, setQuickLinkLoading] = useState(false);
    const [quickLinkError, setQuickLinkError] = useState<string | null>(null);
    const quickLinkUrl = quickLinkUsername ? `${window.location.origin}/pay/${quickLinkUsername}` : '';

    const displayUrl = activeTab === 'store' ? shareUrl : quickLinkUrl;

    useEffect(() => {
        if (organizationLogoUrl) {
            setLogoUrl(organizationLogoUrl);
        }
    }, [organizationLogoUrl]);

    useEffect(() => {
        if (!isOpen || organizationLogoUrl) return;
        organizationService.getOrganization()
            .then(org => setLogoUrl(org.logo_url || null))
            .catch(() => setLogoUrl(null));
    }, [isOpen, organizationLogoUrl]);

    const loadQuickLinkUsername = () => {
        setQuickLinkLoading(true);
        setQuickLinkError(null);
        organizationService.getOrCreateQuickLinkUsername()
            .then(setQuickLinkUsername)
            .catch(err => {
                console.error('Failed to load Quick Link username:', err);
                setQuickLinkError('Couldn’t generate your Quick Link. Please try again.');
            })
            .finally(() => setQuickLinkLoading(false));
    };

    useEffect(() => {
        if (!isOpen || quickLinkUsername) return;
        loadQuickLinkUsername();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, quickLinkUsername]);

    // A fresh URL means a stale "Copied" state from the other tab shouldn't linger.
    useEffect(() => {
        setCopied(false);
    }, [activeTab]);

    if (!isOpen) return null;

    const handleDownload = () => {
        const canvas = qrRef.current?.querySelector('canvas');
        if (!canvas) return;
        const url = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.href = url;
        link.download = `${walletName.replace(/\s+/g, '-').toLowerCase() || 'wallet'}-${activeTab}-qr.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleCopy = async () => {
        if (!displayUrl) return;
        try {
            await navigator.clipboard.writeText(displayUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy text: ', err);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm transition-opacity animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-100">
                {/* Header */}
                <div className="p-6 flex justify-between items-center bg-white">
                    <div className="flex items-center space-x-2.5">
                        <div className="text-blue-600">
                            <Link2 size={20} strokeWidth={2.5} />
                        </div>
                        <div>
                            <h2 className="text-base font-black text-slate-950 uppercase tracking-wider">Share Pay Links</h2>
                            <p className="text-xs font-semibold text-slate-400 mt-0.5">{walletName}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-4">
                    <SegmentedControl
                        variant="capsule"
                        trackBgClassName="bg-neutral-100"
                        value={activeTab}
                        onChange={(v) => setActiveTab(v as 'store' | 'quickpay')}
                        options={[
                            { value: 'store', label: <span className="flex items-center justify-center gap-2"><Store size={16} /> Store</span> },
                            { value: 'quickpay', label: <span className="flex items-center justify-center gap-2"><Zap size={16} /> Quick Pay</span> },
                        ]}
                    />

                    {/* Fixed-height results area so switching tabs (or hitting a loading/
                        error state) never resizes the modal itself. */}
                    <div className="min-h-[478px] flex flex-col">
                        {activeTab === 'quickpay' && quickLinkLoading ? (
                            <div className="flex-1 flex items-center justify-center text-center text-xs font-semibold text-slate-400">
                                Generating your Quick Pay link…
                            </div>
                        ) : activeTab === 'quickpay' && (quickLinkError || !quickLinkUrl) ? (
                            <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center">
                                <p className="text-xs font-semibold text-rose-500">{quickLinkError || 'Couldn’t generate your Quick Link.'}</p>
                                <button
                                    onClick={loadQuickLinkUsername}
                                    className="px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider bg-slate-950 text-white hover:bg-slate-900 transition-all"
                                >
                                    Try again
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="flex justify-center">
                                    <div className="flex flex-col items-center p-4 bg-white border border-slate-100 rounded-2xl shadow-sm">
                                        {logoUrl && (
                                            <img
                                                src={logoUrl}
                                                alt="Company logo"
                                                className="h-10 w-auto max-w-[120px] object-contain mb-3 rounded-xl"
                                            />
                                        )}
                                        <div ref={qrRef}>
                                            <QRCodeCanvas
                                                value={displayUrl}
                                                size={180}
                                                level="M"
                                                marginSize={0}
                                                fgColor="#020617"
                                            />
                                        </div>
                                        <button
                                            onClick={handleDownload}
                                            className="mt-4 flex items-center space-x-2 px-4 py-2.5 border border-slate-200 rounded-xl text-xs font-black uppercase tracking-wider text-slate-700 hover:bg-slate-50 transition-all"
                                        >
                                            <Download size={14} strokeWidth={2.5} />
                                            <span>Download QR</span>
                                        </button>
                                    </div>
                                </div>

                                <div className="relative flex items-center">
                                    <input
                                        type="text"
                                        readOnly
                                        value={displayUrl}
                                        className="w-full pl-4 pr-24 py-3.5 bg-slate-50/70 border border-slate-100 rounded-2xl text-xs font-bold text-slate-700 outline-none select-all"
                                    />
                                    <div className="absolute right-2 flex items-center space-x-1">
                                        <button
                                            onClick={handleCopy}
                                            className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-200 flex items-center space-x-1.5 ${
                                                copied
                                                    ? 'bg-emerald-500 text-white shadow-md shadow-emerald-100'
                                                    : 'bg-slate-950 text-white hover:bg-slate-900 shadow-md shadow-slate-950/10'
                                            }`}
                                        >
                                            {copied ? (
                                                <>
                                                    <Check size={14} strokeWidth={3} />
                                                    <span>Copied</span>
                                                </>
                                            ) : (
                                                <>
                                                    <Copy size={14} />
                                                    <span>Copy</span>
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </div>

                                <div className="pt-2 space-y-2.5">
                                    <a
                                        href={displayUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="w-full py-3.5 border border-slate-200 rounded-2xl flex items-center justify-center font-bold text-xs text-slate-700 hover:bg-slate-50 transition-all space-x-2"
                                    >
                                        <span>{activeTab === 'store' ? 'Open payment portal' : 'Open Quick Pay link'}</span>
                                        <ExternalLink size={14} />
                                    </a>
                                    {/* Always rendered (even off the store tab) so the OTP Link
                                        button's space is reserved — keeps this section's height
                                        identical across tabs instead of jumping when it disappears. */}
                                    {onGenerateInvoiceLink && (
                                        <button
                                            onClick={onGenerateInvoiceLink}
                                            className={`w-full py-3.5 bg-slate-950 hover:bg-slate-900 rounded-2xl flex items-center justify-center font-black text-xs uppercase tracking-wider text-white transition-all space-x-2 shadow-md shadow-slate-950/10 ${
                                                activeTab === 'store' ? '' : 'invisible'
                                            }`}
                                        >
                                            <span>OTP Link</span>
                                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ShareWalletLinkModal;

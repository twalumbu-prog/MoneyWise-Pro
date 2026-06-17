import React, { useState, useEffect, useRef } from 'react';
import { X, Check, Copy, Link2, ExternalLink, Download } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import { organizationService } from '../services/organization.service';

interface ShareWalletLinkModalProps {
    isOpen: boolean;
    onClose: () => void;
    walletName: string;
    shareUrl: string;
}

const ShareWalletLinkModal: React.FC<ShareWalletLinkModalProps> = ({
    isOpen,
    onClose,
    walletName,
    shareUrl
}) => {
    const [copied, setCopied] = useState(false);
    const [logoUrl, setLogoUrl] = useState<string | null>(null);
    const qrRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isOpen) return;
        organizationService.getOrganization()
            .then(org => setLogoUrl(org.logo_url || null))
            .catch(() => setLogoUrl(null));
    }, [isOpen]);

    if (!isOpen) return null;

    const handleDownload = () => {
        const canvas = qrRef.current?.querySelector('canvas');
        if (!canvas) return;
        const url = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.href = url;
        link.download = `${walletName.replace(/\s+/g, '-').toLowerCase() || 'wallet'}-payment-qr.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(shareUrl);
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
                <div className="p-6 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
                    <div className="flex items-center space-x-2.5">
                        <div className="p-2.5 bg-blue-50 rounded-xl text-blue-600">
                            <Link2 size={20} strokeWidth={2.5} />
                        </div>
                        <div>
                            <h2 className="text-base font-black text-slate-950 uppercase tracking-wider">Share Payment Portal</h2>
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
                                    value={shareUrl}
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
                            value={shareUrl}
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

                    <div className="pt-2">
                        <a
                            href={shareUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full py-3.5 border border-slate-200 rounded-2xl flex items-center justify-center font-bold text-xs text-slate-700 hover:bg-slate-50 transition-all space-x-2"
                        >
                            <span>Open payment portal</span>
                            <ExternalLink size={14} />
                        </a>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ShareWalletLinkModal;

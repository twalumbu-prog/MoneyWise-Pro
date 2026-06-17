import React, { useState } from 'react';
import { X, Check, Copy, Link2, ExternalLink, User, Smartphone, DollarSign, Loader2, AlertCircle, ArrowLeft } from 'lucide-react';
import { paymentLinkService, Product } from '../services/product.service';

interface ShareProductLinkModalProps {
    isOpen: boolean;
    onClose: () => void;
    product: Product | null;
}

const ShareProductLinkModal: React.FC<ShareProductLinkModalProps> = ({ isOpen, onClose, product }) => {
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [amount, setAmount] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [shareUrl, setShareUrl] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    // Reset internal state whenever the modal is (re)opened for a product.
    React.useEffect(() => {
        if (isOpen && product) {
            setCustomerName('');
            setCustomerPhone('');
            // DONATION / SERVICE_VARIABLE leave the amount for the admin to set.
            const isOpenPriced = product.product_type === 'DONATION' || product.product_type === 'SERVICE_VARIABLE';
            setAmount(isOpenPriced ? '' : String(product.price ?? ''));
            setError(null);
            setShareUrl(null);
            setCopied(false);
        }
    }, [isOpen, product]);

    if (!isOpen || !product) return null;

    const handleGenerate = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!customerName.trim()) return setError('Please enter the customer name.');
        if (customerPhone.replace(/\D/g, '').length < 9) return setError('Please enter a valid phone number.');
        const amountNum = Number(amount);
        if (isNaN(amountNum) || amountNum <= 0) return setError('Please enter an amount greater than 0.');

        try {
            setSubmitting(true);
            const link = await paymentLinkService.createPaymentLink({
                product_id: product.id,
                customer_name: customerName.trim(),
                customer_phone: customerPhone.trim(),
                amount: amountNum
            });
            const path = link.path || `/pl/${link.token}`;
            setShareUrl(`${window.location.origin}${path}`);
        } catch (err: any) {
            setError(err.response?.data?.error || err.message || 'Failed to create payment link.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleCopy = async () => {
        if (!shareUrl) return;
        try {
            await navigator.clipboard.writeText(shareUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy text:', err);
        }
    };

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm transition-opacity animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-100">
                {/* Header */}
                <div className="p-6 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
                    <div className="flex items-center space-x-2.5">
                        <div className="p-2.5 bg-blue-50 rounded-xl text-blue-600">
                            <Link2 size={20} strokeWidth={2.5} />
                        </div>
                        <div>
                            <h2 className="text-base font-black text-slate-950 uppercase tracking-wider">One-Time Payment Link</h2>
                            <p className="text-xs font-semibold text-slate-400 mt-0.5 truncate max-w-[240px]">{product.name}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all">
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                {!shareUrl ? (
                    <form onSubmit={handleGenerate} className="p-6 space-y-4">
                        <p className="text-xs font-semibold text-slate-500 leading-relaxed">
                            Enter the customer's details and the amount. They'll receive a pre-filled link that becomes inactive after they pay once.
                        </p>

                        <div>
                            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Customer Name</label>
                            <div className="relative">
                                <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                <input
                                    type="text"
                                    value={customerName}
                                    onChange={(e) => setCustomerName(e.target.value)}
                                    placeholder="John Doe"
                                    disabled={submitting}
                                    className="w-full pl-12 pr-4 py-3 bg-slate-50/70 border border-slate-100 rounded-2xl text-xs font-bold text-slate-800 outline-none focus:bg-white focus:ring-4 focus:ring-blue-50 focus:border-blue-300 transition-all placeholder:text-slate-300"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Phone Number</label>
                            <div className="relative">
                                <Smartphone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                <input
                                    type="tel"
                                    value={customerPhone}
                                    onChange={(e) => setCustomerPhone(e.target.value)}
                                    placeholder="e.g. 0970000000"
                                    disabled={submitting}
                                    className="w-full pl-12 pr-4 py-3 bg-slate-50/70 border border-slate-100 rounded-2xl text-xs font-bold text-slate-800 outline-none focus:bg-white focus:ring-4 focus:ring-blue-50 focus:border-blue-300 transition-all placeholder:text-slate-300"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Amount (K)</label>
                            <div className="relative">
                                <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                    placeholder="0.00"
                                    disabled={submitting}
                                    className="w-full pl-12 pr-4 py-3 bg-slate-50/70 border border-slate-100 rounded-2xl text-xs font-bold text-slate-800 outline-none focus:bg-white focus:ring-4 focus:ring-blue-50 focus:border-blue-300 transition-all placeholder:text-slate-300"
                                />
                            </div>
                        </div>

                        {error && (
                            <div className="p-3.5 bg-rose-50 text-rose-600 rounded-xl flex items-start space-x-2 animate-in fade-in duration-200">
                                <AlertCircle className="flex-shrink-0 mt-0.5" size={14} />
                                <span className="text-[11px] font-semibold leading-normal">{error}</span>
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={submitting}
                            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white py-3.5 rounded-2xl font-black text-xs uppercase tracking-[0.15em] transition-all shadow-md flex items-center justify-center space-x-2"
                        >
                            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
                            <span>{submitting ? 'Generating...' : 'Generate Link'}</span>
                        </button>
                    </form>
                ) : (
                    <div className="p-6 space-y-4">
                        <p className="text-xs font-semibold text-slate-500 leading-relaxed">
                            Share this single-use link with <span className="font-bold text-slate-700">{customerName}</span>. It will deactivate automatically once they complete payment of <span className="font-bold text-slate-700">K{Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>.
                        </p>

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
                                    {copied ? <><Check size={14} strokeWidth={3} /><span>Copied</span></> : <><Copy size={14} /><span>Copy</span></>}
                                </button>
                            </div>
                        </div>

                        <a
                            href={shareUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full py-3.5 border border-slate-200 rounded-2xl flex items-center justify-center font-bold text-xs text-slate-700 hover:bg-slate-50 transition-all space-x-2"
                        >
                            <span>Open payment link</span>
                            <ExternalLink size={14} />
                        </a>

                        <button
                            onClick={() => setShareUrl(null)}
                            className="w-full flex items-center justify-center text-xs font-bold text-slate-400 hover:text-blue-600 uppercase tracking-wider transition-colors space-x-1.5"
                        >
                            <ArrowLeft size={12} />
                            <span>Create another link</span>
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ShareProductLinkModal;

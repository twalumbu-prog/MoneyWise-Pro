import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import jsPDF from 'jspdf';
import { 
    Loader2, 
    ArrowRight, 
    Smartphone, 
    User, 
    ShoppingCart, 
    Plus, 
    Minus, 
    AlertCircle, 
    CheckCircle2, 
    ArrowLeft, 
    Building2,
    ShieldCheck,
    Download
} from 'lucide-react';

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');

interface Product {
    id: string;
    name: string;
    description?: string;
    price: number;
    is_active: boolean;
}

interface OrgContext {
    id: string;
    name: string;
    logo_url: string | null;
}

interface WalletContext {
    id: string;
    name: string;
    lenco_subaccount_id: string | null;
    lenco_public_key: string | null;
    payment_test_mode: boolean;
}

interface PublicContextResponse {
    organization: OrgContext;
    wallet: WalletContext;
    products: Product[];
}

export const PublicPay: React.FC = () => {
    const { wallet_id } = useParams<{ wallet_id: string }>();
    const navigate = useNavigate();

    // UI Steps
    // 'LOADING' | 'LOGIN' | 'CATALOG' | 'VERIFYING' | 'SUCCESS' | 'ERROR'
    const [step, setStep] = useState<'LOADING' | 'LOGIN' | 'CATALOG' | 'VERIFYING' | 'SUCCESS' | 'ERROR'>('LOADING');
    
    // Data Context
    const [org, setOrg] = useState<OrgContext | null>(null);
    const [wallet, setWallet] = useState<WalletContext | null>(null);
    const [products, setProducts] = useState<Product[]>([]);
    
    // Inputs & Forms
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [selectedQuantities, setSelectedQuantities] = useState<Record<string, number>>({});
    
    // Payment Status states
    const [currentReference, setCurrentReference] = useState('');
    const [verificationStep, setVerificationStep] = useState<'POLLING' | 'SUCCESS' | 'FAILED'>('POLLING');
    const [verificationReason, setVerificationReason] = useState('');
    const [receiptNumber, setReceiptNumber] = useState<string | null>(null);
    
    // Global errors
    const [error, setError] = useState<string | null>(null);

    // Fetch context on load
    useEffect(() => {
        const fetchContext = async () => {
            if (!wallet_id) {
                setError('Invalid wallet ID in URL.');
                setStep('ERROR');
                return;
            }

            try {
                const response = await axios.get<PublicContextResponse>(`${API_URL}/lenco/public-context/${wallet_id}`);
                setOrg(response.data.organization);
                setWallet(response.data.wallet);
                setProducts(response.data.products);
                
                // If wallet doesn't have a lenco configuration
                if (!response.data.wallet.lenco_subaccount_id) {
                    setError('This organization hasn\'t completed their payment provider integration. Checkout is currently unavailable.');
                    setStep('ERROR');
                    return;
                }

                setStep('LOGIN');
            } catch (err: any) {
                console.error('Error fetching public pay context:', err);
                setError(err.response?.data?.error || 'Failed to load organization checkout details. Please check the link and try again.');
                setStep('ERROR');
            }
        };

        fetchContext();
    }, [wallet_id]);

    const handleLoginSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!customerName.trim()) {
            setError('Please enter your name');
            return;
        }
        if (!customerPhone.trim()) {
            setError('Please enter your phone number');
            return;
        }
        
        // Simple Phone format cleanup/check
        const digits = customerPhone.replace(/\D/g, '');
        if (digits.length < 9) {
            setError('Please enter a valid phone number');
            return;
        }

        setError(null);
        setStep('CATALOG');
    };

    const handleQuantityChange = (productId: string, delta: number) => {
        const currentQty = selectedQuantities[productId] || 0;
        const newQty = Math.max(0, currentQty + delta);
        setSelectedQuantities({
            ...selectedQuantities,
            [productId]: newQty
        });
    };

    // Calculation variables
    const selectedProductsList = products.filter(p => (selectedQuantities[p.id] || 0) > 0);
    const subtotal = selectedProductsList.reduce((sum, p) => sum + (p.price * (selectedQuantities[p.id] || 0)), 0);
    
    // Add Lenco fee markup (divided by 0.99 just like cash ledger deposit to settle full net amount)
    const totalPayable = subtotal > 0 ? subtotal / 0.99 : 0;
    const processingFee = totalPayable - subtotal;

    const handlePay = async () => {
        if (subtotal <= 0) {
            setError('Please select at least one product or service to purchase.');
            return;
        }

        if (!wallet || !org) return;

        const LencoPay: any = (window as any).LencoPay;
        if (!LencoPay) {
            setError('Payment gateway SDK failed to load. Please reload the page or check your connection.');
            return;
        }

        // Build list description for database narration
        const productNarration = selectedProductsList
            .map(p => `${p.name} (x${selectedQuantities[p.id]})`)
            .join(', ');

        const purpose = `Purchase: ${productNarration}`;
        const ref = `DEP-${Date.now()}-${wallet.lenco_subaccount_id!.substring(0, 8)}-PUB`;
        setCurrentReference(ref);
        setError(null);

        try {
            // Log intent on server publicly
            await axios.post(`${API_URL}/lenco/public-wallet-deposit-intent`, {
                reference: ref,
                purpose: `Sale: Products: ${productNarration} | Cust: ${customerPhone}`,
                amount: subtotal, // Settle the subtotal net amount in ledger
                walletId: wallet.id
            });

            // Start Lenco Payment Gateway Iframe
            LencoPay.getPaid({
                key: wallet.lenco_public_key || 'pub-f3a595efda03948ae5dcd2effe073ef0aa2b333457a6c80d',
                amount: totalPayable.toFixed(2), 
                currency: 'ZMW',
                reference: ref,
                accountId: wallet.lenco_subaccount_id!,
                email: 'customer@moneywise.co',
                name: customerName,
                description: purpose,
                narration: purpose,
                meta: {
                    purpose: purpose,
                    customerPhone: customerPhone,
                    isPublicPortal: true
                },
                channels: ['card', 'mobile-money'],
                onSuccess: async (response: any) => {
                    console.log('Public payment window success reported', response);
                    const transactionId = response.id || response.transactionId;
                    setStep('VERIFYING');
                    setVerificationStep('POLLING');
                    
                    // Poll verification route
                    let attempts = 0;
                    const maxAttempts = 15;
                    
                    const pollStatus = async () => {
                        attempts++;
                        try {
                            const verifyRes = await axios.get(
                                `${API_URL}/lenco/public-verify-status/${ref}?transactionId=${transactionId}&organizationId=${org.id}`
                            );
                            
                            if (verifyRes.data.verified) {
                                setVerificationStep('SUCCESS');
                                setReceiptNumber(verifyRes.data.referenceNumber || null);
                                setStep('SUCCESS');
                                return;
                            }
                        } catch (err) {
                            console.error('Public Verification attempt failed:', err);
                        }
                        
                        if (attempts < maxAttempts) {
                            setTimeout(pollStatus, 3000);
                        } else {
                            setVerificationStep('FAILED');
                            setVerificationReason('Payment was submitted but the ledger sync is taking longer than expected. Please contact the business admin to verify.');
                        }
                    };
                    
                    pollStatus();
                },
                onClose: () => {
                    console.log('Public payment window closed');
                }
            });
        } catch (err: any) {
            console.error('Failed to initiate checkout intent:', err);
            setError(err.response?.data?.error || 'Failed to initiate deposit checkout. Please try again.');
        }
    };

    const handleReset = () => {
        setSelectedQuantities({});
        setReceiptNumber(null);
        setStep('CATALOG');
        setError(null);
    };

    const handleDownloadReceipt = () => {
        if (!org || !wallet) return;

        const doc = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
        });

        const primaryColor = '#1e293b'; // slate-800
        const accentColor = '#2563eb'; // blue-600

        // 1. Draw branding header
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(20);
        doc.setTextColor(primaryColor);
        doc.text(org.name.toUpperCase(), 20, 25);

        doc.setFontSize(9);
        doc.setFont('Helvetica', 'normal');
        doc.setTextColor('#64748b'); // slate-500
        doc.text('Official Payment Receipt', 20, 31);

        // Right-aligned title
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(accentColor);
        doc.text('RECEIPT', 190, 25, { align: 'right' });

        // Divider
        doc.setDrawColor('#e2e8f0'); // slate-200
        doc.setLineWidth(0.5);
        doc.line(20, 36, 190, 36);

        // 2. Receipt metadata
        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor('#334155'); // slate-700
        doc.text(`Receipt No: #${receiptNumber || currentReference.replace('-PUB', '')}`, 20, 46);
        doc.text(`Date: ${new Date().toLocaleString()}`, 20, 52);
        doc.text(`Payment Method: Lenco (Card/Mobile Money)`, 20, 58);

        doc.text(`Bill To:`, 120, 46);
        doc.setFont('Helvetica', 'bold');
        doc.text(customerName, 120, 52);
        doc.setFont('Helvetica', 'normal');
        doc.text(`Phone: ${customerPhone}`, 120, 58);

        // Divider
        doc.line(20, 65, 190, 65);

        // 3. Products Table Header
        doc.setFillColor('#f8fafc'); // slate-50
        doc.rect(20, 72, 170, 8, 'F');
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor('#475569'); // slate-600
        doc.text('Item Description', 24, 77);
        doc.text('Qty', 110, 77, { align: 'center' });
        doc.text('Unit Price (K)', 145, 77, { align: 'right' });
        doc.text('Total (K)', 186, 77, { align: 'right' });

        let y = 86;
        doc.setFont('Helvetica', 'normal');
        doc.setTextColor('#334155');

        selectedProductsList.forEach((item) => {
            const qty = selectedQuantities[item.id] || 0;
            const unitPrice = item.price;
            const total = unitPrice * qty;

            doc.text(item.name, 24, y);
            doc.text(qty.toString(), 110, y, { align: 'center' });
            doc.text(unitPrice.toFixed(2), 145, y, { align: 'right' });
            doc.text(total.toFixed(2), 186, y, { align: 'right' });

            // Underline for items
            doc.setDrawColor('#f1f5f9');
            doc.line(20, y + 3, 190, y + 3);
            y += 10;
        });

        // 4. Financial Calculations
        y += 5;
        doc.setFont('Helvetica', 'normal');
        doc.text('Subtotal:', 140, y, { align: 'right' });
        doc.text(`K ${subtotal.toFixed(2)}`, 186, y, { align: 'right' });

        y += 6;
        doc.text('Processing Fee (1%):', 140, y, { align: 'right' });
        doc.text(`K ${processingFee.toFixed(2)}`, 186, y, { align: 'right' });

        y += 8;
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(primaryColor);
        doc.text('Total Paid:', 140, y, { align: 'right' });
        doc.text(`K ${totalPayable.toFixed(2)}`, 186, y, { align: 'right' });

        // Divider
        y += 6;
        doc.setDrawColor('#e2e8f0');
        doc.line(20, y, 190, y);

        // 5. Footer
        y += 12;
        doc.setFont('Helvetica', 'italic');
        doc.setFontSize(9);
        doc.setTextColor('#94a3b8'); // slate-400
        doc.text('Thank you for your payment!', 105, y, { align: 'center' });

        y += 5;
        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(8);
        doc.text('Secured by MoneyWise Ledger Gateway', 105, y, { align: 'center' });

        // Save PDF
        doc.save(`receipt-${receiptNumber || currentReference}.pdf`);
    };

    // Helper to render Organization Logo / Initial
    const renderLogo = (sizeClass = "w-20 h-20", textClass = "text-3xl") => {
        if (!org) return null;
        if (org.logo_url) {
            return (
                <div className={`${sizeClass} rounded-3xl overflow-hidden shadow-md bg-white border border-slate-100/50 flex-shrink-0 animate-in fade-in zoom-in duration-300`}>
                    <img src={org.logo_url} alt={`${org.name} Logo`} className="w-full h-full object-cover" />
                </div>
            );
        }
        return (
            <div className={`${sizeClass} rounded-3xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white font-black ${textClass} shadow-md uppercase flex-shrink-0`}>
                {org.name.charAt(0)}
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-blue-50/30 flex flex-col justify-between py-10 px-4">
            <div className="max-w-md w-full mx-auto my-auto bg-white/70 backdrop-blur-xl rounded-[32px] border border-slate-100 shadow-2xl overflow-hidden flex flex-col justify-between transition-all duration-300">
                
                {/* 1. Loading Step */}
                {step === 'LOADING' && (
                    <div className="p-10 flex flex-col items-center justify-center min-h-[450px]">
                        <div className="p-4 bg-blue-50 text-blue-600 rounded-2xl animate-spin mb-4">
                            <Loader2 size={32} />
                        </div>
                        <h3 className="text-sm font-bold text-slate-700 uppercase tracking-widest">Loading Payment Portal</h3>
                        <p className="text-xs text-slate-400 mt-2 font-medium">Fetching catalog and settings...</p>
                    </div>
                )}

                {/* 2. Login Step */}
                {step === 'LOGIN' && org && (
                    <div className="p-8">
                        <div className="flex flex-col items-center text-center mb-8">
                            {renderLogo("w-20 h-20", "text-3xl")}
                            <h2 className="text-lg font-black text-slate-900 mt-4 uppercase tracking-wider">{org.name}</h2>
                            <p className="text-xs font-semibold text-slate-400 mt-1">Payment Checkout Portal</p>
                        </div>

                        <form onSubmit={handleLoginSubmit} className="space-y-5">
                            <div>
                                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Your Full Name</label>
                                <div className="relative">
                                    <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                    <input
                                        type="text"
                                        value={customerName}
                                        onChange={(e) => setCustomerName(e.target.value)}
                                        placeholder="John Doe"
                                        className="w-full pl-12 pr-4 py-3.5 bg-slate-50/70 border border-slate-100 rounded-2xl text-xs font-bold text-slate-800 outline-none focus:bg-white focus:ring-4 focus:ring-blue-50 focus:border-blue-300 transition-all placeholder:text-slate-300"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Phone Number</label>
                                <div className="relative">
                                    <Smartphone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                    <input
                                        type="tel"
                                        value={customerPhone}
                                        onChange={(e) => setCustomerPhone(e.target.value)}
                                        placeholder="e.g. 0970000000"
                                        className="w-full pl-12 pr-4 py-3.5 bg-slate-50/70 border border-slate-100 rounded-2xl text-xs font-bold text-slate-800 outline-none focus:bg-white focus:ring-4 focus:ring-blue-50 focus:border-blue-300 transition-all placeholder:text-slate-300"
                                    />
                                </div>
                            </div>

                            {error && (
                                <div className="p-4 bg-rose-50 text-rose-600 rounded-2xl flex items-start space-x-2.5 animate-in fade-in duration-200">
                                    <AlertCircle className="flex-shrink-0 mt-0.5" size={16} />
                                    <span className="text-[11px] font-semibold leading-normal">{error}</span>
                                </div>
                            )}

                            <button
                                type="submit"
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-[0.15em] transition-all shadow-lg shadow-blue-100 flex items-center justify-center space-x-2"
                            >
                                <span>Enter Portal</span>
                                <ArrowRight size={14} />
                            </button>
                        </form>
                    </div>
                )}

                {/* 3. Catalog / Selector Step */}
                {step === 'CATALOG' && org && (
                    <div className="flex flex-col min-h-[500px]">
                        {/* Catalog Header */}
                        <div className="p-6 border-b border-slate-50 flex items-center justify-between bg-slate-50/30">
                            <div className="flex items-center space-x-3">
                                {renderLogo("w-10 h-10", "text-sm")}
                                <div>
                                    <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider">{org.name}</h4>
                                    <p className="text-[10px] font-semibold text-slate-400">Products & Services</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setStep('LOGIN')}
                                className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100/50 transition-all"
                                title="Back to Login"
                            >
                                <ArrowLeft size={16} />
                            </button>
                        </div>

                        {/* Catalog List */}
                        <div className="p-6 flex-1 overflow-y-auto max-h-[350px] space-y-3.5">
                            {products.length === 0 ? (
                                <div className="text-center py-10">
                                    <ShoppingCart className="mx-auto text-slate-200 mb-2" size={36} />
                                    <p className="text-xs font-semibold text-slate-400">No products configured yet.</p>
                                </div>
                            ) : (
                                products.map(product => {
                                    const qty = selectedQuantities[product.id] || 0;
                                    return (
                                        <div 
                                            key={product.id}
                                            className={`p-4 rounded-2xl border transition-all duration-300 flex justify-between items-center ${
                                                qty > 0 
                                                    ? 'border-blue-500 bg-blue-50/10 shadow-xs' 
                                                    : 'border-slate-100 hover:border-slate-200 bg-white'
                                            }`}
                                        >
                                            <div className="flex-1 min-w-0 pr-4">
                                                <h5 className="text-xs font-black text-slate-900 truncate uppercase tracking-wide">{product.name}</h5>
                                                {product.description && (
                                                    <p className="text-[10px] font-medium text-slate-400 mt-1 line-clamp-2">{product.description}</p>
                                                )}
                                                <p className="text-xs font-black text-blue-600 mt-2">
                                                    K{product.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                </p>
                                            </div>
                                            
                                            <div className="flex items-center space-x-2">
                                                {qty > 0 ? (
                                                    <div className="flex items-center bg-slate-50 border border-slate-100 rounded-xl p-1">
                                                        <button 
                                                            onClick={() => handleQuantityChange(product.id, -1)}
                                                            className="p-1 rounded-lg hover:bg-white text-slate-500 hover:text-slate-800 transition-all"
                                                        >
                                                            <Minus size={12} strokeWidth={2.5} />
                                                        </button>
                                                        <span className="px-2.5 text-xs font-black text-slate-900">{qty}</span>
                                                        <button 
                                                            onClick={() => handleQuantityChange(product.id, 1)}
                                                            className="p-1 rounded-lg hover:bg-white text-slate-500 hover:text-slate-800 transition-all"
                                                        >
                                                            <Plus size={12} strokeWidth={2.5} />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <button
                                                        onClick={() => handleQuantityChange(product.id, 1)}
                                                        className="p-2 border border-slate-100 hover:border-blue-200 text-slate-400 hover:text-blue-600 rounded-xl hover:bg-blue-50/50 transition-all"
                                                    >
                                                        <Plus size={14} strokeWidth={2.5} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        {/* Order Summary & Button */}
                        <div className="p-6 border-t border-slate-100 bg-slate-50/50 space-y-4">
                            {subtotal > 0 && (
                                <div className="space-y-1.5 text-xs">
                                    <div className="flex justify-between font-semibold text-slate-500">
                                        <span>Subtotal</span>
                                        <span>K{subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                    </div>
                                    <div className="flex justify-between font-semibold text-slate-400 text-[11px]">
                                        <span className="flex items-center gap-1">
                                            <span>Processing Fee (1%)</span>
                                            <span className="text-[9px] bg-slate-100 text-slate-400 px-1 py-0.5 rounded-sm">Paid by Client</span>
                                        </span>
                                        <span>K{processingFee.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                    </div>
                                    <div className="flex justify-between font-black text-slate-900 text-sm pt-2 border-t border-slate-200/50">
                                        <span>Total Amount</span>
                                        <span>K{totalPayable.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                    </div>
                                </div>
                            )}

                            {error && (
                                <div className="p-3.5 bg-rose-50 text-rose-600 rounded-xl flex items-start space-x-2 animate-in fade-in duration-200">
                                    <AlertCircle className="flex-shrink-0 mt-0.5" size={14} />
                                    <span className="text-[10px] font-semibold leading-normal">{error}</span>
                                </div>
                            )}

                            <button
                                onClick={handlePay}
                                disabled={subtotal <= 0}
                                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white py-4 rounded-2xl font-black text-xs uppercase tracking-[0.15em] transition-all shadow-lg shadow-blue-100 flex items-center justify-center space-x-2"
                            >
                                <ShieldCheck size={14} />
                                <span>Pay with Lenco</span>
                            </button>
                        </div>
                    </div>
                )}

                {/* 4. Verifying Payment Status Step */}
                {step === 'VERIFYING' && (
                    <div className="p-10 flex flex-col items-center justify-center min-h-[450px]">
                        {verificationStep === 'POLLING' ? (
                            <>
                                <div className="p-4 bg-amber-50 text-amber-600 rounded-2xl animate-spin mb-4">
                                    <Loader2 size={32} />
                                </div>
                                <h3 className="text-sm font-bold text-slate-700 uppercase tracking-widest text-center">Verifying Payment Status</h3>
                                <p className="text-xs text-slate-400 mt-2 text-center max-w-xs leading-relaxed font-semibold">
                                    Please wait while we sync your mobile money or card deposit with the business ledger...
                                </p>
                            </>
                        ) : (
                            <>
                                <div className="p-4 bg-rose-50 text-rose-600 rounded-2xl mb-4">
                                    <AlertCircle size={32} />
                                </div>
                                <h3 className="text-sm font-bold text-slate-700 uppercase tracking-widest text-center">Reconciliation Pending</h3>
                                <p className="text-xs text-slate-400 mt-3 text-center max-w-xs leading-relaxed font-medium">
                                    {verificationReason}
                                </p>
                                <button
                                    onClick={handleReset}
                                    className="mt-6 px-6 py-3 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-wider hover:bg-slate-800 transition-all"
                                >
                                    Return to Catalog
                                </button>
                            </>
                        )}
                    </div>
                )}

                {/* 5. Success Step */}
                {step === 'SUCCESS' && org && (
                    <div className="p-8 text-center min-h-[450px] flex flex-col justify-between">
                        <div className="my-auto py-6 space-y-5">
                            <div className="mx-auto w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center animate-in zoom-in-75 duration-300">
                                <CheckCircle2 size={32} strokeWidth={2.5} />
                            </div>
                            
                            <div>
                                <h3 className="text-lg font-black text-slate-900 uppercase tracking-wider">Payment Confirmed!</h3>
                                <p className="text-xs text-slate-400 font-semibold mt-1">
                                    Receipt Number: {receiptNumber ? `#${receiptNumber}` : currentReference.replace('-PUB', '')}
                                </p>
                            </div>

                            <div className="bg-slate-50/70 border border-slate-100/50 rounded-2xl p-5 text-left text-xs space-y-2.5 max-w-xs mx-auto">
                                <div className="flex justify-between font-semibold text-slate-400">
                                    <span>Client Name:</span>
                                    <span className="font-bold text-slate-700">{customerName}</span>
                                </div>
                                <div className="flex justify-between font-semibold text-slate-400">
                                    <span>Products:</span>
                                    <span className="font-bold text-slate-700 text-right truncate max-w-[150px]" title={
                                        selectedProductsList.map(p => `${p.name} (x${selectedQuantities[p.id]})`).join(', ')
                                    }>
                                        {selectedProductsList.map(p => `${p.name} (x${selectedQuantities[p.id]})`).join(', ')}
                                    </span>
                                </div>
                                <div className="flex justify-between font-semibold text-slate-400 pt-2 border-t border-slate-100">
                                    <span>Amount Settled:</span>
                                    <span className="font-black text-emerald-600">K{subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                </div>
                                <div className="flex justify-between font-semibold text-slate-400">
                                    <span>Total Paid:</span>
                                    <span className="font-bold text-slate-800">K{totalPayable.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col gap-3">
                            <button
                                onClick={handleDownloadReceipt}
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-[0.15em] transition-all shadow-lg shadow-blue-100 flex items-center justify-center space-x-2"
                            >
                                <Download size={14} />
                                <span>Download Receipt</span>
                            </button>
                            <button
                                onClick={handleReset}
                                className="w-full bg-slate-950 hover:bg-slate-900 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-[0.15em] transition-all shadow-lg"
                            >
                                Make Another Payment
                            </button>
                        </div>
                    </div>
                )}

                {/* 6. Error Step */}
                {step === 'ERROR' && (
                    <div className="p-8 text-center min-h-[450px] flex flex-col justify-between">
                        <div className="my-auto py-6 space-y-4">
                            <div className="mx-auto w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center">
                                <AlertCircle size={32} />
                            </div>
                            <h3 className="text-base font-black text-slate-900 uppercase tracking-wider">Configuration Error</h3>
                            <p className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed font-semibold">
                                {error}
                            </p>
                        </div>

                        <button
                            onClick={() => navigate('/login')}
                            className="w-full bg-slate-950 hover:bg-slate-900 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-[0.15em] transition-all shadow-lg"
                        >
                            Return to Login
                        </button>
                    </div>
                )}

            </div>

            {/* Footer Brand Info */}
            <div className="mt-8 text-center space-y-2">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center justify-center space-x-1.5">
                    <Building2 size={12} />
                    <span>Secured by MoneyWise Ledger Gateway</span>
                </p>
                <p className="text-[9px] font-medium text-slate-400">
                    Terms & Privacy Apply. Payments are processed securely via Lenco.
                </p>
            </div>
        </div>
    );
};

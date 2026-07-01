import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import jsPDF from 'jspdf';
import { trackEvent, trackVerificationTimeout } from '../lib/analytics';
import {
    Loader2,
    ArrowLeft,
    ArrowRight,
    Plus,
    Minus,
    Trash2,
    ShoppingBag,
    ShoppingCart,
    User,
    Smartphone,
    Calendar,
    AlertCircle,
    CheckCircle2,
    Download,
    Search,
    BadgeCheck,
    Building2,
    Banknote,
    CalendarDays,
    Check,
} from 'lucide-react';
import { calculatePlatformFee } from 'shared';
import { SegmentedControl } from '../components/AnimatedTabs';
import BookingCalendar from '../components/BookingCalendar';
import { productService, Product, BookingRange } from '../services/product.service';
import { organizationService, Organization } from '../services/organization.service';
import { cashbookService } from '../services/cashbook.service';
import { lencoService } from '../services/lenco.service';
import { supabase } from '../lib/supabase';

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');

// Mobile-money networks supported for the Manual tab (and detected for POS).
const MOMO_METHODS = [
    { value: 'AIRTEL', label: 'Airtel Money' },
    { value: 'MTN', label: 'MTN Money' },
    { value: 'ZAMTEL', label: 'Zamtel Money' },
];

// Commercial banks operating in Zambia (manual bank-deposit sales).
const ZM_BANKS = [
    'Zanaco', 'Stanbic Bank', 'First National Bank (FNB)', 'Absa Bank Zambia',
    'Standard Chartered', 'Indo-Zambia Bank', 'Access Bank', 'Citibank',
    'Ecobank', 'First Capital Bank', 'United Bank for Africa (UBA)',
    'Investrust Bank', 'AB Bank', 'Bank of China', 'Atlas Mara',
    'Zambia Industrial Commercial Bank (ZICB)', 'Bank of Zambia',
];

// Detect the mobile-money operator from a Zambian MSISDN prefix.
const detectOperator = (phone: string): string => {
    const n = phone.replace(/\D/g, '').replace(/^260/, '0');
    if (n.startsWith('097') || n.startsWith('077')) return 'AIRTEL';
    if (n.startsWith('096') || n.startsWith('076')) return 'MTN';
    if (n.startsWith('095') || n.startsWith('075')) return 'ZAMTEL';
    return '';
};

// Encode the chosen Manual method as `<TYPE>` / `MOMO:<label>` / `BANK:<label>`.
interface ParsedMethod { accountType: 'CASH' | 'AIRTEL_MONEY' | 'BANK'; label: string; }
const parseMethod = (value: string): ParsedMethod => {
    if (value === 'CASH') return { accountType: 'CASH', label: 'Cash' };
    if (value.startsWith('MOMO:')) return { accountType: 'AIRTEL_MONEY', label: value.slice(5) };
    if (value.startsWith('BANK:')) return { accountType: 'BANK', label: value.slice(5) };
    return { accountType: 'CASH', label: 'Cash' };
};

export const NewSale: React.FC = () => {
    const navigate = useNavigate();

    type Step = 'LOADING' | 'SHOP' | 'CART' | 'PAYMENT' | 'VERIFYING' | 'SUCCESS' | 'ERROR';
    const [step, setStep] = useState<Step>('LOADING');

    const [org, setOrg] = useState<Organization | null>(null);
    const [mainWalletId, setMainWalletId] = useState<string | null>(null);
    const [products, setProducts] = useState<Product[]>([]);
    const [error, setError] = useState<string | null>(null);

    // Cart
    const [quantities, setQuantities] = useState<Record<string, number>>({});
    const [donationAmounts, setDonationAmounts] = useState<Record<string, number>>({});
    // Chosen stay per SERVICE_BOOKING product; `nights` doubles as the line quantity.
    const [bookingDates, setBookingDates] = useState<Record<string, { checkIn: string; checkOut: string; nights: number }>>({});
    const [calendarProduct, setCalendarProduct] = useState<Product | null>(null);
    const [calendarAvailability, setCalendarAvailability] = useState<BookingRange[]>([]);
    const [calendarLoading, setCalendarLoading] = useState(false);
    const [search, setSearch] = useState('');

    // Customer
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');

    // Payment
    const [paymentTab, setPaymentTab] = useState<'MANUAL' | 'POS'>('MANUAL');
    const [manualAmount, setManualAmount] = useState('');
    const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
    const [methodValue, setMethodValue] = useState('CASH');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // POS (Lenco) — phone is auto-verified (network + name) as you finish typing.
    const [posOperator, setPosOperator] = useState('');
    const [posResolvedName, setPosResolvedName] = useState<string | null>(null);
    const [isResolving, setIsResolving] = useState(false);
    const [resolveError, setResolveError] = useState<string | null>(null);

    // Result
    const [currentReference, setCurrentReference] = useState('');
    const [receiptNumber, setReceiptNumber] = useState<string | null>(null);
    const [paidMethodLabel, setPaidMethodLabel] = useState('Cash');
    const [paidTotal, setPaidTotal] = useState(0);
    const [verificationStep, setVerificationStep] = useState<'POLLING' | 'FAILED'>('POLLING');
    const [verificationReason, setVerificationReason] = useState('');
    const [isGeneratingReceipt, setIsGeneratingReceipt] = useState(false);

    useEffect(() => {
        const load = async () => {
            try {
                const [orgData, prods, wallets] = await Promise.all([
                    organizationService.getOrganization(),
                    productService.getProducts(),
                    cashbookService.getWallets().catch(() => []),
                ]);
                setOrg(orgData);
                setProducts((prods || []).filter(p => p.is_active));
                const main = (wallets || []).find((w: any) => w.is_main) || (wallets || [])[0];
                setMainWalletId(main?.id || null);
                setStep('SHOP');
            } catch (err: any) {
                console.error('Failed to load New Sale context:', err);
                setError(err?.response?.data?.error || 'Failed to load products. Please try again.');
                setStep('ERROR');
            }
        };
        load();
    }, []);

    // ── Cart helpers ─────────────────────────────────────────────────────────
    const setQty = (id: string, qty: number) =>
        setQuantities(prev => ({ ...prev, [id]: Math.max(0, qty) }));

    // Compact "12 Jul – 15 Jul" range label for a booking line.
    const formatStayRange = (checkIn: string, checkOut: string) => {
        const f = (s: string) => {
            const [y, m, d] = s.split('-').map(Number);
            return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });
        };
        return `${f(checkIn)} – ${f(checkOut)}`;
    };

    // Open the booking calendar for a bookable product, loading its blocked dates.
    const openBookingCalendar = async (product: Product) => {
        setCalendarProduct(product);
        setCalendarAvailability([]);
        setCalendarLoading(true);
        try {
            setCalendarAvailability(await productService.getAvailability(product.id));
        } catch (err) {
            console.error('Failed to load availability:', err);
            setCalendarAvailability([]);
        } finally {
            setCalendarLoading(false);
        }
    };

    const handleConfirmBooking = (productId: string, checkIn: string, checkOut: string, nights: number) => {
        setBookingDates(prev => ({ ...prev, [productId]: { checkIn, checkOut, nights } }));
        setQuantities(prev => ({ ...prev, [productId]: nights }));
        setCalendarProduct(null);
    };

    const removeBooking = (productId: string) => {
        setQuantities(prev => ({ ...prev, [productId]: 0 }));
        setBookingDates(prev => {
            const next = { ...prev };
            delete next[productId];
            return next;
        });
    };

    const catalog = products.filter(p => p.product_type !== 'SERVICE_VARIABLE');

    const lineItems = catalog
        .map(p => {
            const isDonation = p.product_type === 'DONATION';
            const isBooking = p.product_type === 'SERVICE_BOOKING';
            const quantity = quantities[p.id] || 0;
            const unitPrice = isDonation ? (donationAmounts[p.id] || 0) : (p.price || 0);
            const booking = isBooking ? bookingDates[p.id] : undefined;
            return { product: p, quantity, unitPrice, total: quantity * unitPrice, isDonation, isBooking, booking };
        })
        .filter(li => li.quantity > 0);

    const subtotal = lineItems.reduce((s, li) => s + li.total, 0);
    // A booking counts as one cart item regardless of nights.
    const cartCount = lineItems.reduce((n, li) => n + (li.isBooking ? 1 : li.quantity), 0);
    const pendingDonations = lineItems.filter(li => li.isDonation && li.unitPrice <= 0);

    const processingFee = subtotal > 0 ? calculatePlatformFee(subtotal) : 0;
    const totalPayable = subtotal > 0 ? subtotal + processingFee : 0;

    const filteredCatalog = catalog.filter(p => {
        const q = search.trim().toLowerCase();
        return !q || p.name.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q);
    });

    const productNarration = lineItems.map(li => `${li.product.name} (x${li.quantity})`).join(', ');

    // ── Step transitions ─────────────────────────────────────────────────────
    const goToCart = () => {
        setError(null);
        if (lineItems.length === 0) { setError('Add at least one product to the cart.'); return; }
        setStep('CART');
    };

    const goToPayment = () => {
        setError(null);
        if (pendingDonations.length > 0) {
            setError(`Enter an amount for: ${pendingDonations.map(li => li.product.name).join(', ')}`);
            return;
        }
        if (!customerName.trim()) { setError('Enter the customer name to continue.'); return; }
        setManualAmount(subtotal.toFixed(2));
        setStep('PAYMENT');
    };

    // ── Manual sale ──────────────────────────────────────────────────────────
    const handleManualSubmit = async () => {
        const amount = Number(manualAmount);
        if (!Number.isFinite(amount) || amount <= 0) { setError('Enter a valid payment amount.'); return; }
        const { accountType, label } = parseMethod(methodValue);
        // No gateway round-trip on this path, so no reference exists yet to
        // correlate started→succeeded/failed — generate one client-side purely
        // for that purpose; replaced by the real res.reference on success.
        const clientCorrelationId = crypto.randomUUID();
        const saleStartedAt = Date.now();
        trackEvent('pos_sale', 'checkout', 'started', {
            workflow_id: clientCorrelationId,
            organization_id: org?.id || 'unknown',
            payment_channel: 'manual',
            total: amount,
        });
        try {
            setIsSubmitting(true);
            setError(null);
            const res = await cashbookService.recordManualSale({
                items: lineItems.map(li => ({
                    id: li.product.id,
                    quantity: li.quantity,
                    price: li.unitPrice,
                    ...(li.isBooking && li.booking
                        ? { check_in: li.booking.checkIn, check_out: li.booking.checkOut }
                        : {}),
                })),
                amount,
                paymentDate,
                accountType,
                methodLabel: label,
                customerName: customerName.trim(),
                customerPhone: customerPhone.trim(),
            });
            setReceiptNumber(res.referenceNumber);
            setCurrentReference(res.reference);
            setPaidMethodLabel(label);
            setPaidTotal(amount);
            trackEvent('pos_sale', 'checkout', 'succeeded', {
                workflow_id: res.reference,
                client_correlation_id: clientCorrelationId,
                organization_id: org?.id || 'unknown',
                payment_channel: 'manual',
                method_label: label,
                total: amount,
                item_count: lineItems.length,
                customer_name: customerName.trim(),
                receipt_number: res.referenceNumber,
                duration_ms: Date.now() - saleStartedAt,
            });
            setStep('SUCCESS');
        } catch (err: any) {
            console.error('Manual sale failed:', err);
            setError(err?.message || 'Failed to record the sale. Please try again.');
            trackEvent('pos_sale', 'checkout', 'failed', {
                workflow_id: clientCorrelationId,
                organization_id: org?.id || 'unknown',
                payment_channel: 'manual',
                error_code: err?.code || 'UNKNOWN',
                error_message: err?.message || 'Failed to record the sale',
                duration_ms: Date.now() - saleStartedAt,
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    // ── MoneyWise POS (Lenco) ────────────────────────────────────────────────
    // Auto-detect the network and verify the registered name as the cashier finishes
    // typing the phone number (mirrors the New Request mobile-money flow) — no button.
    useEffect(() => {
        if (paymentTab !== 'POS') return;
        const digits = customerPhone.replace(/\D/g, '');
        const operator = detectOperator(customerPhone);
        setPosOperator(operator);
        setPosResolvedName(null);
        setResolveError(null);
        if (digits.length < 10 || !operator) return;
        let cancelled = false;
        setIsResolving(true);
        const timer = setTimeout(async () => {
            try {
                const result = await lencoService.resolveMobileMoney(customerPhone.trim(), operator, org?.id);
                if (cancelled) return;
                const name = result?.accountName || result?.name || result?.account_name || null;
                setPosResolvedName(name);
                if (!name) setResolveError('Name not confirmed — you can still charge this number.');
            } catch (err) {
                if (cancelled) return;
                console.error('Mobile money resolve failed:', err);
                setResolveError('Name not confirmed — you can still charge this number.');
                setPosResolvedName(null);
            } finally {
                if (!cancelled) setIsResolving(false);
            }
        }, 400);
        return () => { cancelled = true; clearTimeout(timer); };
    }, [customerPhone, paymentTab, org?.id]);

    const handlePosPay = async () => {
        if (!org?.lenco_subaccount_id || !mainWalletId) {
            setError('MoneyWise POS is not configured for this organization (no linked Lenco wallet).');
            return;
        }
        if (customerPhone.replace(/\D/g, '').length < 9) { setError('Enter the customer\'s mobile money number.'); return; }

        const LencoPay: any = (window as any).LencoPay;
        if (!LencoPay) { setError('Payment gateway failed to load. Please reload the page.'); return; }

        const purpose = `Sale: ${productNarration} | Cust: ${customerPhone}`;
        const ref = `DEP-${Date.now()}-${org.lenco_subaccount_id.substring(0, 8)}-POS`;
        setCurrentReference(ref);
        setError(null);

        const saleStartedAt = Date.now();
        trackEvent('pos_sale', 'checkout', 'started', {
            workflow_id: ref,
            organization_id: org.id,
            payment_channel: 'moneywise_pos',
            total: totalPayable,
            item_count: lineItems.length,
        });

        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.access_token) { setError('Your session has expired. Please log in again.'); return; }

            // Authenticated sibling of the public checkout intent — allows a past
            // check-in date for retrospective bookings (see logInternalWalletDepositIntent).
            await axios.post(`${API_URL}/lenco/wallet-deposit-intent`, {
                reference: ref,
                purpose,
                amount: subtotal,
                walletId: mainWalletId,
                customerName: customerName.trim(),
                customerPhone: customerPhone.trim(),
                items: lineItems.map(li => ({
                    id: li.product.id,
                    quantity: li.quantity,
                    price: li.unitPrice,
                    ...(li.isBooking && li.booking
                        ? { check_in: li.booking.checkIn, check_out: li.booking.checkOut }
                        : {}),
                })),
            }, { headers: { Authorization: `Bearer ${session.access_token}` } });

            LencoPay.getPaid({
                key: org.lenco_public_key || 'pub-f3a595efda03948ae5dcd2effe073ef0aa2b333457a6c80d',
                amount: totalPayable.toFixed(2),
                currency: 'ZMW',
                reference: ref,
                accountId: org.lenco_subaccount_id,
                email: 'customer@moneywise.co',
                name: customerName.trim(),
                phone: customerPhone.trim(),
                description: purpose,
                narration: purpose,
                meta: { purpose, customerPhone: customerPhone.trim(), isPosPortal: true },
                channels: ['mobile-money', 'card'],
                onSuccess: async (response: any) => {
                    const transactionId = response.id || response.transactionId;
                    setPaidMethodLabel('MoneyWise POS');
                    setPaidTotal(totalPayable);
                    setStep('VERIFYING');
                    setVerificationStep('POLLING');

                    let attempts = 0;
                    const maxAttempts = 15;
                    const poll = async () => {
                        attempts++;
                        try {
                            const verifyRes = await axios.get(
                                `${API_URL}/lenco/public-verify-status/${ref}?transactionId=${transactionId}&organizationId=${org.id}`
                            );
                            if (verifyRes.data.verified) {
                                setReceiptNumber(verifyRes.data.referenceNumber || null);
                                trackEvent('pos_sale', 'checkout', 'succeeded', {
                                    workflow_id: ref,
                                    organization_id: org.id,
                                    payment_channel: 'moneywise_pos',
                                    total: totalPayable,
                                    item_count: lineItems.length,
                                    customer_name: customerName.trim(),
                                    receipt_number: verifyRes.data.referenceNumber,
                                    duration_ms: Date.now() - saleStartedAt,
                                });
                                setStep('SUCCESS');
                                return;
                            }
                        } catch (err) {
                            console.error('POS verification attempt failed:', err);
                        }
                        if (attempts < maxAttempts) {
                            setTimeout(poll, 3000);
                        } else {
                            setVerificationStep('FAILED');
                            setVerificationReason('Payment was submitted but the ledger sync is taking longer than expected. It will reconcile automatically — check the Inflows inbox shortly.');
                            trackVerificationTimeout('pos_sale', {
                                workflow_id: ref,
                                organization_id: org.id,
                                attempts,
                                duration_ms: Date.now() - saleStartedAt,
                            });
                        }
                    };
                    poll();
                },
                onClose: () => { /* keep the page on the payment step */ },
            });
        } catch (err: any) {
            console.error('Failed to start POS checkout:', err);
            setError(err?.response?.data?.error || 'Failed to start the payment. Please try again.');
            trackEvent('pos_sale', 'checkout', 'failed', {
                workflow_id: ref,
                organization_id: org.id,
                payment_channel: 'moneywise_pos',
                error_code: err?.response?.status || 'NETWORK_ERROR',
                error_message: err?.response?.data?.error || err.message,
                duration_ms: Date.now() - saleStartedAt,
            });
        }
    };

    // ── Receipt PDF (adapted from PublicPay) ─────────────────────────────────
    const getQRCodeDataUrl = (data: string): Promise<string> =>
        new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width; canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                if (ctx) { ctx.drawImage(img, 0, 0); resolve(canvas.toDataURL('image/png')); }
                else reject(new Error('Canvas context not available'));
            };
            img.onerror = reject;
            img.src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(data)}`;
        });

    const handleDownloadReceipt = async () => {
        if (!org) return;
        setIsGeneratingReceipt(true);
        try {
            const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            const primaryColor = '#1e293b';
            const accentColor = '#2563eb';
            const receiptId = receiptNumber || currentReference;
            const feeForReceipt = Math.max(0, paidTotal - subtotal);

            doc.setFont('Helvetica', 'bold'); doc.setFontSize(20); doc.setTextColor(primaryColor);
            doc.text((org.name || 'MoneyWise').toUpperCase(), 20, 25);
            doc.setFontSize(9); doc.setFont('Helvetica', 'normal'); doc.setTextColor('#64748b');
            doc.text('Official Payment Receipt', 20, 31);
            doc.setFont('Helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(accentColor);
            doc.text('RECEIPT', 190, 25, { align: 'right' });
            doc.setDrawColor('#e2e8f0'); doc.setLineWidth(0.5); doc.line(20, 36, 190, 36);

            doc.setFont('Helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor('#334155');
            doc.text(`Receipt No: #${receiptId}`, 20, 46);
            doc.text(`Date: ${new Date().toLocaleString()}`, 20, 52);
            doc.text(`Payment Method: ${paidMethodLabel}`, 20, 58);
            doc.text('Bill To:', 120, 46);
            doc.setFont('Helvetica', 'bold'); doc.text(customerName || 'Walk-in Customer', 120, 52);
            doc.setFont('Helvetica', 'normal'); doc.text(`Phone: ${customerPhone || 'N/A'}`, 120, 58);
            doc.line(20, 65, 190, 65);

            doc.setFillColor('#f8fafc'); doc.rect(20, 72, 170, 8, 'F');
            doc.setFont('Helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor('#475569');
            doc.text('Item Description', 24, 77);
            doc.text('Qty', 110, 77, { align: 'center' });
            doc.text('Unit Price (K)', 145, 77, { align: 'right' });
            doc.text('Total (K)', 186, 77, { align: 'right' });

            let y = 86;
            doc.setFont('Helvetica', 'normal'); doc.setTextColor('#334155');
            lineItems.forEach((li) => {
                doc.text(li.product.name, 24, y);
                doc.text(String(li.quantity), 110, y, { align: 'center' });
                doc.text(li.unitPrice.toFixed(2), 145, y, { align: 'right' });
                doc.text(li.total.toFixed(2), 186, y, { align: 'right' });
                doc.setDrawColor('#f1f5f9'); doc.line(20, y + 3, 190, y + 3);
                y += 10;
            });

            const calcStartY = y + 5; y += 5;
            doc.setFont('Helvetica', 'normal');
            doc.text('Subtotal:', 140, y, { align: 'right' });
            doc.text(`K ${subtotal.toFixed(2)}`, 186, y, { align: 'right' });
            if (feeForReceipt > 0) {
                y += 6;
                doc.text('Processing Fee:', 140, y, { align: 'right' });
                doc.text(`K ${feeForReceipt.toFixed(2)}`, 186, y, { align: 'right' });
            }
            y += 8;
            doc.setFont('Helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(primaryColor);
            doc.text('Total Paid:', 140, y, { align: 'right' });
            doc.text(`K ${paidTotal.toFixed(2)}`, 186, y, { align: 'right' });

            try {
                const qrText = `Receipt Verification\nMerchant: ${org.name}\nReceipt No: #${receiptId}\nClient: ${customerName || 'Walk-in'}\nTotal Paid: ZMW ${paidTotal.toFixed(2)}\nDate: ${new Date().toLocaleString()}\nStatus: VERIFIED`;
                const qr = await getQRCodeDataUrl(qrText);
                doc.addImage(qr, 'PNG', 20, calcStartY - 2, 28, 28);
                doc.setFont('Helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor('#94a3b8');
                doc.text('SCAN TO VERIFY RECEIPT', 34, calcStartY + 29, { align: 'center' });
            } catch (qrErr) { console.error('QR generation failed:', qrErr); }

            y += 10; doc.setDrawColor('#e2e8f0'); doc.line(20, y, 190, y);
            y += 12; doc.setFont('Helvetica', 'italic'); doc.setFontSize(9); doc.setTextColor('#94a3b8');
            doc.text('Thank you for your payment!', 105, y, { align: 'center' });
            y += 5; doc.setFont('Helvetica', 'normal'); doc.setFontSize(8);
            doc.text('Secured by MoneyWise Ledger Gateway', 105, y, { align: 'center' });

            doc.save(`receipt-${receiptId}.pdf`);
        } catch (err) {
            console.error('Error generating receipt:', err);
        } finally {
            setIsGeneratingReceipt(false);
        }
    };

    const finishToInbox = () => navigate('/requisitions');

    // ── Render ───────────────────────────────────────────────────────────────
    const Header = ({ title, onBack }: { title: string; onBack: () => void }) => (
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 bg-white sticky top-0 z-10">
            <button onClick={onBack} className="p-2 -ml-2 rounded-full text-slate-500 hover:bg-slate-100 transition-colors">
                <ArrowLeft size={20} />
            </button>
            <div className="flex-1 min-w-0">
                <h1 className="text-base font-black text-slate-900 truncate">{title}</h1>
                {org && <p className="text-[11px] font-semibold text-slate-400 truncate">{org.name}</p>}
            </div>
            <div className="h-9 w-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0">
                <ShoppingBag size={18} />
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col">
            <div className="w-full max-w-2xl mx-auto flex-1 flex flex-col bg-white md:my-6 md:rounded-3xl md:shadow-xl md:border md:border-slate-100 overflow-hidden">

                {step === 'LOADING' && (
                    <div className="flex-1 flex flex-col items-center justify-center p-10 min-h-[60vh]">
                        <Loader2 className="animate-spin text-emerald-500 mb-4" size={32} />
                        <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">Loading catalogue…</p>
                    </div>
                )}

                {step === 'ERROR' && (
                    <div className="flex-1 flex flex-col items-center justify-center p-10 min-h-[60vh] text-center">
                        <div className="h-16 w-16 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mb-4">
                            <AlertCircle size={30} />
                        </div>
                        <h3 className="text-lg font-black text-slate-900">Something went wrong</h3>
                        <p className="text-sm text-slate-400 font-medium mt-2 max-w-xs">{error}</p>
                        <button onClick={() => navigate('/requisitions')} className="mt-6 px-6 py-3 bg-slate-900 text-white rounded-2xl font-bold text-sm">
                            Back to Inbox
                        </button>
                    </div>
                )}

                {/* ── SHOP ── */}
                {step === 'SHOP' && (
                    <>
                        <Header title="New Sale" onBack={() => navigate('/requisitions')} />
                        <div className="px-5 pt-4 pb-2">
                            <div className="flex items-center bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3">
                                <Search size={18} className="text-slate-400 mr-2" />
                                <input
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    placeholder="Search products…"
                                    className="flex-1 bg-transparent outline-none text-sm font-semibold text-slate-700 placeholder:text-slate-400"
                                />
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto px-5 pb-32">
                            {filteredCatalog.length === 0 ? (
                                <div className="text-center py-20 text-slate-400 font-medium text-sm">No products found.</div>
                            ) : (
                                <div className="grid grid-cols-2 gap-3">
                                    {filteredCatalog.map(p => {
                                        const qty = quantities[p.id] || 0;
                                        const isInCart = qty > 0;
                                        const isDonation = p.product_type === 'DONATION';
                                        const isBooking = p.product_type === 'SERVICE_BOOKING';
                                        const stay = bookingDates[p.id];
                                        return (
                                            <div key={p.id} className={`rounded-2xl border p-3 flex flex-col transition-all ${isInCart ? 'border-emerald-300 bg-emerald-50/40' : 'border-slate-100 bg-white'}`}>
                                                <div className="relative">
                                                    {p.image_url ? (
                                                        <img src={p.image_url} alt={p.name} className="w-full h-24 object-cover rounded-xl mb-2" />
                                                    ) : (
                                                        <div className="w-full h-24 rounded-xl mb-2 bg-slate-50 flex items-center justify-center text-slate-300">
                                                            <ShoppingBag size={26} />
                                                        </div>
                                                    )}
                                                    {isInCart && (
                                                        <span className="absolute top-1.5 right-1.5 h-5 w-5 rounded-full bg-black text-white flex items-center justify-center shadow">
                                                            <Check size={12} strokeWidth={3} />
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="text-[13px] font-bold text-slate-800 leading-tight line-clamp-2 min-h-[34px]">{p.name}</div>
                                                <div className="text-[13px] font-black text-emerald-600 mt-1">
                                                    {isDonation
                                                        ? 'Open amount'
                                                        : `K${(p.price || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}${isBooking ? ' / night' : ''}`}
                                                </div>
                                                {isBooking && isInCart && stay && (
                                                    <div className="text-[10px] font-semibold text-teal-700 mt-0.5 truncate">
                                                        {formatStayRange(stay.checkIn, stay.checkOut)} · {stay.nights} night{stay.nights === 1 ? '' : 's'}
                                                    </div>
                                                )}

                                                {isBooking ? (
                                                    <button
                                                        onClick={() => openBookingCalendar(p)}
                                                        className={`mt-2 w-full py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 active:scale-[0.98] transition-colors ${isInCart ? 'bg-emerald-600 text-white' : 'bg-slate-900 text-white'}`}
                                                    >
                                                        {isInCart ? <Check size={14} /> : <CalendarDays size={14} />}
                                                        {isInCart ? 'Reserved · Edit' : 'Reserve'}
                                                    </button>
                                                ) : isDonation ? (
                                                    <button
                                                        onClick={() => {
                                                            setQty(p.id, isInCart ? 0 : 1);
                                                            if (isInCart) setDonationAmounts(prev => ({ ...prev, [p.id]: 0 }));
                                                        }}
                                                        className={`mt-2 w-full py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1 active:scale-[0.98] ${isInCart ? 'bg-emerald-600 text-white' : 'bg-slate-900 text-white'}`}
                                                    >
                                                        {isInCart ? <><Check size={14} /> Added</> : <><Plus size={14} /> Add</>}
                                                    </button>
                                                ) : isInCart ? (
                                                    <div className="mt-2 flex items-center justify-between bg-white border border-slate-200 rounded-xl p-1">
                                                        <button onClick={() => setQty(p.id, qty - 1)} className="h-7 w-7 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center active:scale-95">
                                                            <Minus size={14} />
                                                        </button>
                                                        <span className="text-sm font-black text-slate-800">{qty}</span>
                                                        <button onClick={() => setQty(p.id, qty + 1)} className="h-7 w-7 rounded-lg bg-emerald-500 text-white flex items-center justify-center active:scale-95">
                                                            <Plus size={14} />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <button onClick={() => setQty(p.id, 1)} className="mt-2 w-full py-2 rounded-xl bg-slate-900 text-white text-xs font-bold flex items-center justify-center gap-1 active:scale-[0.98]">
                                                        <Plus size={14} /> Add to Cart
                                                    </button>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                        {/* Sticky cart bar */}
                        <div className="sticky bottom-0 left-0 right-0 p-4 bg-white border-t border-slate-100">
                            {error && <p className="text-xs font-semibold text-rose-600 mb-2 text-center">{error}</p>}
                            <button
                                onClick={goToCart}
                                disabled={cartCount === 0}
                                className="w-full py-4 rounded-2xl bg-emerald-600 text-white font-black text-sm flex items-center justify-center gap-2 disabled:opacity-40 active:scale-[0.99] transition-all"
                            >
                                <ShoppingCart size={18} />
                                Review Cart {cartCount > 0 && `· ${cartCount} item${cartCount > 1 ? 's' : ''} · K${subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                            </button>
                        </div>
                    </>
                )}

                {/* ── CART ── */}
                {step === 'CART' && (
                    <>
                        <Header title="Cart & Customer" onBack={() => setStep('SHOP')} />
                        <div className="flex-1 overflow-y-auto px-5 py-4 pb-32 space-y-5">
                            <div className="space-y-2">
                                {lineItems.map(li => (
                                    <div key={li.product.id} className="flex items-center gap-3 bg-slate-50 rounded-2xl p-3">
                                        <div className="flex-1 min-w-0">
                                            <div className="text-[13px] font-bold text-slate-800 truncate">{li.product.name}</div>
                                            {li.isDonation ? (
                                                <div className="mt-1 flex items-center bg-white border border-slate-200 rounded-lg px-2 w-32">
                                                    <span className="text-xs font-bold text-slate-400 mr-1">K</span>
                                                    <input
                                                        type="number"
                                                        value={donationAmounts[li.product.id] || ''}
                                                        onChange={e => setDonationAmounts(prev => ({ ...prev, [li.product.id]: Number(e.target.value) }))}
                                                        placeholder="0.00"
                                                        className="w-full py-1.5 bg-transparent outline-none text-sm font-bold text-slate-700"
                                                    />
                                                </div>
                                            ) : li.isBooking && li.booking ? (
                                                <div className="text-[12px] font-semibold text-teal-700">
                                                    {formatStayRange(li.booking.checkIn, li.booking.checkOut)} · {li.quantity} night{li.quantity === 1 ? '' : 's'}
                                                </div>
                                            ) : (
                                                <div className="text-[12px] font-semibold text-slate-400">
                                                    K{li.unitPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })} each
                                                </div>
                                            )}
                                        </div>
                                        {li.isBooking ? (
                                            <button
                                                onClick={() => openBookingCalendar(li.product)}
                                                className="flex items-center gap-1 px-3 h-9 rounded-xl bg-white border border-slate-200 text-slate-600 text-xs font-bold"
                                            >
                                                <CalendarDays size={14} /> Edit
                                            </button>
                                        ) : li.isDonation ? null : (
                                            <div className="flex items-center bg-white border border-slate-200 rounded-xl p-1">
                                                <button onClick={() => setQty(li.product.id, li.quantity - 1)} className="h-7 w-7 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center">
                                                    <Minus size={14} />
                                                </button>
                                                <span className="w-7 text-center text-sm font-black text-slate-800">{li.quantity}</span>
                                                <button onClick={() => setQty(li.product.id, li.quantity + 1)} className="h-7 w-7 rounded-lg bg-emerald-500 text-white flex items-center justify-center">
                                                    <Plus size={14} />
                                                </button>
                                            </div>
                                        )}
                                        <div className="w-16 text-right text-[13px] font-black text-slate-800">
                                            K{li.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </div>
                                        <button onClick={() => li.isBooking ? removeBooking(li.product.id) : setQty(li.product.id, 0)} className="text-slate-300 hover:text-rose-500">
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                ))}
                            </div>

                            <div className="flex justify-between items-center px-1">
                                <span className="text-sm font-bold text-slate-500">Subtotal</span>
                                <span className="text-lg font-black text-slate-900">K{subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            </div>

                            <div className="space-y-3 pt-2 border-t border-slate-100">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Customer details</label>
                                <div className="relative">
                                    <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input
                                        value={customerName}
                                        onChange={e => setCustomerName(e.target.value)}
                                        placeholder="Customer name"
                                        className="w-full pl-9 pr-3 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-semibold text-slate-700 outline-none focus:border-emerald-400"
                                    />
                                </div>
                                <div className="relative">
                                    <Smartphone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input
                                        value={customerPhone}
                                        onChange={e => setCustomerPhone(e.target.value)}
                                        placeholder="Phone number (optional for cash)"
                                        className="w-full pl-9 pr-3 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-semibold text-slate-700 outline-none focus:border-emerald-400"
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="sticky bottom-0 p-4 bg-white border-t border-slate-100">
                            {error && <p className="text-xs font-semibold text-rose-600 mb-2 text-center">{error}</p>}
                            <button onClick={goToPayment} className="w-full py-4 rounded-2xl bg-emerald-600 text-white font-black text-sm flex items-center justify-center gap-2 active:scale-[0.99]">
                                Continue to Payment <ArrowRight size={18} />
                            </button>
                        </div>
                    </>
                )}

                {/* ── PAYMENT ── */}
                {step === 'PAYMENT' && (
                    <>
                        <Header title="Payment" onBack={() => setStep('CART')} />
                        <div className="flex-1 overflow-y-auto px-5 py-4 pb-32 space-y-5">
                            <SegmentedControl
                                variant="pill"
                                value={paymentTab}
                                onChange={(v) => { setPaymentTab(v as 'MANUAL' | 'POS'); setError(null); }}
                                options={[
                                    { value: 'MANUAL', label: 'Manual' },
                                    { value: 'POS', label: 'MoneyWise POS' },
                                ]}
                            />

                            {paymentTab === 'MANUAL' ? (
                                <div className="space-y-4">
                                    <div>
                                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1.5">Amount received (K)</label>
                                        <div className="relative">
                                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-600 font-black">K</span>
                                            <input
                                                type="number"
                                                value={manualAmount}
                                                onChange={e => setManualAmount(e.target.value)}
                                                className="w-full pl-9 pr-4 py-4 bg-slate-50 border-2 border-slate-200 rounded-2xl text-xl font-black text-slate-800 outline-none focus:border-emerald-400"
                                            />
                                        </div>
                                        <p className="text-[11px] text-slate-400 font-medium mt-1.5">Cart subtotal: K{subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                                    </div>

                                    <div>
                                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1.5">Payment date</label>
                                        <div className="relative">
                                            <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                            <input
                                                type="date"
                                                value={paymentDate}
                                                onChange={e => setPaymentDate(e.target.value)}
                                                className="w-full pl-9 pr-3 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-semibold text-slate-700 outline-none focus:border-emerald-400"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1.5">Payment method</label>
                                        <div className="relative">
                                            <Banknote size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                            <select
                                                value={methodValue}
                                                onChange={e => setMethodValue(e.target.value)}
                                                className="w-full pl-9 pr-3 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-semibold text-slate-700 outline-none focus:border-emerald-400 appearance-none"
                                            >
                                                <option value="CASH">Cash</option>
                                                <optgroup label="Mobile Money">
                                                    {MOMO_METHODS.map(m => (
                                                        <option key={m.value} value={`MOMO:${m.label}`}>{m.label}</option>
                                                    ))}
                                                </optgroup>
                                                <optgroup label="Bank">
                                                    {ZM_BANKS.map(b => (
                                                        <option key={b} value={`BANK:${b}`}>{b}</option>
                                                    ))}
                                                </optgroup>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="bg-blue-50/60 border border-blue-100 rounded-2xl p-4 text-xs text-slate-500 font-medium leading-relaxed">
                                        Enter the customer's mobile money number. We'll verify it with Lenco, then prompt them to approve the payment.
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1.5">Customer phone (mobile money)</label>
                                        <div className="relative">
                                            <Smartphone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                            <input
                                                value={customerPhone}
                                                onChange={e => setCustomerPhone(e.target.value)}
                                                placeholder="097 / 096 / 095 …"
                                                className="w-full pl-9 pr-20 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-semibold text-slate-700 outline-none focus:border-blue-400"
                                            />
                                            {posOperator && (
                                                <span className={`absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-black px-2 py-1 rounded bg-white border border-slate-100 uppercase tracking-tight ${posOperator === 'AIRTEL' ? 'text-red-500' : posOperator === 'MTN' ? 'text-amber-500' : 'text-emerald-500'}`}>
                                                    {posOperator}
                                                </span>
                                            )}
                                        </div>
                                        {/* Auto-verification status (no button) */}
                                        <div className="mt-2 min-h-[18px]">
                                            {isResolving ? (
                                                <span className="flex items-center gap-1.5 text-slate-400 text-xs font-semibold"><Loader2 size={13} className="animate-spin" /> Verifying name…</span>
                                            ) : posResolvedName ? (
                                                <span className="flex items-center gap-1.5 text-emerald-600 text-xs font-bold"><BadgeCheck size={14} /> {posResolvedName}</span>
                                            ) : resolveError ? (
                                                <span className="text-xs font-semibold text-amber-600">{resolveError}</span>
                                            ) : null}
                                        </div>
                                    </div>

                                    <div className="bg-slate-50 rounded-2xl p-4 space-y-1.5 text-xs">
                                        <div className="flex justify-between font-semibold text-slate-500"><span>Subtotal</span><span>K{subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                                        <div className="flex justify-between font-medium text-slate-400"><span>Processing fee</span><span>K{processingFee.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                                        <div className="flex justify-between font-black text-slate-900 text-sm pt-1.5 border-t border-slate-200"><span>Total</span><span>K{totalPayable.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="sticky bottom-0 p-4 bg-white border-t border-slate-100">
                            {error && <p className="text-xs font-semibold text-rose-600 mb-2 text-center">{error}</p>}
                            {paymentTab === 'MANUAL' ? (
                                <button
                                    onClick={handleManualSubmit}
                                    disabled={isSubmitting}
                                    className="w-full py-4 rounded-2xl bg-emerald-600 text-white font-black text-sm flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.99]"
                                >
                                    {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
                                    Record Sale · K{(Number(manualAmount) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </button>
                            ) : (
                                <button
                                    onClick={handlePosPay}
                                    className="w-full py-4 rounded-2xl bg-blue-600 text-white font-black text-sm flex items-center justify-center gap-2 active:scale-[0.99]"
                                >
                                    <Smartphone size={18} /> Charge · K{totalPayable.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </button>
                            )}
                        </div>
                    </>
                )}

                {/* ── VERIFYING ── */}
                {step === 'VERIFYING' && (
                    <div className="flex-1 flex flex-col items-center justify-center p-10 min-h-[60vh] text-center">
                        {verificationStep === 'POLLING' ? (
                            <>
                                <Loader2 className="animate-spin text-blue-500 mb-4" size={36} />
                                <h3 className="text-base font-black text-slate-900 uppercase tracking-wide">Verifying payment</h3>
                                <p className="text-sm text-slate-400 font-medium mt-2 max-w-xs">Confirming the payment with Lenco and syncing it to your ledger…</p>
                            </>
                        ) : (
                            <>
                                <div className="h-16 w-16 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mb-4"><AlertCircle size={30} /></div>
                                <h3 className="text-base font-black text-slate-900 uppercase tracking-wide">Reconciliation pending</h3>
                                <p className="text-sm text-slate-400 font-medium mt-2 max-w-xs">{verificationReason}</p>
                                <button onClick={finishToInbox} className="mt-6 px-6 py-3 bg-slate-900 text-white rounded-2xl font-bold text-sm">Back to Inbox</button>
                            </>
                        )}
                    </div>
                )}

                {/* ── SUCCESS ── */}
                {step === 'SUCCESS' && (
                    <div className="flex-1 flex flex-col items-center justify-center p-8 min-h-[70vh] text-center">
                        <div className="h-20 w-20 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mb-5 animate-in zoom-in-75 duration-300">
                            <CheckCircle2 size={40} strokeWidth={2.5} />
                        </div>
                        <h3 className="text-xl font-black text-slate-900">Sale Recorded!</h3>
                        <p className="text-xs text-slate-400 font-semibold mt-1">
                            Receipt: #{receiptNumber || currentReference}
                        </p>

                        <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5 text-left text-xs space-y-2.5 w-full max-w-xs mt-6">
                            <div className="flex justify-between font-semibold text-slate-400"><span>Customer</span><span className="font-bold text-slate-700">{customerName || 'Walk-in'}</span></div>
                            <div className="flex justify-between font-semibold text-slate-400"><span>Method</span><span className="font-bold text-slate-700">{paidMethodLabel}</span></div>
                            <div className="flex justify-between font-semibold text-slate-400 pt-2 border-t border-slate-100"><span>Total Paid</span><span className="font-black text-emerald-600">K{paidTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                        </div>

                        <div className="w-full max-w-xs mt-6 space-y-2.5">
                            <button
                                onClick={handleDownloadReceipt}
                                disabled={isGeneratingReceipt}
                                className="w-full py-3.5 rounded-2xl bg-slate-900 text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                {isGeneratingReceipt ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                                Download Receipt
                            </button>
                            <button onClick={finishToInbox} className="w-full py-3.5 rounded-2xl bg-emerald-600 text-white font-black text-sm">
                                Done
                            </button>
                        </div>

                        <p className="mt-8 text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center justify-center gap-1.5">
                            <Building2 size={12} /> Secured by MoneyWise Ledger Gateway
                        </p>
                    </div>
                )}
            </div>

            {/* Booking date calendar overlay */}
            {calendarProduct && (
                <BookingCalendar
                    productName={calendarProduct.name}
                    nightlyPrice={calendarProduct.price}
                    unavailable={calendarAvailability}
                    loading={calendarLoading}
                    initial={bookingDates[calendarProduct.id]
                        ? { checkIn: bookingDates[calendarProduct.id].checkIn, checkOut: bookingDates[calendarProduct.id].checkOut }
                        : null}
                    onClose={() => setCalendarProduct(null)}
                    onConfirm={(ci, co, nights) => handleConfirmBooking(calendarProduct.id, ci, co, nights)}
                    allowPast
                />
            )}
        </div>
    );
};

export default NewSale;

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import jsPDF from 'jspdf';
import {
    Loader2,
    ArrowRight,
    Smartphone,
    Phone,
    User,
    ShoppingCart,
    ShoppingBag,
    Plus,
    Minus,
    AlertCircle,
    ArrowLeft,
    Building2,
    Download,
    Search,
    BadgeCheck,
    PlusCircle,
    ChevronRight,
    ChevronLeft,
    ChevronDown,
    Check,
    X,
    CreditCard,
    ShieldCheck,
    Ticket,
    Receipt,
    Info,
    Wallet,
    ClipboardList
} from 'lucide-react';
import { calculatePlatformFee } from 'shared';
import { SegmentedControl, AnimatedTabContent } from '../components/AnimatedTabs';

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');

// Inject the add-to-cart micro-interaction keyframes once.
//  - mw-add-pop: presses in, springs up past 1, then settles (premium "pop").
//  - mw-tick-draw: strokes the checkmark on as if it's being drawn.
const POP_STYLE_ID = 'mw-add-pop-keyframes';
if (typeof document !== 'undefined' && !document.getElementById(POP_STYLE_ID)) {
    const el = document.createElement('style');
    el.id = POP_STYLE_ID;
    el.textContent = `
@keyframes mw-add-pop {
  0%   { transform: scale(1); }
  28%  { transform: scale(0.8); }
  60%  { transform: scale(1.22); }
  100% { transform: scale(1); }
}
@keyframes mw-tick-draw {
  from { stroke-dashoffset: 26; }
  to   { stroke-dashoffset: 0; }
}
@keyframes mw-pulse-ring {
  0%   { transform: scale(0.9); opacity: 0.65; }
  100% { transform: scale(2.8); opacity: 0; }
}
@keyframes mw-flash {
  0%   { opacity: 0.45; }
  100% { opacity: 0; }
}`;
    document.head.appendChild(el);
}

interface Product {
    id: string;
    name: string;
    description?: string;
    price: number;
    is_active: boolean;
    image_url?: string | null;
    product_type?: 'PRODUCT' | 'SERVICE_FIXED' | 'SERVICE_VARIABLE' | 'DONATION';
    category?: string | null;
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
    //  SHOP    = product catalogue grid (entry page)
    //  CATALOG = the cart (added items)
    //  SUMMARY = checkout breakdown + customer details + Pay
    const [step, setStep] = useState<'LOADING' | 'SHOP' | 'CATALOG' | 'SUMMARY' | 'VERIFYING' | 'SUCCESS' | 'ERROR'>('LOADING');
    
    // Data Context
    const [org, setOrg] = useState<OrgContext | null>(null);
    const [wallet, setWallet] = useState<WalletContext | null>(null);
    const [products, setProducts] = useState<Product[]>([]);
    
    // Inputs & Forms
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [selectedQuantities, setSelectedQuantities] = useState<Record<string, number>>({});
    // Customer-entered amounts for DONATION products (keyed by product id).
    const [donationAmounts, setDonationAmounts] = useState<Record<string, number>>({});
    // Bottom-sheet overlay for quick-adding more items from the cart screen.
    // `showProductSheet` keeps it mounted; `sheetIn` drives the slide-up/down transition.
    const [showProductSheet, setShowProductSheet] = useState(false);
    const [sheetIn, setSheetIn] = useState(false);
    // Product id currently playing the add-to-cart pop animation.
    const [poppedId, setPoppedId] = useState<string | null>(null);
    // Search + category filter on the catalogue.
    const [productSearch, setProductSearch] = useState('');
    const [activeCategory, setActiveCategory] = useState('All');
    
    // Payment Status states
    const [currentReference, setCurrentReference] = useState('');
    const [verificationStep, setVerificationStep] = useState<'POLLING' | 'SUCCESS' | 'FAILED'>('POLLING');
    const [verificationReason, setVerificationReason] = useState('');
    const [receiptNumber, setReceiptNumber] = useState<string | null>(null);
    // How the customer paid (from the Lenco success payload), shown on the receipt screen.
    const [paymentMethod, setPaymentMethod] = useState<string>('Mobile Money');
    const [isGeneratingReceipt, setIsGeneratingReceipt] = useState(false);
    const [lastTransactionId, setLastTransactionId] = useState<string | null>(null);
    const [isConfirmingManual, setIsConfirmingManual] = useState(false);
    const [confirmManualError, setConfirmManualError] = useState<string | null>(null);
    
    // Global errors
    const [error, setError] = useState<string | null>(null);

    // Receipt Retrieval states
    const [showRetrievePortal, setShowRetrievePortal] = useState(false);
    const [retrievePhone, setRetrievePhone] = useState('');
    const [retrievedReceipts, setRetrievedReceipts] = useState<any[]>([]);
    const [isRetrieving, setIsRetrieving] = useState(false);
    const [retrieveError, setRetrieveError] = useState<string | null>(null);
    const [downloadingReference, setDownloadingReference] = useState<string | null>(null);

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

                setStep('SHOP');
            } catch (err: any) {
                console.error('Error fetching public pay context:', err);
                setError(err.response?.data?.error || 'Failed to load organization checkout details. Please check the link and try again.');
                setStep('ERROR');
            }
        };

        fetchContext();
    }, [wallet_id]);

    // Mount the sheet, then flip `sheetIn` on the next frame so the CSS transition runs.
    const openProductSheet = () => {
        setShowProductSheet(true);
        requestAnimationFrame(() => setSheetIn(true));
    };
    // Slide the sheet down first, then unmount it once the transition finishes.
    const closeProductSheet = () => {
        setSheetIn(false);
        setTimeout(() => setShowProductSheet(false), 300);
    };

    const handleQuantityChange = (productId: string, delta: number) => {
        const currentQty = selectedQuantities[productId] || 0;
        const newQty = Math.max(0, currentQty + delta);
        setSelectedQuantities({ ...selectedQuantities, [productId]: newQty });
    };

    const handleQuantitySet = (productId: string, value: string) => {
        const parsed = parseInt(value, 10);
        const newQty = isNaN(parsed) || parsed < 0 ? 0 : parsed;
        setSelectedQuantities({ ...selectedQuantities, [productId]: newQty });
    };

    // Variable-priced services are share-link only; never shown in the open catalog.
    const catalogProducts = products.filter(p => p.product_type !== 'SERVICE_VARIABLE');

    // Unified line items across fixed-price products and customer-priced donations.
    // Donations are included as soon as qty > 0 (amount entered in the cart, not the sheet).
    const lineItems = catalogProducts
        .map(p => {
            const isDonation = p.product_type === 'DONATION';
            const quantity = selectedQuantities[p.id] || 0;
            const unitPrice = isDonation ? (donationAmounts[p.id] || 0) : p.price;
            return { product: p, quantity, unitPrice, total: quantity * unitPrice, isDonation };
        })
        .filter(li => li.quantity > 0);

    const subtotal = lineItems.reduce((sum, li) => sum + li.total, 0);
    // Donation items in cart with no amount yet entered (amount = 0)
    const pendingDonations = lineItems.filter(li => li.isDonation && li.unitPrice === 0);
    
    // MoneyWise platform fee (tiered) — additive markup paid by the customer on top
    // of the subtotal. The merchant settles the net subtotal; the fee is swept to
    // the MoneyWise settlement account after the collection succeeds.
    const processingFee = calculatePlatformFee(subtotal);
    const totalPayable = subtotal > 0 ? subtotal + processingFee : 0;

    // Distinct categories present in the catalog → toggle tabs (always lead with "All").
    const productCategories = ['All', ...Array.from(
        new Set(catalogProducts.map(p => (p.category || '').trim()).filter(Boolean))
    )];

    // Products shown in the sheet, narrowed by the active category tab + search query.
    const sheetProducts = catalogProducts.filter(p => {
        const matchesCat = activeCategory === 'All' || (p.category || '').trim() === activeCategory;
        const q = productSearch.trim().toLowerCase();
        const matchesSearch = !q || p.name.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q);
        return matchesCat && matchesSearch;
    });

    // Total units currently in the cart (drives the "Add N Items" button counter).
    const cartItemCount = lineItems.reduce((n, li) => n + li.quantity, 0);

    // Active category position → drives the directional slide of the product list.
    const activeCategoryIndex = Math.max(0, productCategories.indexOf(activeCategory));

    // Customer details must be present before the Pay button activates.
    const canPay = customerName.trim().length > 0 && customerPhone.replace(/\D/g, '').length >= 9;

    // Full-screen "app" steps fill the viewport (fixed height) so inner content
    // scrolls and footers stay pinned; the simple states just center normally.
    const isAppStep = step === 'SHOP' || step === 'CATALOG' || step === 'SUMMARY' || step === 'SUCCESS';

    // Cart → Payment Summary. Validates the cart before showing the breakdown;
    // the actual Lenco charge is only triggered by the Pay button on the summary.
    const handleProceedToSummary = () => {
        setError(null);
        if (lineItems.length === 0) {
            setError('Please select at least one product or service to purchase.');
            return;
        }
        if (pendingDonations.length > 0) {
            setError(`Please enter an amount for: ${pendingDonations.map(li => li.product.name).join(', ')}`);
            return;
        }
        if (subtotal <= 0) {
            setError('Please select at least one product or service to purchase.');
            return;
        }
        setStep('SUMMARY');
    };

    const handlePay = async () => {
        if (lineItems.length === 0) {
            setError('Please select at least one product or service to purchase.');
            return;
        }
        if (pendingDonations.length > 0) {
            setError(`Please enter an amount for: ${pendingDonations.map(li => li.product.name).join(', ')}`);
            return;
        }
        if (subtotal <= 0) {
            setError('Please select at least one product or service to purchase.');
            return;
        }
        // Customer details are captured on the summary screen before paying.
        if (!customerName.trim()) {
            setError('Please enter your name to continue.');
            return;
        }
        if (customerPhone.replace(/\D/g, '').length < 9) {
            setError('Please enter a valid phone number to continue.');
            return;
        }

        if (!wallet || !org) return;

        const LencoPay: any = (window as any).LencoPay;
        if (!LencoPay) {
            setError('Payment gateway SDK failed to load. Please reload the page or check your connection.');
            return;
        }

        // Build list description for database narration
        const productNarration = lineItems
            .map(li => `${li.product.name} (x${li.quantity})`)
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
                walletId: wallet.id,
                customerName,
                customerPhone,
                items: lineItems.map(li => ({
                    id: li.product.id,
                    quantity: li.quantity,
                    price: li.unitPrice
                }))
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
                phone: customerPhone,
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
                    setLastTransactionId(transactionId || null);
                    // Capture how they paid (card vs mobile money) when Lenco reports it.
                    const rawMethod = response?.type || response?.channel || response?.method || '';
                    if (/card/i.test(rawMethod)) setPaymentMethod('Card');
                    else if (rawMethod) setPaymentMethod('Mobile Money');
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

    const handleConfirmPaymentManual = async () => {
        if (!org || !currentReference) return;
        
        try {
            setIsConfirmingManual(true);
            setConfirmManualError(null);
            
            let url = `${API_URL}/lenco/public-verify-status/${currentReference}?organizationId=${org.id}`;
            if (lastTransactionId) {
                url += `&transactionId=${lastTransactionId}`;
            }

            const verifyRes = await axios.get(url);
            
            if (verifyRes.data.verified) {
                setReceiptNumber(verifyRes.data.referenceNumber || null);
                setStep('SUCCESS');
            } else {
                setConfirmManualError(`Reconciliation check returned: ${verifyRes.data.status || 'pending'}. The payment gateway hasn't reported this transaction as successful yet. Please try again in a few moments.`);
            }
        } catch (err: any) {
            console.error('Manual confirmation check failed:', err);
            setConfirmManualError(err.response?.data?.error || 'Verification check encountered an error. Please try again.');
        } finally {
            setIsConfirmingManual(false);
        }
    };

    const handleReset = () => {
        setSelectedQuantities({});
        setDonationAmounts({});
        setReceiptNumber(null);
        setLastTransactionId(null);
        setConfirmManualError(null);
        setIsConfirmingManual(false);
        setStep('SHOP');
        setError(null);
    };

    const getQRCodeDataUrl = (data: string): Promise<string> => {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.drawImage(img, 0, 0);
                    resolve(canvas.toDataURL('image/png'));
                } else {
                    reject(new Error('Canvas context not available'));
                }
            };
            img.onerror = (e) => reject(e);
            img.src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(data)}`;
        });
    };

    const handleDownloadReceipt = async () => {
        if (!org || !wallet) return;

        setIsGeneratingReceipt(true);
        try {
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

            lineItems.forEach((li) => {
                const qty = li.quantity;
                const unitPrice = li.unitPrice;
                const total = li.total;

                doc.text(li.product.name, 24, y);
                doc.text(qty.toString(), 110, y, { align: 'center' });
                doc.text(unitPrice.toFixed(2), 145, y, { align: 'right' });
                doc.text(total.toFixed(2), 186, y, { align: 'right' });

                // Underline for items
                doc.setDrawColor('#f1f5f9');
                doc.line(20, y + 3, 190, y + 3);
                y += 10;
            });

            // 4. Financial Calculations
            const calculationsStartY = y + 5;
            y += 5;
            doc.setFont('Helvetica', 'normal');
            doc.text('Subtotal:', 140, y, { align: 'right' });
            doc.text(`K ${subtotal.toFixed(2)}`, 186, y, { align: 'right' });

            y += 6;
            doc.text('Processing Fee:', 140, y, { align: 'right' });
            doc.text(`K ${processingFee.toFixed(2)}`, 186, y, { align: 'right' });

            y += 8;
            doc.setFont('Helvetica', 'bold');
            doc.setFontSize(10);
            doc.setTextColor(primaryColor);
            doc.text('Total Paid:', 140, y, { align: 'right' });
            doc.text(`K ${totalPayable.toFixed(2)}`, 186, y, { align: 'right' });

            // Generate and draw QR code on the left side of calculations
            try {
                const qrText = `Receipt Verification
Merchant: ${org.name}
Receipt No: #${receiptNumber || currentReference.replace('-PUB', '')}
Client: ${customerName}
Phone: ${customerPhone}
Amount: ZMW ${subtotal.toFixed(2)}
Total Paid: ZMW ${totalPayable.toFixed(2)}
Date: ${new Date().toLocaleString()}
Status: VERIFIED`;

                const qrCodeDataUrl = await getQRCodeDataUrl(qrText);
                doc.addImage(qrCodeDataUrl, 'PNG', 20, calculationsStartY - 2, 28, 28);

                // Add small helper label
                doc.setFont('Helvetica', 'normal');
                doc.setFontSize(6.5);
                doc.setTextColor('#94a3b8'); // slate-400
                doc.text('SCAN TO VERIFY RECEIPT', 34, calculationsStartY + 29, { align: 'center' });
            } catch (qrErr) {
                console.error('Failed to add QR code to PDF:', qrErr);
            }

            // Divider
            y += 10;
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
        } catch (err) {
            console.error('Error generating receipt:', err);
        } finally {
            setIsGeneratingReceipt(false);
        }
    };

    const handleSearchReceipts = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!retrievePhone.trim() || !wallet_id) return;

        setIsRetrieving(true);
        setRetrieveError(null);
        try {
            const res = await axios.get(`${API_URL}/lenco/public-sales/by-phone/${encodeURIComponent(retrievePhone.trim())}?walletId=${wallet_id}`);
            setRetrievedReceipts(res.data);
            if (res.data.length === 0) {
                setRetrieveError('No completed receipts found for this phone number.');
            }
        } catch (err: any) {
            console.error('Failed to search receipts:', err);
            setRetrieveError(err.response?.data?.error || 'Failed to search receipts. Please try again.');
        } finally {
            setIsRetrieving(false);
        }
    };

    const handleDownloadPublicReceipt = async (reference: string) => {
        setDownloadingReference(reference);
        try {
            const res = await axios.get(`${API_URL}/lenco/public-sale-receipt/${reference}`);
            const details = res.data;

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
            doc.text(details.org.name.toUpperCase(), 20, 25);

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
            doc.text(`Receipt No: #${details.receiptNumber}`, 20, 46);
            doc.text(`Date: ${new Date(details.date).toLocaleString()}`, 20, 52);
            doc.text(`Payment Method: Lenco (Card/Mobile Money)`, 20, 58);

            doc.text(`Bill To:`, 120, 46);
            doc.setFont('Helvetica', 'bold');
            doc.text(details.customerName, 120, 52);
            doc.setFont('Helvetica', 'normal');
            doc.text(`Phone: ${details.customerPhone}`, 120, 58);

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

            details.items.forEach((item: any) => {
                doc.text(item.name, 24, y);
                doc.text(item.quantity.toString(), 110, y, { align: 'center' });
                doc.text(Number(item.price).toFixed(2), 145, y, { align: 'right' });
                doc.text(Number(item.total).toFixed(2), 186, y, { align: 'right' });

                // Underline for items
                doc.setDrawColor('#f1f5f9');
                doc.line(20, y + 3, 190, y + 3);
                y += 10;
            });

            // 4. Financial Calculations
            const calculationsStartY = y + 5;
            y += 5;
            doc.setFont('Helvetica', 'normal');
            doc.text('Subtotal:', 140, y, { align: 'right' });
            doc.text(`K ${Number(details.subtotal).toFixed(2)}`, 186, y, { align: 'right' });

            y += 6;
            doc.text('Processing Fee:', 140, y, { align: 'right' });
            doc.text(`K ${Number(details.processingFee).toFixed(2)}`, 186, y, { align: 'right' });

            y += 8;
            doc.setFont('Helvetica', 'bold');
            doc.setFontSize(10);
            doc.setTextColor(primaryColor);
            doc.text('Total Paid:', 140, y, { align: 'right' });
            doc.text(`K ${Number(details.totalPaid).toFixed(2)}`, 186, y, { align: 'right' });

            // Generate and draw QR code on the left side of calculations
            try {
                const qrText = `Receipt Verification
Merchant: ${details.org.name}
Receipt No: #${details.receiptNumber}
Client: ${details.customerName}
Phone: ${details.customerPhone}
Amount: ZMW ${Number(details.subtotal).toFixed(2)}
Total Paid: ZMW ${Number(details.totalPaid).toFixed(2)}
Date: ${new Date(details.date).toLocaleString()}
Status: VERIFIED`;

                const qrCodeDataUrl = await getQRCodeDataUrl(qrText);
                doc.addImage(qrCodeDataUrl, 'PNG', 20, calculationsStartY - 2, 28, 28);

                // Add small helper label
                doc.setFont('Helvetica', 'normal');
                doc.setFontSize(6.5);
                doc.setTextColor('#94a3b8');
                doc.text('SCAN TO VERIFY RECEIPT', 34, calculationsStartY + 29, { align: 'center' });
            } catch (qrErr) {
                console.error('Failed to add QR code to PDF:', qrErr);
            }

            // Divider
            y += 10;
            doc.setDrawColor('#e2e8f0');
            doc.line(20, y, 190, y);

            // 5. Footer
            y += 12;
            doc.setFont('Helvetica', 'italic');
            doc.setFontSize(9);
            doc.setTextColor('#94a3b8');
            doc.text('Thank you for your payment!', 105, y, { align: 'center' });

            y += 5;
            doc.setFont('Helvetica', 'normal');
            doc.setFontSize(8);
            doc.text('Secured by MoneyWise Ledger Gateway', 105, y, { align: 'center' });

            doc.save(`receipt-${details.receiptNumber}.pdf`);
        } catch (err: any) {
            console.error('Failed to download public receipt:', err);
            alert(err.message || 'Failed to download receipt');
        } finally {
            setDownloadingReference(null);
        }
    };

    // A single selectable product/service row, shown inside the Add Products sheet.
    const renderProductCard = (product: Product) => {
        const isDonation = product.product_type === 'DONATION';
        const qty = selectedQuantities[product.id] || 0;
        const isInCart = qty > 0;

        return (
            <div key={product.id} className="flex items-center gap-2 py-2">
                {/* Product image tile */}
                <div className="w-20 h-20 rounded-xl overflow-hidden bg-neutral-100 flex-shrink-0 flex items-center justify-center">
                    {product.image_url ? (
                        <img
                            src={product.image_url}
                            alt={product.name}
                            className="w-full h-full object-cover"
                        />
                    ) : (
                        <ShoppingBag size={24} className="text-neutral-300" />
                    )}
                </div>

                {/* Content */}
                <div className="flex-1 flex flex-col gap-1.5 min-w-0 ml-4">
                    {/* Name + price row */}
                    <div className="flex flex-col">
                        <span className="text-slate-900 text-base font-semibold truncate leading-snug">{product.name}</span>
                        <div className="flex items-center gap-2 mt-0.5">
                            {isDonation ? (
                                isInCart ? (
                                    <div className="relative w-28">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">K</span>
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            value={donationAmounts[product.id] ?? ''}
                                            onChange={(e) => {
                                                const val = Math.max(0, Number(e.target.value) || 0);
                                                setDonationAmounts(prev => ({ ...prev, [product.id]: val }));
                                            }}
                                            placeholder="0.00"
                                            className="w-full pl-6 pr-2 py-1 bg-white border border-slate-200 rounded-lg text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-blue-200 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                        />
                                    </div>
                                ) : (
                                    <span className="text-slate-400 text-sm">Open amount</span>
                                )
                            ) : (
                                <>
                                    <span className="text-orange-600 text-base font-semibold">
                                        K{product.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </span>
                                    {product.description && (
                                        <>
                                            <div className="w-px h-4 bg-neutral-200 flex-shrink-0" />
                                            <span className="text-slate-400 text-xs leading-tight line-clamp-1 flex-1 min-w-0">
                                                {product.description}
                                            </span>
                                        </>
                                    )}
                                </>
                            )}
                        </div>
                    </div>

                    {/* Qty stepper — zinc pill, only for non-donation */}
                    {!isDonation && (
                        <div className="bg-zinc-100 rounded-full inline-flex items-center self-start">
                            <button
                                onClick={() => handleQuantityChange(product.id, -1)}
                                className="w-7 h-7 flex items-center justify-center text-zinc-600 hover:text-zinc-900 transition-colors"
                            >
                                <Minus size={11} strokeWidth={2} />
                            </button>
                            <div className="w-px h-3 bg-neutral-200 flex-shrink-0" />
                            <input
                                type="number"
                                min="0"
                                value={qty}
                                onChange={(e) => handleQuantitySet(product.id, e.target.value)}
                                onFocus={(e) => e.target.select()}
                                className="w-7 h-7 text-center text-xs font-bold text-zinc-600 bg-transparent outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                            <div className="w-px h-3 bg-neutral-200 flex-shrink-0" />
                            <button
                                onClick={() => handleQuantityChange(product.id, 1)}
                                className="w-7 h-7 flex items-center justify-center text-zinc-600 hover:text-zinc-900 transition-colors"
                            >
                                <Plus size={11} strokeWidth={2} />
                            </button>
                        </div>
                    )}
                </div>

                {/* Add-to-cart button (＋) / remove-from-cart button (✓) */}
                <span className="relative inline-flex flex-shrink-0">
                    {/* Pulse wave that radiates outward when the item is added */}
                    {poppedId === product.id && (
                        <span
                            aria-hidden
                            className="absolute inset-0 rounded-full bg-blue-500/50 pointer-events-none"
                            style={{ animation: 'mw-pulse-ring 0.6s ease-out forwards' }}
                        />
                    )}
                    <button
                        onPointerDown={() => {
                            // Fire the pop + pulse the instant the button is pressed (add only).
                            if (!isInCart) {
                                setPoppedId(product.id);
                                setTimeout(() => setPoppedId(cur => (cur === product.id ? null : cur)), 600);
                            }
                        }}
                        onClick={() => {
                            if (isInCart) {
                                // Remove the item entirely from the cart
                                setSelectedQuantities(prev => ({ ...prev, [product.id]: 0 }));
                                if (isDonation) setDonationAmounts(prev => ({ ...prev, [product.id]: 0 }));
                            } else if (isDonation) {
                                // Add donation (amount entered inline / on cart screen)
                                setSelectedQuantities(prev => ({ ...prev, [product.id]: 1 }));
                            } else {
                                handleQuantityChange(product.id, 1);
                            }
                        }}
                        style={poppedId === product.id ? { animation: 'mw-add-pop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)' } : undefined}
                        className={`relative w-7 h-7 rounded-full flex items-center justify-center transition-colors duration-200 active:scale-90 ${
                            isInCart
                                ? 'bg-black border border-black text-white hover:bg-slate-800'
                                : 'border border-black text-black hover:bg-black hover:text-white'
                        }`}
                        title={isInCart ? 'Remove from cart' : 'Add to cart'}
                    >
                        {isInCart ? (
                            <svg
                                viewBox="0 0 24 24"
                                className="w-3.5 h-3.5"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth={3}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden
                            >
                                <path
                                    d="M5 12.5l4.5 4.5L19 7"
                                    strokeDasharray={26}
                                    style={{ animation: 'mw-tick-draw 0.42s ease-out 0.08s both' }}
                                />
                            </svg>
                        ) : (
                            <Plus size={13} strokeWidth={2} />
                        )}
                    </button>
                </span>
            </div>
        );
    };

    // A single catalogue grid card (image on top, name + price, add control).
    const renderGridCard = (product: Product) => {
        const isDonation = product.product_type === 'DONATION';
        const qty = selectedQuantities[product.id] || 0;
        const isInCart = qty > 0;

        // Fire the add-to-cart pop + pulse the instant the button is pressed.
        const firePop = () => {
            setPoppedId(product.id);
            setTimeout(() => setPoppedId(cur => (cur === product.id ? null : cur)), 600);
        };

        return (
            <div key={product.id} className="flex flex-col">
                {/* Image */}
                <div className="relative w-full aspect-square bg-neutral-100 rounded-2xl overflow-hidden flex items-center justify-center">
                    {product.image_url ? (
                        <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                    ) : (
                        <ShoppingBag size={28} className="text-neutral-300" />
                    )}
                    {/* In-cart tick — black badge with a drawn white check, top-right */}
                    {isInCart && (
                        <span className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black flex items-center justify-center shadow-md">
                            <svg
                                viewBox="0 0 24 24"
                                className="w-3.5 h-3.5 text-white"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth={3}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden
                            >
                                <path
                                    d="M5 12.5l4.5 4.5L19 7"
                                    strokeDasharray={26}
                                    style={{ animation: 'mw-tick-draw 0.42s ease-out 0.08s both' }}
                                />
                            </svg>
                        </span>
                    )}
                </div>

                {/* Info + action */}
                <div className="pt-3 flex flex-col gap-2.5">
                    <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="text-slate-500 text-[11px] truncate">{product.name}</span>
                        <span className="text-slate-900 text-sm font-bold">
                            {isDonation ? 'Open amount' : `K ${product.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                        </span>
                    </div>

                    {/* Action area — pulse flash + pop persist across the button↔stepper swap */}
                    <div className="relative self-stretch">
                        {poppedId === product.id && (
                            <span
                                aria-hidden
                                className="absolute inset-0 rounded-lg bg-blue-500 pointer-events-none"
                                style={{ animation: 'mw-flash 0.5s ease-out forwards' }}
                            />
                        )}
                        <div
                            className="relative"
                            style={poppedId === product.id ? { animation: 'mw-add-pop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)' } : undefined}
                        >
                            {isInCart && !isDonation ? (
                                // Quantity stepper once the item is in the cart
                                <div className="bg-zinc-100 rounded-lg flex items-center justify-between px-1">
                                    <button
                                        onClick={() => handleQuantityChange(product.id, -1)}
                                        className="w-7 h-7 flex items-center justify-center text-zinc-600 hover:text-zinc-900 transition-colors active:scale-90"
                                    >
                                        <Minus size={13} strokeWidth={2} />
                                    </button>
                                    <span className="text-xs font-bold text-zinc-700 tabular-nums">{qty}</span>
                                    <button
                                        onClick={() => handleQuantityChange(product.id, 1)}
                                        className="w-7 h-7 flex items-center justify-center text-zinc-600 hover:text-zinc-900 transition-colors active:scale-90"
                                    >
                                        <Plus size={13} strokeWidth={2} />
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onPointerDown={() => { if (!(isInCart && isDonation)) firePop(); }}
                                    onClick={() => {
                                        if (isDonation) {
                                            // Toggle donation in/out (amount entered on the cart screen)
                                            setSelectedQuantities(prev => ({ ...prev, [product.id]: isInCart ? 0 : 1 }));
                                            if (isInCart) setDonationAmounts(prev => ({ ...prev, [product.id]: 0 }));
                                        } else {
                                            handleQuantityChange(product.id, 1);
                                        }
                                    }}
                                    className={`w-full py-2.5 rounded-lg border text-[11px] font-medium flex items-center justify-center gap-1.5 transition-colors active:scale-95 ${
                                        isInCart && isDonation
                                            ? 'bg-black border-black text-white'
                                            : 'border-slate-300 text-black hover:bg-black hover:text-white'
                                    }`}
                                >
                                    {isInCart && isDonation ? (
                                        <>
                                            <Check size={13} strokeWidth={2.5} />
                                            <span>Added</span>
                                        </>
                                    ) : (
                                        <>
                                            <Plus size={13} strokeWidth={2} />
                                            <span>Add to Cart</span>
                                        </>
                                    )}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    // Helper to render Organization Logo / Initial
    const renderLogo = (sizeClass = "w-20 h-20", textClass = "text-3xl") => {
        if (!org) return null;
        if (org.logo_url) {
            return (
                <div className={`${sizeClass} rounded-2xl overflow-hidden shadow-md bg-white border border-slate-100/50 flex-shrink-0 animate-in fade-in zoom-in duration-300`}>
                    <img src={org.logo_url} alt={`${org.name} Logo`} className="w-full h-full object-cover" />
                </div>
            );
        }
        return (
            <div className={`${sizeClass} rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white font-black ${textClass} shadow-md uppercase flex-shrink-0`}>
                {org.name.charAt(0)}
            </div>
        );
    };

    return (
        <div className={`bg-white flex flex-col sm:justify-center sm:py-10 sm:px-4 ${isAppStep ? 'h-[100dvh] sm:h-auto sm:min-h-screen' : 'min-h-screen'}`}>
            <div className={`w-full bg-white overflow-hidden flex flex-col sm:max-w-md sm:mx-auto sm:rounded-[32px] sm:border sm:border-slate-100 sm:shadow-xl ${isAppStep ? 'flex-1 min-h-0 sm:flex-none sm:max-h-[90vh]' : ''}`}>
                
                {showRetrievePortal ? (
                    <div className="flex flex-col min-h-[500px]">
                        {/* Retrieval Header */}
                        <div className="p-6 border-b border-slate-50 flex items-center justify-between bg-slate-50/30">
                            <div className="flex items-center space-x-3">
                                {renderLogo("w-10 h-10", "text-sm")}
                                <div>
                                    <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider">{org?.name}</h4>
                                    <p className="text-[10px] font-semibold text-slate-400">Receipt Retrieval</p>
                                </div>
                            </div>
                            <button
                                onClick={() => {
                                    setShowRetrievePortal(false);
                                    setRetrievePhone('');
                                    setRetrievedReceipts([]);
                                    setRetrieveError(null);
                                }}
                                className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100/50 transition-all"
                                title="Back to Payment"
                            >
                                <ArrowLeft size={16} />
                            </button>
                        </div>

                        {/* Retrieval Body */}
                        <div className="p-6 flex-1 overflow-y-auto max-h-[350px] flex flex-col">
                            <form onSubmit={handleSearchReceipts} className="space-y-4">
                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Search by Phone Number</label>
                                    <div className="relative">
                                        <Smartphone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                        <input
                                            type="tel"
                                            value={retrievePhone}
                                            onChange={(e) => setRetrievePhone(e.target.value)}
                                            placeholder="e.g. 097XXXXXXXX"
                                            className="w-full pl-12 pr-4 py-4 bg-slate-50 border-none rounded-2xl text-xs focus:ring-2 focus:ring-blue-500 placeholder:text-slate-400 font-bold"
                                            required
                                        />
                                    </div>
                                </div>
                                <button
                                    type="submit"
                                    disabled={isRetrieving}
                                    className="w-full flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-[0.15em] transition-all shadow-md active:scale-98"
                                >
                                    {isRetrieving ? (
                                        <Loader2 size={14} className="animate-spin" />
                                    ) : (
                                        <Search size={14} />
                                    )}
                                    <span>{isRetrieving ? 'Searching...' : 'Find Receipts'}</span>
                                </button>
                            </form>

                            {retrieveError && (
                                <div className="mt-4 p-4 rounded-2xl bg-rose-50 border border-rose-100 text-rose-600 flex items-start space-x-2.5 animate-in fade-in slide-in-from-top-1">
                                    <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                                    <span className="text-[11px] font-semibold leading-normal">{retrieveError}</span>
                                </div>
                            )}

                            {/* Search Results */}
                            <div className="mt-6 flex-1 space-y-3.5">
                                {retrievedReceipts.length > 0 && (
                                    <>
                                        <h5 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Completed Purchases</h5>
                                        {retrievedReceipts.map((receipt) => (
                                            <div key={receipt.reference} className="p-4 rounded-2xl border border-slate-100 bg-white flex justify-between items-center transition-all hover:border-slate-200">
                                                <div className="flex-1 min-w-0 pr-4">
                                                    <h6 className="text-[11px] font-black text-slate-800 uppercase tracking-wide truncate">{receipt.itemsText}</h6>
                                                    <p className="text-[9px] font-semibold text-slate-400 mt-1">Paid on {new Date(receipt.date).toLocaleDateString()}</p>
                                                    <p className="text-xs font-black text-slate-800 mt-1.5">
                                                        K{receipt.totalPaid.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                    </p>
                                                </div>
                                                <button
                                                    onClick={() => handleDownloadPublicReceipt(receipt.reference)}
                                                    disabled={downloadingReference === receipt.reference}
                                                    className="p-3 bg-slate-950 hover:bg-slate-900 text-white rounded-xl shadow-sm hover:shadow-md transition-all active:scale-95 disabled:opacity-50"
                                                    title="Download Receipt"
                                                >
                                                    {downloadingReference === receipt.reference ? (
                                                        <Loader2 size={14} className="animate-spin" />
                                                    ) : (
                                                        <Download size={14} />
                                                    )}
                                                </button>
                                            </div>
                                        ))}
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Retrieval Footer */}
                        <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex justify-center text-center">
                            <button
                                onClick={() => {
                                    setShowRetrievePortal(false);
                                    setRetrievePhone('');
                                    setRetrievedReceipts([]);
                                    setRetrieveError(null);
                                }}
                                className="text-xs font-bold text-blue-600 hover:text-blue-700 uppercase tracking-wider transition-colors"
                            >
                                Back to Checkout
                            </button>
                        </div>
                    </div>
                ) : (
                    <>
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

                {/* 2. Catalogue (Shop) Step — entry page */}
                {step === 'SHOP' && org && (
                    <div className="flex flex-col flex-1 min-h-0 sm:min-h-[620px]">
                        {/* Header */}
                        <div className="px-6 pt-7 pb-4 flex items-center gap-4 flex-shrink-0">
                            {renderLogo("w-14 h-14", "text-xl")}
                            <div className="flex flex-col min-w-0">
                                <div className="flex items-center gap-1.5">
                                    <h4 className="text-base font-black text-slate-900 uppercase tracking-tight truncate">{org.name}</h4>
                                    <BadgeCheck className="w-5 h-5 text-white flex-shrink-0" fill="#2563eb" />
                                </div>
                                <p className="text-xs font-thin text-[#5A5A5A]">Payment Checkout Portal</p>
                            </div>
                        </div>

                        {/* Search */}
                        <div className="px-4 flex-shrink-0">
                            <div className="relative">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                <input
                                    type="text"
                                    value={productSearch}
                                    onChange={(e) => setProductSearch(e.target.value)}
                                    placeholder="Search products"
                                    className="w-full pl-11 pr-4 py-3.5 bg-neutral-100 rounded-full text-sm font-medium text-[#5A5A5A] outline-none focus:ring-2 focus:ring-slate-200 placeholder:text-slate-400 transition-all"
                                />
                            </div>
                        </div>

                        {/* Category tabs — animated segmented control */}
                        {productCategories.length > 1 && (
                            <div className="px-4 pt-4 flex-shrink-0">
                                <SegmentedControl
                                    variant="capsule"
                                    options={productCategories.map(cat => ({ value: cat, label: cat }))}
                                    value={activeCategory}
                                    onChange={setActiveCategory}
                                />
                            </div>
                        )}

                        {/* Product grid */}
                        <div className="flex-1 min-h-0 overflow-y-auto px-4 pt-5 pb-3">
                            {sheetProducts.length === 0 ? (
                                <div className="text-center py-16">
                                    <ShoppingCart className="mx-auto text-slate-200 mb-2" size={36} />
                                    <p className="text-xs font-semibold text-slate-400">
                                        {catalogProducts.length === 0 ? 'No products configured yet.' : 'No matching products.'}
                                    </p>
                                </div>
                            ) : (
                                <AnimatedTabContent
                                    tabKey={activeCategory}
                                    index={activeCategoryIndex}
                                    className="grid grid-cols-2 gap-x-4 gap-y-6"
                                >
                                    {sheetProducts.map(product => renderGridCard(product))}
                                </AnimatedTabContent>
                            )}
                        </div>

                        {/* Subtotal + Go to Cart (pinned) */}
                        <div className="mt-auto bg-white border-t border-slate-100 px-6 pt-4 pb-5 space-y-3 flex-shrink-0">
                            <div className="space-y-1">
                                <div className="flex justify-between items-center">
                                    <span className="text-xs font-normal text-slate-500">Items Added</span>
                                    <span className="text-xs font-normal text-slate-700">{cartItemCount} Item{cartItemCount === 1 ? '' : 's'}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-base font-bold text-slate-900">Subtotal</span>
                                    <span className="text-base font-bold text-slate-900">
                                        K{subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </span>
                                </div>
                            </div>
                            <button
                                onClick={() => { setError(null); setStep('CATALOG'); }}
                                disabled={cartItemCount === 0}
                                className="w-full bg-black hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed text-white py-4 rounded-xl font-medium text-sm transition-all flex items-center justify-center gap-2.5"
                            >
                                <ShoppingBag size={18} />
                                <span>Go to Cart</span>
                                <ArrowRight size={18} strokeWidth={2.5} />
                            </button>
                            <div className="text-center">
                                <button
                                    type="button"
                                    onClick={() => setShowRetrievePortal(true)}
                                    className="text-[11px] font-bold text-slate-400 hover:text-blue-600 transition-colors uppercase tracking-wider"
                                >
                                    Already Paid? Find your receipt
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* 3. Cart Step */}
                {step === 'CATALOG' && org && (
                    <div
                        className="flex flex-col flex-1 min-h-0 sm:min-h-[620px]"
                        style={{ animation: 'atabs-in-right 0.42s cubic-bezier(0.22, 1, 0.36, 1)' }}
                    >
                        {/* Cart Header — logo left, business name right */}
                        <div className="px-6 pt-7 pb-5 flex items-center gap-4">
                            {renderLogo("w-14 h-14", "text-xl")}
                            <div className="flex flex-col min-w-0">
                                <div className="flex items-center gap-1.5">
                                    <h4 className="text-base font-black text-slate-900 uppercase tracking-tight truncate">{org.name}</h4>
                                    <BadgeCheck className="w-5 h-5 text-white flex-shrink-0" fill="#2563eb" />
                                </div>
                                <p className="text-xs font-thin text-[#5A5A5A]">Payment Checkout Portal</p>
                            </div>
                        </div>

                        {/* Cart Total band */}
                        <div className="px-9 py-6 bg-slate-50">
                            <p className="text-xs font-normal text-slate-500">Cart Total</p>
                            <p className="text-4xl font-extrabold text-slate-900 mt-1 tracking-tight">
                                K{subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </p>
                        </div>

                        {/* Cart items */}
                        <div className="flex-1 flex flex-col px-6 pt-6">
                            <div className="flex-1 min-h-[260px] rounded-3xl border border-slate-200 p-4 flex flex-col">
                                {lineItems.length === 0 ? (
                                    <div className="flex-1 flex items-center justify-center">
                                        <p className="text-center text-xs font-thin text-[#5A5A5A] leading-relaxed">
                                            Items will appear in your cart when you<br />Add Products and Services
                                        </p>
                                    </div>
                                ) : (
                                    <div className="space-y-5 overflow-y-auto">
                                        {lineItems.map(li => renderProductCard(li.product))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Footer actions */}
                        <div className="p-6 pt-6 space-y-3">
                            {error && (
                                <div className="p-3.5 bg-rose-50 text-rose-600 rounded-xl flex items-start space-x-2 animate-in fade-in duration-200">
                                    <AlertCircle className="flex-shrink-0 mt-0.5" size={14} />
                                    <span className="text-[10px] font-semibold leading-normal">{error}</span>
                                </div>
                            )}

                            <button
                                onClick={openProductSheet}
                                className={`w-full py-5 rounded-2xl font-bold text-xs tracking-wide transition-all flex items-center justify-center gap-2 ${
                                    lineItems.length > 0
                                        ? 'bg-neutral-100 hover:bg-neutral-200 text-zinc-600'
                                        : 'bg-black hover:bg-slate-800 text-white'
                                }`}
                            >
                                <PlusCircle size={16} />
                                <span>Add Products/Services</span>
                            </button>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => { setError(null); setStep('SHOP'); }}
                                    title="Back to catalogue"
                                    className="flex-shrink-0 w-16 py-5 rounded-2xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-all flex items-center justify-center active:scale-95"
                                >
                                    <ChevronLeft size={18} strokeWidth={2.5} />
                                </button>
                                <button
                                    onClick={handleProceedToSummary}
                                    disabled={subtotal <= 0}
                                    className={`flex-1 py-5 rounded-2xl font-bold text-xs tracking-wide transition-all flex items-center justify-center gap-1.5 ${
                                        lineItems.length > 0
                                            ? 'bg-black hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed text-white'
                                            : 'bg-neutral-100 hover:bg-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-600'
                                    }`}
                                >
                                    <span>Checkout</span>
                                    <ChevronRight size={14} strokeWidth={2.5} />
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* 3b. Payment Summary Step */}
                {step === 'SUMMARY' && org && (
                    <div
                        className="flex flex-col flex-1 min-h-0 sm:min-h-[620px]"
                        style={{ animation: 'atabs-in-right 0.42s cubic-bezier(0.22, 1, 0.36, 1)' }}
                    >
                        {/* Header — logo left, business name right (matches cart) */}
                        <div className="px-6 pt-7 pb-5 flex items-center gap-4">
                            {renderLogo("w-14 h-14", "text-xl")}
                            <div className="flex flex-col min-w-0">
                                <div className="flex items-center gap-1.5">
                                    <h4 className="text-base font-black text-slate-900 uppercase tracking-tight truncate">{org.name}</h4>
                                    <BadgeCheck className="w-5 h-5 text-white flex-shrink-0" fill="#2563eb" />
                                </div>
                                <p className="text-xs font-thin text-[#5A5A5A]">Payment Checkout Portal</p>
                            </div>
                        </div>

                        {/* Cart Total band — grand total (products + transaction costs) */}
                        <div className="px-9 py-6 bg-slate-50">
                            <p className="text-xs font-normal text-slate-500">Cart Total</p>
                            <p className="text-4xl font-extrabold text-slate-900 mt-1 tracking-tight">
                                K{totalPayable.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </p>
                        </div>

                        {/* Summary body */}
                        <div className="flex-1 overflow-y-auto px-6 pt-6 pb-2">
                            <div className="rounded-3xl border border-slate-200 p-5 space-y-5">
                                {/* Breakdown */}
                                <div>
                                    <div className="flex items-center gap-2 mb-3">
                                        <Receipt size={16} className="text-slate-900" />
                                        <h5 className="text-sm font-bold text-slate-900">Breakdown</h5>
                                    </div>
                                    <div className="space-y-2.5">
                                        <div className="flex justify-between text-sm">
                                            <span className="text-slate-500">
                                                {customerName.trim() ? `${customerName.trim().split(' ')[0]} Cart Total` : 'Cart Total'}
                                            </span>
                                            <span className="text-slate-700 font-medium">
                                                K{subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </span>
                                        </div>
                                        <div className="flex justify-between text-xs">
                                            <span className="text-slate-500">Transaction Fee</span>
                                            <span className="text-slate-700 font-medium">
                                                K{processingFee.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </span>
                                        </div>
                                        <div className="border-t border-dashed border-slate-200 pt-3 flex justify-between text-sm">
                                            <span className="font-bold text-slate-900">Total</span>
                                            <span className="font-bold text-slate-900">
                                                K{totalPayable.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Discounts (placeholder) */}
                                <div>
                                    <div className="flex items-center gap-2 mb-3">
                                        <Ticket size={16} className="text-slate-900" />
                                        <h5 className="text-sm font-bold text-slate-900">Discounts</h5>
                                    </div>
                                    <div className="flex items-start gap-2 px-3 py-2.5 bg-slate-50 rounded-xl mb-3">
                                        <Info size={13} className="text-slate-400 mt-0.5 flex-shrink-0" />
                                        <p className="text-[11px] text-slate-400 leading-snug">
                                            You can check which discounts you can get for and apply them.
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        disabled
                                        className="w-full flex items-center justify-between px-4 py-3.5 border border-slate-200 rounded-xl text-sm text-slate-500 cursor-not-allowed"
                                        title="Coming soon"
                                    >
                                        <span className="flex items-center gap-2">
                                            <Plus size={15} strokeWidth={2.5} />
                                            Add Discounts (0 Selected)
                                        </span>
                                        <ChevronDown size={16} className="text-slate-400" />
                                    </button>
                                </div>
                            </div>

                            {/* Your details — collected here, just before paying */}
                            <div className="mt-4 rounded-3xl border border-slate-200 p-5">
                                <div className="flex items-center gap-2 mb-3">
                                    <User size={16} className="text-slate-900" />
                                    <h5 className="text-sm font-bold text-slate-900">
                                        Your Details <span className="text-rose-500">*</span>
                                    </h5>
                                </div>
                                <div className="space-y-3">
                                    <div className="relative">
                                        <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                        <input
                                            type="text"
                                            value={customerName}
                                            onChange={(e) => setCustomerName(e.target.value)}
                                            placeholder="Your full name"
                                            className="w-full pl-11 pr-4 py-3.5 bg-neutral-100 rounded-xl text-sm font-medium text-[#5A5A5A] outline-none focus:ring-2 focus:ring-slate-200 placeholder:text-slate-400 transition-all"
                                        />
                                    </div>
                                    <div className="relative">
                                        <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                        <input
                                            type="tel"
                                            value={customerPhone}
                                            onChange={(e) => setCustomerPhone(e.target.value)}
                                            placeholder="Phone number"
                                            className="w-full pl-11 pr-4 py-3.5 bg-neutral-100 rounded-xl text-sm font-medium text-[#5A5A5A] outline-none focus:ring-2 focus:ring-slate-200 placeholder:text-slate-400 transition-all"
                                        />
                                    </div>
                                </div>
                            </div>

                            {error && (
                                <div className="mt-4 p-3.5 bg-rose-50 text-rose-600 rounded-xl flex items-start space-x-2 animate-in fade-in duration-200">
                                    <AlertCircle className="flex-shrink-0 mt-0.5" size={14} />
                                    <span className="text-[10px] font-semibold leading-normal">{error}</span>
                                </div>
                            )}
                        </div>

                        {/* Footer — Lenco notice + Pay (sticky at the bottom) */}
                        <div className="sticky bottom-0 mt-auto bg-white border-t border-slate-100 px-6 pt-4 pb-6 space-y-4">
                            <div className="flex items-center justify-center gap-1.5 text-slate-400">
                                <ShieldCheck size={14} />
                                <span className="text-xs font-medium">Secure payments powered by Lenco</span>
                            </div>
                            <button
                                onClick={handlePay}
                                disabled={!canPay}
                                className={`w-full py-4 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${
                                    canPay
                                        ? 'bg-black hover:bg-slate-800 text-white'
                                        : 'bg-neutral-100 text-zinc-400 cursor-not-allowed'
                                }`}
                            >
                                <CreditCard size={16} />
                                <span>Pay</span>
                            </button>
                            <div className="text-center">
                                <button
                                    type="button"
                                    onClick={() => { setError(null); setStep('CATALOG'); }}
                                    className="text-[11px] font-bold text-slate-400 hover:text-slate-600 transition-colors uppercase tracking-wider"
                                >
                                    Back to Cart
                                </button>
                            </div>
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
                                {confirmManualError && (
                                    <p className="text-[11px] text-rose-600 mt-3 text-center max-w-xs font-semibold">
                                        {confirmManualError}
                                    </p>
                                )}
                                <div className="flex flex-col items-center gap-3 mt-6 w-full">
                                    <button
                                        onClick={handleConfirmPaymentManual}
                                        disabled={isConfirmingManual}
                                        className="w-full max-w-[200px] px-6 py-3 bg-blue-600 text-white rounded-xl text-xs font-black uppercase tracking-wider hover:bg-blue-700 disabled:bg-slate-200 transition-all flex items-center justify-center space-x-2"
                                    >
                                        {isConfirmingManual ? (
                                            <>
                                                <Loader2 size={12} className="animate-spin mr-1.5" />
                                                <span>Confirming...</span>
                                            </>
                                        ) : (
                                            <span>Confirm Payment</span>
                                        )}
                                    </button>
                                    <button
                                        onClick={handleReset}
                                        className="px-6 py-2 text-slate-500 hover:text-slate-700 transition-all text-xs font-black uppercase tracking-wider"
                                    >
                                        Return to Catalog
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                )}

                {/* 5. Success Step */}
                {step === 'SUCCESS' && org && (
                    <div className="flex flex-col flex-1 min-h-0 sm:min-h-[620px]">
                        {/* Header — logo + name (matches cart/summary) */}
                        <div className="px-6 pt-7 pb-2 flex items-center gap-4">
                            {renderLogo("w-14 h-14", "text-xl")}
                            <div className="flex flex-col min-w-0">
                                <div className="flex items-center gap-1.5">
                                    <h4 className="text-base font-black text-slate-900 uppercase tracking-tight truncate">{org.name}</h4>
                                    <BadgeCheck className="w-5 h-5 text-white flex-shrink-0" fill="#2563eb" />
                                </div>
                                <p className="text-xs font-thin text-[#5A5A5A]">Payment Checkout Portal</p>
                            </div>
                        </div>

                        {/* Body */}
                        <div className="flex-1 overflow-y-auto px-6 pb-4">
                            {/* Success seal + headline */}
                            <div className="flex flex-col items-center text-center pt-6 pb-1">
                                <div
                                    className="relative w-24 h-24 animate-in zoom-in-75 duration-300"
                                    style={{ filter: 'drop-shadow(-5px 5px 0 rgba(0,49,41,1))' }}
                                >
                                    <BadgeCheck
                                        className="w-24 h-24 text-[#003129]"
                                        fill="#16a34a"
                                        strokeWidth={1.5}
                                    />
                                    {/* White tick overlaid on top of the seal's own check */}
                                    <Check className="absolute inset-0 m-auto w-9 h-9 text-white" strokeWidth={3} />
                                </div>
                                <h2 className="text-2xl font-black text-slate-900 mt-6">Congratulations</h2>
                                <p className="text-xs font-medium text-slate-500 mt-2 leading-relaxed">
                                    Your payment was successful.<br />Thank you for your support.
                                </p>
                            </div>

                            {/* Payment Details */}
                            <div className="mt-7 bg-gray-50 border border-neutral-200 rounded-2xl px-6 pt-4 pb-5">
                                <div className="flex items-center gap-2 mb-3">
                                    <Wallet size={15} className="text-slate-900" />
                                    <span className="text-xs font-bold text-zinc-600">Payment Details</span>
                                </div>
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs text-zinc-600">Payment Method</span>
                                        <span className="text-xs font-semibold text-zinc-600">{paymentMethod}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs text-zinc-600">Account Number</span>
                                        <span className="text-xs font-semibold text-zinc-600">{customerPhone}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs text-zinc-600">Account Name</span>
                                        <span className="text-xs font-bold text-zinc-600 text-right truncate max-w-[55%]">{customerName}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Order Summary */}
                            <div className="mt-4 bg-gray-50 border border-gray-200 rounded-2xl px-6 py-4">
                                <div className="flex items-center gap-2 mb-3">
                                    <ClipboardList size={15} className="text-slate-900" />
                                    <span className="text-xs font-bold text-zinc-600">Order Summary</span>
                                </div>
                                <div className="space-y-2">
                                    {lineItems.map(li => (
                                        <div key={li.product.id} className="flex justify-between items-center gap-3">
                                            <span className="text-xs text-zinc-600 truncate">
                                                {li.product.name}
                                                {!li.isDonation && li.quantity > 1 ? ` (x${li.quantity})` : ''}
                                            </span>
                                            <span className="text-xs text-zinc-600 flex-shrink-0">
                                                K{li.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </span>
                                        </div>
                                    ))}
                                    <div className="flex justify-between items-center gap-3">
                                        <span className="text-xs text-zinc-600">Transaction Cost</span>
                                        <span className="text-xs text-zinc-600 flex-shrink-0">
                                            K{processingFee.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </span>
                                    </div>
                                    <div className="border-t border-neutral-200 my-1" />
                                    <div className="flex justify-between items-center gap-3">
                                        <span className="text-xs font-bold text-slate-900">Payment Total</span>
                                        <span className="text-xs font-bold text-slate-900 flex-shrink-0">
                                            K{totalPayable.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <p className="text-center text-[10px] font-semibold text-slate-300 mt-4">
                                Receipt No: {receiptNumber ? `#${receiptNumber}` : currentReference.replace('-PUB', '')}
                            </p>
                        </div>

                        {/* Footer actions (pinned at the bottom) */}
                        <div className="mt-auto px-6 pt-4 pb-6 space-y-3 bg-white">
                            <button
                                onClick={handleDownloadReceipt}
                                disabled={isGeneratingReceipt}
                                className="w-full bg-black hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed text-white py-4 rounded-2xl font-bold text-xs transition-all flex items-center justify-center gap-2"
                            >
                                {isGeneratingReceipt ? (
                                    <Loader2 size={14} className="animate-spin" />
                                ) : (
                                    <Download size={14} />
                                )}
                                <span>{isGeneratingReceipt ? 'Generating...' : 'Download Receipts'}</span>
                            </button>
                            <button
                                onClick={handleReset}
                                className="w-full bg-zinc-100 hover:bg-zinc-200 text-black py-4 rounded-2xl font-medium text-xs transition-all"
                            >
                                Close
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
                </>
                )}

            </div>

            {/* Add Products / Services — quick-add sheet from the cart screen */}
            {showProductSheet && (
                <div className="fixed inset-0 z-50 flex flex-col sm:justify-end">
                    <div
                        className={`hidden sm:block absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity duration-300 ${sheetIn ? 'opacity-100' : 'opacity-0'}`}
                        onClick={closeProductSheet}
                    />
                    <div className={`relative w-full h-full sm:h-auto sm:max-h-[92vh] sm:max-w-md sm:mx-auto bg-white sm:rounded-t-[32px] sm:shadow-2xl flex flex-col transition-transform duration-300 ease-out ${sheetIn ? 'translate-y-0' : 'translate-y-full'}`}>

                        {/* Top bar */}
                        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
                            <div className="flex items-center gap-2">
                                <PlusCircle size={16} className="text-slate-900" />
                                <h3 className="text-sm font-black text-slate-900 tracking-wide">Add Products/Services</h3>
                            </div>
                            <button
                                onClick={closeProductSheet}
                                className="w-8 h-8 rounded-full border border-slate-200 shadow-sm flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition-all"
                                title="Cancel"
                            >
                                <X size={15} />
                            </button>
                        </div>

                        {/* Search */}
                        <div className="px-4 pt-4 flex-shrink-0">
                            <div className="relative">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                <input
                                    type="text"
                                    value={productSearch}
                                    onChange={(e) => setProductSearch(e.target.value)}
                                    placeholder="Search products"
                                    className="w-full pl-11 pr-4 py-3.5 bg-neutral-100 rounded-full text-sm font-medium text-[#5A5A5A] outline-none focus:ring-2 focus:ring-slate-200 placeholder:text-slate-400 transition-all"
                                />
                            </div>
                        </div>

                        {/* Category tabs — animated segmented control (sliding pill) */}
                        {productCategories.length > 1 && (
                            <div className="px-4 pt-6 flex-shrink-0">
                                <SegmentedControl
                                    variant="capsule"
                                    options={productCategories.map(cat => ({ value: cat, label: cat }))}
                                    value={activeCategory}
                                    onChange={setActiveCategory}
                                />
                            </div>
                        )}

                        {/* Product list */}
                        <div className="flex-1 overflow-y-auto px-4 pt-6 pb-2">
                            {sheetProducts.length === 0 ? (
                                <div className="text-center py-16">
                                    <ShoppingCart className="mx-auto text-slate-200 mb-2" size={36} />
                                    <p className="text-xs font-semibold text-slate-400">
                                        {catalogProducts.length === 0 ? 'No products configured yet.' : 'No matching products.'}
                                    </p>
                                </div>
                            ) : (
                                <AnimatedTabContent
                                    tabKey={activeCategory}
                                    index={activeCategoryIndex}
                                    className="space-y-5"
                                >
                                    {sheetProducts.map(product => renderProductCard(product))}
                                </AnimatedTabContent>
                            )}
                        </div>

                        {/* Footer: subtotal + Add N items */}
                        <div className="border-t border-slate-200 px-4 py-4 space-y-3 flex-shrink-0">
                            <div className="flex justify-between items-center px-1">
                                <span className="text-sm font-bold text-slate-900">Subtotal</span>
                                <span className="text-sm font-bold text-slate-900">
                                    K{subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </span>
                            </div>
                            <button
                                onClick={closeProductSheet}
                                disabled={cartItemCount === 0}
                                className="w-full bg-black hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed text-white py-4 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2"
                            >
                                <ShoppingBag size={16} />
                                <span>{cartItemCount > 0 ? `Add ${cartItemCount} Item${cartItemCount === 1 ? '' : 's'}` : 'Add Items'}</span>
                                {cartItemCount > 0 && <Check size={16} strokeWidth={2.5} />}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Footer Brand Info */}
            {step !== 'SHOP' && step !== 'CATALOG' && step !== 'SUMMARY' && step !== 'SUCCESS' && (
            <div className="mt-auto pt-8 pb-6 text-center space-y-2">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center justify-center space-x-1.5">
                    <Building2 size={12} />
                    <span>Secured by MoneyWise Ledger Gateway</span>
                </p>
                <p className="text-[9px] font-medium text-slate-400">
                    Terms & Privacy Apply. Payments are processed securely via Lenco.
                </p>
            </div>
            )}
        </div>
    );
};

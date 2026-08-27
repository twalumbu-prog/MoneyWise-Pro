import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import jsPDF from 'jspdf';
import posthog from '../lib/posthog';
import { trackEvent, trackVerificationTimeout } from '../lib/analytics';
import {
    Loader2,
    ArrowRight,
    Smartphone,
    Phone,
    Mail,
    User,
    ShoppingCart,
    ShoppingBag,
    Plus,
    Minus,
    AlertCircle,
    RefreshCw,
    ArrowLeft,
    Building2,
    Download,
    Search,
    BadgeCheck,
    PlusCircle,
    ChevronRight,
    ChevronDown,
    Check,
    X,
    CreditCard,
    ShieldCheck,
    Ticket,
    Receipt,
    Info,
    Wallet,
    ClipboardList,
    CalendarDays,
    MapPin,
    Edit2,
} from 'lucide-react';
import { calculatePlatformFee } from 'shared';
import { CheckoutErrorInfo, diagnoseCheckoutError } from '../utils/checkoutError';
import { SegmentedControl, AnimatedTabContent } from '../components/AnimatedTabs';
import { PaymentWaitingScreen, PaymentPhase } from '../components/PaymentWaitingScreen';
import { savePendingPayment, loadPendingPayment, clearPendingPayment } from '../lib/paymentRecovery';
import BookingCalendar from '../components/BookingCalendar';
import { BookingRange, isBookingProductType, getBookingTerminology } from '../services/product.service';

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

// Warm the browser cache for a batch of image URLs. Resolves when they've all
// loaded (or errored), or after `timeoutMs` — whichever comes first — so a slow
// or broken image can never block the catalogue from showing. Once warmed, the
// real <img> tags paint instantly from cache instead of popping in one by one.
const preloadImages = (urls: (string | null | undefined)[], timeoutMs = 3000): Promise<void> => {
    const valid = Array.from(new Set(urls.filter((u): u is string => !!u)));
    if (valid.length === 0) return Promise.resolve();
    return new Promise<void>((resolve) => {
        let settled = false;
        let remaining = valid.length;
        const finish = () => {
            if (settled) return;
            remaining -= 1;
            if (remaining <= 0) { settled = true; resolve(); }
        };
        valid.forEach((u) => {
            const img = new Image();
            img.onload = finish;
            img.onerror = finish;
            img.src = u;
        });
        window.setTimeout(() => { if (!settled) { settled = true; resolve(); } }, timeoutMs);
    });
};

interface Product {
    id: string;
    name: string;
    description?: string;
    price: number;
    is_active: boolean;
    image_url?: string | null;
    product_type?: 'PRODUCT' | 'SERVICE_FIXED' | 'SERVICE_VARIABLE' | 'DONATION' | 'SERVICE_BOOKING' | 'SERVICE_BOOKING_DAILY' | 'DIGITAL';
    category?: string | null;
    requires_delivery?: boolean;
    allow_external_delivery?: boolean;
    own_delivery_charge?: number;
}

/** Rider service options available in Zambia — placeholder until a live API exists. */
const RIDER_SERVICES = [
    { id: 'yango',   name: 'Yango',    est_price: 15, est_minutes: 45, logo: '🚗' },
    { id: 'glovo',   name: 'Glovo',    est_price: 20, est_minutes: 35, logo: '🟡' },
    { id: 'pickup',  name: 'Zed Ride', est_price: 12, est_minutes: 60, logo: '🛵' },
];

/** Delivery details captured at checkout. */
interface DeliveryDetails {
    mode: 'deliver' | 'pickup';
    country: string;
    state: string;
    street: string;
    apartment: string;
    rider_service: string | null;
    rider_service_name: string | null;
    delivery_charge: number;
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
    collections_api_enabled?: boolean;
}

// Detect the Zambian mobile money operator from a phone prefix.
// Mirrors LencoService.resolveMobileOperator on the API.
function detectOperator(phone: string): 'airtel' | 'mtn' | 'zamtel' | null {
    const clean = (phone || '').replace(/[^0-9]/g, '');
    let normalized = clean.startsWith('260') ? '0' + clean.slice(3) : clean;
    // Accept the 9-digit local number without its leading 0 (matches the +260
    // prefix already shown in the UI, so the customer doesn't need to type it twice).
    if (normalized.length === 9 && /^[975]/.test(normalized)) {
        normalized = '0' + normalized;
    }
    if (normalized.startsWith('097') || normalized.startsWith('077')) return 'airtel';
    if (normalized.startsWith('096') || normalized.startsWith('076')) return 'mtn';
    if (normalized.startsWith('095') || normalized.startsWith('075')) return 'zamtel';
    return null;
}

const OPERATOR_COLORS: Record<string, string> = {
    airtel: 'text-red-500',
    mtn: 'text-amber-500',
    zamtel: 'text-emerald-500',
};

// Latency threshold (measured from the account-name lookup, which shares the
// customer's current network path) above which the waiting screen warns that
// confirmation may take longer than usual.
const SLOW_LATENCY_MS = 1200;

export const PublicPay: React.FC = () => {
    const { wallet_id } = useParams<{ wallet_id: string }>();

    // UI Steps
    //  SHOP     = product catalogue grid (entry page)
    //  CATALOG  = the cart (added items)
    //  DELIVERY = delivery address + rider selection (only when cart has physical goods)
    //  SUMMARY  = checkout breakdown + customer details + Pay
    //  CHECKOUT = dedicated payment-method page (Collections API own-UX only)
    const [step, setStep] = useState<'LOADING' | 'SHOP' | 'CATALOG' | 'DELIVERY' | 'SUMMARY' | 'CHECKOUT' | 'VERIFYING' | 'SUCCESS' | 'ERROR'>('LOADING');

    // Data Context
    const [org, setOrg] = useState<OrgContext | null>(null);
    const [wallet, setWallet] = useState<WalletContext | null>(null);
    const [products, setProducts] = useState<Product[]>([]);
    // Own-UX checkout (Collections API) kill-switch — see loadContext.
    const [collectionsApiEnabled, setCollectionsApiEnabled] = useState(false);
    const [checkoutMethod, setCheckoutMethod] = useState<'mobile-money' | 'card'>('mobile-money');
    const [checkoutPhone, setCheckoutPhone] = useState('');
    const [resolvedAccountName, setResolvedAccountName] = useState('');
    const [resolvingAccountName, setResolvingAccountName] = useState(false);
    const [resolveFailed, setResolveFailed] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    // Distinguishes the "approve on your phone" wait from the post-approval ledger sync.
    const [awaitingApproval, setAwaitingApproval] = useState(false);
    // Own-UX payment lifecycle phase (null = not on the premium screen, e.g. widget path).
    const [paymentPhase, setPaymentPhase] = useState<PaymentPhase | null>(null);
    const [failureIsDeclined, setFailureIsDeclined] = useState(false);
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const [networkLatencyMs, setNetworkLatencyMs] = useState<number | null>(null);
    const [cancelling, setCancelling] = useState(false);
    // "Check payment status" re-query state (failed / cancelled screens).
    const [rechecking, setRechecking] = useState(false);
    const [recheckNote, setRecheckNote] = useState<string | null>(null);
    // When resuming an in-flight payment after a reload, the live cart is empty, so
    // the waiting screen's amount/phone come from the persisted payment instead.
    const [resumedPayment, setResumedPayment] = useState<{ amount: number; phone: string } | null>(null);
    // Flipped on Cancel so an in-flight poll loop stops recursing instead of racing
    // a fresh attempt (each retry uses a brand-new setTimeout chain).
    const pollCancelledRef = useRef(false);
    // Set once we've resumed an in-flight payment on load, so a second loadContext
    // run (StrictMode double-invoke, or an ERROR-screen retry) can't clobber the
    // resumed VERIFYING screen by falling through to the catalogue.
    const resumedRef = useRef(false);
    
    // Inputs & Forms
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    // Only needed when the cart contains a digital product — that's where we email
    // the file. Can't be derived from the mobile-money account, so we collect it.
    const [customerEmail, setCustomerEmail] = useState('');
    const [selectedQuantities, setSelectedQuantities] = useState<Record<string, number>>({});
    // Customer-entered amounts for DONATION products (keyed by product id).
    const [donationAmounts, setDonationAmounts] = useState<Record<string, number>>({});
    // Chosen stay for SERVICE_BOOKING products (keyed by product id). `nights` doubles
    // as the cart quantity for that line, so total = nights × nightly price.
    const [bookingDates, setBookingDates] = useState<Record<string, { checkIn: string; checkOut: string; nights: number }>>({});
    // Booking calendar overlay state.
    const [calendarProduct, setCalendarProduct] = useState<Product | null>(null);
    const [calendarAvailability, setCalendarAvailability] = useState<BookingRange[]>([]);
    const [calendarLoading, setCalendarLoading] = useState(false);

    // Delivery details captured on the DELIVERY step.
    const [deliveryMode, setDeliveryMode] = useState<'deliver' | 'pickup'>('deliver');
    const [deliveryCountry, setDeliveryCountry] = useState('Zambia');
    const [deliveryState, setDeliveryState] = useState('');
    const [deliveryStreet, setDeliveryStreet] = useState('');
    const [deliveryApartment, setDeliveryApartment] = useState('');
    const [selectedRider, setSelectedRider] = useState<string>(RIDER_SERVICES[0].id);
    const [riderDropdownOpen, setRiderDropdownOpen] = useState(false);
    const riderSectionRef = useRef<HTMLDivElement | null>(null);
    const locationWatchRef = useRef<number | null>(null);
    const [locating, setLocating] = useState(false);
    const [locationError, setLocationError] = useState<string | null>(null);

    // Desktop (≥1024px) uses a full-width two-column shop+cart layout; mobile keeps
    // the stepped flow. Initialised from matchMedia to avoid a first-paint flash.
    const [isDesktop, setIsDesktop] = useState<boolean>(
        () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches
    );
    useEffect(() => {
        const mq = window.matchMedia('(min-width: 1024px)');
        const update = () => setIsDesktop(mq.matches);
        mq.addEventListener('change', update);
        return () => mq.removeEventListener('change', update);
    }, []);

    // The desktop cart panel's height is measured (not assumed) so its bottom edge
    // always lands a fixed margin above the viewport bottom — regardless of where
    // the panel sits on the page (which varies with header/category-tab height) and
    // regardless of how many items are in the cart.
    const cartPanelRef = useRef<HTMLDivElement | null>(null);
    const [cartPanelHeight, setCartPanelHeight] = useState<number | null>(null);
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
    // Structured diagnosis for the full-screen ERROR step (load failures).
    const [errorInfo, setErrorInfo] = useState<CheckoutErrorInfo | null>(null);
    // Set if the tab goes hidden (screen lock, app switch) while the context
    // fetch is in flight — the single biggest cause of a false "timed out" on
    // mobile, since the request keeps running in the background but the payer
    // sees an interrupted page. See diagnoseCheckoutError's PL-BACKGROUNDED.
    const wasBackgroundedDuringFetchRef = useRef(false);

    // Receipt Retrieval states
    const [showRetrievePortal, setShowRetrievePortal] = useState(false);
    const [retrievePhone, setRetrievePhone] = useState('');
    const [retrievedReceipts, setRetrievedReceipts] = useState<any[]>([]);
    const [isRetrieving, setIsRetrieving] = useState(false);
    const [retrieveError, setRetrieveError] = useState<string | null>(null);
    const [downloadingReference, setDownloadingReference] = useState<string | null>(null);

    const handleTryAgain = async () => {
        try {
            await axios.post(`${API_URL}/lenco/public-diagnostics/report`, {
                walletId: wallet_id,
                errorType: errorInfo?.title || 'Unknown Error',
                errorCode: errorInfo?.code,
                logs: {
                    userAgent: navigator.userAgent,
                    url: window.location.href,
                    errorInfo,
                    // Network connection info if available
                    connection: (navigator as any).connection ? {
                        effectiveType: (navigator as any).connection.effectiveType,
                        downlink: (navigator as any).connection.downlink,
                        rtt: (navigator as any).connection.rtt
                    } : 'Not supported'
                }
            });
        } catch (e) {
            console.error('Failed to send diagnostics', e);
        }
        
        // Always try to load context regardless of diagnostic success
        loadContext();
    };

    // Fetch context on load (also re-runnable from the ERROR screen's Try Again).
    const loadContext = useCallback(async () => {
        setErrorInfo(null);
        setStep('LOADING');

        if (!wallet_id) {
            setErrorInfo({
                code: 'PL-INCOMPLETE-CAT',
                title: 'Incomplete link',
                message: 'This payment link looks incomplete, so the checkout can’t open.',
                tips: ['Make sure the entire link was copied, then try again.', 'Ask the business to resend the link.'],
                retry: false,
            });
            setStep('ERROR');
            return;
        }

        const startFetchTime = performance.now();
        console.log(`[Diagnostic] Starting public context fetch for wallet ${wallet_id} at ${new Date().toISOString()}`);
        posthog.capture('payment_link_opened', { wallet_id, link_type: 'catalog' });

        wasBackgroundedDuringFetchRef.current = false;
        const onVisibilityChange = () => {
            if (document.hidden) wasBackgroundedDuringFetchRef.current = true;
        };
        document.addEventListener('visibilitychange', onVisibilityChange);

        try {
            // 45s, not 30s: the API's Vercel function has a 30s maxDuration (see
            // apps/api/vercel.json), so a client timeout equal to that races the
            // server's own hard kill — whichever fires first, the user sees
            // "Connection timed out" even on requests that would've completed.
            // Giving the client real margin means the server error (if any) wins.
            const response = await axios.get<PublicContextResponse>(
                `${API_URL}/lenco/public-context/${wallet_id}`,
                { timeout: 45000 }
            );
            const duration = Math.round(performance.now() - startFetchTime);
            console.log(`[Diagnostic] Successfully fetched public context in ${duration}ms`);
            posthog.capture('payment_link_loaded', { wallet_id, link_type: 'catalog', duration_ms: duration });
            setOrg(response.data.organization);
            setWallet(response.data.wallet);
            setProducts(response.data.products);
            setCollectionsApiEnabled(response.data.collections_api_enabled === true);

            // Reached the server, but the business hasn't connected a payment provider.
            if (!response.data.wallet.lenco_subaccount_id) {
                setErrorInfo({
                    code: 'PL-NO-PROVIDER-CAT',
                    title: 'Payments not set up yet',
                    message: 'This business hasn’t finished connecting their payment provider, so checkout isn’t available yet.',
                    tips: ['Please let the business know so they can finish their payment setup.', 'You can try again once they’ve completed it.'],
                    retry: true,
                });
                setStep('ERROR');
                return;
            }

            // Preload catalogue images so they're already present when the page shows,
            // instead of popping in one by one. Wait on the first screenful (the org
            // logo + the first product images, ~capped) before revealing; warm the rest
            // in the background. A timeout cap means a slow image never hangs the reveal.
            const catalogImages = response.data.products
                .filter(p => p.product_type !== 'SERVICE_VARIABLE')
                .map(p => p.image_url);
            preloadImages(catalogImages.slice(6)); // background, not awaited
            preloadImages([response.data.organization.logo_url, ...catalogImages.slice(0, 6)], 3000);

            // Resume an in-flight payment if the customer reloaded mid-wait: a slow-but-
            // successful mobile money payment is tracked server-side by its reference, so
            // we pick that reference back up and keep watching instead of "losing" it.
            if (!resumedRef.current && response.data.collections_api_enabled) {
                const saved = loadPendingPayment(response.data.wallet.id);
                if (saved) {
                    resumedRef.current = true;
                    const elapsedAtResume = Math.max(0, Math.floor((Date.now() - saved.startedAt) / 1000));
                    setCurrentReference(saved.reference);
                    setCheckoutPhone(saved.phone);
                    setCustomerPhone(saved.phone);
                    setResumedPayment({ amount: saved.amount, phone: saved.phone });
                    setPaymentMethod('Mobile Money');
                    setVerificationStep('POLLING');
                    setAwaitingApproval(true);
                    setPaymentPhase('polling');
                    setElapsedSeconds(elapsedAtResume);
                    setStep('VERIFYING');
                    trackEvent('public_catalogue_checkout', 'resume', 'started', {
                        workflow_id: saved.reference,
                        organization_id: saved.orgId,
                        elapsed_seconds_at_resume: elapsedAtResume,
                    });
                    startCompletionPoll(saved.reference, saved.orgId, saved.startedAt);
                    return;
                }
            }

            // Don't drop a resumed payment back to the catalogue on a second run.
            if (!resumedRef.current) setStep('SHOP');
        } catch (err: any) {
            const duration = Math.round(performance.now() - startFetchTime);
            console.error(`[Diagnostic] Error fetching public pay context after ${duration}ms:`, err);
            const conn = (navigator as any).connection;
            const errorDiagnosis = diagnoseCheckoutError(err, {
                entryPoint: 'catalog',
                wasBackgrounded: wasBackgroundedDuringFetchRef.current,
                isOnline: navigator.onLine,
                connection: conn ? { effectiveType: conn.effectiveType, downlink: conn.downlink, rtt: conn.rtt } : null,
                userAgent: navigator.userAgent,
            });
            posthog.capture('payment_link_failed', {
                wallet_id,
                link_type: 'catalog',
                duration_ms: duration,
                error_type: errorDiagnosis.title,
                error_code: errorDiagnosis.code,
            });
            setErrorInfo(errorDiagnosis);
            setStep('ERROR');
        } finally {
            document.removeEventListener('visibilitychange', onVisibilityChange);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [wallet_id]);

    useEffect(() => {
        loadContext();
    }, [loadContext]);

    // Resolve the mobile money account holder's name as the customer types a valid
    // number — the same trust signal shown on the internal disbursement wizard. Also
    // doubles as our network-speed probe: its round-trip latency estimates how long
    // the upcoming status polling is likely to take.
    useEffect(() => {
        if (step !== 'CHECKOUT' || checkoutMethod !== 'mobile-money' || !wallet) return;
        const operator = detectOperator(checkoutPhone);
        if (!operator) {
            setResolvedAccountName('');
            setResolveFailed(false);
            return;
        }
        let cancelled = false;
        const timer = setTimeout(async () => {
            setResolvingAccountName(true);
            setResolveFailed(false);
            const startedAt = Date.now();
            try {
                const res = await axios.post(`${API_URL}/lenco/public-collection/resolve-momo`, {
                    phone: checkoutPhone, operator, walletId: wallet.id,
                });
                if (cancelled) return;
                setNetworkLatencyMs(Date.now() - startedAt);
                setResolvedAccountName(res.data?.accountName || '');
                if (!res.data?.accountName) setResolveFailed(true);
            } catch {
                if (cancelled) return;
                setNetworkLatencyMs(Date.now() - startedAt);
                setResolvedAccountName('');
                setResolveFailed(true);
            } finally {
                if (!cancelled) setResolvingAccountName(false);
            }
        }, 500);
        return () => { cancelled = true; clearTimeout(timer); };
    }, [checkoutPhone, checkoutMethod, step, wallet]);

    // Tick the elapsed-time counter while waiting for the customer to approve on their phone.
    useEffect(() => {
        if (!awaitingApproval) return;
        const interval = setInterval(() => setElapsedSeconds(s => s + 1), 1000);
        return () => clearInterval(interval);
    }, [awaitingApproval]);

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

    // Compact "12 Jul – 15 Jul" range label for a booking line.
    const formatStayRange = (checkIn: string, checkOut: string) => {
        const f = (s: string) => {
            const [y, m, d] = s.split('-').map(Number);
            return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });
        };
        return `${f(checkIn)} – ${f(checkOut)}`;
    };

    // Open the booking calendar for a product, loading its confirmed (blocked) dates.
    const openBookingCalendar = async (product: Product) => {
        setCalendarProduct(product);
        setCalendarAvailability([]);
        setCalendarLoading(true);
        try {
            const res = await axios.get(`${API_URL}/lenco/public-product-availability/${product.id}`);
            setCalendarAvailability(res.data?.bookings || []);
        } catch (err) {
            console.error('Failed to load availability:', err);
            setCalendarAvailability([]);
        } finally {
            setCalendarLoading(false);
        }
    };

    // Confirm a chosen stay → store the dates and set the line quantity to the nights.
    const handleConfirmBooking = (productId: string, checkIn: string, checkOut: string, nights: number) => {
        setBookingDates(prev => ({ ...prev, [productId]: { checkIn, checkOut, nights } }));
        setSelectedQuantities(prev => ({ ...prev, [productId]: nights }));
        setCalendarProduct(null);
    };

    // Remove a booking from the cart (clear its dates + quantity).
    const removeBooking = (productId: string) => {
        setSelectedQuantities(prev => ({ ...prev, [productId]: 0 }));
        setBookingDates(prev => {
            const next = { ...prev };
            delete next[productId];
            return next;
        });
    };

    // Variable-priced services are share-link only; never shown in the open catalog.
    const catalogProducts = products.filter(p => p.product_type !== 'SERVICE_VARIABLE');

    // Unified line items across fixed-price products and customer-priced donations.
    // Donations are included as soon as qty > 0 (amount entered in the cart, not the sheet).
    const lineItems = catalogProducts
        .map(p => {
            const isDonation = p.product_type === 'DONATION';
            const isBooking = isBookingProductType(p.product_type);
            // For bookings, the stored quantity is the number of nights/days.
            const quantity = selectedQuantities[p.id] || 0;
            const unitPrice = isDonation ? (donationAmounts[p.id] || 0) : p.price;
            const booking = isBooking ? bookingDates[p.id] : undefined;
            return { product: p, quantity, unitPrice, total: quantity * unitPrice, isDonation, isBooking, booking };
        })
        .filter(li => li.quantity > 0);

    const subtotal = lineItems.reduce((sum, li) => sum + li.total, 0);
    // Donation items in cart with no amount yet entered (amount = 0)
    const pendingDonations = lineItems.filter(li => li.isDonation && li.unitPrice === 0);

    // Digital products are delivered by email, so the buyer's email becomes required.
    const cartHasDigital = lineItems.some(li => li.product.product_type === 'DIGITAL');
    const emailIsValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail.trim());
    
    // MoneyWise platform fee (tiered) — additive markup paid by the customer on top
    // of the subtotal. The merchant settles the net subtotal; the fee is swept to
    // the MoneyWise settlement account after the collection succeeds.
    const processingFee = calculatePlatformFee(subtotal);

    const isSlowNetwork = networkLatencyMs !== null && networkLatencyMs > SLOW_LATENCY_MS;

    // The premium screen shows the USSD-approval prompt (confirm) briefly, then a
    // cosmetic "confirming" (polling) pass for the remainder of the wait — matching
    // the design handoff's own timing proportions.
    const displayPaymentPhase: PaymentPhase | null =
        paymentPhase === 'confirm' && elapsedSeconds >= 6 ? 'polling' : paymentPhase;

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
    // A booking counts as one item regardless of nights.
    const cartItemCount = lineItems.reduce((n, li) => n + (li.isBooking ? 1 : li.quantity), 0);

    // Active category position → drives the directional slide of the product list.
    const activeCategoryIndex = Math.max(0, productCategories.indexOf(activeCategory));

    // Own-UX flow: identity is derived on the Payment page from the mobile money
    // account (resolved holder name + the number that pays), so Pay only needs a
    // valid cart. Widget fallback still collects name/phone on the summary.
    const canPay = (collectionsApiEnabled
        ? true
        : customerName.trim().length > 0 && customerPhone.replace(/\D/g, '').length >= 9)
        // Digital carts additionally require a valid delivery email in both flows.
        && (!cartHasDigital || emailIsValid);

    // Full-screen "app" steps fill the viewport (fixed height) so inner content
    // scrolls and footers stay pinned; the simple states just center normally.
    const isAppStep = step === 'SHOP' || step === 'CATALOG' || step === 'DELIVERY' || step === 'SUMMARY' || step === 'CHECKOUT' || step === 'SUCCESS' || step === 'VERIFYING';

    // Whether any item in the cart requires physical delivery.
    const cartNeedsDelivery = lineItems.some(li => li.product.requires_delivery);
    // Whether the org allows external rider services (any product in cart with it set).
    const cartAllowsExternalDelivery = lineItems.some(li => li.product.allow_external_delivery);
    // Own delivery charge = first matching product's charge (if not using external riders).
    const ownDeliveryCharge = (() => {
        const p = lineItems.find(li => li.product.requires_delivery && !li.product.allow_external_delivery);
        return p ? (p.product.own_delivery_charge ?? 0) : 0;
    })();
    const riderDeliveryCharge = (() => {
        const r = RIDER_SERVICES.find(s => s.id === selectedRider);
        return r ? r.est_price : 0;
    })();
    const effectiveDeliveryCharge = deliveryMode === 'pickup' ? 0 :
        cartAllowsExternalDelivery ? riderDeliveryCharge : ownDeliveryCharge;
    const totalPayable = subtotal > 0 ? subtotal + processingFee + effectiveDeliveryCharge : 0;

    // Computed delivery details snapshot for the order.
    const deliveryDetails: DeliveryDetails | null = cartNeedsDelivery ? {
        mode: deliveryMode,
        country: deliveryCountry,
        state: deliveryState,
        street: deliveryStreet,
        apartment: deliveryApartment,
        rider_service: deliveryMode === 'deliver' && cartAllowsExternalDelivery ? selectedRider : null,
        rider_service_name: deliveryMode === 'deliver' && cartAllowsExternalDelivery
            ? (RIDER_SERVICES.find(s => s.id === selectedRider)?.name ?? null) : null,
        delivery_charge: effectiveDeliveryCharge,
    } : null;

    // Cart → Delivery (if needed) → Payment Summary.
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
        // Route through delivery step if any cart item needs it.
        if (cartNeedsDelivery) {
            setStep('DELIVERY');
        } else {
            setStep('SUMMARY');
        }
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
        if (cartHasDigital && !emailIsValid) {
            setError('Please enter a valid email — your digital file will be sent there.');
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

        const checkoutStartedAt = Date.now();
        trackEvent('public_catalogue_checkout', 'payment', 'started', {
            workflow_id: ref,
            organization_id: org.id,
            wallet_id: wallet.id,
            subtotal,
            total_payable: totalPayable,
            item_count: lineItems.length,
        });

        try {
            // Log intent on server publicly
            await axios.post(`${API_URL}/lenco/public-wallet-deposit-intent`, {
                reference: ref,
                purpose: `Sale: Products: ${productNarration} | Cust: ${customerPhone}`,
                amount: subtotal, // Settle the subtotal net amount in ledger
                walletId: wallet.id,
                customerName,
                customerPhone,
                customerEmail: cartHasDigital ? customerEmail.trim() : undefined,
                items: lineItems.map(li => ({
                    id: li.product.id,
                    quantity: li.quantity,
                    price: li.unitPrice,
                    // Booking lines carry their stay so the server can hold/confirm the dates.
                    ...(li.isBooking && li.booking
                        ? { check_in: li.booking.checkIn, check_out: li.booking.checkOut }
                        : {})
                })),
                orderDetails: deliveryDetails,
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
                    setAwaitingApproval(false);

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
                                trackEvent('public_catalogue_checkout', 'payment', 'succeeded', {
                                    workflow_id: ref,
                                    organization_id: org.id,
                                    wallet_id: wallet.id,
                                    subtotal,
                                    total_payable: totalPayable,
                                    receipt_number: verifyRes.data.referenceNumber,
                                    payment_method: paymentMethod,
                                    duration_ms: Date.now() - checkoutStartedAt,
                                });
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
                            trackVerificationTimeout('public_catalogue_checkout', {
                                workflow_id: ref,
                                organization_id: org.id,
                                attempts,
                                duration_ms: Date.now() - checkoutStartedAt,
                            });
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
            trackEvent('public_catalogue_checkout', 'payment', 'failed', {
                workflow_id: ref,
                organization_id: org.id,
                error_code: err?.response?.status || 'NETWORK_ERROR',
                error_message: err?.response?.data?.error || err.message,
                duration_ms: Date.now() - checkoutStartedAt,
            });
        }
    };

    // Phase 2: server-held long-poll replaces the 2 s client-side timer loop.
    // One request stays open for up to 22 s while the server polls Lenco at 1 s
    // intervals from Frankfurt (EU→EU).  On still-pending the client reconnects
    // immediately — max 8 reconnects ≈ ~3 min total ceiling.
    //
    // Phase 1: on verified:true the success screen flips immediately, then a
    // background POST to /public-collection-finalize runs ledger writes while the
    // payer reads the confirmation.  Receipt number is set when the finalize
    // response arrives.  On poll timeout the saved recovery record is kept so a
    // reload or "Check payment status" can still recover the payment.
    const startCompletionPoll = (ref: string, orgId: string, startedAt: number, analytics?: Record<string, any>) => {
        pollCancelledRef.current = false;
        let reconnects = 0;
        const maxReconnects = 8;
        console.log(`[Diagnostic] Starting long-poll for ref ${ref} at ${new Date(startedAt).toISOString()}`);

        const attemptLongPoll = async () => {
            if (pollCancelledRef.current) return;
            reconnects++;
            const attemptStart = performance.now();
            try {
                const res = await axios.get(
                    `${API_URL}/lenco/public-collection-longpoll/${ref}?organizationId=${orgId}`,
                    { timeout: 30_000 }
                );
                const attemptMs = Math.round(performance.now() - attemptStart);
                const elapsedMs = Date.now() - startedAt;
                console.log(`[Diagnostic] Long-poll attempt ${reconnects} (ref ${ref}): responded in ${attemptMs}ms — status=${res.data.status || (res.data.verified ? 'verified' : 'pending')}, elapsed=${elapsedMs}ms`);

                if (pollCancelledRef.current) return;

                if (res.data.verified) {
                    setVerificationStep('SUCCESS');
                    setAwaitingApproval(false);
                    setPaymentPhase('success');
                    clearPendingPayment();

                    const completedAt = res.data.completedAt ? new Date(res.data.completedAt).getTime() : null;
                    const initiatedAt = res.data.initiatedAt ? new Date(res.data.initiatedAt).getTime() : null;
                    const carrierMs = completedAt && initiatedAt ? completedAt - initiatedAt : null;
                    const pipelineMs = completedAt ? Date.now() - completedAt : null;
                    console.log(
                        `[Diagnostic] Payment CONFIRMED for ref ${ref} after ${elapsedMs}ms total (${reconnects} long-poll reconnects).` +
                        (carrierMs !== null ? ` Carrier latency: ${carrierMs}ms.` : '') +
                        (pipelineMs !== null ? ` Pipeline latency: ${pipelineMs}ms.` : '')
                    );
                    trackEvent('public_catalogue_checkout', 'payment', 'succeeded', {
                        workflow_id: ref, organization_id: orgId, ...(analytics || {}),
                        payment_method: 'Mobile Money', duration_ms: elapsedMs,
                        carrier_latency_ms: carrierMs, pipeline_latency_ms: pipelineMs,
                    });

                    if (res.data.referenceNumber) {
                        setReceiptNumber(res.data.referenceNumber);
                        return;
                    }

                    axios.post(`${API_URL}/lenco/public-collection-finalize/${ref}?organizationId=${orgId}`)
                        .then(fin => {
                            if (fin.data?.referenceNumber) setReceiptNumber(fin.data.referenceNumber);
                        })
                        .catch(err => console.error(`[Diagnostic] Background finalize error for ref ${ref}:`, err));
                    return;
                }

                if (res.data.status === 'failed') {
                    const elapsedMs = Date.now() - startedAt;
                    setVerificationStep('FAILED');
                    setVerificationReason(res.data.message || 'The payment was declined or not approved on your phone. You can go back and try again.');
                    setAwaitingApproval(false);
                    setFailureIsDeclined(true);
                    setPaymentPhase('failed');
                    clearPendingPayment();
                    console.log(`[Diagnostic] Payment FAILED for ref ${ref} after ${elapsedMs}ms (${reconnects} reconnects). Reason: ${res.data.reason || 'declined'}`);
                    trackEvent('public_catalogue_checkout', 'payment', 'failed', {
                        workflow_id: ref, organization_id: orgId, ...(analytics || {}),
                        payment_method: 'mobile-money',
                        error_code: res.data.reasonCode || 'declined',
                        error_message: res.data.reason || 'Customer declined or did not approve the mobile money prompt',
                        duration_ms: elapsedMs,
                    });
                    return;
                }

                // still-pending: reconnect immediately.
                if (!pollCancelledRef.current && reconnects < maxReconnects) {
                    console.log(`[Diagnostic] Long-poll still-pending for ref ${ref}, reconnecting (${reconnects}/${maxReconnects})`);
                    attemptLongPoll();
                } else {
                    const elapsedMs = Date.now() - startedAt;
                    setVerificationStep('FAILED');
                    setVerificationReason('This is taking longer than usual. If you approved the prompt, your payment may still be processing — check its status below.');
                    setAwaitingApproval(false);
                    setFailureIsDeclined(false);
                    setPaymentPhase('failed');
                    console.log(`[Diagnostic] Long-poll TIMED OUT for ref ${ref} after ${elapsedMs}ms (${reconnects} reconnects). Payment may still complete server-side.`);
                    // Keep the saved record so a reload / "Check payment status" can recover it.
                    trackVerificationTimeout('public_catalogue_checkout', { workflow_id: ref, organization_id: orgId, attempts: reconnects, duration_ms: elapsedMs });
                }

            } catch (err) {
                const elapsedMs = Date.now() - startedAt;
                console.error(`[Diagnostic] Long-poll attempt ${reconnects} network error for ref ${ref} (${elapsedMs}ms elapsed):`, err);
                if (!pollCancelledRef.current && reconnects < maxReconnects) {
                    setTimeout(attemptLongPoll, 2000);
                } else {
                    setVerificationStep('FAILED');
                    setVerificationReason('This is taking longer than usual. If you approved the prompt, your payment may still be processing — check its status below.');
                    setAwaitingApproval(false);
                    setFailureIsDeclined(false);
                    setPaymentPhase('failed');
                    console.log(`[Diagnostic] Long-poll gave up for ref ${ref} after network errors (${reconnects} attempts).`);
                    trackVerificationTimeout('public_catalogue_checkout', { workflow_id: ref, organization_id: orgId, attempts: reconnects, duration_ms: elapsedMs });
                }
            }
        };

        attemptLongPoll();
    };

    // Own-UX mobile money checkout: initiate the collection server-side, then poll
    // the same verify-status endpoint the widget path used. The customer approves on
    // their phone — no widget, no redirect — so closing/reloading this page can't lose
    // the payment (the reference is server-tracked from the moment it's initiated).
    const handlePayMobileMoney = async () => {
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
        const operator = detectOperator(checkoutPhone);
        if (!operator) {
            setError('Please enter a valid Zambian mobile money number (Airtel, MTN, or Zamtel).');
            return;
        }
        if (!wallet || !org) return;

        // Identity comes from the paying mobile money account itself: the resolved
        // account-holder name + the number the prompt is sent to. Stored into the
        // shared customer state so the receipt/success screens keep working.
        const payerName = resolvedAccountName || 'Mobile Money Customer';
        const payerPhone = checkoutPhone;
        setCustomerName(payerName);
        setCustomerPhone(payerPhone);

        const productNarration = lineItems
            .map(li => `${li.product.name} (x${li.quantity})`)
            .join(', ');
        const ref = `DEP-${Date.now()}-${wallet.lenco_subaccount_id!.substring(0, 8)}-PUB`;
        setCurrentReference(ref);
        setError(null);
        setSubmitting(true);
        setPaymentMethod('Mobile Money');
        pollCancelledRef.current = false;
        // Enter the premium processing screen at the "initiating" phase while the
        // intent + collection calls run.
        setElapsedSeconds(0);
        setAwaitingApproval(false);
        setPaymentPhase('initiating');
        setStep('VERIFYING');

        const checkoutStartedAt = Date.now();
        trackEvent('public_catalogue_checkout', 'payment', 'started', {
            workflow_id: ref,
            organization_id: org.id,
            wallet_id: wallet.id,
            subtotal,
            total_payable: totalPayable,
            item_count: lineItems.length,
            payment_method: 'mobile-money',
        });

        try {
            // 1. Log the PENDING intent (net subtotal) — same as the widget flow.
            await axios.post(`${API_URL}/lenco/public-wallet-deposit-intent`, {
                reference: ref,
                purpose: `Sale: Products: ${productNarration} | Cust: ${payerPhone}`,
                amount: subtotal,
                walletId: wallet.id,
                customerName: payerName,
                customerPhone: payerPhone,
                customerEmail: cartHasDigital ? customerEmail.trim() : undefined,
                items: lineItems.map(li => ({
                    id: li.product.id,
                    quantity: li.quantity,
                    price: li.unitPrice,
                    ...(li.isBooking && li.booking
                        ? { check_in: li.booking.checkIn, check_out: li.booking.checkOut }
                        : {})
                })),
                orderDetails: deliveryDetails,
            });

            // 2. Initiate the collection server-side (gross = subtotal + platform fee).
            const initRes = await axios.post(`${API_URL}/lenco/public-collection/mobile-money`, {
                reference: ref,
                amount: totalPayable,
                phone: checkoutPhone,
                operator,
                walletId: wallet.id,
            });

            const status = initRes.data?.data?.status;
            if (status !== 'pay-offline' && status !== 'pending' && status !== 'successful') {
                throw new Error(`Payment could not be started (status: ${status || 'unknown'}). Please try again.`);
            }

            // 3. Prompt dispatched — persist a recovery record (so a reload can resume),
            // move to the "confirm" phase and poll verify-status via the shared poller.
            savePendingPayment({
                reference: ref,
                contextId: wallet.id,
                orgId: org.id,
                phone: payerPhone,
                amount: totalPayable,
                businessName: org.name,
                startedAt: checkoutStartedAt,
            });
            setResumedPayment(null);
            setRecheckNote(null);
            setVerificationStep('POLLING');
            setPaymentPhase('confirm');
            setAwaitingApproval(true);
            setElapsedSeconds(0);
            setSubmitting(false);

            startCompletionPoll(ref, org.id, checkoutStartedAt, {
                wallet_id: wallet.id,
                subtotal,
                total_payable: totalPayable,
            });
        } catch (err: any) {
            console.error('Failed to initiate mobile money checkout:', err);
            clearPendingPayment();
            setSubmitting(false);
            setAwaitingApproval(false);
            setPaymentPhase(null);
            setStep('CHECKOUT');
            setError(err.response?.data?.error || err.message || 'Failed to start the payment. Please try again.');
            trackEvent('public_catalogue_checkout', 'payment', 'failed', {
                workflow_id: ref,
                organization_id: org.id,
                error_code: err?.response?.status || 'NETWORK_ERROR',
                error_message: err?.response?.data?.error || err.message,
                payment_method: 'mobile-money',
                duration_ms: Date.now() - checkoutStartedAt,
            });
        }
    };

    // Customer-initiated "stop waiting" on a pending mobile money attempt. This only
    // stops OUR polling and returns them to the checkout form — Lenco has no API to
    // cancel a mobile money prompt already sent to the telco, so if they approve it
    // anyway after "cancelling" here, the webhook still finalizes it correctly (we
    // deliberately do NOT delete the PENDING intent server-side; see the /cancel
    // endpoint's comment for why that used to lose product-level bookkeeping).
    const handleCancelPayment = async () => {
        setCancelling(true);
        pollCancelledRef.current = true;
        trackEvent('public_catalogue_checkout', 'cancel', 'started', {
            workflow_id: currentReference,
            organization_id: org?.id || 'unknown',
            payment_method: 'mobile-money',
        });
        try {
            await axios.post(`${API_URL}/lenco/public-collection/cancel`, { reference: currentReference });
        } catch (err) {
            console.error('Failed to cancel payment intent:', err);
        } finally {
            setCancelling(false);
            setAwaitingApproval(false);
            setElapsedSeconds(0);
            setRecheckNote(null);
            // Show a "Payment stopped" state that sets expectations about the lingering
            // prompt (Lenco can't recall it) instead of silently bouncing to the form.
            // The saved recovery record is kept so "Check payment status" / a reload can
            // still catch it if the customer approves the prompt anyway.
            setPaymentPhase('cancelled');
            trackEvent('public_catalogue_checkout', 'cancel', 'succeeded', {
                workflow_id: currentReference,
                organization_id: org?.id || 'unknown',
                payment_method: 'mobile-money',
            });
        }
    };

    // Re-query whether the collection actually went through (used on the failed and
    // cancelled screens). Recovers a slow-but-successful payment and, crucially,
    // prevents a double-charge if the customer approved the prompt after cancelling.
    const handleRecheckPayment = async () => {
        if (!org || !currentReference) return;
        setRechecking(true);
        setRecheckNote(null);
        const startedAt = Date.now();
        trackEvent('public_catalogue_checkout', 'recheck', 'started', {
            workflow_id: currentReference,
            organization_id: org.id,
            from_phase: paymentPhase || 'unknown',
        });
        try {
            const verifyRes = await axios.get(
                `${API_URL}/lenco/public-verify-status/${currentReference}?organizationId=${org.id}`
            );
            let outcome: 'verified' | 'declined' | 'pending' = 'pending';
            if (verifyRes.data.verified) {
                outcome = 'verified';
                setReceiptNumber(verifyRes.data.referenceNumber || null);
                setAwaitingApproval(false);
                setPaymentPhase('success');
                clearPendingPayment();
            } else if (verifyRes.data.status === 'failed') {
                outcome = 'declined';
                setRecheckNote(verifyRes.data.message || 'This payment was declined — nothing has been charged. You can try again.');
                clearPendingPayment();
            } else {
                setRecheckNote('Not confirmed yet. If you just approved it, wait a few seconds and check again.');
            }
            trackEvent('public_catalogue_checkout', 'recheck', 'succeeded', {
                workflow_id: currentReference,
                organization_id: org.id,
                from_phase: paymentPhase || 'unknown',
                recheck_outcome: outcome,
                duration_ms: Date.now() - startedAt,
            });
        } catch (err) {
            console.error('Recheck failed:', err);
            setRecheckNote('Couldn’t check right now — please try again in a moment.');
            trackEvent('public_catalogue_checkout', 'recheck', 'failed', {
                workflow_id: currentReference,
                organization_id: org.id,
                from_phase: paymentPhase || 'unknown',
                duration_ms: Date.now() - startedAt,
            });
        } finally {
            setRechecking(false);
        }
    };

    // Success "View receipt" → the existing full receipt screen.
    const handleViewReceipt = () => {
        setPaymentPhase(null);
        setResumedPayment(null);
        setStep('SUCCESS');
    };

    // Failed "Try again" → back to the payment form with a fresh attempt.
    const handleRetryPayment = () => {
        pollCancelledRef.current = true;
        clearPendingPayment();
        setPaymentPhase(null);
        setResumedPayment(null);
        setRecheckNote(null);
        setVerificationStep('POLLING');
        setError(null);
        setStep('CHECKOUT');
    };

    // Failed "Cancel" / cancelled "Back to cart" → leave the flow back to the cart.
    const handleDismissFailed = () => {
        pollCancelledRef.current = true;
        clearPendingPayment();
        setPaymentPhase(null);
        setResumedPayment(null);
        setRecheckNote(null);
        setVerificationStep('POLLING');
        setError(null);
        setStep('CATALOG');
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

    // Use browser Geolocation to pre-fill address fields.
    const handleUseCurrentLocation = async () => {
        // Cancel any previous watch still running.
        if (locationWatchRef.current !== null) {
            navigator.geolocation?.clearWatch(locationWatchRef.current);
            locationWatchRef.current = null;
        }

        setLocating(true);
        setLocationError(null);

        // Strategy: IP geolocation first (no permissions, no GPS, works everywhere),
        // then attempt browser geolocation for a finer street-level fix if available.
        // IP geo reliably fills country + state; street address is always manual.
        try {
            // ipapi.co — free, HTTPS, no API key required, ~30k req/month.
            const res = await fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(8000) });
            if (res.ok) {
                const data = await res.json();
                if (data.country_name) setDeliveryCountry(data.country_name);
                if (data.region)       setDeliveryState(data.region);
                // Street address can't come from IP geo — leave for manual entry.
                setLocating(false);

                // If the browser also supports geolocation, attempt a background
                // Nominatim reverse-geocode for the street. We don't block on it —
                // the address fields are already partially filled and useful.
                if (navigator.geolocation) {
                    const abortTimeout = setTimeout(() => {
                        if (locationWatchRef.current !== null) {
                            navigator.geolocation.clearWatch(locationWatchRef.current);
                            locationWatchRef.current = null;
                        }
                    }, 15000);

                    locationWatchRef.current = navigator.geolocation.watchPosition(
                        async (pos) => {
                            clearTimeout(abortTimeout);
                            if (locationWatchRef.current !== null) {
                                navigator.geolocation.clearWatch(locationWatchRef.current);
                                locationWatchRef.current = null;
                            }
                            try {
                                const { latitude, longitude } = pos.coords;
                                const nr = await fetch(
                                    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`,
                                    { headers: { 'Accept-Language': 'en' }, signal: AbortSignal.timeout(8000) }
                                );
                                if (nr.ok) {
                                    const addr = (await nr.json()).address || {};
                                    if (addr.country)  setDeliveryCountry(addr.country);
                                    if (addr.state || addr.county || addr.city)
                                        setDeliveryState(addr.state || addr.county || addr.city);
                                    const road = [addr.road, addr.suburb, addr.neighbourhood, addr.quarter]
                                        .filter(Boolean).join(', ');
                                    if (road) setDeliveryStreet(road);
                                    if (addr.house_number) setDeliveryApartment(addr.house_number);
                                }
                            } catch { /* background enhancement — silent */ }
                        },
                        () => {
                            clearTimeout(abortTimeout);
                            if (locationWatchRef.current !== null) {
                                navigator.geolocation.clearWatch(locationWatchRef.current);
                                locationWatchRef.current = null;
                            }
                        },
                        { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 }
                    );
                }
                return;
            }
        } catch { /* fall through to error state */ }

        setLocating(false);
        setLocationError('Could not detect your location. Please fill in the address manually.');
    };

    const handleReset = () => {
        setSelectedQuantities({});
        setDonationAmounts({});
        setBookingDates({});
        setReceiptNumber(null);
        setLastTransactionId(null);
        setConfirmManualError(null);
        setIsConfirmingManual(false);
        setAwaitingApproval(false);
        setPaymentPhase(null);
        setElapsedSeconds(0);
        setResolvedAccountName('');
        setResolveFailed(false);
        setDeliveryMode('deliver');
        setDeliveryCountry('Zambia');
        setDeliveryState('');
        setDeliveryStreet('');
        setDeliveryApartment('');
        setSelectedRider(RIDER_SERVICES[0].id);
        setRiderDropdownOpen(false);
        setLocationError(null);
        if (locationWatchRef.current !== null) {
            navigator.geolocation.clearWatch(locationWatchRef.current);
            locationWatchRef.current = null;
        }
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

        posthog.capture('receipt_downloaded', {
            wallet_id: wallet.id,
            organization_name: org.name,
            receipt_number: receiptNumber,
            total_payable: totalPayable,
        });

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
        const isBooking = isBookingProductType(product.product_type);
        const bookingUnit = getBookingTerminology(product.product_type).unit;
        const qty = selectedQuantities[product.id] || 0;
        const isInCart = qty > 0;
        const stay = bookingDates[product.id];

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
                        <span className="text-[#55595E] text-base font-semibold truncate leading-snug">{product.name}</span>
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
                                        K{product.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}{isBooking ? ` / ${bookingUnit}` : ''}
                                    </span>
                                    {!isBooking && product.description && (
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

                    {/* Booking → show the chosen stay instead of a qty stepper */}
                    {isBooking && isInCart && stay && (
                        <button
                            onClick={() => openBookingCalendar(product)}
                            className="inline-flex items-center gap-1.5 self-start px-3 py-1.5 bg-teal-50 text-teal-700 rounded-full text-[11px] font-bold hover:bg-teal-100 transition-colors"
                        >
                            <CalendarDays size={12} />
                            {formatStayRange(stay.checkIn, stay.checkOut)} · {stay.nights} {bookingUnit}{stay.nights === 1 ? '' : 's'}
                        </button>
                    )}

                    {/* Qty stepper — zinc pill, only for fixed-price products */}
                    {!isDonation && !isBooking && (
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
                            // Fire the pop + pulse the instant the button is pressed (add only; not bookings).
                            if (!isInCart && !isBooking) {
                                setPoppedId(product.id);
                                setTimeout(() => setPoppedId(cur => (cur === product.id ? null : cur)), 600);
                            }
                        }}
                        onClick={() => {
                            if (isBooking) {
                                if (isInCart) removeBooking(product.id);
                                else openBookingCalendar(product);
                                return;
                            }
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
                        title={isInCart ? (isBooking ? 'Remove booking' : 'Remove from cart') : (isBooking ? 'Choose dates' : 'Add to cart')}
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
                        ) : isBooking ? (
                            <CalendarDays size={13} />
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
        const isBooking = isBookingProductType(product.product_type);
        const bookingUnit = getBookingTerminology(product.product_type).unit;
        const qty = selectedQuantities[product.id] || 0;
        const isInCart = qty > 0;
        const stay = bookingDates[product.id];

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
                        <img src={product.image_url} alt={product.name} loading="lazy" className="w-full h-full object-cover" />
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
                        <span className="text-[#55595E] text-[11px] truncate">{product.name}</span>
                        <span className="text-slate-900 text-sm font-bold">
                            {isDonation
                                ? 'Open amount'
                                : isBooking
                                    ? `K ${product.price.toLocaleString(undefined, { minimumFractionDigits: 2 })} / ${bookingUnit}`
                                    : `K ${product.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                        </span>
                        {isBooking && isInCart && stay && (
                            <span className="text-[10px] font-semibold text-teal-700 truncate">
                                {formatStayRange(stay.checkIn, stay.checkOut)} · {stay.nights} {bookingUnit}{stay.nights === 1 ? '' : 's'}
                            </span>
                        )}
                    </div>

                    {isBooking ? (
                        // Booking → open the date calendar (no instant add / pop).
                        <button
                            onClick={() => openBookingCalendar(product)}
                            className={`w-full py-2.5 rounded-lg border text-[11px] font-medium flex items-center justify-center gap-1.5 transition-colors active:scale-95 ${
                                isInCart
                                    ? 'bg-black border-black text-white'
                                    : 'border-[#55595E] text-black hover:bg-black hover:text-white'
                            }`}
                        >
                            {isInCart ? <Check size={13} strokeWidth={2.5} /> : <CalendarDays size={13} />}
                            <span>{isInCart ? 'Reserved · Edit' : 'Reserve'}</span>
                        </button>
                    ) : (
                        // Action area — pulse flash + pop persist across the button↔stepper swap
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
                                                : 'border-[#55595E] text-black hover:bg-black hover:text-white'
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
                    )}
                </div>
            </div>
        );
    };

    // Helper to render Organization Logo / Initial
    const renderLogo = (sizeClass = "w-20 h-20", textClass = "text-3xl") => {
        if (!org) return null;
        if (org.logo_url) {
            return (
                <div className={`${sizeClass} rounded-2xl overflow-hidden bg-white flex-shrink-0 animate-in fade-in zoom-in duration-300`}>
                    <img src={org.logo_url} alt={`${org.name} Logo`} className="w-full h-full object-cover" />
                </div>
            );
        }
        return (
            <div className={`${sizeClass} rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white font-black ${textClass} uppercase flex-shrink-0`}>
                {org.name.charAt(0)}
            </div>
        );
    };

    // Full-width desktop shop: logo/name top-left, search below, then products
    // (2/3) + a sticky cart panel (1/3), e-commerce style. Checkout → SUMMARY.
    const renderDesktopShop = () => {
        if (!org) return null;
        return (
            <div className="min-h-screen bg-white">
                <div className="max-w-7xl mx-auto px-8 py-8">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-6">
                        <div className="flex items-center gap-4">
                            {renderLogo('w-14 h-14', 'text-xl')}
                            <div className="flex flex-col">
                                <div className="flex items-center gap-1.5">
                                    <h4 className="text-lg font-black text-slate-900 uppercase tracking-tight">{org.name}</h4>
                                    <BadgeCheck className="w-5 h-5 text-white flex-shrink-0" fill="#2563eb" />
                                </div>
                                <p className="text-xs font-thin text-[#5A5A5A]">Payment Checkout Portal</p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => setShowRetrievePortal(true)}
                            className="mt-2 text-[11px] font-bold text-slate-400 hover:text-blue-600 transition-colors uppercase tracking-wider flex-shrink-0"
                        >
                            Already Paid? Find your receipt
                        </button>
                    </div>

                    {/* Search */}
                    <div className="mt-6 max-w-md">
                        <div className="relative">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[#55595E]" size={16} />
                            <input
                                type="text"
                                value={productSearch}
                                onChange={(e) => setProductSearch(e.target.value)}
                                aria-label="Search products"
                                className="w-full pl-11 pr-4 py-3.5 bg-[#F5F5F5] rounded-full text-sm font-medium text-[#5A5A5A] outline-none focus:ring-2 focus:ring-slate-200 transition-all"
                            />
                        </div>
                    </div>

                    {/* Two columns: products (2/3) + cart (1/3) */}
                    <div className="mt-7 grid grid-cols-3 gap-8 items-start">
                        {/* Products */}
                        <div className="col-span-2">
                            {productCategories.length > 1 && (
                                <div className="mb-6 max-w-md">
                                    <SegmentedControl
                                        variant="capsule"
                                        trackBgClassName="bg-[#F5F5F5]"
                                        inactiveTextClassName="text-black"
                                        options={productCategories.map(cat => ({ value: cat, label: cat }))}
                                        value={activeCategory}
                                        onChange={setActiveCategory}
                                    />
                                </div>
                            )}
                            {sheetProducts.length === 0 ? (
                                <div className="text-center py-24">
                                    <ShoppingCart className="mx-auto text-slate-200 mb-2" size={40} />
                                    <p className="text-sm font-semibold text-slate-400">
                                        {catalogProducts.length === 0 ? 'No products configured yet.' : 'No matching products.'}
                                    </p>
                                </div>
                            ) : (
                                <AnimatedTabContent
                                    tabKey={activeCategory}
                                    index={activeCategoryIndex}
                                    className="grid grid-cols-3 gap-x-5 gap-y-8"
                                >
                                    {sheetProducts.map(product => renderGridCard(product))}
                                </AnimatedTabContent>
                            )}
                        </div>

                        {/* Cart — sticky sidebar, same design as the mobile cart */}
                        <div className="col-span-1 sticky top-8 flex flex-col">
                            {/* Invisible spacer matching the category-tabs block on the left, so
                                "Cart Total" lines up with the top of the product images, not the tabs. */}
                            {productCategories.length > 1 && (
                                <div className="mb-6 invisible" aria-hidden="true">
                                    <SegmentedControl
                                        variant="capsule"
                                        trackBgClassName="bg-[#F5F5F5]"
                                        inactiveTextClassName="text-black"
                                        options={productCategories.map(cat => ({ value: cat, label: cat }))}
                                        value={activeCategory}
                                        onChange={() => {}}
                                    />
                                </div>
                            )}
                            {/* Fixed, viewport-relative height (not content-driven) so the panel
                                always spans down to near the bottom of the screen, empty or full. */}
                            <div
                                ref={cartPanelRef}
                                className="rounded-3xl border border-slate-200 overflow-hidden flex flex-col"
                                style={{ height: cartPanelHeight != null ? `${cartPanelHeight}px` : 'calc(100vh - 4rem)' }}
                            >
                                <div className="px-6 py-5 bg-slate-50 flex-shrink-0">
                                    <p className="text-xs font-normal text-slate-500">Cart Total</p>
                                    <p className="text-3xl font-extrabold text-slate-900 mt-1 tracking-tight">
                                        K{subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </p>
                                </div>
                                <div className="flex-1 overflow-y-auto p-5">
                                    {lineItems.length === 0 ? (
                                        <div className="h-full flex items-center justify-center text-center">
                                            <p className="text-xs font-thin text-[#5A5A5A] leading-relaxed">
                                                Items you add will appear here.
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="space-y-5">
                                            {lineItems.map(li => renderProductCard(li.product))}
                                        </div>
                                    )}
                                </div>
                                <div className="p-5 border-t border-slate-100 space-y-3 flex-shrink-0">
                                    {error && (
                                        <div className="p-3.5 bg-rose-50 text-rose-600 rounded-xl flex items-start space-x-2">
                                            <AlertCircle className="flex-shrink-0 mt-0.5" size={14} />
                                            <span className="text-[10px] font-semibold leading-normal">{error}</span>
                                        </div>
                                    )}
                                    <button
                                        onClick={handleProceedToSummary}
                                        disabled={subtotal <= 0}
                                        className="w-full bg-black hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed text-white py-4 rounded-2xl font-bold text-xs tracking-wide transition-all flex items-center justify-center gap-1.5"
                                    >
                                        <span>Checkout</span>
                                        <ChevronRight size={14} strokeWidth={2.5} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    // Desktop merges the catalogue + cart into one screen; the retrieve portal and
    // SUMMARY/SUCCESS still use the centered card layout.
    const isDesktopShop = isDesktop && (step === 'SHOP' || step === 'CATALOG') && !showRetrievePortal;

    useEffect(() => {
        if (!isDesktopShop) return;
        const BOTTOM_MARGIN = 32;
        const MIN_HEIGHT = 360;
        const measure = () => {
            const top = cartPanelRef.current?.getBoundingClientRect().top;
            if (top == null) return;
            setCartPanelHeight(Math.max(MIN_HEIGHT, window.innerHeight - top - BOTTOM_MARGIN));
        };
        measure();
        window.addEventListener('resize', measure);
        // Re-measure shortly after mount/update — images, fonts, or the category
        // tabs appearing can still shift the panel's top offset after first paint.
        const t = window.setTimeout(measure, 250);
        return () => { window.removeEventListener('resize', measure); window.clearTimeout(t); };
    }, [isDesktopShop, productCategories.length, sheetProducts.length, org?.logo_url]);

    return (
        <>
        {isDesktopShop && renderDesktopShop()}
        {!isDesktopShop && (
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
                    <div className="flex flex-col flex-1 min-h-0 sm:min-h-[min(620px,80vh)]">
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
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[#55595E]" size={16} />
                                <input
                                    type="text"
                                    value={productSearch}
                                    onChange={(e) => setProductSearch(e.target.value)}
                                    aria-label="Search products"
                                    className="w-full pl-11 pr-4 py-3.5 bg-[#F5F5F5] rounded-full text-sm font-medium text-[#5A5A5A] outline-none focus:ring-2 focus:ring-slate-200 transition-all"
                                />
                            </div>
                        </div>

                        {/* Category tabs — animated segmented control */}
                        {productCategories.length > 1 && (
                            <div className="px-4 pt-4 flex-shrink-0">
                                <SegmentedControl
                                    variant="capsule"
                                    trackBgClassName="bg-[#F5F5F5]"
                                    inactiveTextClassName="text-black"
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

                        {/* Subtotal + Go to Cart (pinned) — only once something's in the cart */}
                        <div className="mt-auto bg-white border-t border-slate-100 px-6 pt-4 pb-5 space-y-3 flex-shrink-0">
                            {cartItemCount > 0 && (
                                <>
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
                                        onClick={() => {
                                            setError(null);
                                            posthog.capture('checkout_initiated', {
                                                wallet_id,
                                                organization_name: org?.name,
                                                item_count: cartItemCount,
                                                subtotal,
                                            });
                                            setStep('CATALOG');
                                        }}
                                        className="w-full bg-black hover:bg-slate-800 text-white py-4 rounded-xl font-medium text-sm transition-all flex items-center justify-center gap-2.5"
                                    >
                                        <ShoppingBag size={18} />
                                        <span>Go to Cart</span>
                                        <ArrowRight size={18} strokeWidth={2.5} />
                                    </button>
                                </>
                            )}
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
                        className="flex flex-col flex-1 min-h-0 sm:min-h-[min(620px,80vh)]"
                        style={{ animation: 'atabs-in-right 0.42s cubic-bezier(0.22, 1, 0.36, 1)' }}
                    >
                        {/* Header */}
                        <div className="px-6 pt-[34px] pb-4 flex items-center gap-6 flex-shrink-0">
                            {renderLogo("w-14 h-14", "text-xl")}
                            <div className="flex flex-col min-w-0 gap-1">
                                <div className="flex items-center gap-2">
                                    <h4 className="text-base font-bold text-black uppercase tracking-tight truncate">{org.name}</h4>
                                    <BadgeCheck className="w-5 h-5 text-white flex-shrink-0" fill="#2563eb" />
                                </div>
                                <p className="text-xs font-normal text-black">Payment Checkout Portal</p>
                            </div>
                        </div>

                        {/* "Your Cart" title row */}
                        <div className="border-t border-neutral-200 px-7 py-3 flex-shrink-0">
                            <h2 className="text-xl font-semibold text-black">Your Cart</h2>
                        </div>

                        {/* Cart items */}
                        <div className="flex-1 min-h-0 overflow-y-auto px-7 pt-4 pb-2">
                            {lineItems.length === 0 ? (
                                <div className="flex items-center justify-center py-16">
                                    <p className="text-center text-xs font-thin text-[#5A5A5A] leading-relaxed">
                                        Items will appear in your cart when you<br />Add Products and Services
                                    </p>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-4">
                                    {lineItems.map((li) => {
                                        const product = li.product;
                                        const isDonation = product.product_type === 'DONATION';
                                        const isBooking = isBookingProductType(product.product_type);
                                        const bookingUnit = getBookingTerminology(product.product_type).unit;
                                        const qty = selectedQuantities[product.id] || 0;
                                        const isInCart = qty > 0;
                                        const stay = bookingDates[product.id];
                                        return (
                                            <div key={product.id} className="flex flex-col gap-4">
                                                <div className="flex items-center gap-7">
                                                    {/* Image */}
                                                    <div className="w-20 h-20 rounded-xl overflow-hidden bg-neutral-100 flex-shrink-0 flex items-center justify-center">
                                                        {product.image_url ? (
                                                            <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                                                        ) : (
                                                            <ShoppingBag size={24} className="text-neutral-300" />
                                                        )}
                                                    </div>

                                                    {/* Name + price */}
                                                    <div className="flex-1 flex flex-col gap-1 min-w-0">
                                                        <span className="text-xs font-medium text-neutral-800 leading-snug line-clamp-2">{product.name}</span>
                                                        {isDonation ? (
                                                            isInCart ? (
                                                                <div className="relative w-28">
                                                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">K</span>
                                                                    <input
                                                                        type="number" min="0" step="0.01"
                                                                        value={donationAmounts[product.id] ?? ''}
                                                                        onChange={(e) => {
                                                                            const val = Math.max(0, Number(e.target.value) || 0);
                                                                            setDonationAmounts(prev => ({ ...prev, [product.id]: val }));
                                                                        }}
                                                                        placeholder="0.00"
                                                                        className="w-full pl-6 pr-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-blue-200 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                                    />
                                                                </div>
                                                            ) : (
                                                                <span className="text-xs font-normal text-neutral-700">Open amount</span>
                                                            )
                                                        ) : (
                                                            <span className="text-xs font-normal text-neutral-700">
                                                                K {product.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}{isBooking ? ` / ${bookingUnit}` : ''}
                                                            </span>
                                                        )}
                                                        {/* Booking stay pill */}
                                                        {isBooking && isInCart && stay && (
                                                            <button
                                                                onClick={() => openBookingCalendar(product)}
                                                                className="inline-flex items-center gap-1.5 self-start px-3 py-1.5 bg-teal-50 text-teal-700 rounded-full text-[11px] font-bold hover:bg-teal-100 transition-colors mt-1"
                                                            >
                                                                <CalendarDays size={12} />
                                                                {formatStayRange(stay.checkIn, stay.checkOut)} · {stay.nights} {bookingUnit}{stay.nights === 1 ? '' : 's'}
                                                            </button>
                                                        )}
                                                    </div>

                                                    {/* Stepper / add button */}
                                                    {!isDonation && !isBooking ? (
                                                        <div className="bg-white rounded-[60px] outline outline-1 outline-offset-[-1px] outline-zinc-200 flex items-center overflow-hidden flex-shrink-0">
                                                            <button
                                                                onClick={() => handleQuantityChange(product.id, -1)}
                                                                className="w-7 h-7 flex items-center justify-center text-zinc-800 hover:text-zinc-900 transition-colors"
                                                            >
                                                                <Minus size={10} strokeWidth={2} />
                                                            </button>
                                                            <input
                                                                type="number" min="0"
                                                                value={qty}
                                                                onChange={(e) => handleQuantitySet(product.id, e.target.value)}
                                                                onFocus={(e) => e.target.select()}
                                                                className="w-7 h-7 text-center text-xs font-bold text-zinc-800 bg-transparent outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                            />
                                                            <button
                                                                onClick={() => handleQuantityChange(product.id, 1)}
                                                                className="w-7 h-7 flex items-center justify-center text-zinc-800 hover:text-zinc-900 transition-colors"
                                                            >
                                                                <Plus size={10} strokeWidth={2} />
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        /* Booking / Donation — keep the existing add/remove button */
                                                        <span className="relative inline-flex flex-shrink-0">
                                                            {poppedId === product.id && (
                                                                <span aria-hidden className="absolute inset-0 rounded-full bg-blue-500/50 pointer-events-none" style={{ animation: 'mw-pulse-ring 0.6s ease-out forwards' }} />
                                                            )}
                                                            <button
                                                                onPointerDown={() => {
                                                                    if (!isInCart && !isBooking) {
                                                                        setPoppedId(product.id);
                                                                        setTimeout(() => setPoppedId(cur => (cur === product.id ? null : cur)), 600);
                                                                    }
                                                                }}
                                                                onClick={() => {
                                                                    if (isBooking) {
                                                                        if (isInCart) removeBooking(product.id);
                                                                        else openBookingCalendar(product);
                                                                        return;
                                                                    }
                                                                    if (isInCart) {
                                                                        setSelectedQuantities(prev => ({ ...prev, [product.id]: 0 }));
                                                                        if (isDonation) setDonationAmounts(prev => ({ ...prev, [product.id]: 0 }));
                                                                    } else if (isDonation) {
                                                                        setSelectedQuantities(prev => ({ ...prev, [product.id]: 1 }));
                                                                    }
                                                                }}
                                                                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all active:scale-90 ${isInCart ? 'bg-blue-600 text-white' : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'}`}
                                                            >
                                                                {isInCart ? <Check size={14} strokeWidth={2.5} /> : <Plus size={14} strokeWidth={2} />}
                                                            </button>
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Divider */}
                                                <div className="h-px bg-neutral-200" />
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Sticky footer */}
                        <div className="flex-shrink-0 border-t border-neutral-300 p-6 space-y-4">
                            {error && (
                                <div className="p-3.5 bg-rose-50 text-rose-600 rounded-xl flex items-start space-x-2 animate-in fade-in duration-200">
                                    <AlertCircle className="flex-shrink-0 mt-0.5" size={14} />
                                    <span className="text-[10px] font-semibold leading-normal">{error}</span>
                                </div>
                            )}

                            {/* Cart total row */}
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-bold text-zinc-600">Cart Total</span>
                                <span className="text-sm font-bold text-zinc-600">
                                    K{subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </span>
                            </div>

                            {/* Add Products/Services */}
                            <button
                                onClick={openProductSheet}
                                className="w-full h-11 px-6 bg-neutral-100 rounded-xl outline outline-1 outline-offset-[-1px] outline-zinc-100 flex items-center justify-center gap-1.5 transition-colors hover:bg-neutral-200"
                            >
                                <Plus size={16} className="text-black" />
                                <span className="text-xs font-medium text-black">Add Products/Services</span>
                            </button>

                            {/* Back + Checkout */}
                            <div className="flex items-center gap-2.5">
                                <button
                                    onClick={() => { setError(null); setStep('SHOP'); }}
                                    className="flex-1 h-11 px-3 bg-white rounded-lg outline outline-1 outline-offset-[-1px] outline-stone-900 flex items-center justify-center transition-colors hover:bg-neutral-50"
                                >
                                    <span className="text-xs font-normal text-black">Back</span>
                                </button>
                                <button
                                    onClick={handleProceedToSummary}
                                    disabled={subtotal <= 0}
                                    className="flex-1 h-11 px-3 bg-black rounded-lg flex items-center justify-center gap-2.5 transition-colors hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    <CreditCard size={12} className="text-white" />
                                    <span className="text-xs font-bold text-white">Checkout</span>
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* 3b. Delivery Step — address + rider selection */}
                {step === 'DELIVERY' && org && (
                    <div className="flex flex-col flex-1 min-h-0" style={{ animation: 'atabs-in-right 0.42s cubic-bezier(0.22, 1, 0.36, 1)' }}>
                        {/* Header */}
                        <div className="px-6 pt-6 pb-4 flex items-center gap-4 shrink-0 border-b border-gray-100">
                            {org.logo_url ? (
                                <img src={org.logo_url} alt={org.name} className="w-10 h-10 rounded-xl object-cover flex-shrink-0" />
                            ) : (
                                <div className="w-10 h-10 rounded-xl bg-[#0058DB]/10 flex items-center justify-center flex-shrink-0">
                                    <ShoppingBag className="h-5 w-5 text-[#0058DB]" />
                                </div>
                            )}
                            <div>
                                <p className="text-base font-bold text-gray-900">{org.name}</p>
                                <p className="text-xs text-gray-400">Payment Checkout Portal</p>
                            </div>
                        </div>

                        {/* Scrollable content */}
                        <div className="flex-1 overflow-y-auto px-6 pt-5 pb-36 space-y-4">
                            <div>
                                <h2 className="text-lg font-semibold text-gray-900">Checkout</h2>
                                <p className="text-xs text-gray-500 mt-0.5">Please choose the mode of delivery that you would like to use to collect your parcel.</p>
                            </div>

                            {/* Deliver / Pick Up segmented control */}
                            <div className="p-1 bg-gray-100 rounded-full flex">
                                {(['deliver', 'pickup'] as const).map(m => (
                                    <button
                                        key={m}
                                        onClick={() => setDeliveryMode(m)}
                                        className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-full text-xs font-medium transition-all ${
                                            deliveryMode === m
                                                ? 'bg-white text-gray-900 shadow-sm'
                                                : 'text-gray-500'
                                        }`}
                                    >
                                        {m === 'deliver' ? (
                                            <><ChevronRight className="h-3.5 w-3.5" />Deliver</>
                                        ) : (
                                            <><ShoppingBag className="h-3.5 w-3.5" />Pick Up</>
                                        )}
                                    </button>
                                ))}
                            </div>

                            {deliveryMode === 'deliver' && (
                                <>
                                    {/* Use Current Location */}
                                    <button
                                        onClick={handleUseCurrentLocation}
                                        disabled={locating}
                                        className="w-full flex items-center justify-center gap-3 py-3 px-5 bg-white border border-slate-300 rounded-full shadow-sm text-sm text-gray-800 hover:bg-gray-50 active:scale-[0.98] transition-all disabled:opacity-60"
                                    >
                                        {locating ? (
                                            <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
                                        ) : (
                                            <MapPin className="h-4 w-4 text-gray-700" />
                                        )}
                                        {locating ? 'Locating…' : 'Use Current Location'}
                                    </button>
                                    {locationError && (
                                        <p className="text-[11px] text-red-500 text-center -mt-1 px-2">{locationError}</p>
                                    )}

                                    {/* Address fields */}
                                    <div className="space-y-3">
                                        {/* Country */}
                                        <div>
                                            <label className="text-xs font-semibold text-gray-700 mb-1 block">Country</label>
                                            <div className="flex items-center gap-3 px-4 py-3 bg-white rounded-full border" style={{borderColor:'#EFF2F6'}}>
                                                <span className="text-sm leading-none">🇿🇲</span>
                                                <span className="flex-1 text-xs text-gray-600 font-normal">{deliveryCountry}</span>
                                                <span className="text-xs font-semibold text-gray-600">ZM</span>
                                                <ChevronDown className="h-4 w-4 text-gray-500" />
                                            </div>
                                        </div>

                                        {/* State / Province */}
                                        <div>
                                            <label className="text-xs font-semibold text-gray-700 mb-1 block">State / Province</label>
                                            <div className="relative">
                                                <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                                                <input
                                                    value={deliveryState}
                                                    onChange={e => setDeliveryState(e.target.value)}
                                                    placeholder="e.g. Lusaka"
                                                    className="w-full pl-10 pr-10 py-3 bg-white rounded-full border text-xs text-gray-700 outline-none focus:border-[#0058DB] transition-colors" style={{borderColor:'#EFF2F6'}}
                                                />
                                                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 pointer-events-none" />
                                            </div>
                                        </div>

                                        {/* Street address */}
                                        <div>
                                            <label className="text-xs font-semibold text-gray-700 mb-1 block">Street Address</label>
                                            <div className="relative">
                                                <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                                                <input
                                                    value={deliveryStreet}
                                                    onChange={e => setDeliveryStreet(e.target.value)}
                                                    placeholder="e.g. E7158 Whitechapel High St"
                                                    className="w-full pl-10 pr-10 py-3 bg-white rounded-full border text-xs text-gray-700 outline-none focus:border-[#0058DB] transition-colors" style={{borderColor:'#EFF2F6'}}
                                                />
                                                <Edit2 className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                                            </div>
                                        </div>

                                        {/* Apartment */}
                                        <div>
                                            <label className="text-xs font-semibold text-gray-700 mb-1 block">Apartment / Suite or House / Plot No.</label>
                                            <div className="relative">
                                                <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                                                <input
                                                    value={deliveryApartment}
                                                    onChange={e => setDeliveryApartment(e.target.value)}
                                                    placeholder="Suite B225, House No. 12"
                                                    className="w-full pl-10 pr-10 py-3 bg-white rounded-full border text-xs text-gray-700 outline-none focus:border-[#0058DB] transition-colors" style={{borderColor:'#EFF2F6'}}
                                                />
                                                <Edit2 className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Rider service selector — collapsed dropdown (only when org allows external delivery) */}
                                    {cartAllowsExternalDelivery && (() => {
                                        const activeSvc = RIDER_SERVICES.find(s => s.id === selectedRider) ?? RIDER_SERVICES[0];
                                        return (
                                            <div ref={riderSectionRef}>
                                                {/* Label sits above the bordered component, matching address field layout */}
                                                <label className="text-xs font-semibold text-gray-700 mb-1 block">Choose Rider Service</label>

                                                {/* Collapsed pill — shows selected rider */}
                                                <button
                                                    onClick={() => {
                                                        const opening = !riderDropdownOpen;
                                                        setRiderDropdownOpen(opening);
                                                        if (opening) {
                                                            // Let the list render first, then scroll it into view
                                                            // with enough bottom clearance for the sticky footer (~100px).
                                                            setTimeout(() => {
                                                                riderSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                                                            }, 50);
                                                        }
                                                    }}
                                                    className="w-full bg-white rounded-2xl border px-5 py-3 flex items-center gap-2.5 text-left" style={{borderColor:'#EFF2F6'}}
                                                >
                                                    <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-xl flex-shrink-0 overflow-hidden">
                                                        {activeSvc.logo}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="text-base font-medium text-black leading-5">{activeSvc.name}</div>
                                                        <div className="text-[10px] text-zinc-600">
                                                            Est <span className="font-bold">Price K{activeSvc.est_price}</span>
                                                            {' · '}Est Delivery time <span className="font-bold">~{activeSvc.est_minutes} min</span>
                                                        </div>
                                                    </div>
                                                    <ChevronDown className={`h-5 w-5 text-gray-600 flex-shrink-0 transition-transform duration-200 ${riderDropdownOpen ? 'rotate-180' : ''}`} />
                                                </button>

                                                {/* Inline list — not absolute, so it pushes layout down and
                                                    never overlaps the sticky footer */}
                                                {riderDropdownOpen && (
                                                    <div className="mt-1.5 bg-white border rounded-2xl overflow-hidden" style={{borderColor:'#EFF2F6'}}>
                                                        {RIDER_SERVICES.map((svc, idx) => (
                                                            <button
                                                                key={svc.id}
                                                                onClick={() => { setSelectedRider(svc.id); setRiderDropdownOpen(false); }}
                                                                className={`w-full flex items-center gap-3 px-5 py-3 transition-colors text-left ${
                                                                    idx < RIDER_SERVICES.length - 1 ? 'border-b border-gray-100' : ''
                                                                } ${selectedRider === svc.id ? 'bg-blue-50/60' : 'hover:bg-gray-50'}`}
                                                            >
                                                                <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-xl flex-shrink-0">{svc.logo}</div>
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="text-base font-medium text-black leading-5">{svc.name}</div>
                                                                    <div className="text-[10px] text-zinc-600">
                                                                        Est <span className="font-bold">Price K{svc.est_price}</span>
                                                                        {' · '}Est Delivery time <span className="font-bold">~{svc.est_minutes} min</span>
                                                                    </div>
                                                                </div>
                                                                {selectedRider === svc.id && (
                                                                    <div className="w-4 h-4 rounded-full bg-[#0058DB] flex-shrink-0 flex items-center justify-center">
                                                                        <div className="w-2 h-2 bg-white rounded-full" />
                                                                    </div>
                                                                )}
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })()}
                                </>
                            )}

                            {deliveryMode === 'pickup' && (
                                <div className="flex flex-col items-center justify-center py-10 text-center text-gray-500">
                                    <ShoppingBag className="h-10 w-10 text-gray-200 mb-3" />
                                    <p className="text-sm font-semibold text-gray-700">You'll collect at the store</p>
                                    <p className="text-xs text-gray-400 mt-1 max-w-xs">The merchant will contact you with pick-up details after your order is confirmed.</p>
                                </div>
                            )}
                        </div>

                        {/* Sticky footer */}
                        <div className="fixed bottom-0 inset-x-0 sm:absolute sm:bottom-0 sm:inset-x-auto sm:left-0 sm:right-0 sm:w-full bg-white border-t border-gray-200 px-6 py-4 space-y-3">
                            <div className="flex items-center justify-between text-sm font-bold text-gray-600">
                                <span>Delivery Charge</span>
                                <span>K{effectiveDeliveryCharge.toFixed(2)}</span>
                            </div>
                            <div className="flex gap-2.5">
                                <button
                                    onClick={() => setStep('CATALOG')}
                                    className="flex-1 h-11 px-3 py-2 bg-white rounded-xl border border-gray-900 flex items-center justify-center text-xs font-medium text-gray-900 hover:bg-gray-50 transition-colors"
                                >
                                    Back
                                </button>
                                <button
                                    onClick={() => setStep('SUMMARY')}
                                    className="flex-1 h-11 px-3 py-2 bg-gray-900 rounded-xl flex items-center justify-center gap-2 text-xs font-bold text-white hover:bg-black transition-colors"
                                >
                                    <CreditCard className="h-3.5 w-3.5" />
                                    Checkout
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* 3c. Payment Summary Step */}
                {step === 'SUMMARY' && org && (
                    <div
                        className="flex flex-col flex-1 min-h-0 sm:min-h-[min(620px,80vh)]"
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
                                        {effectiveDeliveryCharge > 0 && (
                                            <div className="flex justify-between text-xs">
                                                <span className="text-slate-500">
                                                    Delivery
                                                    {deliveryDetails?.rider_service_name
                                                        ? ` · ${deliveryDetails.rider_service_name}`
                                                        : ''}
                                                </span>
                                                <span className="text-slate-700 font-medium">
                                                    K{effectiveDeliveryCharge.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                </span>
                                            </div>
                                        )}
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

                            {/* Widget fallback only: collect name/phone before paying. The own-UX
                                flow derives both from the mobile money account on the Payment page. */}
                            {!collectionsApiEnabled && (
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
                            )}

                            {/* Email — required only when the cart has a digital product, since
                                that's how we deliver the file (can't derive it from mobile money). */}
                            {cartHasDigital && (
                                <div className="mt-4 rounded-3xl border border-violet-200 bg-violet-50/40 p-5">
                                    <div className="flex items-center gap-2 mb-1.5">
                                        <Mail size={16} className="text-violet-600" />
                                        <h5 className="text-sm font-bold text-slate-900">
                                            Delivery email <span className="text-rose-500">*</span>
                                        </h5>
                                    </div>
                                    <p className="text-xs text-slate-500 mb-3">Your digital file will be sent here right after payment.</p>
                                    <div className="relative">
                                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                        <input
                                            type="email"
                                            value={customerEmail}
                                            onChange={(e) => setCustomerEmail(e.target.value)}
                                            placeholder="you@example.com"
                                            className="w-full pl-11 pr-4 py-3.5 bg-white rounded-xl text-sm font-medium text-[#5A5A5A] outline-none focus:ring-2 focus:ring-violet-200 placeholder:text-slate-400 transition-all"
                                        />
                                    </div>
                                </div>
                            )}

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
                                onClick={() => {
                                    if (!canPay) return;
                                    if (collectionsApiEnabled) {
                                        setError(null);
                                        setCheckoutPhone(customerPhone);
                                        setResolvedAccountName('');
                                        setResolveFailed(false);
                                        setCheckoutMethod('mobile-money');
                                        setStep('CHECKOUT');
                                    } else {
                                        handlePay();
                                    }
                                }}
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

                {/* 3b. Dedicated checkout page — payment method toggle at the top,
                    mobile money phone entry + account-holder confirmation below */}
                {step === 'CHECKOUT' && org && (
                    <div className="flex flex-col flex-1 min-h-0 sm:min-h-[min(620px,80vh)] bg-neutral-50">
                        {/* Top bar — back + title */}
                        <div className="px-7 py-3 flex items-start gap-6">
                            <button
                                onClick={() => { setStep('SUMMARY'); setError(null); }}
                                className="p-1 -ml-1 mt-1 rounded-lg hover:bg-slate-100 transition-colors"
                            >
                                <ArrowLeft size={20} className="text-black" />
                            </button>
                            <div className="flex-1">
                                <h3 className="text-base font-semibold text-black">Payment</h3>
                                <p className="text-xs" style={{ color: '#585858' }}>
                                    You are making a payment to {org.name} –{' '}
                                    <span className="font-bold">
                                        K{totalPayable.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </span>
                                </p>
                            </div>
                        </div>

                        {/* Method toggle */}
                        <div className="px-4 pt-4">
                            <div className="p-0.5 bg-neutral-100 rounded-full flex items-center">
                                <button
                                    onClick={() => { setCheckoutMethod('mobile-money'); setError(null); }}
                                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-full text-xs leading-4 transition-all ${
                                        checkoutMethod === 'mobile-money'
                                            ? 'bg-white text-gray-800 font-normal shadow-sm'
                                            : 'text-gray-800 font-normal'
                                    }`}
                                >
                                    <Smartphone size={16} /> Mobile Money
                                </button>
                                <button
                                    onClick={() => { setCheckoutMethod('card'); setError(null); }}
                                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-full text-xs leading-4 transition-all ${
                                        checkoutMethod === 'card'
                                            ? 'bg-white text-gray-800 font-normal shadow-sm'
                                            : 'text-gray-800 font-normal'
                                    }`}
                                >
                                    <CreditCard size={16} /> Debit Card
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto px-6 pt-6 pb-2">
                            {checkoutMethod === 'mobile-money' ? (
                                <>
                                    <label className="block text-sm font-semibold text-gray-800 mb-2">
                                        Enter your mobile money number
                                    </label>
                                    <div className="min-h-12 bg-white rounded-full border border-slate-300 flex items-center overflow-hidden">
                                        <div className="self-stretch p-3 bg-neutral-100 border-r border-slate-300 flex items-center gap-1.5">
                                            <span className="text-base leading-none" role="img" aria-label="Zambia">🇿🇲</span>
                                            <ChevronDown size={14} className="text-slate-400" />
                                        </div>
                                        <div className="flex-1 px-5 py-3 flex items-center gap-1.5 min-w-0">
                                            <span className="text-base font-semibold text-gray-600 flex-shrink-0">+260</span>
                                            <input
                                                type="tel"
                                                value={checkoutPhone}
                                                onChange={(e) => setCheckoutPhone(e.target.value)}
                                                placeholder="(971) 234 - 567"
                                                className="flex-1 min-w-0 text-base text-gray-600 outline-none bg-transparent placeholder:text-gray-400"
                                            />
                                            {detectOperator(checkoutPhone) && (
                                                <span className={`text-xs font-semibold uppercase tracking-tighter flex-shrink-0 ${OPERATOR_COLORS[detectOperator(checkoutPhone)!]}`}>
                                                    {detectOperator(checkoutPhone)}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {checkoutPhone.length >= 9 && (
                                        <div className="mt-3 px-4 py-3 rounded-2xl bg-white border border-slate-200 flex items-center gap-3">
                                            {resolvingAccountName ? (
                                                <Loader2 size={16} className="text-blue-600 animate-spin flex-shrink-0" />
                                            ) : resolvedAccountName ? (
                                                <Check size={16} className="text-emerald-500 flex-shrink-0" />
                                            ) : (
                                                <AlertCircle size={16} className="text-amber-500 flex-shrink-0" />
                                            )}
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Account Holder</p>
                                                <p className="text-sm font-semibold text-gray-800 truncate">
                                                    {resolvingAccountName
                                                        ? 'Verifying number…'
                                                        : resolvedAccountName || (resolveFailed ? 'Could not verify — check the number' : 'Waiting for a valid number…')}
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    {error && (
                                        <div className="mt-4 p-3.5 bg-rose-50 text-rose-600 rounded-xl flex items-start space-x-2">
                                            <AlertCircle className="flex-shrink-0 mt-0.5" size={14} />
                                            <span className="text-[11px] font-semibold leading-normal">{error}</span>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div className="text-center py-10 px-4 bg-white border border-slate-100 rounded-2xl">
                                    <div className="mx-auto w-12 h-12 bg-slate-200 text-slate-500 rounded-full flex items-center justify-center mb-3">
                                        <CreditCard size={22} />
                                    </div>
                                    <h4 className="text-sm font-black text-slate-700 uppercase tracking-wider">Card — Coming Soon</h4>
                                    <p className="text-[11px] font-semibold text-slate-400 mt-2 max-w-[220px] mx-auto leading-relaxed">
                                        Card payments aren’t available here yet. Please use Mobile Money for now.
                                    </p>
                                </div>
                            )}
                        </div>

                        <div className="sticky bottom-0 mt-auto bg-white border-t border-gray-100 px-7 py-6 flex flex-col items-center gap-3">
                            <div className="flex items-center justify-center gap-2.5">
                                <ShieldCheck size={16} className="text-zinc-600" />
                                <span className="text-xs text-zinc-600">Secure payments powered by Lenco</span>
                            </div>
                            {checkoutMethod === 'mobile-money' ? (
                                <button
                                    onClick={handlePayMobileMoney}
                                    disabled={submitting || !detectOperator(checkoutPhone) || resolvingAccountName}
                                    className={`w-full h-14 rounded-xl font-bold text-base transition-all flex items-center justify-center gap-2 ${
                                        !submitting && detectOperator(checkoutPhone) && !resolvingAccountName
                                            ? 'bg-black hover:bg-slate-800 text-white'
                                            : 'bg-neutral-100 text-zinc-400 cursor-not-allowed'
                                    }`}
                                >
                                    {submitting ? <Loader2 size={16} className="animate-spin" /> : null}
                                    <span>{submitting ? 'Starting…' : `Pay K${totalPayable.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}</span>
                                </button>
                            ) : (
                                <button disabled className="w-full h-14 rounded-xl font-bold text-base bg-neutral-100 text-zinc-400 cursor-not-allowed">
                                    Coming Soon
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {/* 4a. Premium processing screen (own-UX): initiating → confirm → polling → success/failed */}
                {step === 'VERIFYING' && displayPaymentPhase && org && (
                    <div className="flex flex-col flex-1 min-h-0 sm:min-h-[min(620px,80vh)]">
                        <PaymentWaitingScreen
                            phase={displayPaymentPhase}
                            amount={resumedPayment ? resumedPayment.amount : totalPayable}
                            businessName={org.name}
                            payerPhone={resumedPayment ? resumedPayment.phone : checkoutPhone}
                            operator={detectOperator(resumedPayment ? resumedPayment.phone : checkoutPhone)}
                            isSlowNetwork={isSlowNetwork}
                            elapsedSeconds={elapsedSeconds}
                            reference={receiptNumber || currentReference}
                            failureIsDeclined={failureIsDeclined}
                            failureReason={verificationReason}
                            cancelling={cancelling}
                            rechecking={rechecking}
                            recheckNote={recheckNote}
                            dismissLabel="Back to cart"
                            onCancel={handleCancelPayment}
                            onRetry={handleRetryPayment}
                            onDismiss={handleDismissFailed}
                            onDone={handleViewReceipt}
                            onRecheck={handleRecheckPayment}
                        />
                    </div>
                )}

                {/* 4b. Verifying (widget path) / failure states */}
                {step === 'VERIFYING' && !displayPaymentPhase && (
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
                    <div className="flex flex-col flex-1 min-h-0 sm:min-h-[min(620px,80vh)]">
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
                                >
                                    <BadgeCheck
                                        className="w-24 h-24 text-[#002962]"
                                        fill="#006AFF"
                                        strokeWidth={1.5}
                                        style={{ filter: 'drop-shadow(-5px 5px 0 rgba(0,41,98,1))' }}
                                    />
                                    {/* White tick overlaid on top of the seal's own check — no shadow, sits flat above it */}
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
                                                {li.isBooking && li.booking
                                                    ? ` · ${formatStayRange(li.booking.checkIn, li.booking.checkOut)} (${li.quantity} ${getBookingTerminology(li.product.product_type).unit}${li.quantity === 1 ? '' : 's'})`
                                                    : !li.isDonation && li.quantity > 1 ? ` (x${li.quantity})` : ''}
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
                            <h3 className="text-base font-black text-slate-900 uppercase tracking-wider">
                                {errorInfo?.title || 'Checkout unavailable'}
                            </h3>
                            <p className="text-xs text-slate-500 max-w-xs mx-auto leading-relaxed font-semibold">
                                {errorInfo?.message || 'We couldn’t load this checkout right now. Please try again in a moment.'}
                            </p>

                            {errorInfo?.tips && errorInfo.tips.length > 0 && (
                                <div className="text-left bg-slate-50 border border-slate-100 rounded-2xl p-4 max-w-xs mx-auto space-y-2">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">What you can try</p>
                                    <ul className="space-y-1.5">
                                        {errorInfo.tips.map((tip, i) => (
                                            <li key={i} className="flex items-start gap-2 text-[11px] font-medium text-slate-500 leading-relaxed">
                                                <span className="mt-1.5 h-1 w-1 rounded-full bg-slate-300 flex-shrink-0" />
                                                <span>{tip}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>

                        {(errorInfo?.retry ?? true) && (
                            <button
                                onClick={handleTryAgain}
                                className="w-full bg-slate-950 hover:bg-slate-900 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-[0.15em] transition-all shadow-lg flex items-center justify-center gap-2"
                            >
                                <RefreshCw size={14} /> Try Again
                            </button>
                        )}
                        {errorInfo?.code && (
                            <p className="mt-3 text-[9px] font-mono text-slate-300 tracking-wide select-all">{errorInfo.code}</p>
                        )}
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
                                    trackBgClassName="bg-[#F5F5F5]"
                                    inactiveTextClassName="text-black"
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

            {/* Footer Brand Info — hidden on the premium processing screen, which has its own header,
                and on the dedicated checkout page, which has its own "Secure payments" footer */}
            {step !== 'SHOP' && step !== 'CATALOG' && step !== 'SUMMARY' && step !== 'SUCCESS' && step !== 'CHECKOUT' && !(step === 'VERIFYING' && displayPaymentPhase) && (
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
        )}

        {/* Booking date calendar — shared across desktop + mobile */}
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
                {...getBookingTerminology(calendarProduct.product_type)}
            />
        )}
        </>
    );
};

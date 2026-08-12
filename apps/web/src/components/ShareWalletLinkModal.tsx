import React, { useState, useEffect, useRef } from 'react';
import { X, Check, Copy, Link2, ExternalLink, Download, Store, Zap } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import { organizationService } from '../services/organization.service';
import { useAuth } from '../context/AuthContext';
import { SegmentedControl } from './AnimatedTabs';

// ── Pay-With logos (SVG source, filled white for dark-blue card) ────────────
const AIRTEL_SVG_WHITE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 338.35583 353.46598"><path fill="#ffffff" d="m 254.86166,353.06387 c -43.7808,-6.48489 -40.5176,-90.34431 3.5162,-90.36024 20.8888,-0.008 31.3177,13.67062 32.1253,42.13415 l 0.1557,5.49011 h -22.5694 -22.5694 l 0.1592,4.29948 c 0.438,11.83204 3.35,18.51842 9.3023,21.35917 6.7677,3.22993 19.0806,1.31509 27.925,-4.34274 1.9319,-1.23583 2.2815,-1.37809 2.4866,-1.0116 0.3136,0.5603 5.7165,12.30148 5.7165,12.42258 0,0.21359 -4.7987,3.16641 -7.2633,4.46939 -9.1128,4.81776 -19.9173,6.88278 -28.9847,5.5397 z m 13.6812,-59.73546 c -1.0246,-19.58009 -20.2598,-18.66392 -22.0462,1.05006 -0.1746,1.9265 -0.1746,1.9265 11.0137,1.9265 11.1883,0 11.1883,0 11.0325,-2.97656 z M 27.055459,353.03679 c -0.3638,-0.0644 -1.3758,-0.24643 -2.249,-0.40444 -26.7475004,-4.84041 -34.0747004,-40.98223 -10.9971,-54.24412 5.7249,-3.28994 12.1313,-4.45223 24.5848,-4.46032 6.6839,-0.004 8.2588,-2.77207 5.6431,-9.91723 -2.76,-7.53977 -14.9181,-8.01613 -29.2188,-1.14482 -1.8555,0.89151 -3.4144,1.57134 -3.4644,1.51074 -0.2168,-0.26302 -5.4670004,-12.83782 -5.4662004,-13.0921 5e-4,-0.15506 1.8166,-1.18635 4.0358,-2.29175 27.5590004,-13.72748 51.0210004,-6.89884 55.6593004,16.19972 1.4613,7.27702 0.7226,54.04138 -0.8783,55.60756 -8.5798,8.39348 -26.4872,14.21373 -37.6492,12.23676 z m 12.2094,-15.88811 c 5.5937,-1.18096 5.3775,-0.5803 5.4541,-15.15333 l 0.069,-13.07108 -5.6249,0.16296 c -12.0643,0.34953 -17.0513,4.67787 -16.9765,14.73441 0.079,10.61645 6.4328,15.57465 17.0787,13.32704 z m 286.137101,15.25 c -13.5388,-1.70883 -20.5879,-9.23187 -21.8556,-23.32495 -0.2047,-2.27594 -0.2696,-15.83428 -0.2138,-44.67214 l 0.08,-41.40443 9.7896,-1.77514 c 5.3842,-0.97633 10.0872,-1.81105 10.451,-1.85495 0.6615,-0.0798 0.6615,-0.0798 0.7938,45.56082 0.1323,45.64062 0.1323,45.64062 0.7081,47.04532 1.5464,3.7723 4.2475,5.25259 10.4705,5.73819 3.5545,0.27737 3.6795,13.87549 0.1323,14.39063 -2.9562,0.42932 -8.1307,0.57754 -10.3561,0.29665 z m -122.2306,-0.30225 c -13.2136,-1.69688 -20.5731,-9.82851 -21.6122,-23.8798 -0.1797,-2.42916 -0.2487,-17.96881 -0.1977,-44.47937 l 0.078,-40.74583 10.3187,-1.77226 c 5.6753,-0.97474 10.5271,-1.77841 10.7818,-1.78594 0.4344,-0.0128 0.463,0.73055 0.463,12.0204 v 12.03407 l 6.813,0.0706 6.8131,0.0706 0.07,8.13593 0.07,8.13594 h -6.8894 -6.8895 l 0.073,25.20157 c 0.073,25.20156 0.073,25.20156 0.7036,26.76758 1.5519,3.85121 4.377,5.46259 10.2831,5.86532 2.7119,0.18493 2.7119,0.18493 2.7119,7.00525 0,6.82032 0,6.82032 -0.7276,6.9763 -3.0906,0.66253 -9.2452,0.84417 -12.8627,0.37961 z M 81.559659,309.41687 c 0,-42.19209 0,-42.19209 0.8599,-42.35023 9.4999,-1.74712 20.114301,-3.42462 20.202401,-3.19279 0.059,0.15633 0.077,19.92956 0.04,43.9405 l -0.068,43.65625 -10.517101,0.0692 -10.5172,0.0692 z m 37.570801,6.07535 c 0,-40.52784 -0.5851,-36.40544 5.9453,-41.88514 12.4748,-10.4676 34.3935,-14.88681 43.7573,-8.82228 0.338,0.21891 -0.6364,2.74306 -5.0289,13.02702 -0.5204,1.21831 -0.5204,1.21831 -2.0257,0.86791 -6.7692,-1.57571 -15.8883,0.30163 -20.306,4.18038 -0.9108,0.79968 -0.9108,0.79968 -0.9108,34.77123 v 33.97155 h -10.7156 -10.7156 z M 88.731059,256.19876 c -11.0846,-2.98081 -13.405,-19.00895 -3.6911,-25.49567 6.5657,-4.38438 15.467201,-1.97121 18.870001,5.11562 5.303,11.04404 -3.9078,23.41101 -15.178901,20.38005 z m 43.808101,-63.88978 c -24.0342,-2.79352 -23.8886,-39.0474 0.2507,-62.42693 12.7945,-12.39175 28.3947,-13.04706 34.1342,-1.43387 3.4124,6.90443 1.434,11.14329 -11.1881,23.97125 -11.8551,12.0484 -13.6986,14.31618 -15.2109,18.71171 -4.6965,13.6507 19.3291,4.64555 44.0898,-16.52546 28.4147,-24.29539 45.8637,-53.72527 44.0555,-74.305343 -1.5365,-17.4886 -13.2226,-22.88341 -32.6784,-15.08583 -11.7471,4.70802 -21.2647,10.53555 -46.8143,28.66389 -27.6995,19.653773 -52.005801,22.041603 -62.296401,6.11997 -9.648,-14.92723 2.3855,-43.79796 26.428401,-63.40686 46.4236,-37.8622701 95.8167,-47.28306 125.0156,-23.84434 43.0399,34.54929 22.5989,105.257413 -44.3177,153.300823 -27.388,19.66346 -46.8168,27.96396 -61.4684,26.26099 z"/></svg>`;

const MONEYWISE_LOGO_WHITE = `<svg width="26" height="18" viewBox="0 0 26 18" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2.85474 12.4959L6.10299 4.53705C6.78008 2.87804 9.12932 2.87804 9.80642 4.53705L11.203 7.95881C11.88 9.61782 14.2293 9.61782 14.9064 7.95881L16.3029 4.53705C16.98 2.87804 19.3293 2.87804 20.0063 4.53705L23.2546 12.4959" stroke="white" stroke-width="2.5" stroke-linecap="round"/><path d="M25 9.46973L19.3273 9.46973" stroke="white" stroke-width="2" stroke-linecap="round"/><path d="M6.5636 9.4707H1" stroke="white" stroke-width="2" stroke-linecap="round"/></svg>`;

const BADGE_CHECK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z" fill="#2563eb" stroke="#2563eb" stroke-width="0.5"/><path d="m9 12 2 2 4-4" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const MTN_SVG_WHITE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 998.57409 499.29377"><path fill="#ffffff" d="m 490.78484,499.24244 c -0.074,-0.0741 -3.7,-0.15754 -8.0575,-0.18538 -25.0421,-0.16004 -59.0333,-2.2012 -87.8269,-5.27398 -121.8439,-13.00287 -229.3011,-48.30101 -302.286491,-99.29677 -28.2234,-19.72008 -51.3294,-42.33472 -66.6879,-65.26989 -6.0992,-9.108 -12.1717,-20.35304 -15.8198,-29.29495 -12.1650008,-29.81809 -13.3691008,-61.1835 -3.4963008,-91.07629 2.3409,-7.08773 4.5741008,-12.45241 8.2606008,-19.84375 9.0509,-18.14678 20.8657,-34.14994 37.5163,-50.81573 46.5766,-46.619324 120.865191,-84.707524 213.030691,-109.222044 58.692,-15.61114 125.4693,-25.4601539 190.3371,-28.07291384 3.638,-0.14653 7.7456,-0.32672 9.1281,-0.40041 11.2734,-0.60092 48.0077,-0.66325 65.2198,-0.11066 121.8488,3.91192994 234.1764,29.08985384 320.4104,71.81908384 47.717,23.64393 84.5543,51.013364 110.2728,81.930594 5.9379,7.13818 12.0834,15.79129 17.0622,24.02416 3.018,4.99067 8.9866,16.9891 11.0558,22.225 8.4673,21.42639 11.38896,43.22298 8.7064,64.95521 -5.445,44.11302 -34.6171,87.04012 -83.9941,123.59844 -24.6728,18.26753 -53.1068,34.36608 -86.3864,48.90954 -81.9931,35.83164 -186.6998,57.45694 -294.6136,60.84718 -2.5466,0.08 -6.4757,0.20649 -8.7312,0.28108 -6.2291,0.20598 -32.9466,0.42592 -33.1,0.27248 z m 33.6291,-39.69644 c 1.6735,-0.0724 5.424,-0.19852 8.3344,-0.28023 32.3531,-0.90829 70.7901,-4.23432 104.1135,-9.00916 111.1092,-15.92055 205.782,-50.97747 263.1282,-97.43521 43.9079,-35.57104 63.9445,-75.90429 58.1828,-117.12101 -2.4234,-17.33613 -9.8719,-34.9931 -21.7645,-51.59375 -27.0202,-37.7167 -77.3157,-71.33172 -144.8975,-96.842284 -70.4582,-26.59633 -159.1289,-43.35325 -248.4437,-46.95069 -3.6381,-0.14654 -7.7457,-0.32697 -9.1282,-0.40096 -11.4249,-0.61147 -48.3356,-0.66851 -66.0135,-0.10201 -111.4905,3.57278 -213.4251,24.74608 -293.5552,60.975714 -6.7987,3.07391 -23.9985,11.72796 -30.1625,15.17623 -29.4347,16.4662 -52.733791,34.18429 -69.888891,53.14793 -28.7754,31.80886 -39.8141,65.52563 -32.8747,100.4127 6.465,32.50147 30.6468,64.79537 69.342391,92.60406 61.2336,44.00568 155.3012,75.98963 264.667,89.98952 26.7598,3.42552 60.1895,6.17975 83.7406,6.8993 2.9105,0.0889 5.6489,0.20929 6.0855,0.2675 0.4365,0.0582 6.1515,0.18544 12.7,0.28274 6.5484,0.0973 11.961,0.22515 12.0279,0.28411 0.156,0.1374 30.3746,-0.13003 34.4064,-0.3045 z M 250.16344,332.60404 c -0.069,-0.18191 -0.095,-37.65683 -0.058,-83.27761 l 0.068,-82.94687 h 19.7115 19.7114 l 21.7584,33.46857 c 11.967,18.40772 21.8492,33.49459 21.9604,33.52638 0.1111,0.0318 10.0182,-15.05883 22.0156,-33.53472 l 21.8136,-33.59253 h 19.6599 19.6598 v 83.21316 83.21315 l -19.6449,-0.0678 -19.645,-0.0678 v -46.61152 c -6e-4,-25.63633 -0.06,-46.66552 -0.1326,-46.73152 -0.072,-0.066 -6.7565,10.07449 -14.8536,22.53443 l -14.7221,22.65444 -14.0109,0.0685 -14.011,0.0684 -14.7484,-22.62313 c -8.1116,-12.44272 -14.8568,-22.69016 -14.9894,-22.77208 -0.1446,-0.0894 -0.241,18.64203 -0.241,46.83021 v 46.97915 h -19.5874 c -15.4267,0 -19.6142,-0.0703 -19.7131,-0.33072 z m 236.9443,-63.16758 v -63.5017 h -25.4 -25.4 v -19.71145 -19.71146 h 70.3791 70.3792 v 19.71146 19.71145 h -25.2672 -25.2671 l -0.067,63.43386 -0.067,63.43385 -19.6453,0.0678 -19.6453,0.0679 z m 109.8021,-19.97774 v -83.21146 h 19.6944 19.6945 l 35.6696,49.45507 35.6696,49.45506 0.067,-49.45506 0.067,-49.45507 h 19.7107 19.7108 v 83.21315 83.21314 l -19.7732,-0.0678 -19.7732,-0.0678 -14.4242,-19.99643 c -7.9333,-10.99804 -23.9492,-33.2032 -35.5909,-49.34479 l -21.1666,-29.34836 -0.067,49.41093 -0.067,49.41094 h -19.7108 -19.7107 z"/></svg>`;

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
    const { organizationLogoUrl, organizationName } = useAuth();
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

    // Store tab: plain QR download
    const handleDownload = () => {
        const canvas = qrRef.current?.querySelector('canvas');
        if (!canvas) return;
        const url = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.href = url;
        link.download = `${walletName.replace(/\s+/g, '-').toLowerCase() || 'wallet'}-store-qr.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // Quick Pay tab: styled "Scan to Pay" card download
    const handleDownloadQuickPay = async () => {
        const qrCanvas = qrRef.current?.querySelector('canvas');
        if (!qrCanvas) return;

        // ── SVG → Image helper (used throughout) ──────────────────────────────
        const loadSvg = (svg: string): Promise<HTMLImageElement> =>
            new Promise(res => {
                const blob = new Blob([svg], { type: 'image/svg+xml' });
                const url = URL.createObjectURL(blob);
                const i = new Image();
                i.onload = () => { URL.revokeObjectURL(url); res(i); };
                i.onerror = () => { URL.revokeObjectURL(url); res(i); };
                i.src = url;
            });

        // ── Canvas setup (2× for retina) ──────────────────────────────────────
        const SCALE = 2;
        const W = 384; const H = 635;
        const canvas = document.createElement('canvas');
        canvas.width = W * SCALE; canvas.height = H * SCALE;
        const c = canvas.getContext('2d')!;
        c.scale(SCALE, SCALE);

        // Polyfill roundRect for older browsers
        const rr = (x: number, y: number, w: number, h: number, r: number) => {
            c.beginPath();
            c.moveTo(x + r, y);
            c.lineTo(x + w - r, y);
            c.quadraticCurveTo(x + w, y, x + w, y + r);
            c.lineTo(x + w, y + h - r);
            c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
            c.lineTo(x + r, y + h);
            c.quadraticCurveTo(x, y + h, x, y + h - r);
            c.lineTo(x, y + r);
            c.quadraticCurveTo(x, y, x + r, y);
            c.closePath();
        };

        // ── 1. White card background ───────────────────────────────────────────
        c.fillStyle = '#ffffff';
        rr(0, 0, W, H, 16); c.fill();
        c.strokeStyle = '#e4e4e7'; c.lineWidth = 1;
        rr(0.5, 0.5, W - 1, H - 1, 16); c.stroke();

        // ── 2. Organisation logo ───────────────────────────────────────────────
        const LOGO_SIZE = 56;
        const LOGO_CX = W / 2; const LOGO_CY = 24 + LOGO_SIZE / 2;
        if (logoUrl) {
            const img = new Image(); img.crossOrigin = 'anonymous';
            await new Promise<void>(res => { img.onload = () => res(); img.onerror = () => res(); img.src = logoUrl; });
            c.save();
            c.beginPath(); c.arc(LOGO_CX, LOGO_CY, LOGO_SIZE / 2, 0, Math.PI * 2); c.clip();
            c.drawImage(img, LOGO_CX - LOGO_SIZE / 2, LOGO_CY - LOGO_SIZE / 2, LOGO_SIZE, LOGO_SIZE);
            c.restore();
        } else {
            const grad = c.createLinearGradient(LOGO_CX - 28, LOGO_CY - 28, LOGO_CX + 28, LOGO_CY + 28);
            grad.addColorStop(0, '#2563eb'); grad.addColorStop(1, '#4338ca');
            c.fillStyle = grad;
            c.beginPath(); c.arc(LOGO_CX, LOGO_CY, LOGO_SIZE / 2, 0, Math.PI * 2); c.fill();
            c.fillStyle = '#fff'; c.font = 'bold 22px DM Sans, sans-serif';
            c.textAlign = 'center'; c.textBaseline = 'middle';
            c.fillText((organizationName || walletName || 'B').charAt(0).toUpperCase(), LOGO_CX, LOGO_CY);
        }

        // ── 3. Organisation name + verified badge ──────────────────────────────
        const ORG = organizationName || walletName || '';
        c.font = 'bold 13px DM Sans, sans-serif';
        c.fillStyle = '#111827'; c.textAlign = 'center'; c.textBaseline = 'middle';
        const NAME_Y = LOGO_CY + LOGO_SIZE / 2 + 18;
        const nameW = c.measureText(ORG).width;
        const BADGE_SIZE = 18; const NAME_BADGE_GAP = 10;
        // Draw name offset left to make room for badge
        c.fillText(ORG, W / 2 - (NAME_BADGE_GAP + BADGE_SIZE) / 2, NAME_Y);
        // Draw BadgeCheck SVG icon
        const badgeImg = await loadSvg(BADGE_CHECK_SVG);
        const bx = W / 2 + nameW / 2 + NAME_BADGE_GAP;
        c.drawImage(badgeImg, bx, NAME_Y - BADGE_SIZE / 2, BADGE_SIZE, BADGE_SIZE);

        // ── 4. Dark-blue card ──────────────────────────────────────────────────
        const CARD_X = 32; const CARD_W = W - 64;
        const CARD_Y = NAME_Y + 20;
        const QR_BOX = 264; const INNER_PAD = 20; const GAP16 = 16;
        const SCAN_H = 38; const PAY_LABEL_H = 18; const LOGOS_H = 22;
        const CARD_H = INNER_PAD + SCAN_H + GAP16 + QR_BOX + GAP16 + PAY_LABEL_H + 6 + LOGOS_H + INNER_PAD;
        c.fillStyle = '#00347C';
        rr(CARD_X, CARD_Y, CARD_W, CARD_H, 16); c.fill();

        // ── 5. "Scan to Pay" text ──────────────────────────────────────────────
        await document.fonts.load('bold 26px Advercase');
        c.fillStyle = '#ffffff'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.font = 'bold 26px Advercase, DM Sans, sans-serif';
        c.fillText('Scan to Pay', W / 2, CARD_Y + INNER_PAD + SCAN_H / 2);

        // ── 6. White QR box ────────────────────────────────────────────────────
        const QB_X = CARD_X + (CARD_W - QR_BOX) / 2;
        const QB_Y = CARD_Y + INNER_PAD + SCAN_H + GAP16;
        c.fillStyle = '#ffffff'; rr(QB_X, QB_Y, QR_BOX, QR_BOX, 12); c.fill();
        const QR_PAD = 14;
        c.drawImage(qrCanvas, QB_X + QR_PAD, QB_Y + QR_PAD, QR_BOX - QR_PAD * 2, QR_BOX - QR_PAD * 2);

        // ── 7. "Pay With" label ────────────────────────────────────────────────
        const PW_Y = QB_Y + QR_BOX + GAP16 + PAY_LABEL_H / 2;
        c.fillStyle = 'rgba(255,255,255,0.90)'; c.font = '11px DM Sans, sans-serif';
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText('Pay With', W / 2, PW_Y);

        // ── 8. Payment-method logos ────────────────────────────────────────────
        const [airtelImg, mtnImg, mwImg] = await Promise.all([
            loadSvg(AIRTEL_SVG_WHITE),
            loadSvg(MTN_SVG_WHITE),
            loadSvg(MONEYWISE_LOGO_WHITE),
        ]);

        const LOGO_H = 18;
        // Airtel: viewBox ≈ 338×353 (near-square)
        const AIRTEL_W = Math.round(LOGO_H * (338 / 353));
        // MTN: viewBox 998×499 (2:1 wide)
        const MTN_W = Math.round(LOGO_H * (998 / 499));
        // MoneyWise logo: viewBox 26×18
        const MW_W = Math.round(LOGO_H * (26 / 18));

        const LOGO_GAP = 24;
        const totalLogosW = AIRTEL_W + LOGO_GAP + MTN_W + LOGO_GAP + MW_W;
        let lx = (W - totalLogosW) / 2;
        const LOGOS_Y = PW_Y + PAY_LABEL_H / 2 + 6;

        c.drawImage(airtelImg, lx, LOGOS_Y, AIRTEL_W, LOGO_H);
        lx += AIRTEL_W + LOGO_GAP;
        c.drawImage(mtnImg, lx, LOGOS_Y, MTN_W, LOGO_H);
        lx += MTN_W + LOGO_GAP;
        c.drawImage(mwImg, lx, LOGOS_Y, MW_W, LOGO_H);

        // ── 9. "Powered by MoneyWise" footer ──────────────────────────────────
        const FOOTER_Y = CARD_Y + CARD_H + 28;
        c.font = '13px DM Sans, sans-serif';
        const powText = 'Powered by ';
        const powW = c.measureText(powText).width;
        c.font = 'bold 13px Advercase, DM Sans, sans-serif';
        const mwText = 'MoneyWise';
        const mwW = c.measureText(mwText).width;
        const footerStart = (W - powW - mwW) / 2;
        c.fillStyle = '#71717a'; c.textAlign = 'left'; c.textBaseline = 'middle';
        c.font = '13px DM Sans, sans-serif';
        c.fillText(powText, footerStart, FOOTER_Y);
        c.font = 'bold 13px Advercase, DM Sans, sans-serif';
        c.fillText(mwText, footerStart + powW, FOOTER_Y);

        // ── Download ──────────────────────────────────────────────────────────
        const dataUrl = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = dataUrl; a.download = 'quickpay-scan-to-pay.png';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
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
                                            onClick={activeTab === 'quickpay' ? handleDownloadQuickPay : handleDownload}
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

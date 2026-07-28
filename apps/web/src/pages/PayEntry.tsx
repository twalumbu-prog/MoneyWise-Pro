import React, { Suspense } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

const PublicPay = React.lazy(() => import('./PublicPay').then(m => ({ default: m.PublicPay })));
const QuickPay = React.lazy(() => import('./QuickPay').then(m => ({ default: m.QuickPay })));

// Wallet IDs are UUIDs; Quick Link usernames are auto-generated lowercase
// alphanumeric slugs (see organization.controller.ts's getOrCreateQuickLinkUsername).
// The two formats never overlap, so a single /pay/:wallet_id route can safely
// dispatch on shape instead of needing two separate route registrations. Each
// target stays its own lazy chunk so a Quick Link visit never pulls in the
// (much larger) product catalogue page, and vice versa.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const PayEntry: React.FC = () => {
    const { wallet_id } = useParams<{ wallet_id: string }>();
    const isWalletId = UUID_RE.test(wallet_id || '');

    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-slate-400" /></div>}>
            {isWalletId ? <PublicPay /> : <QuickPay />}
        </Suspense>
    );
};

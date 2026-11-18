import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
    ArrowDownToLine, ArrowLeftRight, ChevronRight,
    Plus, Sparkles, Wallet,
} from 'lucide-react';
import { cashbookService, formatKwacha } from 'core';
import { Layout } from '../components/Layout';
import { PersonalAdvice } from '../components/home/PersonalAdvice';
import { PersonalInsights } from '../components/home/PersonalInsights';
import ShareWalletLinkModal from '../components/ShareWalletLinkModal';
import { useAuth } from '../context/AuthContext';

const greeting = () => {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};

/** A white rounded card; the optional header carries a title and a "See all ›" link. */
const Card: React.FC<{ title?: string; actionLabel?: string; onAction?: () => void; className?: string; children: React.ReactNode }> = ({ title, actionLabel, onAction, className = '', children }) => (
    <section className={`rounded-2xl border border-[rgba(116,119,117,0.22)] bg-white p-6  ${className}`}>
        {title && (
            <div className="mb-5 flex items-center justify-between">
                <h2 className="text-sm font-bold text-[#1F1F1F]">{title}</h2>
                {actionLabel && (
                    <button type="button" onClick={onAction} className="flex items-center gap-1 text-sm text-[#5F6368] hover:text-[#1F1F1F]">
                        {actionLabel}
                        <ChevronRight size={14} />
                    </button>
                )}
            </div>
        )}
        {children}
    </section>
);

/**
 * Home for a MoneyWise personal account, laid out for the desktop: a balance hero with the two main actions and the wallets as tiles
 * down the left; rotating advice and the insights card down the right. On a phone it stacks into a single column.
 */
export const PersonalHome: React.FC = () => {
    const navigate = useNavigate();
    const { organizationId, notificationCounts, userName } = useAuth();
    const [receiveOpen, setReceiveOpen] = useState(false);

    const { data, isLoading } = useQuery({
        queryKey: ['cashbook-entries', 'overview', organizationId],
        queryFn: () => cashbookService.getOverview(),
        enabled: !!organizationId,
    });

    const wallets = ((data?.wallets ?? []) as any[])
        .map((w) => ({ id: String(w.id), name: String(w.name ?? 'Wallet'), balance: Number(w.balance ?? 0), isMain: !!w.is_main }))
        .sort((a, b) => Number(b.isMain) - Number(a.isMain));
    const mainWallet = wallets.find((w) => w.isMain) ?? wallets[0];
    const total = wallets.reduce((sum, w) => sum + w.balance, 0);

    const counts = notificationCounts ?? { requisitions: 0, approvals: 0, vouchers: 0, disbursements: 0, settings: 0, wallets: 0 };

    const ask = (text: string) => {
        const q = text.trim();
        if (!q) return;
        navigate('/intelligence', { state: { prompt: q } });
    };

    const firstName = (userName ?? '').trim().split(/\s+/)[0];

    return (
        <Layout noPadding={true} backgroundColor="bg-white">
            {/* A white panel on the shell, like Reports and Intelligence, so the sidebar and top bar read as separate from the page. */}
            <div className="flex-1 overflow-y-auto bg-white md:mx-4 md:mb-4 md:h-[calc(100%-1rem)] md:flex-none md:rounded-[20px] md:border md:border-[rgba(116,119,117,0.22)]">
            <div className="mx-auto w-full max-w-[1900px] px-5 py-6 md:px-8 md:py-8">
                {/* Header */}
                <div className="mb-6">
                    <div>
                        <h1 className="font-advercase text-3xl font-bold text-[#1F1F1F] md:text-4xl">
                            {greeting()}{firstName ? `, ${firstName}` : ''}
                        </h1>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 xl:grid-cols-12">
                    {/* Balance and wallets */}
                    <div className="flex flex-col gap-6 lg:col-span-2 xl:col-span-8">
                        {/* Balance hero */}
                        <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#0B57D0] to-[#0842A0] p-7 text-white md:p-8">
                            <p className="text-[11px] font-medium uppercase tracking-wider text-white/60">Total balance</p>
                            <p className="mt-2 text-4xl font-bold leading-none tracking-tight tabular-nums md:text-[44px]">{isLoading ? '…' : formatKwacha(total)}</p>
                            <p className="mt-2 text-[11px] font-medium text-white/60">
                                Across {wallets.length} {wallets.length === 1 ? 'wallet' : 'wallets'}
                            </p>
                            <div className="relative mt-7 flex flex-wrap gap-3">
                                <button
                                    type="button"
                                    onClick={() => setReceiveOpen(true)}
                                    disabled={!mainWallet}
                                    className="flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-[#0B57D0] transition hover:bg-white/90 active:opacity-90 disabled:opacity-50"
                                >
                                    <ArrowDownToLine size={16} strokeWidth={2} />
                                    Receive money
                                </button>
                                <button
                                    type="button"
                                    onClick={() => navigate('/send')}
                                    className="flex items-center gap-2 rounded-full bg-[#D3E3FD] px-5 py-3 text-sm font-semibold text-[#041E49] transition hover:bg-[#C2D7FA] active:opacity-90"
                                >
                                    <ArrowLeftRight size={16} strokeWidth={2} />
                                    Send money
                                </button>
                            </div>
                        </section>

                        {/* Wallets */}
                        <Card className="flex-1" title="Accounts" actionLabel="Manage wallets" onAction={() => navigate('/cashbook')}>
                            <button type="button" onClick={() => navigate('/manual-entry')} className="mb-4 -mt-2 text-xs font-semibold text-[#0B57D0] hover:underline">Record money by hand</button>
                            {isLoading ? (
                                <p className="py-4 text-sm text-[#80868B]">Loading…</p>
                            ) : wallets.length === 0 ? (
                                <p className="text-sm text-[#80868B]">No wallets yet.</p>
                            ) : (
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                                    {wallets.map((w) => (
                                        <button
                                            key={w.id}
                                            type="button"
                                            onClick={() => navigate('/cashbook')}
                                            className="group flex flex-col gap-4 rounded-2xl border border-[rgba(116,119,117,0.22)] p-4 text-left transition hover:border-[#0B57D0]/40 hover:bg-[#E8F0FE]"
                                        >
                                            <div className="flex items-center justify-between">
                                                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#E8F0FE] text-[#041E49]">
                                                    <Wallet size={16} />
                                                </span>
                                                {w.isMain && <span className="rounded-full bg-[#E8F0FE] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#0B57D0]">Main</span>}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="truncate text-xs text-[#5F6368]">{w.name}</p>
                                                <p className="mt-0.5 text-lg font-bold text-[#1F1F1F]">{formatKwacha(w.balance)}</p>
                                            </div>
                                        </button>
                                    ))}
                                    <button
                                        type="button"
                                        onClick={() => navigate('/cashbook')}
                                        className="flex min-h-[112px] flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-[#C4C7C5] text-sm text-[#5F6368] transition hover:border-[#0B57D0]/50 hover:text-[#0B57D0]"
                                    >
                                        <Plus size={18} />
                                        New wallet
                                    </button>
                                </div>
                            )}
                        </Card>
                    </div>

                    {/* Advice and insights */}
                    <div className="flex flex-col gap-6 lg:col-span-1 xl:col-span-4">
                        {/* Assistant */}
                        <Card>
                            <div className="mb-3 flex items-center gap-2">
                                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#E8F0FE] text-[#0B57D0]">
                                    <Sparkles size={16} />
                                </span>
                                <h2 className="text-sm font-bold text-[#1F1F1F]">Ask MoneyWise</h2>
                            </div>
                            <PersonalAdvice
                                totalBalance={total}
                                walletCount={wallets.length}
                                counts={counts}
                                ready={!isLoading}
                                onAsk={ask}
                            />
                        </Card>

                        {/* Insights */}
                        <Card className="flex-1" title="Insights" actionLabel="Reports" onAction={() => navigate('/reporting')}>
                            <PersonalInsights />
                        </Card>
                    </div>
                </div>
            </div>
            </div>

            {mainWallet && (
                <ShareWalletLinkModal
                    isOpen={receiveOpen}
                    onClose={() => setReceiveOpen(false)}
                    walletId={mainWallet.id}
                    walletName={mainWallet.name}
                    shareUrl={`${window.location.origin}/pay/${mainWallet.id}`}
                />
            )}
        </Layout>
    );
};

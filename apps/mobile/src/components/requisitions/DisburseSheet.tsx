import { useEffect, useMemo, useRef, useState } from 'react';
import {
    View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Wallet, Coins, Smartphone, Building2, AlertTriangle, Check } from 'lucide-react-native';
import { requisitionService, cashbookService, lencoService, formatKwacha } from 'core';
import { InlineSearchSelect } from '../InlineSearchSelect';
import { colors, fonts, radius } from '../../theme/tokens';

const LENCO_MIN_TRANSFER = 5;

type Route = 'WALLET' | 'CASH';
type Rail = 'MOBILE_MONEY' | 'BANK';

const normalisePhone = (v: string) => {
    const clean = v.replace(/[^0-9]/g, '');
    return clean.startsWith('260') ? '0' + clean.substring(3) : clean;
};
const operatorFor = (phone: string): string | null => {
    if (phone.startsWith('097') || phone.startsWith('077')) return 'AIRTEL';
    if (phone.startsWith('096') || phone.startsWith('076')) return 'MTN';
    if (phone.startsWith('095') || phone.startsWith('075')) return 'ZAMTEL';
    return null;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Mirrors the web card's parseDisburseError so the same failure reads the same on both. */
const explain = (raw: string, amount: number): { title: string; body: string; canRetry: boolean } => {
    const msg = raw.toLowerCase();
    if (msg.includes('less than k5') || msg.includes('minimum')) {
        return { title: 'Amount too low', body: `Lenco needs at least K${LENCO_MIN_TRANSFER} per transfer. This one is ${formatKwacha(amount)} — record it as Cash / Other instead.`, canRetry: false };
    }
    if (msg.includes('insufficient') || msg.includes('balance')) {
        return { title: 'Not enough funds', body: raw.length < 220 ? raw : 'The wallet doesn’t have enough real funds at Lenco to cover this transfer plus its fee. Top it up or pick another wallet.', canRetry: true };
    }
    if (msg.includes('invalid account') || msg.includes('account not found') || msg.includes('name not found')) {
        return { title: 'Recipient not verified', body: 'The account or mobile number couldn’t be verified. Check the details and try again.', canRetry: true };
    }
    if (msg.includes('network') || msg.includes('timeout') || msg.includes('connection') || msg.includes('failed to fetch')) {
        return { title: 'Connection problem', body: 'A temporary connection issue occurred. The requisition is still Authorised — wait a moment and try again.', canRetry: true };
    }
    if (msg.includes('already been disbursed') || msg.includes('duplicate')) {
        return { title: 'Already processed', body: 'This requisition has already been disbursed. Pull to refresh to see its latest status.', canRetry: false };
    }
    return { title: 'Disbursement failed', body: raw, canRetry: true };
};

/**
 * Pay out an authorised requisition — the same choices as the web card:
 *
 *  - MoneyWise Wallet: a real Lenco transfer from a chosen source wallet to a mobile-money number or bank account
 *    (operator detected from the number, recipient name verified, fee shown, wallet balance checked).
 *  - Cash / Other: records a payment made outside the system; no money moves electronically.
 *
 * Lenco payouts can sit PROCESSING for a while (MTN especially), so a pending transfer is polled for a short
 * time and otherwise reported as "on its way" rather than "done".
 */
export const DisburseSheet: React.FC<{
    requisitionId: string;
    amount: number;
    recipientName?: string;
    recipientAccount?: string;
    /** What the requestor saved at creation: a bank id, or AIRTEL / MTN / ZAMTEL. */
    recipientBankCode?: string;
    /** The saved payment method (MOBILE_MONEY, BANK, …), used to pre-select the rail. */
    savedMethod?: string;
    organizationId?: string;
    onDone: () => void;
    /** DISBURSE_EXCESS hits /disburse-excess instead of /disburse — same payload
     * shape, used to settle spend that came in over the original disbursal. */
    mode?: 'DISBURSE' | 'DISBURSE_EXCESS';
}> = ({ requisitionId, amount, recipientName, recipientAccount, recipientBankCode, savedMethod, organizationId, onDone, mode = 'DISBURSE' }) => {
    const qc = useQueryClient();
    const isExcess = mode === 'DISBURSE_EXCESS';

    const savedCode = (recipientBankCode || '').toUpperCase();
    const savedIsMomo = ['AIRTEL', 'MTN', 'ZAMTEL'].includes(savedCode) || ['AIRTEL', 'MTN', 'ZAMTEL', 'MOBILE_MONEY'].includes((savedMethod || '').toUpperCase());
    const savedIsBank = !savedIsMomo && (!!recipientBankCode || ['BANK', 'BANK_TRANSFER'].includes((savedMethod || '').toUpperCase()));

    const [route, setRoute] = useState<Route>('WALLET');
    const [rail, setRail] = useState<Rail>(savedIsBank ? 'BANK' : 'MOBILE_MONEY');
    const [recipient, setRecipient] = useState(recipientAccount ?? '');
    const [provider, setProvider] = useState<string | null>(recipientBankCode ? (savedIsMomo ? savedCode : recipientBankCode) : null);
    const [lookupName, setLookupName] = useState<string | null>(recipientName ?? null);
    const [looking, setLooking] = useState(false);
    const [walletId, setWalletId] = useState<string | null>(null);
    const [status, setStatus] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const lookupSeq = useRef(0);

    // ── source wallets (with balances) and banks ──
    const { data: wallets = [] } = useQuery({
        queryKey: ['disburse-wallets'],
        queryFn: async () => ((await cashbookService.getWallets()) || []).map((w: any) => ({ id: String(w.id), name: String(w.name), balance: Number(w.balance) || 0, isMain: !!w.is_main })),
        enabled: route === 'WALLET',
    });
    const { data: banksRaw } = useQuery({ queryKey: ['lenco-banks'], queryFn: () => lencoService.getBanks(), staleTime: 60 * 60_000, enabled: route === 'WALLET' && rail === 'BANK' });
    const banks: any[] = Array.isArray(banksRaw) ? banksRaw : (banksRaw?.data || []);

    useEffect(() => {
        if (!walletId && wallets.length > 0) setWalletId((wallets.find((w: any) => w.isMain) || wallets[0]).id);
    }, [wallets, walletId]);

    const selectedWallet = wallets.find((w: any) => w.id === walletId);
    // MoneyWise Pay (wallet-to-wallet) is an on-us transfer: no payout fee.
    const isMoneyWisePay = (savedMethod || '').toUpperCase() === 'MONEYWISE_PAY' || savedCode === 'MONEYWISE';
    const fee = lencoService.calculatePayoutFee(amount, isMoneyWisePay ? 'MONEYWISE_PAY' : rail);
    const totalDue = amount + fee;
    const insufficient = route === 'WALLET' && !!selectedWallet && totalDue > selectedWallet.balance;

    // ── operator detection (mobile money) ──
    const phone = rail === 'MOBILE_MONEY' ? normalisePhone(recipient) : '';
    useEffect(() => {
        if (rail !== 'MOBILE_MONEY' || !phone) return;
        const op = operatorFor(phone);
        if (op && op !== provider) setProvider(op);
    }, [phone, rail, provider]);

    // ── recipient name verification ──
    useEffect(() => {
        if (route !== 'WALLET' || lookupName || looking || !provider) return;
        const ready = rail === 'MOBILE_MONEY' ? phone.length === 10 : recipient.trim().length >= 5;
        if (!ready) return;
        const seq = ++lookupSeq.current;
        setLooking(true);
        const run = rail === 'MOBILE_MONEY'
            ? lencoService.resolveMobileMoney(phone, provider, organizationId)
            : lencoService.resolveBankAccount(recipient.trim(), provider, organizationId);
        run.then((res: any) => { if (seq === lookupSeq.current) setLookupName(res?.accountName || res?.account_name || res?.name || 'Name not found'); })
            .catch(() => { if (seq === lookupSeq.current) setLookupName('Name not found'); })
            .finally(() => { if (seq === lookupSeq.current) setLooking(false); });
    }, [route, rail, provider, phone, recipient, lookupName, looking, organizationId]);

    const bankItems = useMemo(() => banks.map((b) => ({ id: String(b.id), label: String(b.name) })), [banks]);
    const walletItems = useMemo(() => wallets.map((w: any) => ({ id: w.id, label: `${w.name} · ${formatKwacha(w.balance)}` })), [wallets]);

    const switchRail = (r: Rail) => {
        if (r === rail) return;
        setRail(r); setProvider(null); setLookupName(null); setRecipient(''); setError(null);
    };

    const walletReady = route === 'WALLET'
        && amount >= LENCO_MIN_TRANSFER
        && recipient.trim().length > 0
        && !!provider
        && (wallets.length === 0 || !!walletId)
        && !insufficient
        && lookupName !== 'Name not found';
    const canSubmit = route === 'CASH' ? amount > 0 : walletReady;

    const pay = useMutation({
        mutationFn: async () => {
            setError(null);
            if (route === 'CASH') {
                const payload = { payment_method: 'CASH', total_prepared: amount };
                return isExcess ? requisitionService.disburseExcess(requisitionId, payload) : requisitionService.disburse(requisitionId, payload);
            }
            setStatus('Initiating transfer…');
            const payload = {
                payment_method: 'MONEYWISE_WALLET',
                total_prepared: amount,
                recipient_account: rail === 'MOBILE_MONEY' ? phone : recipient.trim(),
                recipient_bank_code: (provider || '').toLowerCase(),
                recipient_account_name: lookupName && lookupName !== 'Name not found' ? lookupName : undefined,
                wallet_id: walletId || undefined,
            };
            const result: any = isExcess
                ? await requisitionService.disburseExcess(requisitionId, payload)
                : await requisitionService.disburse(requisitionId, payload);

            if (!isExcess && String(result?.lencoStatus || '').toLowerCase() === 'pending') {
                setStatus('Transfer initiated — waiting for Lenco to confirm…');
                for (let attempt = 0; attempt < 8; attempt++) {
                    await sleep(4000);
                    const poll: any = await requisitionService.verifyDisbursement(requisitionId);
                    if (poll?.status === 'successful') return { ...result, lencoStatus: 'successful' };
                    if (poll?.status === 'failed') {
                        throw new Error(poll.error || poll.details?.reasonForFailure || 'Transfer was rejected. The requisition has been reset to Authorised — please try again.');
                    }
                }
            }
            return result;
        },
        onSuccess: (res: any) => {
            setStatus(null);
            qc.invalidateQueries({ queryKey: ['requisitions'] });
            qc.invalidateQueries({ queryKey: ['cashbook-entries'] });
            qc.invalidateQueries({ queryKey: ['disburse-wallets'] });
            const lenco = String(res?.lencoStatus || '').toLowerCase();
            Alert.alert(
                route === 'CASH' ? 'Disbursed' : lenco === 'successful' ? 'Payout sent' : 'Payout on its way',
                route === 'CASH'
                    ? `${formatKwacha(amount)} recorded as paid out.`
                    : lenco === 'successful'
                        ? `${formatKwacha(amount)} was sent${lookupName && lookupName !== 'Name not found' ? ` to ${lookupName}` : ''}.`
                        : 'The transfer is still processing at Lenco. It can take a while to settle — the status will update on its own.',
            );
            onDone();
        },
        onError: (e: Error) => { setStatus(null); setError(e.message || 'An unexpected error occurred. Please try again.'); },
    });

    const parsed = error ? explain(error, amount) : null;

    if (pay.isPending) {
        return (
            <View style={styles.processing}>
                <ActivityIndicator size="large" color={colors.blue} />
                <Text style={styles.processingTitle}>Processing disbursal</Text>
                {!!status && <Text style={styles.processingSub}>{status}</Text>}
            </View>
        );
    }

    return (
        <View style={styles.root}>
            <Text style={styles.sectionTitle}>{isExcess ? 'Disburse excess' : 'Pay out'} {formatKwacha(amount)}</Text>

            <View style={styles.routes}>
                {([
                    { id: 'WALLET' as Route, label: 'MoneyWise Wallet', Icon: Wallet },
                    { id: 'CASH' as Route, label: 'Cash / Other', Icon: Coins },
                ]).map(({ id, label, Icon }) => (
                    <Pressable key={id} onPress={() => { setRoute(id); setError(null); }} style={[styles.route, route === id && styles.routeActive]}>
                        <Icon size={15} color={route === id ? '#FFFFFF' : colors.textMuted} />
                        <Text style={[styles.routeText, route === id && styles.routeTextActive]}>{label}</Text>
                    </Pressable>
                ))}
            </View>

            {route === 'CASH' ? (
                <View style={styles.note}>
                    <Coins size={18} color={colors.textMuted} />
                    <View style={{ flex: 1 }}>
                        <Text style={styles.noteTitle}>Manual disbursement</Text>
                        <Text style={styles.noteBody}>Record a payment made outside the system (cash handed over, or paid from another bank). No money is moved electronically.</Text>
                    </View>
                </View>
            ) : (
                <>
                    <View style={styles.rails}>
                        {([
                            { id: 'MOBILE_MONEY' as Rail, label: 'Mobile money', Icon: Smartphone },
                            { id: 'BANK' as Rail, label: 'Bank transfer', Icon: Building2 },
                        ]).map(({ id, label, Icon }) => (
                            <Pressable key={id} onPress={() => switchRail(id)} style={[styles.rail, rail === id && styles.railActive]}>
                                <Icon size={14} color={rail === id ? colors.blue : colors.textMuted} />
                                <Text style={[styles.railText, rail === id && styles.railTextActive]}>{label}</Text>
                            </Pressable>
                        ))}
                    </View>

                    <Text style={styles.label}>Amount</Text>
                    <View style={styles.amountBox}>
                        <Text style={styles.amountText}>{formatKwacha(amount)}</Text>
                        <Text style={styles.feeText}>Fee {formatKwacha(fee)}</Text>
                    </View>

                    {wallets.length > 0 && (
                        <>
                            <Text style={[styles.label, styles.spaced]}>Source wallet</Text>
                            <InlineSearchSelect
                                items={walletItems}
                                selectedId={walletId}
                                placeholder="Select source wallet"
                                searchPlaceholder="Search wallets…"
                                onSelect={(i) => setWalletId(i.id)}
                            />
                            {insufficient && (
                                <View style={styles.warn}>
                                    <AlertTriangle size={14} color="#B45309" />
                                    <Text style={styles.warnText}>
                                        This wallet only has {formatKwacha(selectedWallet?.balance ?? 0)} — this transfer needs {formatKwacha(totalDue)} (incl. fee). Choose another wallet or top it up first.
                                    </Text>
                                </View>
                            )}
                        </>
                    )}

                    {rail === 'BANK' && (
                        <>
                            <Text style={[styles.label, styles.spaced]}>Destination bank</Text>
                            <InlineSearchSelect
                                items={bankItems}
                                selectedId={provider}
                                placeholder={banks.length === 0 ? 'Loading banks…' : 'Select destination bank'}
                                searchPlaceholder="Search banks…"
                                onSelect={(i) => { setProvider(i.id); setLookupName(null); }}
                            />
                        </>
                    )}

                    <Text style={[styles.label, styles.spaced]}>{rail === 'MOBILE_MONEY' ? 'Recipient number' : 'Account number'}</Text>
                    <View>
                        <TextInput
                            style={styles.input}
                            value={recipient}
                            onChangeText={(t) => { setRecipient(t); setLookupName(null); setError(null); }}
                            keyboardType={rail === 'BANK' ? 'number-pad' : 'phone-pad'}
                            placeholder={rail === 'BANK' ? 'Account number' : '097…'}
                            placeholderTextColor={colors.textFaint}
                        />
                        <View style={styles.inputTag}>
                            {looking
                                ? <ActivityIndicator size="small" color={colors.blue} />
                                : rail === 'MOBILE_MONEY' && !!provider && <Text style={styles.providerTag}>{provider}</Text>}
                        </View>
                    </View>
                    {!!lookupName && (
                        <View style={styles.lookupRow}>
                            {lookupName === 'Name not found'
                                ? <AlertTriangle size={13} color={colors.danger} />
                                : <Check size={13} color={colors.positiveInk} />}
                            <Text style={[styles.lookupText, lookupName === 'Name not found' && { color: colors.danger }]}>{lookupName}</Text>
                        </View>
                    )}
                    {amount < LENCO_MIN_TRANSFER && (
                        <Text style={styles.hintError}>Lenco needs at least K{LENCO_MIN_TRANSFER} per transfer — use Cash / Other for this amount.</Text>
                    )}
                </>
            )}

            {!!parsed && (
                <View style={styles.errorCard}>
                    <Text style={styles.errorTitle}>{parsed.title}</Text>
                    <Text style={styles.errorBody}>{parsed.body}</Text>
                    <View style={styles.errorActions}>
                        {parsed.canRetry && canSubmit && (
                            <Pressable style={styles.errorBtn} onPress={() => pay.mutate()}><Text style={styles.errorBtnText}>Try again</Text></Pressable>
                        )}
                        {route === 'WALLET' && (
                            <Pressable style={styles.errorBtn} onPress={() => { setRoute('CASH'); setError(null); }}><Text style={styles.errorBtnText}>Use Cash / Other</Text></Pressable>
                        )}
                        <Pressable style={styles.errorBtn} onPress={() => setError(null)}><Text style={styles.errorBtnText}>Dismiss</Text></Pressable>
                    </View>
                </View>
            )}

            <Pressable
                style={({ pressed }) => [styles.btn, !canSubmit && styles.disabled, pressed && canSubmit && { opacity: 0.85 }]}
                onPress={() => pay.mutate()}
                disabled={!canSubmit}
            >
                <Text style={styles.btnText}>{route === 'CASH' ? 'Record disbursement' : 'Send money'}</Text>
            </Pressable>
        </View>
    );
};

const styles = StyleSheet.create({
    root: { gap: 8 },
    sectionTitle: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text, marginBottom: 6 },
    label: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textMuted, marginBottom: 4 },
    spaced: { marginTop: 12 },
    routes: { flexDirection: 'row', gap: 8, marginBottom: 6 },
    route: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
        paddingVertical: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong,
    },
    routeActive: { backgroundColor: colors.blue, borderColor: colors.blue },
    routeText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.textMuted },
    routeTextActive: { color: '#FFFFFF' },
    rails: { flexDirection: 'row', gap: 8, marginBottom: 8 },
    rail: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
        paddingVertical: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong,
    },
    railActive: { backgroundColor: colors.tabActiveBg, borderColor: colors.blue },
    railText: { fontFamily: fonts.bodyMedium, fontSize: 12.5, color: colors.textMuted },
    railTextActive: { color: colors.blue },
    amountBox: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 13,
        backgroundColor: colors.canvasAlt,
    },
    amountText: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.text },
    feeText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textMuted },
    input: {
        fontFamily: fonts.body, fontSize: 15, color: colors.text,
        borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md,
        paddingHorizontal: 14, paddingVertical: 12, paddingRight: 90,
    },
    inputTag: { position: 'absolute', right: 12, top: 0, bottom: 0, justifyContent: 'center' },
    providerTag: { fontFamily: fonts.bodyBold, fontSize: 11, color: colors.blue, letterSpacing: 0.5 },
    lookupRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, marginLeft: 4 },
    lookupText: { fontFamily: fonts.bodyBold, fontSize: 12.5, color: colors.positiveInk, textTransform: 'uppercase', letterSpacing: 0.3 },
    hintError: { fontFamily: fonts.body, fontSize: 12, color: colors.danger, marginTop: 6 },
    warn: {
        flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginTop: 8, padding: 12,
        borderRadius: radius.md, backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A',
    },
    warnText: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 12, lineHeight: 17, color: '#92400E' },
    note: {
        flexDirection: 'row', gap: 10, padding: 14, borderRadius: radius.md,
        backgroundColor: colors.canvasAlt, borderWidth: 1, borderColor: colors.border,
    },
    noteTitle: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text },
    noteBody: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: colors.textMuted, marginTop: 2 },
    errorCard: { marginTop: 10, padding: 14, borderRadius: radius.md, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA' },
    errorTitle: { fontFamily: fonts.bodyBold, fontSize: 13.5, color: '#991B1B' },
    errorBody: { fontFamily: fonts.body, fontSize: 12.5, lineHeight: 18, color: '#B91C1C', marginTop: 4 },
    errorActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
    errorBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#FECACA' },
    errorBtnText: { fontFamily: fonts.bodyBold, fontSize: 12, color: '#991B1B' },
    btn: {
        backgroundColor: colors.blue, borderRadius: radius.md, paddingVertical: 15,
        alignItems: 'center', justifyContent: 'center', minHeight: 50, marginTop: 14,
    },
    disabled: { opacity: 0.4 },
    btnText: { fontFamily: fonts.bodyBold, fontSize: 15, color: '#FFFFFF' },
    processing: { alignItems: 'center', paddingVertical: 36, gap: 10 },
    processingTitle: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.text },
    processingSub: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, textAlign: 'center' },
});

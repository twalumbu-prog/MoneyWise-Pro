import { useEffect, useState } from 'react';
import {
    Modal, View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, ActivityIndicator, Image, ScrollView
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { X, ImagePlus, CheckCircle2, AlertCircle, Smartphone, Wallet as WalletIcon } from 'lucide-react-native';
import {
    savingsService, cashbookService, lencoService, formatKwacha, requireCapability, getCore,
} from 'core';
import type { SavingsItem, SavingsKind, SavingsFrequency } from 'core';
import { uploadToBucket } from '../../lib/uploads';
import { useAuth } from '../../context/AuthContext';
import { SelectField, DateField, type SelectOption } from '../invest/application/formFields';
import { colors, fonts, radius } from '../../theme/tokens';
import { PaymentWaitingScreen } from '../payments/PaymentWaitingScreen';
import { useMobileMoneyCollection } from '../../hooks/useMobileMoneyCollection';
import { MobileMoneyNumberField, useMomoHolder } from '../payments/MobileMoneyNumberField';

/* ── Shared bottom sheet ─────────────────────────────────────────────────── */

const Sheet: React.FC<{ visible: boolean; onClose: () => void; title: string; children: React.ReactNode }> = ({ visible, onClose, title, children }) => {
    const insets = useSafeAreaInsets();
    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
            <Pressable style={styles.backdrop} onPress={onClose} />
            <KeyboardAvoidingView behavior="padding" style={styles.wrap} pointerEvents="box-none">
                <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
                    <View style={styles.handle} />
                    <View style={styles.header}>
                        <Text style={styles.title} numberOfLines={1}>{title}</Text>
                        <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={8} accessibilityLabel="Close"><X size={18} color={colors.textFaint} /></Pressable>
                    </View>
                    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, paddingBottom: 8 }} bounces={false}>
                        {children}
                    </ScrollView>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
};

const AmountInput: React.FC<{ value: string; onChange: (v: string) => void; error?: string }> = ({ value, onChange, error }) => (
    <View style={{ marginBottom: 16 }}>
        <Text style={styles.label}>Amount</Text>
        <View style={[styles.amountBox, !!error && styles.inputError]}>
            <Text style={styles.currency}>K</Text>
            <TextInput
                value={value}
                onChangeText={(t) => onChange(t.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1'))}
                placeholder="0.00"
                placeholderTextColor={colors.textFaint}
                keyboardType="decimal-pad"
                style={styles.amountInput}
                accessibilityLabel="Amount"
            />
        </View>
        {!!error && <Text style={styles.error}>{error}</Text>}
    </View>
);

const PrimaryBtn: React.FC<{ label: string; onPress: () => void; loading?: boolean; disabled?: boolean; dark?: boolean }> = ({ label, onPress, loading, disabled, dark }) => (
    <Pressable
        onPress={onPress}
        disabled={disabled || loading}
        style={({ pressed }) => [styles.primary, dark && { backgroundColor: '#000000' }, (disabled || loading) && { opacity: 0.55 }, pressed && { opacity: 0.85 }]}
    >
        {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>{label}</Text>}
    </Pressable>
);

const Banner: React.FC<{ text: string | null; tone?: 'error' | 'info' }> = ({ text, tone = 'error' }) => text ? (
    <View style={[styles.banner, tone === 'info' && styles.bannerInfo]}>
        <AlertCircle size={16} color={tone === 'info' ? colors.blue : '#B91C1C'} />
        <Text style={[styles.bannerText, tone === 'info' && { color: colors.navy }]}>{text}</Text>
    </View>
) : null;

/** MoneyWise wallets the user can pay from / into — never a savings wallet itself. */
function useSpendWallets(excludeId?: string) {
    const { data } = useQuery({ queryKey: ['wallets-payment-flow'], queryFn: () => cashbookService.getWallets() });
    const list: any[] = Array.isArray(data) ? data : (data?.data || []);
    return list
        .filter((w) => w.id !== excludeId && !/\(Savings( [A-Z0-9]{3})?\)$/.test(String(w.name)))
        .map((w) => ({ id: String(w.id), name: String(w.name), balance: Number(w.balance) || 0 }));
}

const KIND_COPY: Record<SavingsKind, { title: string; namePh: string; targetLabel: string; targetOptional: boolean }> = {
    WISHLIST: { title: 'Add to wishlist', namePh: 'e.g. Sony WH-1000XM5', targetLabel: 'Price', targetOptional: false },
    GOAL: { title: 'New savings goal', namePh: 'e.g. Emergency fund', targetLabel: 'Target amount', targetOptional: true },
    GROUP: { title: 'New group savings', namePh: 'e.g. Livingstone Group Trip', targetLabel: 'Group target', targetOptional: false },
};

/* ── Create ──────────────────────────────────────────────────────────────── */

export const CreateSavingsSheet: React.FC<{ visible: boolean; kind: SavingsKind; onClose: () => void; onCreated: (item: SavingsItem) => void }> = ({ visible, kind, onClose, onCreated }) => {
    const qc = useQueryClient();
    const { organizationId } = useAuth();
    const copy = KIND_COPY[kind];
    const [name, setName] = useState('');
    const [target, setTarget] = useState('');
    const [description, setDescription] = useState('');
    const [goalDate, setGoalDate] = useState('');
    const [frequency, setFrequency] = useState<SavingsFrequency | null>(null);
    const [link, setLink] = useState('');
    const [image, setImage] = useState<{ uri: string; url: string } | null>(null);
    const [uploading, setUploading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (visible) { setName(''); setTarget(''); setDescription(''); setGoalDate(''); setFrequency(null); setLink(''); setImage(null); setError(null); }
    }, [visible]);

    const pickImage = async () => {
        try {
            const [file] = await requireCapability('files').pick({ kind: 'image' });
            if (!file) return;
            setUploading(true); setError(null);
            const compressed = await requireCapability('files').compressImage(file, 1024 * 1024);
            const path = `${organizationId ?? 'org'}/savings/${Date.now()}.jpg`;
            await uploadToBucket('organization-logos', path, { ...compressed, mimeType: compressed.mimeType || 'image/jpeg' });
            const { data } = getCore().supabase.storage.from('organization-logos').getPublicUrl(path);
            setImage({ uri: compressed.uri, url: data.publicUrl });
        } catch (e: any) {
            setError(e?.message || 'Could not add the picture.');
        } finally {
            setUploading(false);
        }
    };

    const save = async () => {
        if (name.trim().length < 2) { setError('Give it a name.'); return; }
        const t = Number(target);
        if (!copy.targetOptional && (!target || !(t > 0))) { setError(`Enter the ${copy.targetLabel.toLowerCase()}.`); return; }
        if (goalDate && goalDate <= new Date().toISOString().split('T')[0]) { setError('The goal date must be in the future.'); return; }
        setSaving(true); setError(null);
        try {
            const item = await savingsService.create({
                kind, name: name.trim(), targetAmount: target ? t : undefined, imageUrl: image?.url,
                ...(kind !== 'GROUP' ? {
                    description: description.trim() || undefined,
                    targetDate: goalDate || undefined,
                    frequency: frequency ?? undefined,
                    productUrl: kind === 'WISHLIST' && link.trim() ? link.trim() : undefined,
                } : {}),
            });
            qc.invalidateQueries({ queryKey: ['savings'] });
            onCreated(item);
        } catch (e: any) {
            setError(e?.message || 'Could not create it. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    const showDetails = kind !== 'GROUP';

    return (
        <Sheet visible={visible} onClose={onClose} title={copy.title}>
            <Banner text={error} />

            {kind === 'WISHLIST' && (
                // Same photo box as Products & services on the web: a dashed square you tap, with the hint beside it.
                <View style={styles.photoRow}>
                    <Pressable onPress={pickImage} disabled={uploading} style={({ pressed }) => [styles.photoBox, pressed && { opacity: 0.8 }]} accessibilityLabel="Upload item photo">
                        {uploading ? <ActivityIndicator size="small" color={colors.blue} />
                            : image ? <Image source={{ uri: image.uri }} style={styles.photoImg} />
                            : <ImagePlus size={22} color="#D1D5DB" />}
                    </Pressable>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.photoTitle}>Item photo</Text>
                        <Text style={styles.photoHint}>Tap the box to upload. Optional but recommended.</Text>
                        {!!image && <Pressable onPress={() => setImage(null)} hitSlop={6}><Text style={styles.photoRemove}>Remove photo</Text></Pressable>}
                    </View>
                </View>
            )}

            <Text style={styles.label}>Name</Text>
            <TextInput value={name} onChangeText={setName} placeholder={copy.namePh} placeholderTextColor={colors.textFaint} style={[styles.input, { marginBottom: 16 }]} autoCapitalize="sentences" />
            <Text style={styles.label}>{copy.targetLabel}{copy.targetOptional ? ' (optional)' : ''}</Text>
            <View style={[styles.amountBox, { marginBottom: 16 }]}>
                <Text style={styles.currency}>K</Text>
                <TextInput value={target} onChangeText={(t) => setTarget(t.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1'))} placeholder="0.00" placeholderTextColor={colors.textFaint} keyboardType="decimal-pad" style={styles.amountInput} />
            </View>

            {showDetails && (
                <>
                    <Text style={styles.label}>Description (optional)</Text>
                    <TextInput
                        value={description} onChangeText={setDescription} placeholder={kind === 'WISHLIST' ? 'Why you want it, colour, model…' : 'What this money is for'}
                        placeholderTextColor={colors.textFaint} multiline style={[styles.input, styles.multiline, { marginBottom: 16 }]}
                    />

                    <DateField label="Goal date (optional)" value={goalDate} onChange={setGoalDate} />

                    <Text style={styles.label}>How often will you save? (optional)</Text>
                    <View style={styles.freqRow}>
                        {([['DAILY', 'Daily'], ['WEEKLY', 'Weekly'], ['MONTHLY', 'Monthly']] as [SavingsFrequency, string][]).map(([f, label]) => (
                            <Pressable key={f} onPress={() => setFrequency((cur) => (cur === f ? null : f))} style={[styles.freqChip, frequency === f && styles.freqChipOn]}>
                                <Text style={[styles.freqText, frequency === f && styles.freqTextOn]}>{label}</Text>
                            </Pressable>
                        ))}
                    </View>

                    {kind === 'WISHLIST' && (
                        <>
                            <Text style={styles.label}>Link to the product (optional)</Text>
                            <TextInput
                                value={link} onChangeText={setLink} placeholder="https://…" placeholderTextColor={colors.textFaint}
                                autoCapitalize="none" autoCorrect={false} keyboardType="url" style={[styles.input, { marginBottom: 16 }]}
                            />
                        </>
                    )}
                </>
            )}

            {kind === 'GROUP' && <Text style={styles.hint}>You'll get an invite code to share. People who join can contribute by mobile money.</Text>}
            <PrimaryBtn label="Create" onPress={save} loading={saving} disabled={uploading} dark={kind === 'GROUP'} />
        </Sheet>
    );
};

/* ── Add money ───────────────────────────────────────────────────────────── */

/**
 * Owners move money in from one of their MoneyWise wallets (or pay by mobile money); a group
 * member pays by mobile money, collected straight into the group's wallet. Mobile money runs
 * through the shared hardened collection flow (org-attributed reference, awaited finalise,
 * declined handling, resume, "check payment status"), and every kind records a contribution so
 * the server can settle it on its own if the app is closed before Lenco confirms.
 */
export const AddMoneySheet: React.FC<{ visible: boolean; item: SavingsItem | null; onClose: () => void; onDone: () => void }> = ({ visible, item, onClose, onDone }) => {
    const qc = useQueryClient();
    const isOwner = item?.role === 'OWNER';
    const wallets = useSpendWallets(item?.walletId);
    const [method, setMethod] = useState<'WALLET' | 'MOBILE_MONEY'>('WALLET');
    const [amount, setAmount] = useState('');
    const [walletId, setWalletId] = useState('');
    const [phone, setPhone] = useState('');
    const [busy, setBusy] = useState(false);
    const [stage, setStage] = useState<'form' | 'done'>('form');
    const [error, setError] = useState<string | null>(null);
    const [target, setTarget] = useState<{ walletId: string; organizationId: string; name: string } | null>(null);

    const itemId = item?.id;
    const collection = useMobileMoneyCollection({
        storageKey: `savings:${itemId ?? 'none'}`,
        onConfirmed: async (ref) => { if (itemId) await savingsService.confirmContribution(itemId, ref); },
    });

    useEffect(() => {
        if (!visible) return;
        setMethod('WALLET'); setAmount(''); setPhone(''); setError(null); setStage('form');
    }, [visible, isOwner, item?.id]);
    useEffect(() => { if (!walletId && wallets.length) setWalletId(wallets[0].id); }, [wallets, walletId]);

    const { operator, holder, resolving, resolveFailed } = useMomoHolder(phone, method === 'MOBILE_MONEY');

    const walletOptions: SelectOption[] = wallets.map((w) => ({ value: w.id, label: `${w.name} · ${formatKwacha(w.balance)}` }));
    const selected = wallets.find((w) => w.id === walletId);
    const value = Number(amount);

    // The lists are refreshed when the sheet is dismissed (not when the money lands), so the
    // progress bars behind it spring to their new level while the user is looking at them.
    const refreshLists = () => {
        qc.invalidateQueries({ queryKey: ['savings'] });
        qc.invalidateQueries({ queryKey: ['wallets-payment-flow'] });
    };

    const payFromWallet = async () => {
        if (!item) return;
        if (!(value > 0)) { setError('Enter an amount.'); return; }
        if (!selected) { setError('Choose a wallet to pay from.'); return; }
        if (selected.balance < value) { setError(`Not enough in ${selected.name}.`); return; }
        setBusy(true); setError(null);
        try {
            if (isOwner) {
                await savingsService.deposit(item.id, value, selected.id);
                setStage('done');
            } else {
                // A member's wallet is in a different organization from the group's: a real Lenco transfer.
                const r = await savingsService.memberDeposit(item.id, value, selected.id);
                if (r.status === 'CONFIRMED') setStage('done');
                else if (r.status === 'PENDING') {
                    setError('Your transfer is on its way. It can take a minute to confirm — it will show in the group once it lands.');
                    refreshLists();
                } else setError('The transfer didn’t go through. Nothing was taken from your wallet.');
            }
        }
        catch (e: any) { setError(e?.message || 'Could not add the money.'); }
        finally { setBusy(false); }
    };

    const payByMobileMoney = async () => {
        if (!item) return;
        if (!(value > 0)) { setError('Enter an amount.'); return; }
        if (!operator) { setError('Enter a valid Airtel, MTN or Zamtel number.'); return; }
        setError(null);
        const fallback = { walletId: item.walletId, organizationId: item.organizationId, name: item.name };
        setTarget(fallback);
        await collection.start({
            tag: 'SAV',
            organizationId: item.organizationId,
            walletId: item.walletId,
            amount: value,
            phone,
            operator,
            prepare: async (ref) => {
                // Record the contribution first (any kind), then the PENDING ledger intent.
                const t = await savingsService.startContribution(item.id, value, ref);
                const dest = { walletId: t?.walletId || fallback.walletId, organizationId: t?.organizationId || fallback.organizationId, name: t?.name || fallback.name };
                setTarget(dest);
                await lencoService.logPublicWalletDepositIntent(ref, `Savings: ${dest.name}`, value, dest.walletId);
            },
        });
    };

    const close = () => { if (stage === 'done' || collection.phase) refreshLists(); onClose(); };

    if (visible && collection.phase) {
        return (
            <Modal visible animationType="slide" onRequestClose={() => { refreshLists(); onClose(); }} statusBarTranslucent>
                <PaymentWaitingScreen
                    phase={collection.phase}
                    amount={collection.amount}
                    businessName={target?.name || item?.name || 'Savings'}
                    payerPhone={collection.phone}
                    operator={collection.operator}
                    elapsedSeconds={collection.elapsed}
                    reference={collection.reference}
                    headerLabel="Add money"
                    doneLabel="Done"
                    failureMessage={collection.failureMessage}
                    declined={collection.declined}
                    rechecking={collection.rechecking}
                    recheckNote={collection.recheckNote}
                    onRecheck={collection.recheck}
                    onRetry={collection.reset}
                    onCancel={collection.cancel}
                    onDone={() => { const ok = collection.phase === 'success'; collection.reset(); refreshLists(); if (ok) onDone(); else onClose(); }}
                />
            </Modal>
        );
    }

    return (
        <Sheet visible={visible} onClose={close} title={item ? `Add money · ${item.name}` : 'Add money'}>
            {stage === 'done' ? (
                <View style={{ alignItems: 'center', gap: 10, paddingVertical: 12 }}>
                    <CheckCircle2 size={44} color={colors.positiveInk} />
                    <Text style={styles.doneTitle}>{formatKwacha(value)} added</Text>
                    <Text style={styles.hint}>It's now in {item?.name}.</Text>
                    <View style={{ alignSelf: 'stretch', marginTop: 8 }}><PrimaryBtn label="Done" onPress={() => { refreshLists(); onDone(); }} /></View>
                </View>
            ) : (
                <>
                    <Banner text={error || collection.error} />
                    {(isOwner || item?.kind === 'GROUP') && (
                        <View style={styles.methodRow}>
                            {(['WALLET', 'MOBILE_MONEY'] as const).map((m) => (
                                <Pressable key={m} onPress={() => { setMethod(m); setError(null); collection.setError(null); }} style={[styles.methodBtn, method === m && styles.methodBtnOn]}>
                                    {m === 'WALLET' ? <WalletIcon size={14} color={method === m ? colors.blue : colors.textMuted} /> : <Smartphone size={14} color={method === m ? colors.blue : colors.textMuted} />}
                                    <Text style={[styles.methodText, method === m && styles.methodTextOn]}>{m === 'WALLET' ? 'MoneyWise wallet' : 'Mobile money'}</Text>
                                </Pressable>
                            ))}
                        </View>
                    )}
                    <AmountInput value={amount} onChange={(v) => { setAmount(v); setError(null); }} />
                    {method === 'WALLET' ? (
                        <SelectField label="Pay from" value={walletId} options={walletOptions} onChange={setWalletId} placeholder={wallets.length ? 'Choose wallet' : 'Loading wallets…'} />
                    ) : (
                        <View style={{ marginBottom: 16 }}>
                            <MobileMoneyNumberField
                                label="Mobile money number"
                                phone={phone} onChangePhone={setPhone}
                                operator={operator} holder={holder} resolving={resolving} resolveFailed={resolveFailed}
                            />
                        </View>
                    )}
                    <PrimaryBtn
                        label={method === 'WALLET' ? 'Add money' : 'Send payment request'}
                        onPress={method === 'WALLET' ? payFromWallet : payByMobileMoney}
                        loading={busy || collection.busy}
                    />
                </>
            )}
        </Sheet>
    );
};

/* ── Transfer out ────────────────────────────────────────────────────────── */

export const TransferOutSheet: React.FC<{ visible: boolean; item: SavingsItem | null; onClose: () => void; onDone: () => void }> = ({ visible, item, onClose, onDone }) => {
    const qc = useQueryClient();
    const wallets = useSpendWallets(item?.walletId);
    const [amount, setAmount] = useState('');
    const [walletId, setWalletId] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => { if (visible) { setAmount(''); setError(null); } }, [visible]);
    useEffect(() => { if (!walletId && wallets.length) setWalletId(wallets[0].id); }, [wallets, walletId]);

    const go = async () => {
        if (!item) return;
        const v = Number(amount);
        if (!(v > 0)) { setError('Enter an amount.'); return; }
        if (v > item.balance) { setError(`There's only ${formatKwacha(item.balance)} in ${item.name}.`); return; }
        if (!walletId) { setError('Choose where to send it.'); return; }
        setBusy(true); setError(null);
        try {
            await savingsService.withdraw(item.id, v, walletId);
            qc.invalidateQueries({ queryKey: ['savings'] });
            qc.invalidateQueries({ queryKey: ['wallets-payment-flow'] });
            onDone();
        } catch (e: any) { setError(e?.message || 'Could not transfer.'); }
        finally { setBusy(false); }
    };

    return (
        <Sheet visible={visible} onClose={onClose} title={item ? `Transfer from ${item.name}` : 'Transfer'}>
            <Banner text={error} />
            <Text style={[styles.hint, { marginBottom: 14 }]}>Available: {formatKwacha(item?.balance ?? 0)}</Text>
            <AmountInput value={amount} onChange={(v) => { setAmount(v); setError(null); }} />
            <SelectField label="Send to" value={walletId} options={wallets.map((w) => ({ value: w.id, label: w.name }))} onChange={setWalletId} placeholder="Choose wallet" />
            <PrimaryBtn label="Transfer" onPress={go} loading={busy} />
        </Sheet>
    );
};

/* ── Join a group ────────────────────────────────────────────────────────── */

export const JoinGroupSheet: React.FC<{ visible: boolean; initialCode?: string; onClose: () => void; onJoined: (id: string) => void }> = ({ visible, initialCode, onClose, onJoined }) => {
    const qc = useQueryClient();
    const [code, setCode] = useState(initialCode ?? '');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    useEffect(() => { if (visible) { setCode(initialCode ?? ''); setError(null); } }, [visible, initialCode]);

    const join = async () => {
        if (code.trim().length < 6) { setError('Enter the invite code.'); return; }
        setBusy(true); setError(null);
        try {
            const r = await savingsService.join(code.trim());
            qc.invalidateQueries({ queryKey: ['savings'] });
            onJoined(r.id);
        } catch (e: any) { setError(e?.message || 'Could not join.'); }
        finally { setBusy(false); }
    };

    return (
        <Sheet visible={visible} onClose={onClose} title="Join group savings">
            <Banner text={error} />
            <Text style={styles.label}>Invite code</Text>
            <TextInput
                value={code} onChangeText={(t) => setCode(t.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12))}
                placeholder="e.g. 7KQ2MXRA" placeholderTextColor={colors.textFaint} autoCapitalize="characters" autoCorrect={false}
                style={[styles.input, styles.codeInput, { marginBottom: 20 }]}
            />
            <PrimaryBtn label="Join group" onPress={join} loading={busy} />
        </Sheet>
    );
};

const styles = StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,42,60,0.5)' },
    wrap: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end' },
    sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%' },
    handle: { width: 48, height: 5, borderRadius: 3, backgroundColor: colors.border, alignSelf: 'center', marginTop: 10 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.canvasAlt },
    title: { flex: 1, fontFamily: fonts.bodyBold, fontSize: 18, color: colors.navy },
    closeBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.canvasAlt, alignItems: 'center', justifyContent: 'center' },
    label: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.navy, marginBottom: 6 },
    input: { minHeight: 48, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, paddingHorizontal: 16, fontFamily: fonts.body, fontSize: 15, color: colors.text },
    codeInput: { fontFamily: fonts.bodyBold, fontSize: 18, letterSpacing: 3, textAlign: 'center' },
    inputError: { borderColor: colors.danger },
    error: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.danger, marginTop: 4 },
    amountBox: { flexDirection: 'row', alignItems: 'center', minHeight: 56, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, paddingHorizontal: 16, gap: 6 },
    currency: { fontFamily: fonts.bodyBold, fontSize: 22, color: colors.textMuted },
    amountInput: { flex: 1, fontFamily: fonts.bodyBold, fontSize: 24, color: colors.text, paddingVertical: 10 },
    primary: { minHeight: 50, borderRadius: radius.pill, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
    primaryText: { fontFamily: fonts.bodyBold, fontSize: 15, color: '#FFFFFF' },
    banner: { flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FCA5A5', borderRadius: radius.md, padding: 12, marginBottom: 14 },
    bannerInfo: { backgroundColor: colors.tabActiveBg, borderColor: 'rgba(0,106,255,0.15)' },
    bannerText: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 13, color: '#991B1B' },
    hint: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 19, marginBottom: 14 },
    photoRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 20 },
    photoBox: { width: 80, height: 80, borderRadius: 16, backgroundColor: '#F9FAFB', borderWidth: 2, borderStyle: 'dashed', borderColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    photoImg: { width: '100%', height: '100%' },
    photoTitle: { fontFamily: fonts.bodyBold, fontSize: 14, color: '#1F2937' },
    photoHint: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, marginTop: 2, lineHeight: 17 },
    photoRemove: { fontFamily: fonts.bodyBold, fontSize: 12, color: '#EF4444', marginTop: 4 },
    multiline: { minHeight: 84, textAlignVertical: 'top', paddingTop: 12 },
    freqRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
    freqChip: { flex: 1, height: 40, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
    freqChipOn: { borderColor: colors.blue, backgroundColor: colors.tabActiveBg },
    freqText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textMuted },
    freqTextOn: { fontFamily: fonts.bodyBold, color: colors.blue },
    imagePick: { height: 140, borderRadius: radius.lg, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.borderStrong, backgroundColor: colors.tabActiveBg, alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 18, overflow: 'hidden' },
    imagePreview: { width: '100%', height: '100%' },
    imagePickText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.blue },
    methodRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
    methodBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 40, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong },
    methodBtnOn: { borderColor: colors.blue, backgroundColor: colors.tabActiveBg },
    methodText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textMuted },
    methodTextOn: { color: colors.blue, fontFamily: fonts.bodyBold },
    holder: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.positiveInk, marginTop: 6 },
    doneTitle: { fontFamily: fonts.bodyBold, fontSize: 18, color: colors.navy, textAlign: 'center' },
});

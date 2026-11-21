import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { ChevronRight, PiggyBank, TrendingUp, Landmark, Home, Car, Briefcase, HandCoins, CreditCard, Banknote, Users } from 'lucide-react-native';
import { PersonalStepError, type HoldingKind, type PersonalHolding } from 'core';
import { PersonalStepShell } from './PersonalStepShell';
import { Sheet, MoneyField, fmtK, formatTyped, parseTyped, moneyStyles as m } from './moneyUi';
import { Field } from './steps';
import type { StepContext } from './stepContext';
import { colors, fonts, radius } from '../../../theme/tokens';

/**
 * Step "assets": savings, investments, property and the like, and what's owed (loans, credit, money owed to people).
 * Each item becomes its own account with an opening balance, so net worth comes straight from the books. A loan with
 * a monthly repayment is carried to the bills step.
 */
const KINDS: { kind: HoldingKind; label: string; Icon: any; debt?: boolean }[] = [
    { kind: 'savings', label: 'Savings or fixed deposit', Icon: PiggyBank },
    { kind: 'investments', label: 'Investments', Icon: TrendingUp },
    { kind: 'pension', label: 'Pension', Icon: Landmark },
    { kind: 'property', label: 'Property', Icon: Home },
    { kind: 'vehicle', label: 'Vehicle', Icon: Car },
    { kind: 'business', label: 'Business stake', Icon: Briefcase },
    { kind: 'owed_to_me', label: 'Money owed to you', Icon: HandCoins },
    { kind: 'loan', label: 'Loan', Icon: Banknote, debt: true },
    { kind: 'credit_card', label: 'Credit card or overdraft', Icon: CreditCard, debt: true },
    { kind: 'owed_by_me', label: 'Money you owe', Icon: Users, debt: true },
];
const kindDef = (k: HoldingKind) => KINDS.find((x) => x.kind === k)!;

export function StepAssets({ ctx }: { ctx: StepContext }) {
    const [editing, setEditing] = useState<{ kind: HoldingKind; existing?: PersonalHolding } | null>(null);
    const holdings = ctx.money?.holdings ?? [];
    const own = holdings.filter((h) => h.type === 'ASSET');
    const owe = holdings.filter((h) => h.type === 'LIABILITY');

    return (
        <PersonalStepShell
            def={ctx.def} progress={ctx.progress} onBack={ctx.onBack} onSkip={ctx.skip}
            onContinue={() => ctx.done({ count: holdings.length })} saving={ctx.saving} error={ctx.error}
            continueLabel={ctx.single ? 'Done' : holdings.length ? 'Continue' : 'Nothing else, continue'}
        >
            <Text style={[m.sectionTitle, { marginTop: 0 }]}>What you own</Text>
            <Tiles kinds={KINDS.filter((k) => !k.debt)} onPick={(kind) => setEditing({ kind })} />
            <Text style={m.sectionTitle}>What you owe</Text>
            <Tiles kinds={KINDS.filter((k) => k.debt)} onPick={(kind) => setEditing({ kind })} />

            {holdings.length > 0 && (
                <View style={{ marginTop: 8 }}>
                    <Text style={m.sectionTitle}>Added</Text>
                    {[...own, ...owe].map((h) => {
                        const { Icon } = kindDef(h.kind);
                        return (
                            <Pressable key={h.accountId} onPress={() => setEditing({ kind: h.kind, existing: h })} style={m.row} accessibilityRole="button" accessibilityLabel={`${h.name}, ${fmtK(h.value)}. Edit`}>
                                <View style={[styles.icon, h.type === 'LIABILITY' && { backgroundColor: '#FEF2F2' }]}><Icon size={18} color={h.type === 'LIABILITY' ? colors.danger : colors.blue} /></View>
                                <Text style={m.rowName}>{h.name}</Text>
                                <Text style={[m.rowAmount, h.type === 'LIABILITY' && { color: colors.danger }]}>{h.type === 'LIABILITY' ? '− ' : ''}{fmtK(h.value)}</Text>
                                <ChevronRight size={18} color={colors.textFaint} />
                            </Pressable>
                        );
                    })}
                </View>
            )}

            <HoldingSheet editing={editing} ctx={ctx} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void ctx.refreshMoney(); }} />
        </PersonalStepShell>
    );
}

function Tiles({ kinds, onPick }: { kinds: typeof KINDS; onPick: (k: HoldingKind) => void }) {
    return (
        <View style={styles.tiles}>
            {kinds.map(({ kind, label, Icon, debt }) => (
                <Pressable key={kind} onPress={() => onPick(kind)} style={({ pressed }) => [styles.tile, pressed && { opacity: 0.7 }]} accessibilityRole="button" accessibilityLabel={`Add ${label}`}>
                    <Icon size={18} color={debt ? colors.danger : colors.blue} />
                    <Text style={styles.tileText}>{label}</Text>
                </Pressable>
            ))}
        </View>
    );
}

function HoldingSheet({ editing, ctx, onClose, onSaved }: { editing: { kind: HoldingKind; existing?: PersonalHolding } | null; ctx: StepContext; onClose: () => void; onSaved: () => void }) {
    const [name, setName] = useState('');
    const [value, setValue] = useState('');
    const [repay, setRepay] = useState('');
    const [day, setDay] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

    useEffect(() => {
        if (!editing) return;
        const ex = editing.existing;
        setName(ex?.name ?? '');
        setValue(ex ? formatTyped(String(ex.value)) : '');
        setRepay(ex?.monthlyRepayment ? formatTyped(String(ex.monthlyRepayment)) : '');
        setDay(ex?.repaymentDay ? String(ex.repaymentDay) : '');
        setError(null); setFieldErrors({});
    }, [editing]);

    if (!editing) return null;
    const def = kindDef(editing.kind);
    const isLoan = editing.kind === 'loan' || editing.kind === 'credit_card';

    const save = async () => {
        setBusy(true); setError(null); setFieldErrors({});
        try {
            await ctx.service.saveHolding({
                accountId: editing.existing?.accountId, kind: editing.kind, name: name || def.label, value: parseTyped(value),
                monthlyRepayment: isLoan && repay ? parseTyped(repay) : null, repaymentDay: isLoan && day ? Number(day) : null,
            });
            onSaved();
        } catch (e: any) {
            if (e instanceof PersonalStepError && e.field) setFieldErrors({ [e.field]: e.message });
            else setError(e?.message || 'Couldn’t save. Try again.');
        } finally { setBusy(false); }
    };
    const remove = async () => {
        if (!editing.existing) return;
        setBusy(true);
        try { await ctx.service.deleteHolding(editing.existing.accountId); onSaved(); } catch (e: any) { setError(e?.message || 'Couldn’t remove it.'); } finally { setBusy(false); }
    };

    return (
        <Sheet
            visible title={editing.existing ? `Edit ${editing.existing.name}` : def.label} onClose={onClose} busy={busy} error={error}
            primary={{ label: 'Save', onPress: () => void save(), disabled: parseTyped(value) <= 0 }}
            secondary={editing.existing ? { label: 'Remove', onPress: () => void remove(), danger: true } : undefined}
        >
            <Field label="Name" value={name} onChangeText={setName} placeholder={def.label} autoCapitalize="sentences" error={fieldErrors.name} />
            <MoneyField label={def.debt ? 'How much is left to pay' : 'What it’s worth today'} value={value} onChange={setValue} error={fieldErrors.value} autoFocus={!editing.existing} />
            {isLoan && (
                <>
                    <MoneyField label="Monthly repayment (optional)" value={repay} onChange={setRepay} error={fieldErrors.monthlyRepayment} hint="We’ll add it to your regular bills." />
                    <Field label="Day of the month it’s paid (optional)" value={day} onChangeText={(t) => setDay(t.replace(/\D/g, '').slice(0, 2))} keyboardType="number-pad" placeholder="e.g. 25" error={fieldErrors.repaymentDay} />
                </>
            )}
        </Sheet>
    );
}

const styles = StyleSheet.create({
    tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    tile: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface },
    tileText: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text },
    icon: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#EAF1FF', alignItems: 'center', justifyContent: 'center' },
});

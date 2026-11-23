import React, { useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { ChevronRight, Plus } from 'lucide-react-native';
import type { MoneyProviderType } from 'core';
import { PersonalStepShell } from './PersonalStepShell';
import { AccountSheet, type AccountTarget } from './AccountSheet';
import { ProviderLogo, Sheet, fmtK, moneyStyles as m } from './moneyUi';
import type { StepContext } from './stepContext';
import { colors, fonts, radius } from '../../../theme/tokens';

/**
 * Step "accounts": the screen is the person's accounts and one Add button. Add slides up a sheet with the
 * Mobile money / Bank / Cash & other toggle and its providers; picking one moves on to its balance, and saving puts it
 * back in the list below. Every account is saved as soon as its sheet is saved (an opening-balance entry in the books),
 * so the step itself only records that it was done.
 */
type Tab = MoneyProviderType;
const TABS: { key: Tab; label: string }[] = [
    { key: 'MOBILE_MONEY', label: 'Mobile money' },
    { key: 'BANK', label: 'Banks' },
    { key: 'CUSTOM', label: 'Cash & other' },
];

export function StepAccounts({ ctx }: { ctx: StepContext }) {
    const [adding, setAdding] = useState(false);
    const [tab, setTab] = useState<Tab>('MOBILE_MONEY');
    const [target, setTarget] = useState<AccountTarget | null>(null);
    const money = ctx.money;
    const accounts = money?.accounts ?? [];
    const phoneNetwork = ctx.state.profile.phoneNetwork ?? null;
    const total = accounts.reduce((a, x) => a + x.balance, 0);
    const added = (code: string) => accounts.some((a) => a.providerCode === code);

    // every tab's grid is as tall as the Banks one (the longest), so the sheet doesn't jump when you switch
    const bankRows = Math.ceil((money?.providers ?? []).filter((p) => p.type === 'BANK').length / 3);
    const TILE_H = 112; // fixed, so a tab's height is rows × this and every tab can match the Banks one exactly
    const gridMinH = bankRows * TILE_H + Math.max(0, bankRows - 1) * 10;

    const providers = tab === 'CUSTOM'
        ? [{ code: 'CASH', name: 'Cash', type: 'CUSTOM' as const }, { code: 'OTHER', name: 'Other', type: 'CUSTOM' as const }]
        : (money?.providers ?? []).filter((p) => p.type === tab);

    return (
        <PersonalStepShell
            def={ctx.def} progress={ctx.progress} onBack={ctx.onBack} onSkip={ctx.skip}
            onContinue={() => ctx.done({ count: accounts.length })} saving={ctx.saving} error={ctx.error}
            continueLabel={ctx.single ? 'Done' : 'Continue'}
            stickyAbove={(
                <View style={styles.sticky}>
                    <Text style={m.totalLabel}>Total</Text>
                    <Text style={m.totalValue}>{fmtK(total)}</Text>
                </View>
            )}
        >
            <Text style={[m.sectionTitle, { marginTop: 0 }]}>Your accounts</Text>
            {!money ? <ActivityIndicator color={colors.blue} /> : accounts.length === 0 ? (
                <Text style={m.empty}>Nothing added yet. Tap Add to put in your mobile money, bank or cash.</Text>
            ) : (
                <View>
                    {accounts.map((a) => (
                        <Pressable
                            key={a.walletId}
                            onPress={() => setTarget({ providerType: a.providerType, providerCode: a.providerCode, providerName: money.providers.find((p) => p.code === a.providerCode)?.name ?? a.name, existing: a })}
                            style={m.row}
                            accessibilityRole="button"
                            accessibilityLabel={`${a.name}, ${fmtK(a.balance)}. Edit`}
                        >
                            <ProviderLogo type={a.providerType} code={a.providerCode} name={a.name} size={36} />
                            <Text style={m.rowName}>{a.name}</Text>
                            <Text style={m.rowAmount}>{fmtK(a.balance)}</Text>
                            <ChevronRight size={18} color={colors.textFaint} />
                        </Pressable>
                    ))}
                </View>
            )}

            <Pressable onPress={() => setAdding(true)} disabled={!money} style={({ pressed }) => [styles.add, pressed && { opacity: 0.7 }]} accessibilityRole="button" accessibilityLabel="Add an account">
                <Plus size={18} color={colors.blue} />
                <Text style={styles.addText}>{accounts.length ? 'Add another account' : 'Add an account'}</Text>
            </Pressable>

            {adding && (
                <Sheet visible title="Add an account" onClose={() => setAdding(false)}>
                    <View style={m.segment} accessibilityRole="tablist">
                        {TABS.map((t) => (
                            <Pressable key={t.key} onPress={() => setTab(t.key)} style={[m.segBtn, tab === t.key && m.segBtnOn]} accessibilityRole="tab" accessibilityState={{ selected: tab === t.key }}>
                                <Text style={[m.segText, tab === t.key && m.segTextOn]}>{t.label}</Text>
                            </Pressable>
                        ))}
                    </View>
                    <View style={[m.grid, { marginTop: 0, minHeight: gridMinH, alignContent: 'flex-start' }]}>
                        {providers.map((p) => {
                            const on = tab !== 'CUSTOM' && added(p.code);
                            const yours = tab === 'MOBILE_MONEY' && phoneNetwork === p.code && !on;
                            return (
                                <Pressable
                                    key={p.code}
                                    onPress={() => { setAdding(false); setTarget({ providerType: tab, providerCode: tab === 'CUSTOM' ? null : p.code, providerName: p.name }); }}
                                    style={[m.tile, { height: TILE_H }, on && m.tileOn]}
                                    accessibilityRole="button"
                                    accessibilityLabel={`${on ? 'Add another' : 'Add'} ${p.name}`}
                                >
                                    <ProviderLogo type={tab} code={tab === 'CUSTOM' ? null : p.code} name={p.name} size={40} />
                                    <Text style={m.tileText} numberOfLines={2}>{p.name}</Text>
                                    {(on || yours) && <View style={[m.badge, yours && { backgroundColor: colors.blue }]}><Text style={m.badgeText}>{on ? 'Added' : 'Your number'}</Text></View>}
                                </Pressable>
                            );
                        })}
                    </View>
                </Sheet>
            )}

            <AccountSheet
                target={target}
                service={ctx.service}
                onClose={() => setTarget(null)}
                onSaved={() => { setTarget(null); void ctx.refreshMoney(); }}
            />
        </PersonalStepShell>
    );
}

const styles = StyleSheet.create({
    sticky: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 14, borderTopWidth: 1, borderColor: colors.border, backgroundColor: colors.canvas },
    add: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 52, marginTop: 14, borderRadius: radius.pill, backgroundColor: '#EAF1FF' },
    addText: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.blue },
});

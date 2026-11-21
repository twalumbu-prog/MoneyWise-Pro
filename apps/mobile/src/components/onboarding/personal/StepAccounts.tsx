import React, { useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import type { MoneyProviderType } from 'core';
import { PersonalStepShell } from './PersonalStepShell';
import { AccountSheet, type AccountTarget } from './AccountSheet';
import { ProviderLogo, fmtK, moneyStyles as m } from './moneyUi';
import type { StepContext } from './stepContext';
import { colors } from '../../../theme/tokens';

/**
 * Step "accounts": mobile money, banks and cash, each with today's balance. Every account is saved as soon as its
 * sheet is saved (an opening-balance entry in the books), so the step itself only records that it was done.
 */
type Tab = MoneyProviderType;
const TABS: { key: Tab; label: string }[] = [
    { key: 'MOBILE_MONEY', label: 'Mobile money' },
    { key: 'BANK', label: 'Bank' },
    { key: 'CUSTOM', label: 'Cash & other' },
];

export function StepAccounts({ ctx }: { ctx: StepContext }) {
    const [tab, setTab] = useState<Tab>('MOBILE_MONEY');
    const [target, setTarget] = useState<AccountTarget | null>(null);
    const money = ctx.money;
    const accounts = money?.accounts ?? [];
    const phoneNetwork = ctx.state.profile.phoneNetwork ?? null;

    const providers = tab === 'CUSTOM'
        ? [{ code: 'CASH', name: 'Cash', type: 'CUSTOM' as const }, { code: 'OTHER', name: 'Other', type: 'CUSTOM' as const }]
        : (money?.providers ?? []).filter((p) => p.type === tab);

    const total = accounts.reduce((a, x) => a + x.balance, 0);
    const added = (code: string) => accounts.some((a) => a.providerCode === code);

    return (
        <PersonalStepShell
            def={ctx.def} progress={ctx.progress} onBack={ctx.onBack} onSkip={ctx.skip}
            onContinue={() => ctx.done({ count: accounts.length })} saving={ctx.saving} error={ctx.error}
            continueLabel={ctx.single ? 'Done' : accounts.length ? 'Continue' : 'Continue without accounts'}
        >
            <View style={m.segment} accessibilityRole="tablist">
                {TABS.map((t) => (
                    <Pressable key={t.key} onPress={() => setTab(t.key)} style={[m.segBtn, tab === t.key && m.segBtnOn]} accessibilityRole="tab" accessibilityState={{ selected: tab === t.key }}>
                        <Text style={[m.segText, tab === t.key && m.segTextOn]}>{t.label}</Text>
                    </Pressable>
                ))}
            </View>

            {!money ? <ActivityIndicator color={colors.blue} style={{ marginTop: 24 }} /> : (
                <View style={m.grid}>
                    {providers.map((p) => {
                        const on = tab !== 'CUSTOM' && added(p.code);
                        const yours = tab === 'MOBILE_MONEY' && phoneNetwork === p.code && !on;
                        return (
                            <Pressable
                                key={p.code}
                                onPress={() => setTarget({ providerType: tab, providerCode: tab === 'CUSTOM' ? null : p.code, providerName: p.name })}
                                style={[m.tile, on && m.tileOn]}
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
            )}

            <Text style={m.sectionTitle}>Your accounts</Text>
            {accounts.length === 0 ? <Text style={m.empty}>Nothing added yet. Tap a provider above.</Text> : (
                <View>
                    {accounts.map((a) => (
                        <Pressable
                            key={a.walletId}
                            onPress={() => setTarget({ providerType: a.providerType, providerCode: a.providerCode, providerName: money?.providers.find((p) => p.code === a.providerCode)?.name ?? a.name, existing: a })}
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
                    <View style={m.totalRow}>
                        <Text style={m.totalLabel}>Total</Text>
                        <Text style={m.totalValue}>{fmtK(total)}</Text>
                    </View>
                </View>
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

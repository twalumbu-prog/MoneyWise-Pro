import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Clock, CheckCircle2, AlertCircle, XCircle, Ban, ChevronRight, X } from 'lucide-react-native';
import { getCore } from 'core';
import type { MyInvestorAccount } from 'core';
import { useInvestProviders } from '../../hooks/useInvestProviders';
import { InvestLogo } from './InvestLogo';
import { colors, fonts, radius } from '../../theme/tokens';

const STATUS_UI = {
    PENDING_REVIEW: { icon: Clock, tint: colors.tabActiveBg, ink: colors.blue, title: 'Application under review' },
    INFO_REQUESTED: { icon: AlertCircle, tint: '#FEF3C7', ink: colors.warn, title: 'More information needed' },
    ACTIVE: { icon: CheckCircle2, tint: '#ECFDF5', ink: colors.positiveInk, title: 'Account approved' },
    REJECTED: { icon: XCircle, tint: '#FEE2E2', ink: colors.danger, title: 'Application not approved' },
    SUSPENDED: { icon: Ban, tint: '#FEE2E2', ink: colors.danger, title: 'Account suspended' },
} as const;

const dismissKey = (a: MyInvestorAccount) => `invest-banner-dismissed:${a.id}:${a.status}`;

/**
 * The card at the top of Invest that reports on your applications. Tap it to see every
 * application and its status. Once a decision arrives (approved, rejected…) it can be
 * dismissed; while an application is still under review it stays so you can keep an eye on it.
 * A later status change on the same application brings the card back.
 */
export const InvestApplicationsBanner: React.FC<{ accounts: MyInvestorAccount[] }> = ({ accounts }) => {
    const router = useRouter();
    const providers = useInvestProviders();
    const [dismissed, setDismissed] = useState<Set<string>>(new Set());
    const [loaded, setLoaded] = useState(false);

    // Which of the current (account, status) pairs the user has already dismissed.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            const store = getCore().storage;
            const hits = await Promise.all(accounts.map(async (a) => ((await store.get(dismissKey(a))) ? dismissKey(a) : null)));
            if (!cancelled) { setDismissed(new Set(hits.filter((h): h is string => !!h))); setLoaded(true); }
        })();
        return () => { cancelled = true; };
    }, [accounts]);

    // Applications that need attention first; a freshly decided one (not yet dismissed) after.
    const visible = useMemo(() => {
        const rank: Record<string, number> = { INFO_REQUESTED: 0, PENDING_REVIEW: 1, REJECTED: 2, SUSPENDED: 3, ACTIVE: 4 };
        return accounts
            .filter((a) => a.source === 'REGISTERED')
            .filter((a) => a.status === 'PENDING_REVIEW' || a.status === 'INFO_REQUESTED' || !dismissed.has(dismissKey(a)))
            .filter((a) => !(a.status === 'ACTIVE' && dismissed.has(dismissKey(a))))
            .sort((x, y) => rank[x.status] - rank[y.status]);
    }, [accounts, dismissed]);

    if (!loaded || visible.length === 0) return null;

    const top = visible[0];
    const ui = STATUS_UI[top.status];
    const Icon = ui.icon;
    const provider = providers.find((p) => p.investmentTargetId === top.targetId);
    const resolved = top.status !== 'PENDING_REVIEW' && top.status !== 'INFO_REQUESTED';

    const subtitle =
        top.status === 'ACTIVE' ? `${provider?.name ?? 'Your account'} · Account no. ${top.accountNumber ?? '—'}`
        : top.status === 'INFO_REQUESTED' ? `${provider?.name ?? 'The company'} asked for more details`
        : top.status === 'PENDING_REVIEW' ? `${provider?.name ?? 'The company'} is reviewing your details`
        : `${provider?.name ?? 'The company'}`;

    const dismiss = async () => {
        await getCore().storage.set(dismissKey(top), '1');
        setDismissed((d) => new Set(d).add(dismissKey(top)));
    };

    return (
        <Pressable onPress={() => router.push('/apps/invest/applications')} style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]} accessibilityRole="button" accessibilityLabel={`${ui.title}. Tap to view all applications`}>
            <View style={[styles.iconWrap, { backgroundColor: ui.tint }]}><Icon size={22} color={ui.ink} /></View>
            <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.title} numberOfLines={1}>{ui.title}</Text>
                <Text style={styles.sub} numberOfLines={2}>{subtitle}</Text>
                {visible.length > 1 && <Text style={styles.more}>+{visible.length - 1} more · tap to view all</Text>}
            </View>
            {provider && visible.length === 1 && <InvestLogo logo={provider.logo} size={30} />}
            {resolved ? (
                <Pressable onPress={dismiss} hitSlop={10} style={styles.closeBtn} accessibilityLabel="Dismiss"><X size={14} color={colors.textMuted} /></Pressable>
            ) : (
                <ChevronRight size={18} color={colors.textFaint} />
            )}
        </Pressable>
    );
};

const styles = StyleSheet.create({
    card: {
        flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.lg,
        backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
        shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1,
    },
    iconWrap: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    title: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
    sub: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, lineHeight: 16 },
    more: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.blue, marginTop: 2 },
    closeBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.chipActiveBg, alignItems: 'center', justifyContent: 'center' },
});

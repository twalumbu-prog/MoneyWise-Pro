import { View, Text, ScrollView, Pressable, StyleSheet, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import {
    ShieldCheck, ShoppingBag, LayoutGrid, TrendingUp, Landmark, Store,
    CheckSquare, Banknote, FileText, User, Settings as SettingsIcon, Users, LogOut,
} from 'lucide-react-native';
import {
    requisitionService, canAuthoriseRequisition, canDisburse, canManageVouchers,
} from 'core';
import { useAuth } from '../../src/context/AuthContext';
import { colors, fonts, radius } from '../../src/theme/tokens';

/**
 * The Menu tab, mirroring apps/web/src/pages/Menu.tsx: a profile card, the
 * Other Services grid, then settings. Work queues sit at the top because on a
 * phone they are what people open this tab for.
 */
export default function MenuScreen() {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const { user, userRole, userName, organizationName, signOut } = useAuth();

    // Reuses the inbox query, so opening Menu costs nothing extra.
    const { data } = useQuery({
        queryKey: ['requisitions'],
        queryFn: () => requisitionService.getAll(),
    });
    const rows: { status: string }[] = Array.isArray(data) ? data : [];
    const count = (s: string) => rows.filter((r) => r.status === s).length;

    const queues = [
        {
            show: canAuthoriseRequisition(userRole),
            icon: CheckSquare, label: 'Approvals',
            sub: 'Requests awaiting your decision',
            badge: count('PENDING_APPROVAL'),
            go: () => router.push('/approvals'),
        },
        {
            show: canDisburse(userRole),
            icon: Banknote, label: 'Disbursements',
            sub: 'Approved requests to pay out',
            badge: count('AUTHORISED'),
            go: () => router.push('/disbursements'),
        },
        {
            show: canManageVouchers(userRole),
            icon: FileText, label: 'Vouchers',
            sub: 'Journal vouchers and posting',
            badge: 0,
            go: () => router.push('/vouchers'),
        },
    ].filter((q) => q.show);

    const services = [
        { icon: ShieldCheck, label: 'Audit', go: () => soon('Audit') },
        { icon: ShoppingBag, label: 'Products', go: () => soon('Products') },
        { icon: LayoutGrid, label: 'Apps', go: () => soon('Apps') },
        { icon: TrendingUp, label: 'Invest', go: () => soon('Invest') },
        { icon: Landmark, label: 'Loans', go: () => soon('Business Loans') },
        { icon: Store, label: 'Marketplace', go: () => soon('Marketplace') },
    ];

    function soon(name: string) {
        Alert.alert(name, 'This lands in a later phase of the app rollout. It’s available on the web app now.');
    }

    return (
        <ScrollView style={styles.root} contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 12 }]}>
            <Text style={styles.title}>Menu</Text>

            <View style={styles.profileCard}>
                <View style={styles.avatar}><User size={26} color={colors.textMuted} /></View>
                <View style={styles.profileMain}>
                    <Text style={styles.orgName} numberOfLines={1}>{organizationName || 'My Business'}</Text>
                    <Text style={styles.role}>{userRole ?? ''}</Text>
                    <Text style={styles.email} numberOfLines={1}>{userName || user?.email}</Text>
                </View>
            </View>

            {queues.length > 0 && (
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Your queues</Text>
                    {queues.map((q, i) => {
                        const Icon = q.icon;
                        return (
                            <Pressable
                                key={q.label}
                                onPress={q.go}
                                style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }, i > 0 && styles.rowBorder]}
                            >
                                <Icon size={18} color={colors.blue} />
                                <View style={styles.rowMain}>
                                    <Text style={styles.rowLabel}>{q.label}</Text>
                                    <Text style={styles.rowSub}>{q.sub}</Text>
                                </View>
                                {q.badge > 0 && (
                                    <View style={styles.badge}><Text style={styles.badgeText}>{q.badge}</Text></View>
                                )}
                            </Pressable>
                        );
                    })}
                </View>
            )}

            <View style={styles.card}>
                <Text style={styles.cardTitle}>Other Services</Text>
                <View style={styles.grid}>
                    {services.map((s) => {
                        const Icon = s.icon;
                        return (
                            <Pressable
                                key={s.label}
                                onPress={s.go}
                                style={({ pressed }) => [styles.gridItem, pressed && { opacity: 0.6 }]}
                            >
                                <View style={styles.gridIcon}><Icon size={20} color={colors.blue} /></View>
                                <Text style={styles.gridLabel}>{s.label}</Text>
                            </Pressable>
                        );
                    })}
                </View>
            </View>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>Settings</Text>
                <Pressable
                    onPress={() => soon('Settings')}
                    style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
                >
                    <SettingsIcon size={18} color={colors.blue} />
                    <View style={styles.rowMain}>
                        <Text style={styles.rowLabel}>General Settings</Text>
                        <Text style={styles.rowSub}>Organisation & departments</Text>
                    </View>
                </Pressable>
                <Pressable
                    onPress={() => soon('Team Members')}
                    style={({ pressed }) => [styles.row, styles.rowBorder, pressed && { opacity: 0.6 }]}
                >
                    <Users size={18} color={colors.blue} />
                    <View style={styles.rowMain}>
                        <Text style={styles.rowLabel}>Team Members</Text>
                        <Text style={styles.rowSub}>Manage staff access</Text>
                    </View>
                </Pressable>
            </View>

            <Pressable
                onPress={() =>
                    Alert.alert('Sign out?', 'You’ll need to sign in again to use MoneyWise.', [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Sign out', style: 'destructive', onPress: () => { void signOut(); } },
                    ])
                }
                style={({ pressed }) => [styles.signOut, pressed && { opacity: 0.6 }]}
            >
                <LogOut size={17} color={colors.danger} />
                <Text style={styles.signOutText}>Sign Out</Text>
            </Pressable>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.canvasAlt },
    scroll: { paddingHorizontal: 20, paddingBottom: 120, gap: 14 },
    title: { fontFamily: fonts.display, fontSize: 30, color: '#000000', marginBottom: 4 },
    profileCard: {
        flexDirection: 'row', alignItems: 'center', gap: 16,
        backgroundColor: colors.surface, borderRadius: radius.lg, padding: 20,
        borderWidth: 1, borderColor: colors.border,
    },
    avatar: {
        width: 56, height: 56, borderRadius: 28, backgroundColor: colors.canvasAlt,
        alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.borderStrong,
    },
    profileMain: { flex: 1, gap: 2 },
    orgName: { fontFamily: fonts.bodyBold, fontSize: 17, color: colors.navy },
    role: { fontFamily: fonts.bodyBold, fontSize: 10, color: colors.textFaint, letterSpacing: 1.2 },
    email: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted },
    card: {
        backgroundColor: colors.surface, borderRadius: radius.lg, padding: 20,
        borderWidth: 1, borderColor: colors.border,
    },
    cardTitle: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text, marginBottom: 6 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 13 },
    rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
    rowMain: { flex: 1, gap: 2 },
    rowLabel: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
    rowSub: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint },
    badge: {
        minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6,
        backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center',
    },
    badgeText: { fontFamily: fonts.bodyBold, fontSize: 11, color: '#FFFFFF' },
    grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 },
    gridItem: { width: '33.33%', alignItems: 'center', gap: 8, paddingVertical: 14 },
    gridIcon: {
        width: 46, height: 46, borderRadius: 16, backgroundColor: colors.tabActiveBg,
        alignItems: 'center', justifyContent: 'center',
    },
    gridLabel: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.text },
    signOut: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        paddingVertical: 16, borderRadius: radius.md,
        backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    },
    signOutText: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.danger },
});

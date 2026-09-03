import { View, Text, ScrollView, Pressable, StyleSheet, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
    ShieldCheck, ShoppingBag, LayoutGrid, TrendingUp, Landmark, Store,
    User, Settings as SettingsIcon, Users, LogOut, Plug,
} from 'lucide-react-native';
import { useAuth } from '../../src/context/AuthContext';
import { OtherServiceIcon } from '../../src/components/icons/OtherServiceIcon';
import { colors, fonts, radius } from '../../src/theme/tokens';

/**
 * The Menu tab, mirroring apps/web/src/pages/Menu.tsx exactly: a profile
 * card, the Other Services grid, then settings — no separate queues section
 * (Approvals/Disbursements/Vouchers aren't on web's Menu either).
 */
export default function MenuScreen() {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const { user, userRole, userName, organizationName, signOut } = useAuth();

    const services = [
        { icon: ShieldCheck, label: 'Audit', go: () => router.push('/audit') },
        { icon: ShoppingBag, label: 'Products', go: () => router.push('/products') },
        { icon: LayoutGrid, label: 'Apps', go: () => router.push('/apps') },
        { icon: TrendingUp, label: 'Invest', go: () => router.push('/apps/invest') },
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
                                <OtherServiceIcon><Icon size={22} color="#FFFFFF" strokeWidth={2} /></OtherServiceIcon>
                                <Text style={styles.gridLabel}>{s.label}</Text>
                            </Pressable>
                        );
                    })}
                </View>
            </View>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>Settings</Text>
                <Pressable
                    onPress={() => router.push('/settings/profile')}
                    style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
                >
                    <User size={18} color={colors.blue} />
                    <View style={styles.rowMain}>
                        <Text style={styles.rowLabel}>My Profile</Text>
                        <Text style={styles.rowSub}>Your account & disbursement details</Text>
                    </View>
                </Pressable>
                <Pressable
                    onPress={() => router.push('/settings/general')}
                    style={({ pressed }) => [styles.row, styles.rowBorder, pressed && { opacity: 0.6 }]}
                >
                    <SettingsIcon size={18} color={colors.blue} />
                    <View style={styles.rowMain}>
                        <Text style={styles.rowLabel}>General Settings</Text>
                        <Text style={styles.rowSub}>Organisation & departments</Text>
                    </View>
                </Pressable>
                <Pressable
                    onPress={() => router.push('/settings/team')}
                    style={({ pressed }) => [styles.row, styles.rowBorder, pressed && { opacity: 0.6 }]}
                >
                    <Users size={18} color={colors.blue} />
                    <View style={styles.rowMain}>
                        <Text style={styles.rowLabel}>Team Members</Text>
                        <Text style={styles.rowSub}>Manage staff access</Text>
                    </View>
                </Pressable>
                <Pressable
                    onPress={() => router.push('/settings/integrations')}
                    style={({ pressed }) => [styles.row, styles.rowBorder, pressed && { opacity: 0.6 }]}
                >
                    <Plug size={18} color={colors.blue} />
                    <View style={styles.rowMain}>
                        <Text style={styles.rowLabel}>Integrations</Text>
                        <Text style={styles.rowSub}>QuickBooks connection</Text>
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
    grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 },
    gridItem: { width: '33.33%', alignItems: 'center', gap: 8, paddingVertical: 14 },
    gridLabel: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.text },
    signOut: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        paddingVertical: 16, borderRadius: radius.md,
        backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    },
    signOutText: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.danger },
});

import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Users, ArrowRight, CheckCircle2 } from 'lucide-react-native';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { colors, fonts, radius } from '../../src/theme/tokens';

/**
 * Apps hub. Web gates each app behind a local "Activate" toggle even though
 * the feature is fully available server-side — kept here for parity, since a
 * user moving between the app and web should see the same activation state
 * language, even though this build only ever offers the one card.
 */
export default function AppsScreen() {
    const router = useRouter();

    return (
        <View style={styles.root}>
            <Stack.Screen options={{ headerShown: false }} />
            <ScreenHeader title="Apps" />
            <View style={styles.scroll}>
                <Text style={styles.subtitle}>Extend MoneyWise with powerful business tools</Text>

                <View style={styles.card}>
                    <View style={styles.cardTop}>
                        <View style={styles.icon}><Users size={20} color="#FFFFFF" /></View>
                        <View style={styles.cardMain}>
                            <Text style={styles.cardTitle}>Payroll</Text>
                            <Text style={styles.cardBody}>
                                Run monthly payroll, manage staff records, calculate statutory obligations
                                (NAPSA, NHIMA, PAYE), and disburse salaries.
                            </Text>
                        </View>
                    </View>
                    <View style={styles.activeRow}>
                        <CheckCircle2 size={13} color={colors.positiveInk} />
                        <Text style={styles.activeText}>Active</Text>
                    </View>
                    <Pressable
                        style={styles.openBtn}
                        onPress={() => router.push('/apps/payroll')}
                    >
                        <Text style={styles.openBtnText}>Open App</Text>
                        <ArrowRight size={14} color="#FFFFFF" />
                    </Pressable>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.canvas },
    scroll: { padding: 20, gap: 14 },
    subtitle: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, marginBottom: 4 },
    card: {
        backgroundColor: colors.surface, borderRadius: radius.lg, padding: 18,
        borderWidth: 1, borderColor: colors.border, gap: 12,
    },
    cardTop: { flexDirection: 'row', gap: 12 },
    icon: {
        width: 40, height: 40, borderRadius: 12, backgroundColor: colors.blue,
        alignItems: 'center', justifyContent: 'center',
    },
    cardMain: { flex: 1 },
    cardTitle: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
    cardBody: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, marginTop: 4, lineHeight: 17 },
    activeRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    activeText: { fontFamily: fonts.bodyBold, fontSize: 10, color: colors.positiveInk },
    openBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
        backgroundColor: colors.blue, borderRadius: radius.md, paddingVertical: 10,
    },
    openBtnText: { fontFamily: fonts.bodyBold, fontSize: 13, color: '#FFFFFF' },
});

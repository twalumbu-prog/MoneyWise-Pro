import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, Mail, Clock } from 'lucide-react-native';
import { useInvestProviders } from '../../../../src/hooks/useInvestProviders';
import { InvestApplicationWizard } from '../../../../src/components/invest/application/InvestApplicationWizard';
import { InvestLogo } from '../../../../src/components/invest/InvestLogo';
import { colors, fonts, radius } from '../../../../src/theme/tokens';
import { useGoBack } from '../../../../src/hooks/useGoBack';

/** Register for an account with an investment company: the application wizard, then a confirmation. */
export default function InvestRegisterScreen() {
    const router = useRouter();
    const safeBack = useGoBack();
    const insets = useSafeAreaInsets();
    const { targetId } = useLocalSearchParams<{ targetId: string }>();
    const providers = useInvestProviders();
    const provider = providers.find((p) => p.investmentTargetId === targetId);
    const [done, setDone] = useState(false);

    const leave = () => router.replace('/apps/invest');

    if (!provider) {
        return (
            <View style={styles.centre}>
                <Stack.Screen options={{ headerShown: false }} />
                <Text style={styles.muted}>This investment company could not be found.</Text>
                <Pressable onPress={() => safeBack()} style={styles.btn}><Text style={styles.btnText}>Go back</Text></Pressable>
            </View>
        );
    }

    if (done) {
        return (
            <View style={[styles.done, { paddingTop: insets.top + 48, paddingBottom: Math.max(insets.bottom, 20) + 12 }]}>
                <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
                <View style={styles.tick}><Check size={42} color={colors.positive} strokeWidth={2.5} /></View>
                <Text style={styles.doneTitle}>Application sent</Text>
                <Text style={styles.doneText}>
                    Your application has been sent to {provider.name}. We emailed you a confirmation.
                </Text>

                <View style={styles.card}>
                    <InvestLogo logo={provider.logo} size={36} />
                    <View style={{ flex: 1, gap: 10 }}>
                        <Row icon={<Clock size={16} color={colors.blue} />} text={`${provider.name} will review your details and documents.`} />
                        <Row icon={<Mail size={16} color={colors.blue} />} text="You'll get an email when your account is approved and your account number is issued." />
                    </View>
                </View>

                <View style={{ flex: 1 }} />
                <Pressable onPress={leave} style={({ pressed }) => [styles.btn, { alignSelf: 'stretch' }, pressed && { opacity: 0.85 }]}>
                    <Text style={styles.btnText}>Done</Text>
                </Pressable>
            </View>
        );
    }

    return (
        <View style={{ flex: 1 }}>
            <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
            <InvestApplicationWizard provider={provider} onClose={() => safeBack()} onSubmitted={() => setDone(true)} />
        </View>
    );
}

const Row: React.FC<{ icon: React.ReactNode; text: string }> = ({ icon, text }) => (
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
        <View style={{ marginTop: 2 }}>{icon}</View>
        <Text style={styles.rowText}>{text}</Text>
    </View>
);

const styles = StyleSheet.create({
    centre: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, backgroundColor: colors.canvas, padding: 24 },
    muted: { fontFamily: fonts.body, fontSize: 14, color: colors.textMuted, textAlign: 'center' },
    done: { flex: 1, backgroundColor: colors.canvas, paddingHorizontal: 24, alignItems: 'center' },
    tick: { width: 88, height: 88, borderRadius: 44, borderWidth: 3, borderColor: colors.positive, alignItems: 'center', justifyContent: 'center' },
    doneTitle: { fontFamily: fonts.bodyBold, fontSize: 24, color: colors.navy, marginTop: 20 },
    doneText: { fontFamily: fonts.body, fontSize: 15, color: colors.textMuted, textAlign: 'center', marginTop: 8, lineHeight: 22 },
    card: { flexDirection: 'row', gap: 14, alignItems: 'flex-start', alignSelf: 'stretch', marginTop: 28, padding: 18, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
    rowText: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.text, lineHeight: 19 },
    btn: { minHeight: 50, borderRadius: radius.pill, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
    btnText: { fontFamily: fonts.bodyBold, fontSize: 15, color: '#FFFFFF' },
});

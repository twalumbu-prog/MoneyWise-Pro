import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Users, Link2Off } from 'lucide-react-native';
import { savingsService, formatKwacha } from 'core';
import { SpringProgress } from '../../../src/components/invest/application/SpringProgress';
import { colors, fonts, radius } from '../../../src/theme/tokens';

/**
 * Where an invite link lands in the app (moneywise.blueopus.cloud/savings/join/CODE opens here for
 * people who have MoneyWise installed): a preview of the group and a button to confirm joining.
 */
export default function JoinSavingsScreen() {
    const router = useRouter();
    const qc = useQueryClient();
    const insets = useSafeAreaInsets();
    const { code } = useLocalSearchParams<{ code: string }>();
    const [error, setError] = useState<string | null>(null);

    const { data: preview, isPending, error: loadError } = useQuery({
        queryKey: ['savings-invite', code],
        queryFn: () => savingsService.previewInvite(String(code)),
        retry: false,
    });

    const join = useMutation({
        mutationFn: () => savingsService.join(String(code)),
        onSuccess: (res) => {
            qc.invalidateQueries({ queryKey: ['savings'] });
            router.replace(`/savings/${res.id}`);
        },
        onError: (e: any) => setError(e?.message || 'Could not join. Please try again.'),
    });

    const pct = preview?.progress != null ? Math.round(preview.progress * 100) : null;

    return (
        <View style={[styles.root, { paddingTop: insets.top + 24, paddingBottom: Math.max(insets.bottom, 16) + 12 }]}>
            <Stack.Screen options={{ headerShown: false }} />

            {isPending ? (
                <View style={styles.centre}><ActivityIndicator color={colors.blue} /></View>
            ) : loadError || !preview ? (
                <View style={styles.centre}>
                    <View style={styles.badge}><Link2Off size={30} color={colors.textMuted} /></View>
                    <Text style={styles.title}>This invite isn't valid</Text>
                    <Text style={styles.sub}>{(loadError as Error)?.message || 'The link may have expired or been replaced. Ask the organiser for a new one.'}</Text>
                </View>
            ) : (
                <View style={styles.centre}>
                    <View style={[styles.badge, { backgroundColor: colors.tabActiveBg }]}><Users size={30} color={colors.blue} /></View>
                    <Text style={styles.kicker}>You're invited to join</Text>
                    <Text style={styles.title}>{preview.name}</Text>
                    <Text style={styles.sub}>Organised by {preview.organiser} · {preview.memberCount} member{preview.memberCount === 1 ? '' : 's'}</Text>

                    {preview.targetAmount ? (
                        <View style={styles.card}>
                            <SpringProgress value={pct ?? 0} height={8} trackColor="#E5E5E5" fillColor="#60A5FA" />
                            <View style={styles.cardRow}>
                                <Text style={styles.cardText}>{pct}% saved</Text>
                                <Text style={styles.cardText}>Target {formatKwacha(preview.targetAmount)}</Text>
                            </View>
                        </View>
                    ) : null}

                    {!!error && <Text style={styles.error}>{error}</Text>}
                </View>
            )}

            {preview && (
                <View style={{ gap: 6 }}>
                    <Pressable onPress={() => join.mutate()} disabled={join.isPending} style={({ pressed }) => [styles.primary, pressed && { opacity: 0.85 }, join.isPending && { opacity: 0.6 }]}>
                        {join.isPending ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>Join group</Text>}
                    </Pressable>
                    <Pressable onPress={() => router.replace('/savings')} style={styles.later}><Text style={styles.laterText}>Not now</Text></Pressable>
                </View>
            )}
            {!preview && !isPending && (
                <Pressable onPress={() => router.replace('/savings')} style={styles.primary}><Text style={styles.primaryText}>Go to Savings</Text></Pressable>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.canvas, paddingHorizontal: 24 },
    centre: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
    badge: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.chipActiveBg, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
    kicker: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textMuted },
    title: { fontFamily: fonts.bodyBold, fontSize: 26, color: colors.navy, textAlign: 'center' },
    sub: { fontFamily: fonts.body, fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
    card: { alignSelf: 'stretch', marginTop: 20, padding: 18, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: 10 },
    cardRow: { flexDirection: 'row', justifyContent: 'space-between' },
    cardText: { fontFamily: fonts.bodyBold, fontSize: 12, color: '#737373' },
    error: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.danger, textAlign: 'center', marginTop: 8 },
    primary: { minHeight: 52, borderRadius: radius.pill, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
    primaryText: { fontFamily: fonts.bodyBold, fontSize: 15, color: '#FFFFFF' },
    later: { paddingVertical: 12, alignItems: 'center' },
    laterText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.textMuted },
});

import { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator, Linking, Alert } from 'react-native';
import { Stack } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ExternalLink, Unplug } from 'lucide-react-native';
import { integrationService } from 'core';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { colors, fonts, radius } from '../../src/theme/tokens';

/**
 * Native port of apps/web/src/components/settings/integrations/QuickBooksIntegration.tsx,
 * scoped to connect/disconnect + status — web's account-mapping editor and
 * statement viewer are desktop accounting tools this doesn't try to replicate.
 * OAuth itself needs no native plumbing: the connect URL opens in the system
 * browser, QuickBooks redirects back to the web app's own callback (which
 * finalizes the connection server-side), and the user returns to this screen
 * and pulls to refresh — there's no deep-link handoff for the app to catch.
 */
export default function IntegrationsScreen() {
    const qc = useQueryClient();
    const [connecting, setConnecting] = useState(false);
    const [disconnecting, setDisconnecting] = useState(false);

    const { data: status, isLoading, refetch, isRefetching } = useQuery({
        queryKey: ['integration-status', 'quickbooks'],
        queryFn: () => integrationService.getStatus(),
    });

    const connect = async () => {
        setConnecting(true);
        try {
            const url = await integrationService.getConnectUrl();
            await Linking.openURL(url);
        } catch (e: any) {
            Alert.alert('Could not start connection', e?.message ?? 'Please try again.');
        } finally {
            setConnecting(false);
        }
    };

    const disconnect = () => {
        Alert.alert('Disconnect QuickBooks?', 'Expense syncing will stop until you reconnect.', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Disconnect', style: 'destructive',
                onPress: async () => {
                    setDisconnecting(true);
                    try {
                        await integrationService.disconnect();
                        qc.invalidateQueries({ queryKey: ['integration-status'] });
                    } catch (e: any) {
                        Alert.alert('Could not disconnect', e?.message ?? 'Please try again.');
                    } finally {
                        setDisconnecting(false);
                    }
                },
            },
        ]);
    };

    return (
        <View style={styles.root}>
            <Stack.Screen options={{ headerShown: false }} />
            <ScreenHeader title="Integrations" />

            <ScrollView contentContainerStyle={styles.scroll} refreshControl={undefined}>
                <Text style={styles.sectionSub}>Manage connections to external services.</Text>

                {isLoading ? (
                    <View style={styles.centre}><ActivityIndicator color={colors.blue} /></View>
                ) : (
                    <View style={styles.card}>
                        <View style={styles.cardTop}>
                            <View style={styles.qbIcon}><Text style={styles.qbIconText}>QB</Text></View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.cardTitle}>QuickBooks Online</Text>
                                <Text style={styles.cardSub}>Sync expenses and chart of accounts</Text>
                            </View>
                            {status?.connected && (
                                <View style={styles.connectedPill}>
                                    <CheckCircle2 size={12} color="#059669" />
                                    <Text style={styles.connectedPillText}>Connected</Text>
                                </View>
                            )}
                        </View>

                        {status?.connected && (
                            <View style={styles.statusBlock}>
                                {status.companyName && (
                                    <View style={styles.statusRow}>
                                        <Text style={styles.statusLabel}>Company</Text>
                                        <Text style={styles.statusValue}>{status.companyName}</Text>
                                    </View>
                                )}
                                <View style={styles.statusRow}>
                                    <Text style={styles.statusLabel}>Last synced</Text>
                                    <Text style={styles.statusValue}>{status.lastSync ? new Date(status.lastSync).toLocaleString() : 'Never'}</Text>
                                </View>
                            </View>
                        )}

                        {status?.connected ? (
                            <Pressable style={styles.disconnectBtn} onPress={disconnect} disabled={disconnecting}>
                                {disconnecting ? <ActivityIndicator color={colors.danger} /> : (
                                    <><Unplug size={14} color={colors.danger} /><Text style={styles.disconnectBtnText}>Disconnect</Text></>
                                )}
                            </Pressable>
                        ) : (
                            <Pressable style={styles.connectBtn} onPress={connect} disabled={connecting}>
                                {connecting ? <ActivityIndicator color="#FFFFFF" /> : (
                                    <><Text style={styles.connectBtnText}>Connect QuickBooks</Text><ExternalLink size={14} color="#FFFFFF" /></>
                                )}
                            </Pressable>
                        )}

                        <Pressable style={styles.refreshRow} onPress={() => refetch()} disabled={isRefetching}>
                            <Text style={styles.refreshText}>{isRefetching ? 'Checking…' : 'Refresh status'}</Text>
                        </Pressable>
                    </View>
                )}

                <Text style={styles.footnote}>
                    Account mapping and QuickBooks statement viewing are available on the web app.
                </Text>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.canvasAlt },
    scroll: { padding: 20, gap: 14, paddingBottom: 40 },
    sectionSub: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted },
    centre: { paddingVertical: 48, alignItems: 'center' },
    card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 20, borderWidth: 1, borderColor: colors.border, gap: 14 },
    cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    qbIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#2CA01C', alignItems: 'center', justifyContent: 'center' },
    qbIconText: { fontFamily: fonts.bodyBold, fontSize: 15, color: '#FFFFFF' },
    cardTitle: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
    cardSub: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, marginTop: 2 },
    connectedPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#ECFDF5', borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 4 },
    connectedPillText: { fontFamily: fonts.bodyBold, fontSize: 10, color: '#059669' },
    statusBlock: { gap: 6, paddingTop: 4, borderTopWidth: 1, borderTopColor: colors.border },
    statusRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 8 },
    statusLabel: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint },
    statusValue: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.text },
    connectBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        backgroundColor: '#2CA01C', borderRadius: radius.md, paddingVertical: 14,
    },
    connectBtnText: { fontFamily: fonts.bodyBold, fontSize: 14, color: '#FFFFFF' },
    disconnectBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        backgroundColor: colors.canvasAlt, borderRadius: radius.md, paddingVertical: 14,
    },
    disconnectBtnText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.danger },
    refreshRow: { alignItems: 'center' },
    refreshText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.blue },
    footnote: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint, lineHeight: 16, textAlign: 'center' },
});

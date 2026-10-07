import { useEffect, useState } from 'react';
import {
    Modal, View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, KeyboardAvoidingView, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Clock, AlertCircle, XCircle, Ban, Lock, FilePlus2 } from 'lucide-react-native';
import { investmentService } from 'core';
import type { MyInvestorAccount } from 'core';
import type { InvestProvider } from '../../data/investCatalog';
import { InvestLogo } from './InvestLogo';
import { colors, fonts, radius } from '../../theme/tokens';

/**
 * What the Invest button shows when the investor can't pay yet.
 *
 *   no account        → "Connect your account" (type the number) or "Register" (the application)
 *   under review      → status only
 *   info requested    → the company's note + "Update application"
 *   rejected          → the reason + "Apply again"
 *   suspended         → contact the company
 *   company not open  → this catalog provider has no MoneyWise account behind it yet
 */
export const InvestAccountGate: React.FC<{
    visible: boolean;
    onClose: () => void;
    provider: InvestProvider;
    account?: MyInvestorAccount;
    onRegister: () => void;
    onConnected: () => void;
}> = ({ visible, onClose, provider, account, onRegister, onConnected }) => {
    const insets = useSafeAreaInsets();
    const qc = useQueryClient();
    const [number, setNumber] = useState('');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => { if (visible) { setNumber(''); setError(null); } }, [visible]);

    const connect = useMutation({
        mutationFn: () => investmentService.connectAccount(provider.investmentTargetId!, number.trim()),
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: ['investor-accounts'] });
            onConnected();
        },
        onError: (e: any) => setError(e?.message || 'Could not connect that account. Please try again.'),
    });

    const canConnect = number.trim().length >= 3 && !connect.isPending;

    let body: React.ReactNode;

    if (!provider.isReal) {
        body = (
            <StateView
                icon={<Lock size={26} color={colors.textMuted} />} tint={colors.chipActiveBg}
                title="Not open for investing yet"
                text={`${provider.name} isn't taking investments through MoneyWise yet. You can still browse their products.`}
                primary={{ label: 'Got it', onPress: onClose }}
            />
        );
    } else if (account?.status === 'PENDING_REVIEW') {
        body = (
            <StateView
                icon={<Clock size={26} color={colors.blue} />} tint={colors.tabActiveBg}
                title="Application under review"
                text={`${provider.name} is reviewing your application. You'll get an email and see it here as soon as your account is active — then you can invest.`}
                primary={{ label: 'OK', onPress: onClose }}
            />
        );
    } else if (account?.status === 'INFO_REQUESTED') {
        body = (
            <StateView
                icon={<AlertCircle size={26} color={colors.warn} />} tint="#FEF3C7"
                title="More information needed"
                text={`${provider.name} needs a little more before they can approve your account.`}
                note={account.reviewNote}
                primary={{ label: 'Update application', onPress: onRegister }}
                secondary={{ label: 'Not now', onPress: onClose }}
            />
        );
    } else if (account?.status === 'REJECTED') {
        body = (
            <StateView
                icon={<XCircle size={26} color={colors.danger} />} tint="#FEE2E2"
                title="Application not approved"
                text={`${provider.name} couldn't approve your application.`}
                note={account.reviewNote}
                primary={{ label: 'Apply again', onPress: onRegister }}
                secondary={{ label: 'Close', onPress: onClose }}
            />
        );
    } else if (account?.status === 'SUSPENDED') {
        body = (
            <StateView
                icon={<Ban size={26} color={colors.danger} />} tint="#FEE2E2"
                title="Account suspended"
                text={`Your ${provider.name} account is suspended, so you can't invest right now. Please contact ${provider.name}.`}
                note={account.reviewNote}
                primary={{ label: 'Close', onPress: onClose }}
            />
        );
    } else {
        body = (
            <View>
                <View style={styles.hero}>
                    <InvestLogo logo={provider.logo} size={44} />
                    <View style={{ flex: 1 }}>
                        <Text style={styles.title}>Connect your account</Text>
                        <Text style={styles.sub}>You need a {provider.name} account to invest.</Text>
                    </View>
                </View>

                <Text style={styles.label}>Investment account number</Text>
                <TextInput
                    value={number}
                    onChangeText={(t) => { setNumber(t); setError(null); }}
                    placeholder="Enter your account number"
                    placeholderTextColor={colors.textFaint}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    returnKeyType="go"
                    onSubmitEditing={() => canConnect && connect.mutate()}
                    style={[styles.input, !!error && styles.inputError]}
                    accessibilityLabel="Investment account number"
                />
                {!!error && <Text style={styles.error}>{error}</Text>}

                <Pressable
                    onPress={() => connect.mutate()}
                    disabled={!canConnect}
                    style={({ pressed }) => [styles.primary, !canConnect && { opacity: 0.5 }, pressed && { opacity: 0.85 }]}
                >
                    {connect.isPending ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>Connect account</Text>}
                </Pressable>

                <View style={styles.orRow}><View style={styles.orLine} /><Text style={styles.orText}>or</Text><View style={styles.orLine} /></View>

                <Pressable onPress={onRegister} style={({ pressed }) => [styles.registerCard, pressed && { opacity: 0.7 }]}>
                    <View style={styles.registerIcon}><FilePlus2 size={20} color={colors.blue} /></View>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.registerTitle}>Don't have an account? Register</Text>
                        <Text style={styles.registerSub}>About 5 minutes. Have your NRC and a few documents ready.</Text>
                    </View>
                </Pressable>
            </View>
        );
    }

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
            <Pressable style={styles.backdrop} onPress={onClose} />
            <KeyboardAvoidingView behavior="padding" style={styles.wrap} pointerEvents="box-none">
                <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 12 }]}>
                    <View style={styles.handle} />
                    <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={8} accessibilityLabel="Close"><X size={18} color={colors.textFaint} /></Pressable>
                    <ScrollView keyboardShouldPersistTaps="handled" bounces={false} contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 8 }}>
                        {body}
                    </ScrollView>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
};

const StateView: React.FC<{
    icon: React.ReactNode; tint: string; title: string; text: string; note?: string | null;
    primary: { label: string; onPress: () => void }; secondary?: { label: string; onPress: () => void };
}> = ({ icon, tint, title, text, note, primary, secondary }) => (
    <View style={{ alignItems: 'center' }}>
        <View style={[styles.stateIcon, { backgroundColor: tint }]}>{icon}</View>
        <Text style={[styles.title, { textAlign: 'center', marginTop: 14 }]}>{title}</Text>
        <Text style={[styles.sub, { textAlign: 'center', marginTop: 6 }]}>{text}</Text>
        {!!note && (
            <View style={styles.noteCard}>
                <Text style={styles.noteLabel}>Message from the company</Text>
                <Text style={styles.noteText}>{note}</Text>
            </View>
        )}
        <Pressable onPress={primary.onPress} style={({ pressed }) => [styles.primary, { alignSelf: 'stretch' }, pressed && { opacity: 0.85 }]}>
            <Text style={styles.primaryText}>{primary.label}</Text>
        </Pressable>
        {secondary && (
            <Pressable onPress={secondary.onPress} style={styles.secondary}><Text style={styles.secondaryText}>{secondary.label}</Text></Pressable>
        )}
    </View>
);

const styles = StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,42,60,0.5)' },
    wrap: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, justifyContent: 'flex-end' },
    sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%' },
    handle: { width: 48, height: 5, borderRadius: 3, backgroundColor: colors.border, alignSelf: 'center', marginTop: 10 },
    closeBtn: { position: 'absolute', right: 18, top: 16, width: 34, height: 34, borderRadius: 17, backgroundColor: colors.canvasAlt, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
    hero: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 22, paddingRight: 40 },
    title: { fontFamily: fonts.bodyBold, fontSize: 19, color: colors.navy },
    sub: { fontFamily: fonts.body, fontSize: 14, color: colors.textMuted, marginTop: 2, lineHeight: 20 },
    label: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.navy, marginBottom: 6 },
    input: {
        minHeight: 52, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong,
        paddingHorizontal: 16, fontFamily: fonts.bodyMedium, fontSize: 16, color: colors.text, letterSpacing: 0.5,
    },
    inputError: { borderColor: colors.danger },
    error: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.danger, marginTop: 6 },
    primary: { minHeight: 50, borderRadius: radius.pill, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
    primaryText: { fontFamily: fonts.bodyBold, fontSize: 15, color: '#FFFFFF' },
    secondary: { paddingVertical: 14 },
    secondaryText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.textMuted },
    orRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 18 },
    orLine: { flex: 1, height: 1, backgroundColor: colors.borderStrong },
    orText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textFaint },
    registerCard: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderStrong },
    registerIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.tabActiveBg, alignItems: 'center', justifyContent: 'center' },
    registerTitle: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
    registerSub: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, marginTop: 2, lineHeight: 17 },
    stateIcon: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
    noteCard: { alignSelf: 'stretch', marginTop: 16, padding: 14, borderRadius: radius.md, backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.borderStrong },
    noteLabel: { fontFamily: fonts.bodyBold, fontSize: 11, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
    noteText: { fontFamily: fonts.body, fontSize: 14, color: colors.text, marginTop: 4, lineHeight: 20 },
});

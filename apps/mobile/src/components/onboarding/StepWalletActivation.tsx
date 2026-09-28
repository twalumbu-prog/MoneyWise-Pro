import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, ScrollView } from 'react-native';
import { WalletCards, Check } from 'lucide-react-native';
import { onboardingService, WalletStatus } from 'core';
import { StepFooter, ErrorBanner, PrimaryButton } from './ui';
import { colors, fonts, radius } from '../../theme/tokens';

interface Props {
    organizationId: string;
    organizationName: string;
    logoUrl: string | null;
    userName: string | null;
    onBack: () => void;
    onProceed: () => Promise<void>;
    saving: boolean;
}

export const StepWalletActivation: React.FC<Props> = ({
    organizationName,
    onBack,
    onProceed,
    saving,
}) => {
    const [status, setStatus] = useState<WalletStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [claiming, setClaiming] = useState(false);

    const amount = status?.activation.amount ?? 0;
    const currency = status?.activation.currency ?? 'ZMW';

    useEffect(() => {
        onboardingService.getWalletStatus()
            .then(setStatus)
            .catch(() => setError('Failed to load wallet status.'))
            .finally(() => setLoading(false));
    }, []);

    const handleActivate = async () => {
        setClaiming(true);
        setError(null);
        try {
            if (!status?.linked) {
                const claimed = await onboardingService.claimWallet();
                setStatus(s => s ? {
                    ...s,
                    linked: true,
                    providerAccountId: claimed.providerAccountId,
                    publicKey: claimed.publicKey,
                } : s);
            }
            // Complete / finish step
            await onProceed();
        } catch (err: any) {
            setError(err.message || 'Failed to claim wallet.');
        } finally {
            setClaiming(false);
        }
    };

    if (loading) {
        return (
            <View style={styles.centerLoading}>
                <ActivityIndicator size="large" color={colors.blue} />
            </View>
        );
    }

    return (
        <View style={styles.root}>
            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >
                <ErrorBanner message={error} />

                <View style={styles.heroBox}>
                    <View style={styles.heroIconBox}>
                        <WalletCards size={36} color={colors.blue} />
                    </View>
                    <Text style={styles.heroTitle}>Activate {organizationName}'s wallet</Text>
                    <Text style={styles.heroSubtitle}>
                        All payments collected from your customers will land directly in your wallet.
                    </Text>
                </View>

                {/* Main Wallet Card */}
                <View style={styles.walletCard}>
                    <Text style={styles.walletCardTag}>MAIN WALLET</Text>
                    <Text style={styles.walletAmount}>
                        {currency === 'ZMW' ? 'K' : currency} {amount.toFixed(2)}
                    </Text>
                    <Text style={styles.walletNote}>
                        Deposit <Text style={{ fontFamily: fonts.bodyBold }}>{currency === 'ZMW' ? 'K' : currency}{amount.toFixed(2)}</Text> to activate your wallet
                    </Text>

                    <PrimaryButton
                        onPress={handleActivate}
                        loading={claiming || saving}
                        variant="black"
                        style={{ marginTop: 12 }}
                    >
                        Activate Wallet Now
                    </PrimaryButton>
                </View>

                {/* Bullet features */}
                <View style={styles.bulletsList}>
                    {[
                        'Dedicated payment wallet reserved for your business',
                        'Activation deposit lands directly in your wallet — spend anytime',
                        'Instant setup for receiving customer mobile money & cards',
                        'It is your money — activation is not a fee',
                    ].map((line, idx) => (
                        <View key={idx} style={styles.bulletRow}>
                            <View style={styles.checkCircle}>
                                <Check size={12} color="#FFFFFF" />
                            </View>
                            <Text style={styles.bulletText}>{line}</Text>
                        </View>
                    ))}
                </View>

                <Pressable onPress={onProceed} style={styles.skipBtn}>
                    <Text style={styles.skipBtnText}>Skip for now & Continue to Dashboard →</Text>
                </Pressable>
            </ScrollView>

            <StepFooter
                onBack={onBack}
                onContinue={onProceed}
                continueLabel="Skip for now"
            />
        </View>
    );
};

const styles = StyleSheet.create({
    root: {
        flex: 1,
    },
    scroll: {
        flex: 1,
    },
    scrollContent: {
        paddingVertical: 12,
        paddingHorizontal: 16,
    },
    centerLoading: {
        paddingVertical: 40,
        alignItems: 'center',
    },
    heroBox: {
        alignItems: 'center',
        marginBottom: 20,
    },
    heroIconBox: {
        width: 64,
        height: 64,
        borderRadius: radius.xl,
        backgroundColor: '#EFF6FF',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 12,
    },
    heroTitle: {
        fontFamily: fonts.bodyBold,
        fontSize: 22,
        color: colors.navy,
        textAlign: 'center',
        marginBottom: 4,
    },
    heroSubtitle: {
        fontFamily: fonts.body,
        fontSize: 14,
        color: colors.textMuted,
        textAlign: 'center',
        paddingHorizontal: 20,
        lineHeight: 20,
    },
    walletCard: {
        backgroundColor: colors.surface,
        borderRadius: radius.xl,
        borderWidth: 1,
        borderColor: colors.borderStrong,
        padding: 20,
        marginBottom: 20,
    },
    walletCardTag: {
        fontFamily: fonts.bodyBold,
        fontSize: 11,
        color: colors.textFaint,
        letterSpacing: 1,
        marginBottom: 4,
    },
    walletAmount: {
        fontFamily: fonts.bodyBold,
        fontSize: 24,
        color: colors.navy,
        marginBottom: 6,
    },
    walletNote: {
        fontFamily: fonts.body,
        fontSize: 13,
        color: colors.textMuted,
        marginBottom: 16,
    },
    bulletsList: {
        marginBottom: 20,
        gap: 12,
        paddingHorizontal: 8,
    },
    bulletRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
    },
    checkCircle: {
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: colors.blue,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 2,
    },
    bulletText: {
        flex: 1,
        fontFamily: fonts.body,
        fontSize: 14,
        color: colors.navy,
        lineHeight: 20,
    },
    skipBtn: {
        alignItems: 'center',
        paddingVertical: 12,
        marginBottom: 16,
    },
    skipBtnText: {
        fontFamily: fonts.bodyBold,
        fontSize: 13,
        color: colors.textMuted,
    },
});

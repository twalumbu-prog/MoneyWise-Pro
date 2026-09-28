import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { LogOut } from 'lucide-react-native';
import { ONBOARDING_STEPS, TOTAL_STEPS } from './constants';
import { colors, fonts, radius } from '../../theme/tokens';
import { useAuth } from '../../context/AuthContext';

interface Props {
    step: number;
    organizationName?: string;
    isPersonal?: boolean;
    totalSteps?: number;
    heroTitle?: string;
    subtitle?: string;
}

export const OnboardingProgressHeader: React.FC<Props> = ({
    step,
    organizationName,
    isPersonal = false,
    totalSteps = TOTAL_STEPS,
    heroTitle,
    subtitle,
}) => {
    const { signOut } = useAuth();
    const maxSteps = isPersonal ? (totalSteps || 3) : TOTAL_STEPS;
    const progressPct = Math.round((step / maxSteps) * 100);
    const stepDef = ONBOARDING_STEPS.find(s => s.id === step);

    const selfHeaded = step === 1 || step === maxSteps;

    return (
        <View style={styles.container}>
            {/* Top row with org badge and sign out */}
            <View style={styles.topRow}>
                {organizationName ? (
                    <View style={styles.orgBadge}>
                        <Text style={styles.orgBadgeText}>{organizationName}</Text>
                    </View>
                ) : <View />}

                <Pressable onPress={() => signOut()} style={styles.signOutBtn}>
                    <LogOut size={16} color={colors.textMuted} />
                    <Text style={styles.signOutText}>Sign out</Text>
                </Pressable>
            </View>

            {/* Progress bar */}
            <View style={styles.track}>
                <View style={[styles.fill, { width: `${Math.max(progressPct, 8)}%` }]} />
            </View>

            {/* Step header title */}
            {(!selfHeaded || heroTitle) && (
                <View style={styles.headerTitleBox}>
                    <Text style={styles.stepCounter}>STEP {step} OF {maxSteps}</Text>
                    <Text style={styles.heroTitle}>
                        {heroTitle || (stepDef ? `${stepDef.heroTitle[0]}\n${stepDef.heroTitle[1]}` : '')}
                    </Text>
                    {(subtitle || stepDef?.subtitle) ? (
                        <Text style={styles.subtitle}>{subtitle || stepDef?.subtitle}</Text>
                    ) : null}
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        width: '100%',
        paddingHorizontal: 20,
        paddingTop: 12,
        paddingBottom: 8,
    },
    topRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    orgBadge: {
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.borderStrong,
        borderRadius: radius.pill,
        paddingHorizontal: 12,
        paddingVertical: 4,
    },
    orgBadgeText: {
        fontFamily: fonts.bodyBold,
        fontSize: 12,
        color: colors.navy,
    },
    signOutBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 6,
        gap: 6,
    },
    signOutText: {
        fontFamily: fonts.bodyMedium,
        fontSize: 12,
        color: colors.textMuted,
    },
    track: {
        height: 6,
        backgroundColor: '#E5E7EB',
        borderRadius: radius.pill,
        overflow: 'hidden',
        width: '100%',
        marginBottom: 16,
    },
    fill: {
        height: '100%',
        backgroundColor: colors.blue,
        borderRadius: radius.pill,
    },
    headerTitleBox: {
        alignItems: 'center',
        marginVertical: 12,
    },
    stepCounter: {
        fontFamily: fonts.bodyBold,
        fontSize: 11,
        color: colors.textFaint,
        letterSpacing: 1.5,
        marginBottom: 6,
    },
    heroTitle: {
        fontFamily: fonts.bodyBold,
        fontSize: 24,
        color: colors.navy,
        textAlign: 'center',
        lineHeight: 30,
    },
    subtitle: {
        fontFamily: fonts.body,
        fontSize: 15,
        color: colors.textMuted,
        textAlign: 'center',
        marginTop: 6,
    },
});

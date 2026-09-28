import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, Animated, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { onboardingService, OnboardingState, BusinessProfile, CoaAccount } from 'core';
import { useAuth } from '../src/context/AuthContext';
import { OnboardingProgressHeader } from '../src/components/onboarding/OnboardingProgressHeader';
import { CompletionScreen } from '../src/components/onboarding/CompletionScreen';
import { StepWelcome } from '../src/components/onboarding/StepWelcome';
import { StepPersonalCategories } from '../src/components/onboarding/StepPersonalCategories';
import { StepLogo } from '../src/components/onboarding/StepLogo';
import { StepContact } from '../src/components/onboarding/StepContact';
import { StepAddress } from '../src/components/onboarding/StepAddress';
import { StepIndustries } from '../src/components/onboarding/StepIndustries';
import { StepCategories } from '../src/components/onboarding/StepCategories';
import { StepProducts } from '../src/components/onboarding/StepProducts';
import { StepChartOfAccounts } from '../src/components/onboarding/StepChartOfAccounts';
import { StepWalletActivation } from '../src/components/onboarding/StepWalletActivation';
import { colors, fonts, radius } from '../src/theme/tokens';

export default function OnboardingScreen() {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const { session, signOut, organizationName: authOrgName } = useAuth();

    const [state, setState] = useState<OnboardingState | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [step, setStep] = useState<number>(1);
    const [savingStep, setSavingStep] = useState(false);
    const prevStepRef = useRef<number>(1);

    const slideAnim = useRef(new Animated.Value(0)).current;
    const fadeAnim = useRef(new Animated.Value(1)).current;

    const currentOrgName = (state?.organization?.name || authOrgName || '').toLowerCase();
    const isPersonal = currentOrgName.includes('personal') ||
        currentOrgName.includes('workspace') ||
        currentOrgName.includes('individual');

    useEffect(() => {
        if (!session) {
            router.replace('/(auth)/login');
        }
    }, [session, router]);

    useEffect(() => {
        let cancelled = false;
        onboardingService.getState()
            .then((s) => {
                if (cancelled) return;
                setState(s);
                const orgName = (s.organization?.name || authOrgName || '').toLowerCase();
                const personal = orgName.includes('personal') || orgName.includes('workspace') || orgName.includes('individual');
                const maxStepLimit = personal ? 3 : 9;

                if (s.progress.status === 'COMPLETED') {
                    setStep(10); // Completion screen
                } else {
                    const next = s.progress.completedSteps.length > 0
                        ? Math.min(Math.max(...s.progress.completedSteps) + 1, maxStepLimit)
                        : 1;
                    setStep(next);
                    prevStepRef.current = next;
                }
            })
            .catch((err) => {
                if (cancelled) return;
                setError(err.message || 'Failed to load onboarding status.');
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => { cancelled = true; };
    }, [authOrgName]);

    const animateStepChange = (targetStep: number) => {
        const direction = targetStep >= prevStepRef.current ? 1 : -1;
        prevStepRef.current = targetStep;

        slideAnim.setValue(direction * 50);
        fadeAnim.setValue(0.3);

        Animated.parallel([
            Animated.timing(slideAnim, {
                toValue: 0,
                duration: 250,
                useNativeDriver: true,
            }),
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 250,
                useNativeDriver: true,
            }),
        ]).start();
    };

    const completeStep = useCallback(async (stepId: number) => {
        if (!state) return;
        setSavingStep(true);
        try {
            const maxStepLimit = isPersonal ? 3 : 9;
            const nextStep = Math.min(stepId + 1, maxStepLimit);
            await onboardingService.saveProgress(nextStep, stepId);
            setState(s => s ? {
                ...s,
                progress: {
                    ...s.progress,
                    currentStep: nextStep,
                    completedSteps: Array.from(new Set([...s.progress.completedSteps, stepId])).sort((a, b) => a - b),
                },
            } : s);
            animateStepChange(nextStep);
            setStep(nextStep);
        } catch (err: any) {
            setError(err.message || 'Failed to save progress.');
        } finally {
            setSavingStep(false);
        }
    }, [state, isPersonal]);

    const saveProfileAndAdvance = useCallback(async (patch: Partial<BusinessProfile>, stepId: number) => {
        if (!state) return;
        setSavingStep(true);
        try {
            const updatedProfile = await onboardingService.saveProfile(patch);
            setState(s => s ? { ...s, profile: updatedProfile } : s);
            await completeStep(stepId);
        } catch (err: any) {
            setError(err.message || 'Failed to save profile.');
            setSavingStep(false);
        }
    }, [state, completeStep]);

    const goBack = (targetStep: number) => {
        animateStepChange(targetStep);
        setStep(targetStep);
    };

    const handleFinish = async () => {
        try {
            setSavingStep(true);
            await onboardingService.complete();
            animateStepChange(10);
            setStep(10);
        } catch (err: any) {
            setError(err.message || 'Failed to complete onboarding.');
        } finally {
            setSavingStep(false);
        }
    };

    if (loading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color={colors.blue} />
            </View>
        );
    }

    if (error || !state) {
        return (
            <View style={styles.center}>
                <Text style={styles.errorText}>{error || 'Onboarding state could not be loaded.'}</Text>
                <Pressable
                    style={({ pressed }) => [styles.signOutFallbackBtn, pressed && { opacity: 0.8 }]}
                    onPress={() => signOut()}
                >
                    <Text style={styles.signOutFallbackText}>Sign Out</Text>
                </Pressable>
            </View>
        );
    }

    if (step === 10) {
        return <CompletionScreen />;
    }

    // Header title for Personal Onboarding
    let personalHeroTitle: string | undefined;
    let personalSubtitle: string | undefined;
    if (isPersonal) {
        if (step === 2) {
            personalHeroTitle = "Personal Budget Setup";
            personalSubtitle = "Select your income & expense categories";
        } else if (step === 3) {
            personalHeroTitle = "Personal Wallet Setup";
            personalSubtitle = "Activate your Personal Wallet";
        }
    }

    return (
        <KeyboardAvoidingView
            style={[styles.container, { paddingTop: insets.top }]}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <OnboardingProgressHeader
                step={step}
                organizationName={state.organization.name}
                isPersonal={isPersonal}
                totalSteps={isPersonal ? 3 : 9}
                heroTitle={personalHeroTitle}
                subtitle={personalSubtitle}
            />

            <Animated.View
                style={[
                    styles.stepContainer,
                    {
                        opacity: fadeAnim,
                        transform: [{ translateX: slideAnim }],
                    },
                ]}
            >
                {/* Individual Onboarding Flow */}
                {isPersonal ? (
                    <>
                        {step === 1 && (
                            <StepWelcome
                                organizationName={state.organization.name}
                                isPersonal={true}
                                onNameSaved={(name) => setState(s => s ? { ...s, organization: { ...s.organization, name } } : s)}
                                onContinue={() => completeStep(1)}
                                saving={savingStep}
                            />
                        )}
                        {step === 2 && (
                            <StepPersonalCategories
                                onBack={() => goBack(1)}
                                onContinue={async (selectedItems) => {
                                    setSavingStep(true);
                                    try {
                                        let incCount = 101;
                                        let expCount = 201;
                                        const personalCoa: CoaAccount[] = selectedItems.map((item) => ({
                                            code: item.type === 'INCOME' ? `INC-${incCount++}` : `EXP-${expCount++}`,
                                            name: item.label,
                                            type: item.type,
                                            subtype: item.type === 'INCOME' ? 'Revenue' : 'Operating Expenses',
                                            description: `Personal ${item.label.toLowerCase()}`,
                                            is_active: true,
                                        }));
                                        await onboardingService.saveChartOfAccounts(personalCoa);
                                        await completeStep(2);
                                    } catch (err: any) {
                                        setError(err.message || 'Failed to save categories.');
                                        setSavingStep(false);
                                    }
                                }}
                                saving={savingStep}
                            />
                        )}
                        {step === 3 && (
                            <StepWalletActivation
                                organizationId={state.organization.id}
                                organizationName={state.organization.name}
                                logoUrl={state.organization.logoUrl}
                                userName={state.organization.name}
                                onBack={() => goBack(2)}
                                onProceed={handleFinish}
                                saving={savingStep}
                            />
                        )}
                    </>
                ) : (
                    /* Business Onboarding Flow */
                    <>
                        {step === 1 && (
                            <StepWelcome
                                organizationName={state.organization.name}
                                onNameSaved={(name) => setState(s => s ? { ...s, organization: { ...s.organization, name } } : s)}
                                onContinue={() => completeStep(1)}
                                saving={savingStep}
                            />
                        )}
                        {step === 2 && (
                            <StepLogo
                                organizationId={state.organization.id}
                                organizationName={state.organization.name}
                                logoUrl={state.organization.logoUrl}
                                onLogoChanged={(logoUrl) => setState(s => s ? { ...s, organization: { ...s.organization, logoUrl } } : s)}
                                onBack={() => goBack(1)}
                                onContinue={() => completeStep(2)}
                                saving={savingStep}
                            />
                        )}
                        {step === 3 && (
                            <StepContact
                                profile={state.profile}
                                onSave={(patch) => saveProfileAndAdvance(patch, 3)}
                                onBack={() => goBack(2)}
                                saving={savingStep}
                            />
                        )}
                        {step === 4 && (
                            <StepAddress
                                profile={state.profile}
                                onSave={(patch) => saveProfileAndAdvance(patch, 4)}
                                onBack={() => goBack(3)}
                                saving={savingStep}
                            />
                        )}
                        {step === 5 && (
                            <StepIndustries
                                initial={state.profile?.industries || []}
                                onSave={(industries) => saveProfileAndAdvance({ industries }, 5)}
                                onBack={() => goBack(4)}
                                saving={savingStep}
                            />
                        )}
                        {step === 6 && (
                            <StepCategories
                                initial={state.profile?.store_categories || []}
                                industries={state.profile?.industries || []}
                                onSave={(store_categories) => saveProfileAndAdvance({ store_categories }, 6)}
                                onBack={() => goBack(5)}
                                saving={savingStep}
                            />
                        )}
                        {step === 7 && (
                            <StepProducts
                                organizationId={state.organization.id}
                                storeCategories={state.profile?.store_categories || []}
                                onBack={() => goBack(6)}
                                onContinue={(count) => {
                                    setState(s => s ? { ...s, productCount: count } : s);
                                    completeStep(7);
                                }}
                                saving={savingStep}
                            />
                        )}
                        {step === 8 && (
                            <StepChartOfAccounts
                                onBack={() => goBack(7)}
                                onSaved={async () => {
                                    setState(s => s ? { ...s, progress: { ...s.progress, coaSaved: true } } : s);
                                    await completeStep(8);
                                }}
                                saving={savingStep}
                            />
                        )}
                        {step === 9 && (
                            <StepWalletActivation
                                organizationId={state.organization.id}
                                organizationName={state.organization.name}
                                logoUrl={state.organization.logoUrl}
                                userName={state.organization.name}
                                onBack={() => goBack(8)}
                                onProceed={handleFinish}
                                saving={savingStep}
                            />
                        )}
                    </>
                )}
            </Animated.View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.canvas,
    },
    stepContainer: {
        flex: 1,
    },
    center: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.canvas,
        padding: 24,
    },
    errorText: {
        fontFamily: fonts.bodyBold,
        fontSize: 14,
        color: colors.danger,
        textAlign: 'center',
        marginBottom: 16,
    },
    signOutFallbackBtn: {
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.borderStrong,
        borderRadius: radius.pill,
        paddingHorizontal: 20,
        paddingVertical: 10,
    },
    signOutFallbackText: {
        fontFamily: fonts.bodyBold,
        fontSize: 13,
        color: colors.navy,
    },
});

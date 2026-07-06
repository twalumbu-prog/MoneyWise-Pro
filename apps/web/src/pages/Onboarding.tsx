import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
    onboardingService, OnboardingState, BusinessProfile,
} from '../services/onboarding.service';
import { ONBOARDING_STEPS, TOTAL_STEPS } from '../components/onboarding/constants';
import { StepWelcome } from '../components/onboarding/StepWelcome';
import { StepIndustries } from '../components/onboarding/StepIndustries';
import { StepLogo } from '../components/onboarding/StepLogo';
import { StepContact } from '../components/onboarding/StepContact';
import { StepAddress } from '../components/onboarding/StepAddress';
import { StepCategories } from '../components/onboarding/StepCategories';
import { StepProducts } from '../components/onboarding/StepProducts';
import { StepChartOfAccounts } from '../components/onboarding/StepChartOfAccounts';
import { StepWalletActivation } from '../components/onboarding/StepWalletActivation';
import { CompletionScreen } from '../components/onboarding/CompletionScreen';

/**
 * The guided onboarding wizard (/onboarding).
 *
 * Orchestration only — each step owns its UI and validation, this page owns
 * navigation, progress persistence (autosave after every completed step) and
 * resume: on load the server's saved current_step decides where we start.
 */
export const Onboarding: React.FC = () => {
    const { user, userName, userRole, loading: authLoading } = useAuth();
    const navigate = useNavigate();

    const [state, setState] = useState<OnboardingState | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [step, setStep] = useState(1);
    const [direction, setDirection] = useState<1 | -1>(1);
    const [savingStep, setSavingStep] = useState(false);
    const [done, setDone] = useState(false);
    const headingRef = useRef<HTMLHeadingElement>(null);

    // Move focus to the step subtitle whenever the step changes so screen
    // readers and keyboard users land on the new step's objective.
    useEffect(() => {
        if (state) headingRef.current?.focus({ preventScroll: true });
    }, [step, state]);

    // Load state + resume position.
    useEffect(() => {
        if (authLoading) return;
        if (!user) {
            navigate('/login', { replace: true });
            return;
        }
        if (userRole && userRole !== 'ADMIN') {
            navigate('/', { replace: true });
            return;
        }
        onboardingService.getState()
            .then(s => {
                if (s.progress.status === 'COMPLETED') {
                    navigate('/', { replace: true });
                    return;
                }
                setState(s);
                setStep(Math.min(Math.max(s.progress.currentStep, 1), TOTAL_STEPS));
            })
            .catch(() => setLoadError('Failed to load your onboarding. Please refresh the page.'));
    }, [authLoading, user, userRole, navigate]);

    const goTo = useCallback((next: number, dir: 1 | -1) => {
        setDirection(dir);
        setStep(next);
        window.scrollTo({ top: 0 });
    }, []);

    /** Mark a step complete, persist progress, advance. */
    const completeStep = useCallback(async (stepId: number) => {
        const next = Math.min(stepId + 1, TOTAL_STEPS);
        setSavingStep(true);
        try {
            await onboardingService.saveProgress(next, stepId);
            setState(s => s ? {
                ...s,
                progress: {
                    ...s.progress,
                    currentStep: next,
                    completedSteps: Array.from(new Set([...s.progress.completedSteps, stepId])).sort((a, b) => a - b),
                },
            } : s);
            goTo(next, 1);
        } finally {
            setSavingStep(false);
        }
    }, [goTo]);

    const goBack = useCallback((toStep: number) => {
        onboardingService.saveProgress(toStep).catch(() => { /* best-effort */ });
        goTo(toStep, -1);
    }, [goTo]);

    /** Persist a business-profile patch, then complete the step. */
    const saveProfileAndAdvance = useCallback(async (patch: Partial<BusinessProfile>, stepId: number) => {
        setSavingStep(true);
        try {
            const profile = await onboardingService.saveProfile(patch);
            setState(s => s ? { ...s, profile } : s);
            await completeStep(stepId);
        } finally {
            setSavingStep(false);
        }
    }, [completeStep]);

    const handleFinish = useCallback(async () => {
        await onboardingService.complete();
        setDone(true);
    }, []);

    if (done) return <CompletionScreen />;

    if (loadError) {
        return (
            <div className="mw-font-figtree min-h-screen bg-slate-50 flex items-center justify-center p-6">
                <div className="text-center">
                    <p className="text-sm font-bold text-red-600 mb-4">{loadError}</p>
                    <button onClick={() => window.location.reload()} className="text-sm font-bold text-blue-700 hover:underline">
                        Reload
                    </button>
                </div>
            </div>
        );
    }

    if (!state) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
        );
    }

    // Tied directly to the step being viewed (not "steps completed so far") so
    // the bar visibly advances the instant the user moves, not one step late.
    const progressPct = Math.round((step / TOTAL_STEPS) * 100);
    const stepDef = ONBOARDING_STEPS.find(s => s.id === step);

    // Wider canvas for the store-builder style steps.
    const wide = step === 6 || step === 7 || step === 8;

    // Step 1 (Welcome) and the final wallet step render their own hero, so the
    // shell's persistent "Lets Setup…" heading is suppressed for them.
    const selfHeaded = step === 1 || step === TOTAL_STEPS;

    return (
        <div className="mw-font-figtree min-h-screen bg-slate-50 flex flex-col">
            {/* Thin rounded progress bar (Figma: neutral track, blue-600 fill) */}
            <header className="w-full px-4 sm:px-8 pt-5 sm:pt-8">
                <div className={`mx-auto ${wide ? 'max-w-3xl' : 'max-w-xl'}`}>
                    <div
                        className="h-2 bg-neutral-100 rounded-3xl overflow-hidden"
                        role="progressbar"
                        aria-valuenow={progressPct}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label="Onboarding progress"
                    >
                        <div
                            className="h-full bg-blue-600 rounded-full transition-all duration-500 ease-out"
                            style={{ width: `${Math.max(progressPct, 6)}%` }}
                        />
                    </div>
                </div>
            </header>

            {/* Step content with directional slide transition. Bottom padding
                clears the fixed StepFooter bar rendered inside each step. */}
            <main className="flex-1 w-full px-4 sm:px-8 pb-28 sm:pb-32">
                <div
                    key={step}
                    className={`relative mx-auto pt-6 mw-anim ${wide ? 'max-w-3xl' : 'max-w-xl'}`}
                    style={{ animation: `${direction === 1 ? 'mw-step-in-right' : 'mw-step-in-left'} 0.35s cubic-bezier(0.22,1,0.36,1) both` }}
                >
                    {/* Persistent heading + per-step subtitle (step 1 & the
                        final wallet step render their own hero instead) */}
                    {!selfHeaded && (
                        <div className="flex flex-col items-center gap-5 sm:gap-6 mb-8 sm:mb-10 text-center">
                            <p className="text-[11px] font-semibold tracking-[0.18em] uppercase text-gray-400" aria-live="polite">
                                Step {step} of {TOTAL_STEPS}
                            </p>
                            <h1 className="text-gray-800 text-3xl font-bold leading-9">
                                {stepDef?.heroTitle[0]}<br />{stepDef?.heroTitle[1]}
                            </h1>
                            <h2
                                ref={headingRef}
                                tabIndex={-1}
                                className="mw-font-dmsans text-gray-800 text-2xl font-normal leading-8 outline-none"
                            >
                                {stepDef?.subtitle}
                            </h2>
                        </div>
                    )}
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
                            userName={userName}
                            onBack={() => goBack(8)}
                            onProceed={handleFinish}
                            saving={savingStep}
                        />
                    )}
                </div>
            </main>
        </div>
    );
};

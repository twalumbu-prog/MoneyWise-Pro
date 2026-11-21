import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, BackHandler, LogBox } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import {
    personalOnboardingService, PersonalStepError, builtPersonalSteps, firstOpenPersonalStep, personalStepDef, personalProgress,
    type PersonalOnboardingState, type PersonalStepKey, type PersonalStepsMap, type PersonalMoney,
} from 'core';
import { useQueryClient } from '@tanstack/react-query';
import { PersonalAllSet } from '../src/components/onboarding/personal/PersonalAllSet';
import { STEP_COMPONENTS } from '../src/components/onboarding/personal/registry';
import type { PersonalDrafts, StepContext, PersonalService } from '../src/components/onboarding/personal/stepContext';
import { track } from '../src/lib/analytics';
import { PERSONAL_ONBOARDING_QUERY_KEY } from '../src/hooks/usePersonalOnboarding';
import { previewPersonalOnboardingService } from '../src/components/onboarding/personal/previewService';
import { useAuth } from '../src/context/AuthContext';
import { colors, fonts } from '../src/theme/tokens';

/**
 * MoneyWise Personal onboarding (flow PERSONAL_V2) — docs/personal-onboarding-plan.md.
 *
 * The order comes from PERSONAL_STEPS in core; only `built` steps are shown, each drawn by its component in
 * registry.tsx. Every Continue/Skip is saved on the server before moving on, so closing the app resumes at the first
 * step with no saved state.
 *
 *   /personal-onboarding                       the wizard (from the gate in app/index.tsx)
 *   /personal-onboarding?step=<key>&single=1   one step on its own (Home "Finish setting up"); returns when saved
 *   /personal-onboarding?preview=1             dev builds only: in-memory fake server, to walk the screens
 */
type Cursor = PersonalStepKey | 'done';

const emptyDrafts = (): PersonalDrafts => ({
    name: { firstName: '', lastName: '' },
    dob: { dateOfBirth: '' },
    phone: { number: '', codeSentTo: null, code: '', resendAt: null },
    avatar: {},
    intents: [],
    gmail: null,
    billsMonthly: null,
});

export default function PersonalOnboardingScreen() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const { refreshUserOrganizations } = useAuth();
    const params = useLocalSearchParams<{ step?: string; single?: string; preview?: string }>();
    const preview = __DEV__ && params.preview === '1';
    const service: PersonalService = preview ? (previewPersonalOnboardingService as unknown as PersonalService) : personalOnboardingService;
    // Preview runs signed out, so session/Keychain errors from the rest of the app would cover the screens.
    useEffect(() => { if (preview) LogBox.ignoreAllLogs(true); }, [preview]);
    const single = params.single === '1' && !!params.step && !!personalStepDef(params.step);

    const [state, setState] = useState<PersonalOnboardingState | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [cursor, setCursor] = useState<Cursor | null>(null);
    const [saving, setSaving] = useState<'continue' | 'skip' | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const [finishing, setFinishing] = useState(false);
    // Drafts live here, not in the steps, so going Back and forward never loses what was typed.
    const [drafts, setDrafts] = useState<PersonalDrafts>(emptyDrafts);
    const [money, setMoney] = useState<PersonalMoney | null>(null);
    const refreshMoney = useCallback(async () => {
        try { const m = await service.getMoney(); setMoney(m); return m; } catch { return null; }
    }, [service]);

    const built = useMemo(() => builtPersonalSteps(), []);
    const viewedAt = useRef<number>(Date.now());

    const load = useCallback(async () => {
        setLoadError(null);
        try {
            const s = await service.getState();
            if (s.flow !== 'PERSONAL_V2' || (s.status === 'COMPLETED' && !single)) {
                router.replace('/');
                return;
            }
            setState(s);
            setDrafts((d) => ({
                ...d,
                name: { firstName: s.profile.firstName, lastName: s.profile.lastName },
                dob: { dateOfBirth: s.profile.dateOfBirth ?? '' },
                intents: s.profile.intents ?? [],
            }));
            setCursor(single ? (params.step as PersonalStepKey) : firstOpenPersonalStep(s.steps)?.key ?? 'done');
            void refreshMoney();
        } catch (e: any) {
            setLoadError(e?.status === 404 ? 'The server doesn’t have the new setup yet. Try again after the next update.' : e?.message || 'Could not load your setup.');
        }
    }, [router, single, params.step, service, refreshMoney]);

    useEffect(() => { void load(); }, [load]);

    // Funnel: one "viewed" per step shown, with the time spent attached to completed/skipped.
    useEffect(() => {
        if (!cursor || cursor === 'done') return;
        viewedAt.current = Date.now();
        track('onboarding_step_viewed', { flow: 'PERSONAL_V2', step_key: cursor, chapter: personalStepDef(cursor)!.chapter, single });
        setError(null);
        setFieldErrors({});
    }, [cursor, single]);

    // Leaves a single-step screen. With nothing behind it (opened straight from a link on a fresh launch) "back" does
    // nothing, which looked like a dead Done button, so go home instead.
    const exitSingle = useCallback(() => { if (router.canGoBack()) router.back(); else router.replace('/'); }, [router]);

    const index = cursor && cursor !== 'done' ? built.findIndex((s) => s.key === cursor) : built.length;

    const goBack = useCallback(() => {
        if (single) { exitSingle(); return true; }
        if (cursor === 'done') { setCursor(built[built.length - 1].key); return true; }
        if (index > 0) { setCursor(built[index - 1].key); return true; }
        return false;
    }, [single, cursor, index, built, exitSingle]);

    // Android back follows the wizard's Back instead of leaving the app mid-setup.
    useEffect(() => {
        const sub = BackHandler.addEventListener('hardwareBackPress', () => goBack());
        return () => sub.remove();
    }, [goBack]);

    const advanceFrom = useCallback((key: PersonalStepKey, steps: PersonalStepsMap) => {
        setState((s) => (s ? { ...s, steps } : s));
        void queryClient.invalidateQueries({ queryKey: PERSONAL_ONBOARDING_QUERY_KEY });
        // The workspace may have been renamed after the first name.
        if (key === 'name' && !preview) void refreshUserOrganizations().catch(() => undefined);
        if (single) { exitSingle(); return; }
        setCursor(built[built.findIndex((s) => s.key === key) + 1]?.key ?? 'done');
    }, [queryClient, preview, refreshUserOrganizations, single, exitSingle, built]);

    const run = useCallback(async (key: PersonalStepKey, how: 'continue' | 'skip', fn: () => Promise<{ steps: PersonalStepsMap } | null>) => {
        if (saving) return;
        setSaving(how);
        setError(null);
        setFieldErrors({});
        const def = personalStepDef(key)!;
        const props = { flow: 'PERSONAL_V2', step_key: key, chapter: def.chapter, single, ms_on_step: Date.now() - viewedAt.current };
        try {
            const res = await fn();
            if (res) {
                track(how === 'continue' ? 'onboarding_step_completed' : 'onboarding_step_skipped', props);
                advanceFrom(key, res.steps);
            }
        } catch (e: any) {
            track('onboarding_step_error', { ...props, status: e?.status ?? null, message: e?.message ?? null });
            if (e instanceof PersonalStepError && e.field) setFieldErrors({ [e.field]: e.message });
            else setError(e instanceof PersonalStepError && e.status && e.status < 500 ? e.message : 'Couldn’t save. Check your connection and try again.');
        } finally {
            setSaving(null);
        }
    }, [saving, single, advanceFrom]);

    const finish = async () => {
        setFinishing(true);
        setError(null);
        try {
            await service.complete();
            void queryClient.invalidateQueries({ queryKey: PERSONAL_ONBOARDING_QUERY_KEY });
            if (preview) { if (router.canGoBack()) router.back(); else router.replace('/'); return; }
            router.replace('/');
        } catch (e: any) {
            setError(e?.message || 'Couldn’t finish. Check your connection and try again.');
        } finally {
            setFinishing(false);
        }
    };

    if (loadError) {
        return (
            <View style={styles.centre}>
                <Stack.Screen options={{ headerShown: false, gestureEnabled: single }} />
                <Text style={styles.loadError}>{loadError}</Text>
                <Pressable onPress={() => void load()} style={styles.retry} accessibilityRole="button">
                    <Text style={styles.retryText}>Try again</Text>
                </Pressable>
            </View>
        );
    }

    if (!state || !cursor) {
        return (
            <View style={styles.centre}>
                <Stack.Screen options={{ headerShown: false, gestureEnabled: single }} />
                <ActivityIndicator color={colors.blue} />
            </View>
        );
    }

    if (cursor === 'done') {
        return (
            <>
                <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
                <PersonalAllSet
                    firstName={state.profile.firstName}
                    steps={state.steps}
                    finishing={finishing}
                    error={error}
                    onFinish={finish}
                    onOpenStep={(key) => setCursor(key)}
                />
            </>
        );
    }

    const def = personalStepDef(cursor)!;
    const Step = STEP_COMPONENTS[cursor];
    const ctx: StepContext = {
        def,
        progress: single ? 1 : personalProgress(cursor),
        single,
        preview,
        service,
        state,
        drafts,
        setDraft: (k, v) => setDrafts((d) => ({ ...d, [k]: v })),
        onBack: single || index > 0 ? () => { goBack(); } : undefined,
        saving,
        error,
        fieldErrors,
        run: (how, fn) => run(cursor, how, fn),
        skip: def.required ? undefined : () => void run(cursor, 'skip', () => service.saveStep(cursor, 'skipped')),
        done: (data) => void run(cursor, 'continue', () => service.saveStep(cursor, 'done', data)),
        patchProfile: (patch) => setState((s) => (s ? { ...s, profile: { ...s.profile, ...patch } } : s)),
        money,
        refreshMoney,
        goTo: (key) => {
            if (single) router.push({ pathname: '/personal-onboarding', params: { step: key, single: '1', ...(preview ? { preview: '1' } : {}) } } as any);
            else setCursor(key);
        },
    };

    return (
        <>
            <Stack.Screen options={{ headerShown: false, gestureEnabled: single }} />
            {Step ? <Step key={cursor} ctx={ctx} /> : null}
        </>
    );
}

const styles = StyleSheet.create({
    centre: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, padding: 24 },
    loadError: { fontFamily: fonts.body, fontSize: 15, color: colors.textMuted, textAlign: 'center', marginBottom: 16 },
    retry: { paddingHorizontal: 24, minHeight: 48, borderRadius: 24, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
    retryText: { fontFamily: fonts.bodyBold, fontSize: 15, color: '#FFFFFF' },
});

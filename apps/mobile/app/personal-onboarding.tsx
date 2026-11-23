import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, BackHandler, LogBox, Alert } from 'react-native';
import { useSharedValue, withTiming } from 'react-native-reanimated';
import { PUSH_EASE, PUSH_MS, SCREEN_W } from '../src/lib/pagePush';
import { SlideContext } from '../src/components/onboarding/personal/slide';
import { StepCheer } from '../src/components/onboarding/personal/StepCheer';
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

// Steps whose "continue" is just a save: the next page opens at once and the save finishes behind it.
const OPTIMISTIC = new Set<string>(['name', 'dob', 'intents']);

type LeavingLayer = { id: number; key: string; ctx: StepContext; dir: 1 | -1 };

/**
 * One page of the wizard. Its offset goes to the step shell through SlideContext, which moves only the middle content;
 * the top bar and bottom buttons never move. `enter` slides in from the side you are heading, `leave` slides out the
 * other way, `rest` just sits there (the first page).
 */
function SlideLayer({ mode, dir, children }: { mode: 'enter' | 'leave' | 'rest'; dir: 1 | -1; children: React.ReactNode }) {
    const x = useSharedValue(mode === 'enter' ? SCREEN_W * dir : 0);
    useEffect(() => {
        if (mode === 'enter') x.value = withTiming(0, { duration: PUSH_MS, easing: PUSH_EASE });
        else if (mode === 'leave') x.value = withTiming(-SCREEN_W * dir, { duration: PUSH_MS, easing: PUSH_EASE });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return (
        <SlideContext.Provider value={x}>
            <View style={StyleSheet.absoluteFill} pointerEvents={mode === 'leave' ? 'none' : 'auto'}>{children}</View>
        </SlideContext.Provider>
    );
}

export default function PersonalOnboardingScreen() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const { refreshUserOrganizations, signOut } = useAuth();
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
    const keepError = useRef(false);   // set when a background save failed and we came back to show why
    const inFlight = useRef(false);
    const swipeStart = useRef<{ x: number; y: number } | null>(null);
    const dirSV = useSharedValue(1);   // which way pages push: forward (1) or back (-1)
    const dirRef = { get current() { return dirSV.value as 1 | -1; }, set current(v: 1 | -1) { dirSV.value = v; } };
    const [cheer, setCheer] = useState(false);          // the "great start" page shown between net worth and Grow
    const [leaving, setLeaving] = useState<LeavingLayer[]>([]);
    const stash = useRef<{ key: string | null; ctx: StepContext | null } | null>(null);
    const renderedKey = useRef<string | null>(null);
    const lastCtx = useRef<StepContext | null>(null);
    const layerId = useRef(0);
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
        if (keepError.current) { keepError.current = false; return; }
        track('onboarding_step_viewed', { flow: 'PERSONAL_V2', step_key: cursor, chapter: personalStepDef(cursor)!.chapter, single });
        setError(null);
        setFieldErrors({});
    }, [cursor, single]);

    // Leaves a single-step screen. With nothing behind it (opened straight from a link on a fresh launch) "back" does
    // nothing, which looked like a dead Done button, so go home instead.
    const exitSingle = useCallback(() => { if (router.canGoBack()) router.back(); else router.replace('/'); }, [router]);

    const index = cursor && cursor !== 'done' ? built.findIndex((s) => s.key === cursor) : built.length;

    // Back from the very first step: the account already exists, so going back means signing out to the welcome screen.
    const leaveSetup = useCallback(() => {
        Alert.alert(
            'Go back?',
            'You’ll be signed out. Your account is saved, so you can sign in again any time to finish setting up.',
            [
                { text: 'Stay', style: 'cancel' },
                { text: 'Sign out', style: 'destructive', onPress: () => { void signOut().then(() => router.replace('/(auth)/welcome' as any)); } },
            ],
        );
    }, [signOut, router]);

    const goBack = useCallback(() => {
        dirRef.current = -1;
        if (single) { exitSingle(); return true; }
        if (!preview && cursor === built[0]?.key && !cheer) { leaveSetup(); return true; }
        if (cursor === 'done') { setCursor(built[built.length - 1].key); return true; }
        if (cheer) { setCheer(false); setCursor(built[index - 1].key); return true; }
        if (index > 0) { setCursor(built[index - 1].key); return true; }
        return false;
    }, [single, cursor, index, built, exitSingle, cheer, preview, leaveSetup]);

    // Android back follows the wizard's Back instead of leaving the app mid-setup.
    useEffect(() => {
        const sub = BackHandler.addEventListener('hardwareBackPress', () => goBack());
        return () => sub.remove();
    }, [goBack]);

    // Moves forward from `key`; going into Grow, the "great start" page comes first.
    const goNext = useCallback((key: PersonalStepKey) => {
        dirRef.current = 1;
        const next = built[built.findIndex((s) => s.key === key) + 1]?.key ?? 'done';
        if (next === 'grow') setCheer(true);
        setCursor(next);
    }, [built]);

    const advanceFrom = useCallback((key: PersonalStepKey, steps: PersonalStepsMap, navigate = true) => {
        setState((s) => (s ? { ...s, steps } : s));
        void queryClient.invalidateQueries({ queryKey: PERSONAL_ONBOARDING_QUERY_KEY });
        // The workspace may have been renamed after the first name.
        if (key === 'name' && !preview) void refreshUserOrganizations().catch(() => undefined);
        if (!navigate) return;
        if (single) { exitSingle(); return; }
        goNext(key);
    }, [queryClient, preview, refreshUserOrganizations, single, exitSingle, goNext]);

    const run = useCallback(async (key: PersonalStepKey, how: 'continue' | 'skip', fn: () => Promise<{ steps: PersonalStepsMap } | null>, optimistic = false) => {
        if (saving || inFlight.current) return;
        // Optimistic: plain "save this step" calls move on at once and finish saving in the background; a failure brings
        // the person back to the step with the reason. Not used where the call decides whether to move on (phone code, etc.).
        const instant = optimistic && !single;
        inFlight.current = true;
        if (!instant) setSaving(how);
        setError(null);
        setFieldErrors({});
        if (instant) goNext(key);
        const def = personalStepDef(key)!;
        const props = { flow: 'PERSONAL_V2', step_key: key, chapter: def.chapter, single, ms_on_step: Date.now() - viewedAt.current };
        try {
            const res = await fn();
            if (res) {
                track(how === 'continue' ? 'onboarding_step_completed' : 'onboarding_step_skipped', props);
                advanceFrom(key, res.steps, !instant);
            }
        } catch (e: any) {
            if (instant) { keepError.current = true; dirRef.current = -1; setCursor(key); }
            track('onboarding_step_error', { ...props, status: e?.status ?? null, message: e?.message ?? null });
            if (__DEV__) console.warn(`[PersonalOnboarding] step "${key}" (${how}) failed:`, e?.status ?? '(no status)', e?.message ?? e);
            if (e instanceof PersonalStepError && e.field) setFieldErrors({ [e.field]: e.message });
            // A server rejection (4xx) carries its own reason (PersonalStepError from the onboarding calls, ApiError from the
            // shared ones such as bills): show it. Only a network failure or a 5xx gets the generic line.
            else setError(typeof e?.status === 'number' && e.status < 500 && e?.message ? e.message : 'Couldn’t save. Check your connection and try again.');
        } finally {
            inFlight.current = false;
            setSaving(null);
        }
    }, [saving, single, advanceFrom, built, goNext]);

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

    const stepKey = cheer ? 'cheer' : cursor;
    // When the page changes, keep the old one mounted for a moment so it can slide out.
    useEffect(() => {
        const st = stash.current;
        if (!st || !st.key || st.key === 'done' || !st.ctx) return;
        stash.current = null;
        const id = ++layerId.current;
        const entry: LeavingLayer = { id, key: st.key, ctx: st.ctx, dir: dirSV.value as 1 | -1 };
        setLeaving((l) => [...l, entry]);
        const t = setTimeout(() => setLeaving((l) => l.filter((x) => x.id !== id)), PUSH_MS + 80);
        return () => clearTimeout(t);
    }, [stepKey]);

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
    const Step = cheer && !single ? StepCheer : STEP_COMPONENTS[cursor];
    const ctx: StepContext = {
        leaveCheer: () => { dirRef.current = 1; setCheer(false); },
        def,
        progress: single ? 1 : personalProgress(cursor),
        single,
        preview,
        service,
        state,
        drafts,
        setDraft: (k, v) => setDrafts((d) => ({ ...d, [k]: v })),
        onBack: () => { goBack(); },
        saving,
        error,
        fieldErrors,
        run: (how, fn) => run(cursor, how, fn, OPTIMISTIC.has(cursor)),
        skip: def.required ? undefined : () => void run(cursor, 'skip', () => service.saveStep(cursor, 'skipped'), true),
        done: (data) => void run(cursor, 'continue', () => service.saveStep(cursor, 'done', data), cursor !== 'wallet' && cursor !== 'phone' && cursor !== 'kyc'),
        patchProfile: (patch) => setState((s) => (s ? { ...s, profile: { ...s.profile, ...patch } } : s)),
        money,
        refreshMoney,
        goTo: (key) => {
            if (single) router.push({ pathname: '/personal-onboarding', params: { step: key, single: '1', ...(preview ? { preview: '1' } : {}) } } as any);
            else setCursor(key);
        },
    };

    const liveKey = cheer && !single ? 'cheer' : cursor;
    let animateIn = false;
    if (renderedKey.current !== liveKey) {
        if (renderedKey.current) { stash.current = { key: renderedKey.current, ctx: lastCtx.current }; animateIn = true; }
        renderedKey.current = liveKey;
    }
    lastCtx.current = ctx;

    return (
        <>
            <Stack.Screen options={{ headerShown: false, gestureEnabled: single }} />
            <View
                style={{ flex: 1, backgroundColor: colors.surface, overflow: 'hidden' }}
                // Swipe right from the left edge = Back (the wizard's pages are not stack screens, so the system gesture can't do it).
                onTouchStart={(e) => { swipeStart.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY }; }}
                onTouchEnd={(e) => {
                    const st = swipeStart.current; swipeStart.current = null;
                    if (!st || st.x > 40 || saving) return;
                    const dx = e.nativeEvent.pageX - st.x, dy = Math.abs(e.nativeEvent.pageY - st.y);
                    if (dx > 70 && dy < 60) goBack();
                }}
            >
                {leaving.map((l) => {
                    const Old = l.key === 'cheer' ? StepCheer : STEP_COMPONENTS[l.key as PersonalStepKey];
                    return Old ? <SlideLayer key={`out${l.id}`} mode="leave" dir={l.dir}><Old ctx={l.ctx} /></SlideLayer> : null;
                })}
                {Step ? (
                    <SlideLayer key={liveKey} mode={animateIn ? 'enter' : 'rest'} dir={dirSV.value as 1 | -1}>
                        <Step ctx={ctx} />
                    </SlideLayer>
                ) : null}
            </View>
        </>
    );
}

const styles = StyleSheet.create({
    centre: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, padding: 24 },
    loadError: { fontFamily: fonts.body, fontSize: 15, color: colors.textMuted, textAlign: 'center', marginBottom: 16 },
    retry: { paddingHorizontal: 24, minHeight: 48, borderRadius: 24, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
    retryText: { fontFamily: fonts.bodyBold, fontSize: 15, color: '#FFFFFF' },
});

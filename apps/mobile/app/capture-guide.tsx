import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Image, ScrollView, ActivityIndicator, AppState, Linking, type LayoutChangeEvent } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSpring, withTiming } from 'react-native-reanimated';
import { ChevronLeft, ChevronRight, PictureInPicture2 } from 'lucide-react-native';
import { useQueryClient } from '@tanstack/react-query';
import { momoCaptureService } from 'core';
import { pushIn, pushOut } from '../src/lib/pagePush';
import { hapticSuccess, hapticTick } from '../src/lib/haptics';
import { AnimatedCheck } from '../src/components/auth/AnimatedCheck';
import { GuideVideo, pipAvailable, videoAvailable, type GuideVideoHandle } from '../src/components/captureGuide/GuideVideo';
import { GUIDE_STEPS, SHOT_H, SHOT_W, TROUBLESHOOT, type GuideStep } from '../src/components/captureGuide/steps';
import { getIosStatus, markIosShortcutSetUp, MOMO_SETTINGS_KEY, openShortcutsApp } from '../src/lib/momoCapture';
import { track } from '../src/lib/analytics';
import { colors, fonts, radius } from '../src/theme/tokens';

/**
 * The iPhone capture guide: adding "When I get a message containing . → Capture mobile money message" in Shortcuts.
 * The full stop makes it run for (almost) every SMS; the app's filter keeps only money messages on the phone.
 *   1. Intro: the how-to video. "Open Shortcuts" keeps it playing in a floating window over Shortcuts.
 *   2. One screen per tap: the real Shortcuts screen, zoomed to the spot, with a pulsing ring on it.
 *   3. Check it works: a test message to yourself, caught live. If it isn't, the usual causes, each linked to its step,
 *      and a strip of every step to jump back to wherever the person got stuck.
 * Built like the onboarding steps: same header, black progress bar, push between pages, black/grey pill buttons.
 */
type Page = { kind: 'intro' } | { kind: 'step'; i: number } | { kind: 'test' };
const pageKey = (p: Page) => (p.kind === 'step' ? `step${p.i}` : p.kind);
const TEST_BODY = 'MoneyWise test: ZMW 1.00';
const GIVE_UP_MS = 25_000;

export default function CaptureGuideScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const qc = useQueryClient();
    const reduced = useReducedMotion();
    const dirSV = useSharedValue(1);
    const video = useRef<GuideVideoHandle>(null);
    const awayAt = useRef<number | null>(null);
    const startedAt = useRef(Date.now());
    const touchX = useRef<number | null>(null);

    const [page, setPage] = useState<Page>({ kind: 'intro' });
    const [moved, setMoved] = useState(false);
    const [heard, setHeard] = useState(false);
    const [sentAt, setSentAt] = useState<number | null>(null);
    const [stuck, setStuck] = useState(false);

    const n = GUIDE_STEPS.length;
    const order = (p: Page) => (p.kind === 'intro' ? 0 : p.kind === 'step' ? p.i + 1 : n + 1);
    const go = (next: Page) => {
        if (pageKey(next) === pageKey(page)) return;
        hapticTick();
        dirSV.value = order(next) >= order(page) ? 1 : -1;
        setMoved(true);
        setPage(next);
    };
    const back = () => {
        if (page.kind === 'intro') { router.back(); return; }
        if (page.kind === 'test') { go(n ? { kind: 'step', i: n - 1 } : { kind: 'intro' }); return; }
        go(page.i === 0 ? { kind: 'intro' } : { kind: 'step', i: page.i - 1 });
    };
    const next = () => {
        if (page.kind === 'intro') go(n ? { kind: 'step', i: 0 } : { kind: 'test' });
        else if (page.kind === 'step') go(page.i < n - 1 ? { kind: 'step', i: page.i + 1 } : { kind: 'test' });
    };

    // To Shortcuts: the video floats on top (iOS starts picture-in-picture as the app leaves). Coming back lands on the
    // check, where the step strip covers "I didn't finish".
    const openShortcuts = () => {
        track('capture_guide_open_shortcuts', { from: pageKey(page), pip: pipAvailable });
        awayAt.current = Date.now();
        if (page.kind === 'intro' && pipAvailable) {
            video.current?.float();
            // A moment for the floating window to appear before Shortcuts comes to the front.
            setTimeout(() => { void openShortcutsApp(); }, 350);
        } else {
            void openShortcutsApp();
        }
    };
    useEffect(() => {
        const sub = AppState.addEventListener('change', (s) => {
            if (s !== 'active' || awayAt.current === null) return;
            const wasAwayLong = Date.now() - awayAt.current > 4000;
            awayAt.current = null;
            video.current?.stopFloating();
            if (wasAwayLong && !heard) go({ kind: 'test' });
        });
        return () => sub.remove();
    });

    // Listening for the test: the action records each send on the phone, and the server records it too.
    useEffect(() => {
        if (page.kind !== 'test' || heard) return;
        const t = setInterval(async () => {
            const local = getIosStatus();
            let ok = !!(local?.lastSentAt && local.lastSentAt > startedAt.current);
            if (!ok) {
                try {
                    const s = await momoCaptureService.getSettings();
                    ok = s.lastCaptureSource === 'IOS_SHORTCUT' && !!s.lastCaptureAt && new Date(s.lastCaptureAt).getTime() > startedAt.current;
                } catch { /* keep waiting */ }
            }
            if (ok) { setHeard(true); hapticSuccess(); track('capture_guide_test_caught'); }
            else if (sentAt && Date.now() - sentAt > GIVE_UP_MS) setStuck(true);
        }, 3000);
        return () => clearInterval(t);
    }, [page.kind, heard, sentAt]);

    const sendTest = () => {
        setSentAt(Date.now()); setStuck(false);
        track('capture_guide_test_sent');
        void Linking.openURL(`sms:&body=${encodeURIComponent(TEST_BODY)}`);
    };
    const finish = async (done: boolean) => {
        if (done) { await markIosShortcutSetUp(true); void qc.invalidateQueries({ queryKey: MOMO_SETTINGS_KEY }); }
        track('capture_guide_finished', { tested: heard });
        router.back();
    };

    const progress = order(page) / (n + 1);
    const step = page.kind === 'step' ? GUIDE_STEPS[page.i] : null;

    return (
        <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
            <Stack.Screen options={{ headerShown: false, gestureEnabled: page.kind === 'intro' }} />
            <View style={styles.header}>
                <Pressable onPress={back} hitSlop={12} style={styles.circleBtn} accessibilityRole="button" accessibilityLabel="Back">
                    <ChevronLeft size={24} color={colors.text} />
                </Pressable>
                <Text style={styles.chapter}>Set up on iPhone</Text>
                <View style={styles.circleSpacer} />
            </View>
            <View style={styles.track} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}>
                <Fill progress={progress} />
            </View>

            {/* Only the middle pushes between pages; header and buttons stay put, as in onboarding. */}
            <View
                style={{ flex: 1, overflow: 'hidden' }}
                onTouchStart={(e) => { touchX.current = e.nativeEvent.pageX; }}
                onTouchEnd={(e) => {
                    if (touchX.current === null || page.kind !== 'step') return;
                    const dx = e.nativeEvent.pageX - touchX.current; touchX.current = null;
                    if (dx < -60) next(); else if (dx > 60) back();
                }}
            >
                <Animated.View
                    key={pageKey(page)}
                    style={{ flex: 1 }}
                    entering={moved && !reduced ? pushIn(dirSV) : undefined}
                    exiting={reduced ? undefined : pushOut(dirSV)}
                >
                    {page.kind === 'intro' && (
                        <View style={styles.body}>
                            <Text style={styles.title} accessibilityRole="header">Add one automation in Shortcuts</Text>
                            <Text style={styles.subtitle}>About a minute, once. We’ll show you every tap.</Text>
                            <View style={styles.videoWrap}>
                                <View style={styles.videoCard}>
                                    {videoAvailable ? <GuideVideo ref={video} /> : n > 0 && <Shot step={GUIDE_STEPS[0]} />}
                                </View>
                            </View>
                            {pipAvailable && (
                                <View style={styles.note}>
                                    <PictureInPicture2 size={18} color={colors.textMuted} />
                                    <Text style={styles.noteText}>This guide keeps playing in a small window over Shortcuts, so you can follow along.</Text>
                                </View>
                            )}
                        </View>
                    )}

                    {step && page.kind === 'step' && (
                        <View style={styles.body}>
                            <Text style={styles.count}>STEP {page.i + 1} OF {n}</Text>
                            <Caption text={step.caption} />
                            {!!step.tip && <Text style={styles.tip}>{step.tip}</Text>}
                            <View style={styles.shotCard}><Shot step={step} /></View>
                        </View>
                    )}

                    {page.kind === 'test' && (
                        <ScrollView contentContainerStyle={styles.body}>
                            <Text style={styles.title} accessibilityRole="header">Check it works</Text>
                            <Text style={styles.subtitle}>Send yourself a quick test message. MoneyWise should catch it within a few seconds.</Text>

                            <View style={[styles.status, heard && styles.statusOn]}>
                                {heard ? <AnimatedCheck checked size={28} fill={colors.positive} border={colors.positive} /> : sentAt ? <ActivityIndicator color={colors.text} /> : <View style={styles.dot} />}
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.statusTitle}>{heard ? 'Capture is working' : sentAt ? 'Waiting for your test message…' : 'Ready to test'}</Text>
                                    <Text style={styles.statusBody}>
                                        {heard ? 'Your mobile money messages will now come into MoneyWise on their own.'
                                            : 'Tap Send a test message, choose yourself as the recipient and send it.'}
                                    </Text>
                                </View>
                            </View>

                            {stuck && !heard && (
                                <View style={{ marginTop: 24 }}>
                                    <Text style={styles.section}>Not caught yet? Check these</Text>
                                    {TROUBLESHOOT.map((t) => {
                                        const i = GUIDE_STEPS.findIndex((s) => s.key === t.step);
                                        return (
                                            <Pressable key={t.title} disabled={i < 0} onPress={() => go({ kind: 'step', i })} style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]} accessibilityRole="button">
                                                <View style={{ flex: 1 }}>
                                                    <Text style={styles.rowTitle}>{t.title}</Text>
                                                    <Text style={styles.rowBody}>{t.body}</Text>
                                                </View>
                                                {i >= 0 && <ChevronRight size={18} color={colors.textFaint} />}
                                            </Pressable>
                                        );
                                    })}
                                </View>
                            )}

                            {!heard && n > 0 && (
                                <View style={{ marginTop: 24 }}>
                                    <Text style={styles.section}>Didn’t finish in Shortcuts? Pick where you are</Text>
                                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginRight: -24 }} contentContainerStyle={{ gap: 10, paddingRight: 24 }}>
                                        {GUIDE_STEPS.map((s, i) => (
                                            <Pressable key={s.key} onPress={() => go({ kind: 'step', i })} style={styles.thumb} accessibilityRole="button" accessibilityLabel={`Step ${i + 1}: ${s.caption.replace(/\*\*/g, '')}`}>
                                                <Image source={s.image} style={styles.thumbImg} resizeMode="cover" />
                                                <View style={styles.thumbNum}><Text style={styles.thumbNumText}>{i + 1}</Text></View>
                                            </Pressable>
                                        ))}
                                    </ScrollView>
                                </View>
                            )}
                        </ScrollView>
                    )}
                </Animated.View>
            </View>

            <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
                {page.kind === 'intro' && (<>
                    <Button kind="secondary" label="Step by step" onPress={next} />
                    <Button label="Open Shortcuts" onPress={openShortcuts} />
                </>)}
                {page.kind === 'step' && (<>
                    <Button kind="secondary" label="Open Shortcuts" onPress={openShortcuts} />
                    <Button label={page.i < n - 1 ? 'Next' : 'I’ve done this'} onPress={next} />
                </>)}
                {page.kind === 'test' && (heard
                    ? <Button label="Finish" onPress={() => void finish(true)} />
                    : (<>
                        <Button kind="secondary" label="Finish later" onPress={() => void finish(false)} />
                        <Button label={sentAt ? 'Send another' : 'Send a test message'} onPress={sendTest} />
                    </>))}
            </View>
        </View>
    );
}

function Fill({ progress }: { progress: number }) {
    const w = useSharedValue(progress);
    useEffect(() => { w.value = withSpring(Math.max(0.04, progress), { stiffness: 300, damping: 35, mass: 1, overshootClamping: true }); }, [progress, w]);
    const style = useAnimatedStyle(() => ({ width: `${w.value * 100}%` }));
    return <Animated.View style={[styles.fill, style]} />;
}

/** "Tap **Next**": the words to look for on screen in blue. */
function Caption({ text }: { text: string }) {
    return (
        <Text style={styles.caption} accessibilityRole="header">
            {text.split('**').map((part, i) => <Text key={i} style={i % 2 ? { color: colors.blue } : undefined}>{part}</Text>)}
        </Text>
    );
}

/** The Shortcuts screen at full width, scrolled so the tap sits in view, with a pulsing ring on it. */
function Shot({ step }: { step: GuideStep }) {
    const [box, setBox] = useState<{ w: number; h: number } | null>(null);
    const onLayout = (e: LayoutChangeEvent) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });
    let content: React.ReactNode = null;
    if (box) {
        const imgH = (box.w * SHOT_H) / SHOT_W;
        const ty = (step.y / SHOT_H) * imgH;
        const statusBar = (62 / SHOT_H) * imgH;   // never show the screenshot's clock and battery
        const offset = Math.max(statusBar, Math.min(ty - box.h * 0.45, imgH - box.h));
        content = (
            <>
                <Image source={step.image} style={{ position: 'absolute', left: 0, top: -offset, width: box.w, height: imgH }} />
                <Ring x={(step.x / SHOT_W) * box.w} y={ty - offset} />
            </>
        );
    }
    return <View style={StyleSheet.absoluteFill} onLayout={onLayout}>{content}</View>;
}

function Ring({ x, y }: { x: number; y: number }) {
    const reduced = useReducedMotion();
    const p = useSharedValue(0);
    useEffect(() => {
        if (!reduced) p.value = withRepeat(withTiming(1, { duration: 1300, easing: Easing.out(Easing.cubic) }), -1, false);
    }, [p, reduced]);
    const ring = useAnimatedStyle(() => ({ opacity: 0.9 * (1 - p.value), transform: [{ scale: 0.7 + p.value * 1.1 }] }));
    return (
        <View pointerEvents="none" style={{ position: 'absolute', left: x - 30, top: y - 30, width: 60, height: 60 }}>
            <Animated.View style={[styles.ring, ring]} />
            <View style={styles.tapDot} />
        </View>
    );
}

function Button({ label, onPress, kind = 'primary' }: { label: string; onPress: () => void; kind?: 'primary' | 'secondary' }) {
    const primary = kind === 'primary';
    return (
        <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.btn, primary ? styles.primary : styles.secondary, { opacity: pressed ? 0.85 : 1 }]}>
            <Text style={primary ? styles.primaryText : styles.secondaryText}>{label}</Text>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.surface },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, gap: 12 },
    circleBtn: {
        width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface,
        shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2,
    },
    circleSpacer: { width: 44, height: 44 },
    chapter: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textMuted, letterSpacing: 0.3, textAlign: 'center' },
    track: { alignSelf: 'stretch', height: 4, marginTop: 16, backgroundColor: colors.borderStrong, overflow: 'hidden' },
    fill: { height: 4, backgroundColor: '#000000' },
    body: { flexGrow: 1, flex: 1, paddingHorizontal: 24, paddingTop: 24, paddingBottom: 16 },
    title: { fontFamily: fonts.display, fontSize: 30, lineHeight: 36, color: colors.text },
    subtitle: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.textMuted, marginTop: 6 },
    videoWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 20 },
    videoCard: {
        height: '100%', aspectRatio: 720 / 1280, maxWidth: '100%', borderRadius: 24, overflow: 'hidden', backgroundColor: '#F2F2F7',
        borderWidth: 1, borderColor: colors.borderStrong,
    },
    note: { flexDirection: 'row', gap: 10, alignItems: 'center', padding: 14, borderRadius: radius.md, backgroundColor: '#F3F4F6' },
    noteText: { flex: 1, fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.text },
    count: { fontFamily: fonts.bodyMedium, fontSize: 12, letterSpacing: 1, color: colors.textMuted },
    caption: { fontFamily: fonts.display, fontSize: 24, lineHeight: 30, color: colors.text, marginTop: 6 },
    tip: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.textMuted, marginTop: 6 },
    shotCard: {
        flex: 1, marginTop: 18, borderRadius: 24, overflow: 'hidden', backgroundColor: '#F2F2F7',
        borderWidth: 1, borderColor: colors.borderStrong,
    },
    ring: { position: 'absolute', left: 0, top: 0, width: 60, height: 60, borderRadius: 30, borderWidth: 3, borderColor: colors.blue },
    // A see-through fingertip: white rim so it shows on blue buttons and grey rows alike.
    tapDot: {
        position: 'absolute', left: 14, top: 14, width: 32, height: 32, borderRadius: 16, borderWidth: 2.5, borderColor: '#FFFFFF', backgroundColor: 'rgba(0,106,255,0.45)',
        shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 4, shadowOffset: { width: 0, height: 1 },
    },
    status: { flexDirection: 'row', gap: 14, alignItems: 'center', padding: 16, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, marginTop: 28 },
    statusOn: { borderColor: colors.positive, backgroundColor: '#F0FDF7' },
    dot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#C4C8D2' },
    statusTitle: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
    statusBody: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.textMuted, marginTop: 2 },
    section: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text, marginBottom: 10 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderStrong },
    rowTitle: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text },
    rowBody: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: colors.textMuted, marginTop: 2 },
    thumb: { width: 72, height: 120, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: '#F2F2F7' },
    thumbImg: { width: '100%', height: '100%' },
    thumbNum: { position: 'absolute', left: 6, top: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center' },
    thumbNumText: { fontFamily: fonts.bodyBold, fontSize: 11, color: '#FFFFFF' },
    footer: { flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingTop: 12, backgroundColor: colors.surface },
    btn: { flex: 1, minHeight: 46, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
    primary: { backgroundColor: '#000000' },
    secondary: { backgroundColor: colors.chipActiveBg },
    primaryText: { fontFamily: fonts.bodyMedium, fontSize: 14, color: '#FFFFFF' },
    secondaryText: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text },
});

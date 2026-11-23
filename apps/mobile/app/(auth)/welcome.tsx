import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, useWindowDimensions, LayoutChangeEvent } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useReducedMotion, useSharedValue } from 'react-native-reanimated';
import { pushIn, pushOut } from '../../src/lib/pagePush';
import * as WebBrowser from 'expo-web-browser';
import { SocialButtons } from '../../src/components/auth/SocialButtons';
import { MoneywiseMark } from '../../src/components/icons/MoneywiseMark';
import { WelcomeHero, SLIDE_DWELL_MS, type WelcomeSlideKey } from '../../src/components/auth/WelcomeHero';
import { track } from '../../src/lib/analytics';
import { colors, fonts } from '../../src/theme/tokens';

/**
 * First screen for someone with no account on this device (docs/personal-onboarding-plan.md, step 0): a swipeable
 * summary of what MoneyWise does over one quiet gradient that fades to white where the buttons are, with the ways in
 * always visible below it.
 */
const SLIDES: { key: WelcomeSlideKey; title: string; body: string }[] = [
    { key: 'accounts', title: 'All your accounts in one place', body: 'Mobile money, bank and cash, together and always up to date.' },
    { key: 'capture', title: 'Captured automatically', body: 'Mobile money messages and bank emails turn into posted transactions on their own.' },
    { key: 'grow', title: 'Watch your net worth grow', body: 'Set targets for saving and investing and see where they take you.' },
];

const TERMS_URL = 'https://moneywise.blueopus.cloud/terms';
const PRIVACY_URL = 'https://moneywise.blueopus.cloud/privacy';

export default function WelcomeScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { width } = useWindowDimensions();
    // Dev builds only: ?hold=1 stops the carousel advancing, so one slide can be looked at (the animation still runs).
    const { hold } = useLocalSearchParams<{ hold?: string }>();
    const holdSlides = __DEV__ && hold === '1';
    const reduced = useReducedMotion();
    const dirSV = useSharedValue(1);
    const touchX = useRef(0);
    const [index, setIndex] = useState(0);
    const [touching, setTouching] = useState(false);
    const [areaH, setAreaH] = useState(0);
    const [error, setError] = useState('');

    useEffect(() => { track('welcome_viewed'); }, []);

    // Auto-advance every 5 s; paused while a finger is down, and off for reduced motion.
    useEffect(() => {
        if (reduced || touching || holdSlides) return;
        const t = setTimeout(() => {
            goTo((index + 1) % SLIDES.length, 1);
        }, SLIDE_DWELL_MS[SLIDES[index].key]);
        return () => clearTimeout(t);
    }, [index, touching, reduced, holdSlides]);

    const goTo = (i: number, dir: 1 | -1 = i >= index ? 1 : -1) => { if (i === index) return; dirSV.value = dir; setIndex(i); };
    const onArea = (e: LayoutChangeEvent) => setAreaH(Math.round(e.nativeEvent.layout.height));

    return (
        <View style={styles.root}>
            {/* One background: a pale lavender wash at the top that flows into white by the buttons. */}
            <LinearGradient colors={['#E4E9FF', '#F1F3FF', '#FFFFFF']} locations={[0, 0.5, 0.82]} style={StyleSheet.absoluteFill} />

            {/* The brand, small, top left, in the dark navy the login screen uses so it reads against the pale wash. */}
            <View style={[styles.brand, { top: insets.top + 10 }]} accessibilityRole="header" accessibilityLabel="Moneywise">
                <MoneywiseMark height={16} color="#0F172A" />
                <Text style={styles.brandText}>Moneywise</Text>
            </View>

            <View style={[styles.slides, { paddingTop: insets.top + 8 }]} onLayout={onArea}>
                {areaH > 0 && (
                    <View
                        style={{ flex: 1, overflow: 'hidden' }}
                        onTouchStart={(e) => { touchX.current = e.nativeEvent.pageX; setTouching(true); }}
                        onTouchEnd={(e) => {
                            setTouching(false);
                            const dx = e.nativeEvent.pageX - touchX.current;
                            if (dx < -50) goTo((index + 1) % SLIDES.length, 1);
                            else if (dx > 50) goTo((index + SLIDES.length - 1) % SLIDES.length, -1);
                        }}
                    >
                        {/* One slide at a time; the next pushes the current one out (Animate UI's push transition). */}
                        <Animated.View
                            key={SLIDES[index].key}
                            style={{ width, height: areaH - insets.top - 8 }}
                            entering={reduced ? undefined : pushIn(dirSV)}
                            exiting={reduced ? undefined : pushOut(dirSV)}
                            accessible accessibilityLabel={`${SLIDES[index].title}. ${SLIDES[index].body}`}
                        >
                            <WelcomeHero slide={SLIDES[index].key} active />
                            <View style={styles.copy}>
                                <Text style={styles.title}>{SLIDES[index].title}</Text>
                                <Text style={styles.body}>{SLIDES[index].body}</Text>
                            </View>
                        </Animated.View>
                    </View>
                )}
            </View>

            <View style={styles.dots} accessibilityRole="adjustable" accessibilityLabel={`Slide ${index + 1} of ${SLIDES.length}`}>
                {SLIDES.map((s, i) => (
                    <Pressable key={s.key} onPress={() => goTo(i)} hitSlop={8} accessibilityLabel={`Show slide ${i + 1}`}>
                        <View style={[styles.dot, i === index && styles.dotOn]} />
                    </Pressable>
                ))}
            </View>

            <View style={[styles.actions, { paddingBottom: Math.max(insets.bottom, 14) }]}>
                <SocialButtons compact onError={setError} onEmail={() => { track('welcome_email_tapped'); router.push('/(auth)/choose'); }} />
                {!!error && <Text style={styles.error}>{error}</Text>}
                <Pressable onPress={() => router.push('/(auth)/login')} hitSlop={8} accessibilityRole="button" style={styles.haveAccount}>
                    <Text style={styles.haveAccountText}>I already have an account</Text>
                </Pressable>
                <Text style={styles.legal}>
                    By continuing you agree to our{' '}
                    <Text style={styles.link} onPress={() => void WebBrowser.openBrowserAsync(TERMS_URL)}>Terms of Use</Text>
                    {' '}and{' '}
                    <Text style={styles.link} onPress={() => void WebBrowser.openBrowserAsync(PRIVACY_URL)}>Privacy Policy</Text>.
                </Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#FFFFFF' },
    brand: { position: 'absolute', left: 22, zIndex: 5, flexDirection: 'row', alignItems: 'center', gap: 7 },
    brandText: { fontFamily: fonts.advercaseRegular, fontSize: 17, color: '#0F172A', letterSpacing: -0.2 },
    slides: { flex: 1 },
    copy: { paddingHorizontal: 32, paddingBottom: 4, alignItems: 'center' },
    title: { fontFamily: fonts.display, fontSize: 21, lineHeight: 26, color: colors.text, textAlign: 'center' },
    body: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.textMuted, textAlign: 'center', marginTop: 6 },
    dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingVertical: 14 },
    dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#D6DAF0' },
    dotOn: { width: 18, backgroundColor: colors.blue },
    actions: { paddingHorizontal: 24, gap: 10 },
    error: { fontFamily: fonts.bodyMedium, fontSize: 12, color: '#B91C1C', textAlign: 'center' },
    haveAccount: { alignSelf: 'center', paddingVertical: 8 },
    haveAccountText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textMuted },
    legal: { fontFamily: fonts.body, fontSize: 11, lineHeight: 15, color: colors.textFaint, textAlign: 'center' },
    link: { fontFamily: fonts.bodyMedium, color: colors.textMuted, textDecorationLine: 'underline' },
});

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, useWindowDimensions, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useReducedMotion } from 'react-native-reanimated';
import * as WebBrowser from 'expo-web-browser';
import { Mail } from 'lucide-react-native';
import { SocialButtons } from '../../src/components/auth/SocialButtons';
import { WelcomeHero, type WelcomeSlideKey } from '../../src/components/auth/WelcomeHero';
import { track } from '../../src/lib/analytics';
import { colors, fonts, radius } from '../../src/theme/tokens';

/**
 * First screen for someone with no account on this device (docs/personal-onboarding-plan.md, step 0): a swipeable
 * summary of what MoneyWise does, with the ways in always visible below it.
 */
const SLIDES: { key: WelcomeSlideKey; title: string; body: string }[] = [
    { key: 'accounts', title: 'All your money in one place', body: 'Mobile money, bank and cash balances together, always up to date.' },
    { key: 'capture', title: 'Captured automatically', body: 'MoMo messages and bank emails become transactions on their own.' },
    { key: 'bills', title: 'Never miss a bill', body: 'Rent, ZESCO, bundles: reminders before each one is due.' },
    { key: 'grow', title: 'Watch your net worth grow', body: 'Set targets for saving and investing and see where they take you.' },
];

const TERMS_URL = 'https://moneywise.blueopus.cloud/terms';
const PRIVACY_URL = 'https://moneywise.blueopus.cloud/privacy';

export default function WelcomeScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { width } = useWindowDimensions();
    const reduced = useReducedMotion();
    const scroller = useRef<ScrollView>(null);
    const [index, setIndex] = useState(0);
    const [touching, setTouching] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => { track('welcome_viewed'); }, []);

    // Auto-advance every 5 s; paused while a finger is down, and off for reduced motion.
    useEffect(() => {
        if (reduced || touching) return;
        const t = setTimeout(() => {
            const next = (index + 1) % SLIDES.length;
            scroller.current?.scrollTo({ x: next * width, animated: true });
            setIndex(next);
        }, 5000);
        return () => clearTimeout(t);
    }, [index, touching, reduced, width]);

    const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
        const i = Math.round(e.nativeEvent.contentOffset.x / width);
        if (i !== index) setIndex(i);
    };

    const goTo = (i: number) => { scroller.current?.scrollTo({ x: i * width, animated: !reduced }); setIndex(i); };

    return (
        <View style={styles.root}>
            <ScrollView
                ref={scroller}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={onScrollEnd}
                onTouchStart={() => setTouching(true)}
                onTouchEnd={() => setTouching(false)}
                onScrollEndDrag={() => setTouching(false)}
                style={{ flexGrow: 0 }}
            >
                {SLIDES.map((s) => (
                    <View key={s.key} style={{ width }} accessible accessibilityLabel={`${s.title}. ${s.body}`}>
                        <View style={[styles.hero, { paddingTop: insets.top }]}><WelcomeHero slide={s.key} /></View>
                        <View style={styles.copy}>
                            <Text style={styles.title}>{s.title}</Text>
                            <Text style={styles.body}>{s.body}</Text>
                        </View>
                    </View>
                ))}
            </ScrollView>

            <View style={styles.dots} accessibilityRole="adjustable" accessibilityLabel={`Slide ${index + 1} of ${SLIDES.length}`}>
                {SLIDES.map((s, i) => (
                    <Pressable key={s.key} onPress={() => goTo(i)} hitSlop={8} accessibilityLabel={`Show slide ${i + 1}`}>
                        <View style={[styles.dot, i === index && styles.dotOn]} />
                    </Pressable>
                ))}
            </View>

            <View style={[styles.actions, { paddingBottom: Math.max(insets.bottom, 16) }]}>
                <SocialButtons onError={setError} showDivider={false} />
                <Pressable
                    onPress={() => { track('welcome_email_tapped'); router.push('/(auth)/choose'); }}
                    style={({ pressed }) => [styles.emailBtn, pressed && { opacity: 0.85 }]}
                    accessibilityRole="button"
                >
                    <Mail size={18} color={colors.text} />
                    <Text style={styles.emailText}>Continue with email</Text>
                </Pressable>
                {!!error && <Text style={styles.error}>{error}</Text>}
                <Pressable onPress={() => router.push('/(auth)/login')} hitSlop={8} accessibilityRole="button" style={{ alignSelf: 'center', paddingVertical: 10 }}>
                    <Text style={styles.signIn}>I already have an account</Text>
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
    root: { flex: 1, backgroundColor: colors.surface },
    hero: { height: 360 },
    copy: { paddingHorizontal: 28, paddingTop: 22, alignItems: 'center' },
    title: { fontFamily: fonts.display, fontSize: 27, lineHeight: 33, color: colors.text, textAlign: 'center' },
    body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: colors.textMuted, textAlign: 'center', marginTop: 8 },
    dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 14 },
    dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.borderStrong },
    dotOn: { width: 20, backgroundColor: colors.blue },
    actions: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 20, gap: 10 },
    emailBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, height: 52, borderRadius: radius.pill, backgroundColor: colors.chipActiveBg },
    emailText: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
    error: { fontFamily: fonts.bodyMedium, fontSize: 13, color: '#B91C1C', textAlign: 'center' },
    signIn: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.blue },
    legal: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: colors.textFaint, textAlign: 'center' },
    link: { fontFamily: fonts.bodyMedium, color: colors.textMuted, textDecorationLine: 'underline' },
});

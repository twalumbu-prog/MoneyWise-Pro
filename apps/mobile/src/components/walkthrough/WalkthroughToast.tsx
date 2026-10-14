import { useEffect, useRef, useState } from 'react';
import { Animated, AppState, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronRight, PartyPopper, X } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { useWalkthroughCore } from '../../hooks/useWalkthrough';
import { CARD_MAX_ACCOUNT_AGE_DAYS } from '../../lib/walkthrough';
import { tour } from '../../lib/tour';
import { walkthroughUi } from '../../lib/walkthroughUi';
import { cacheStoreSync } from '../../platform/storage';
import { colors, fonts } from '../../theme/tokens';

const seenKey = (orgId: string) => `walkthrough_seen_v1:${orgId}`;

/**
 * Notices, anywhere in the app, when a getting-started step gets done, whether the person followed the tour or just
 * found it themselves, and tells them with a banner at the top. Tapping the banner opens the remaining list.
 * Progress is re-read every 25 s, when the app returns to the foreground, and shortly after moving between screens.
 */
export const WalkthroughToast: React.FC = () => {
    const { organizationId } = useAuth();
    const wt = useWalkthroughCore(25_000);
    const { reload } = wt;
    const pathname = usePathname();
    const insets = useSafeAreaInsets();
    const [msg, setMsg] = useState<{ title: string; sub: string } | null>(null);
    const slide = useRef(new Animated.Value(0)).current;
    const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Re-read progress when the app comes back to the front, and a moment after the person moves to another screen.
    useEffect(() => {
        const sub = AppState.addEventListener('change', (s) => { if (s === 'active') reload(); });
        return () => sub.remove();
    }, [reload]);
    useEffect(() => {
        const t = setTimeout(reload, 1400);
        return () => clearTimeout(t);
    }, [pathname, reload]);

    const dismiss = () => {
        if (hideTimer.current) clearTimeout(hideTimer.current);
        Animated.timing(slide, { toValue: 0, duration: 220, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(() => setMsg(null));
    };

    // Compare what is done now with what the person has already been told about.
    useEffect(() => {
        if (!organizationId || !wt.available || wt.hidden) return;
        if ((wt.accountAgeDays ?? Infinity) > CARD_MAX_ACCOUNT_AGE_DAYS) return;
        const doneIds = wt.tasks.filter((t) => t.complete).map((t) => t.id);
        const raw = cacheStoreSync.getItem(seenKey(organizationId));
        if (raw === null) { cacheStoreSync.setItem(seenKey(organizationId), JSON.stringify(doneIds)); return; }   // first look: don't announce old progress
        let seen: string[] = [];
        try { seen = JSON.parse(raw); } catch { /* treat as nothing seen */ }
        const fresh = wt.tasks.filter((t) => t.complete && !seen.includes(t.id));
        if (fresh.length === 0) return;
        cacheStoreSync.setItem(seenKey(organizationId), JSON.stringify(doneIds));

        // the step being walked through is done: end its tour
        const active = tour.state().taskId;
        if (active && fresh.some((t) => t.id === active)) tour.stop();

        const allDone = doneIds.length === wt.total;
        setMsg({
            title: allDone ? 'You\'ve completed every step!' : fresh.length === 1 ? `Congratulations, you ${fresh[0].achieved}!` : `Congratulations, ${fresh.length} steps done!`,
            sub: allDone ? 'You\'re set up to make the most of Moneywise.' : `${doneIds.length} of ${wt.total} steps done. Tap to see what's next.`,
        });
        slide.setValue(0);
        Animated.timing(slide, { toValue: 1, duration: 320, easing: Easing.out(Easing.back(1.2)), useNativeDriver: true }).start();
        if (hideTimer.current) clearTimeout(hideTimer.current);
        hideTimer.current = setTimeout(dismiss, 7000);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [wt.tasks, wt.available, wt.hidden, wt.accountAgeDays, organizationId]);

    if (!msg) return null;
    return (
        <Animated.View
            pointerEvents="box-none"
            style={[styles.wrap, { top: insets.top + 8, opacity: slide, transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [-90, 0] }) }] }]}
        >
            <Pressable style={styles.card} onPress={() => { dismiss(); walkthroughUi.openList(); }} accessibilityRole="button" accessibilityLabel="Open your getting-started list">
                <View style={styles.icon}><PartyPopper size={20} color="#FFFFFF" /></View>
                <View style={{ flex: 1 }}>
                    <Text style={styles.title} numberOfLines={2}>{msg.title}</Text>
                    <Text style={styles.sub} numberOfLines={2}>{msg.sub}</Text>
                </View>
                <ChevronRight size={18} color={colors.textFaint} />
                <Pressable onPress={dismiss} hitSlop={10} style={styles.close} accessibilityLabel="Dismiss"><X size={14} color={colors.textMuted} /></Pressable>
            </Pressable>
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    wrap: { position: 'absolute', left: 12, right: 12, zIndex: 9500, elevation: 9500 },
    card: {
        flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFFFFF', borderRadius: 18,
        paddingVertical: 12, paddingLeft: 12, paddingRight: 34, borderWidth: 1, borderColor: '#D1FAE5',
        shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 12,
    },
    icon: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.positiveInk, alignItems: 'center', justifyContent: 'center' },
    title: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
    sub: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, marginTop: 1 },
    close: { position: 'absolute', top: 8, right: 8 },
});

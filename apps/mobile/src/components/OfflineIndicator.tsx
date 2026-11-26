import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, interpolate, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, WifiOff } from 'lucide-react-native';
import { fonts } from '../theme/tokens';
import { probe, useOnline } from '../lib/offline/connectivity';
import { discardOutboxItem, retryFailedItem, useOutbox } from '../lib/offline/outbox';
import { useAuth } from '../context/AuthContext';
import { flushOutbox } from '../lib/offline/outbox';
import { androidSystemStatusAvailable } from '../lib/offline/liveActivity';

/**
 * Tells the person, at all times, that the phone is working offline.
 *
 * iPhones with a Dynamic Island: a black capsule is drawn exactly over the island. It swells (the way the island does for a call or
 * a timer) to say "Offline · saved on phone", then settles back to island size with a small amber light beside the camera for as long as
 * the phone is offline. Tap it to open it again. When the connection returns it swells once more in green ("Back online · 2 synced").
 * Android 16 phones with their own island / chip (HyperOS, One UI, Pixel): the phone shows it there, and nothing is drawn here.
 * Every other phone: a slim pill just under the status bar does the same job.
 *
 * (This lives inside the app. A true system Live Activity, visible while the app is closed, needs native iOS code; see the notes.)
 */

const ISLAND_W = 126, ISLAND_H = 37, ISLAND_TOP = 11;
const ISLAND_OPEN_W = 262;
const AMBER = '#F5A524', GREEN = '#34C759';

export const OfflineIndicator: React.FC = () => {
    const online = useOnline();
    const items = useOutbox();
    const insets = useSafeAreaInsets();
    const reduced = useReducedMotion();
    const { user, organizationId } = useAuth();
    const hasIsland = Platform.OS === 'ios' && insets.top >= 51;

    const waiting = items.filter((i) => !i.failed);
    const failed = items.filter((i) => i.failed);

    const [shown, setShown] = useState(false);            // mounted at all
    const [mode, setMode] = useState<'offline' | 'synced'>('offline');
    const [syncedCount, setSyncedCount] = useState(0);
    const wasOnline = useRef(true);
    const prevWaiting = useRef(0);
    const open = useSharedValue(0);                        // 0 = island size / compact, 1 = swollen
    const vis = useSharedValue(0);                         // 0 = gone, 1 = present
    const pulse = useSharedValue(0);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const swell = (ms: number) => {
        open.value = reduced ? withTiming(1, { duration: 120 }) : withSpring(1, { damping: 13, stiffness: 170, mass: 0.8 });
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => { open.value = withSpring(0, { damping: 17, stiffness: 190 }); }, ms);
    };

    useEffect(() => {
        if (!online) {
            wasOnline.current = false;
            setMode('offline'); setShown(true);
            vis.value = withTiming(1, { duration: 200 });
            pulse.value = withRepeat(withSequence(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }), withTiming(0, { duration: 900, easing: Easing.inOut(Easing.quad) })), -1);
            swell(4200);
        } else if (!wasOnline.current) {
            wasOnline.current = true;
            setSyncedCount(prevWaiting.current);
            setMode('synced');
            pulse.value = 0;
            swell(2600);
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => {
                open.value = withSpring(0, { damping: 17, stiffness: 190 });
                vis.value = withTiming(0, { duration: 260 });
                setTimeout(() => setShown(false), 300);
            }, 2800);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [online]);
    useEffect(() => { prevWaiting.current = Math.max(prevWaiting.current, waiting.length); if (online && waiting.length === 0 && wasOnline.current) prevWaiting.current = 0; }, [waiting.length, online]);
    useEffect(() => { if (!online && waiting.length > 0) swell(2600); /* a new item was just saved: show it */ // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [waiting.length]);

    const tint = mode === 'synced' ? GREEN : AMBER;

    const capsule = useAnimatedStyle(() => ({
        opacity: vis.value,
        width: interpolate(open.value, [0, 1], hasIsland ? [ISLAND_W, ISLAND_OPEN_W] : [96, 250]),
        height: interpolate(open.value, [0, 1], hasIsland ? [ISLAND_H, 44] : [28, 44]),
        borderRadius: interpolate(open.value, [0, 1], hasIsland ? [ISLAND_H / 2, 24] : [14, 22]),
    }));
    const compactDot = useAnimatedStyle(() => ({ opacity: interpolate(open.value, [0, 0.3], [1, 0], 'clamp') * (0.55 + 0.45 * pulse.value) }));
    const detail = useAnimatedStyle(() => ({ opacity: interpolate(open.value, [0.55, 1], [0, 1], 'clamp') }));
    const compactLabel = useAnimatedStyle(() => ({ opacity: interpolate(open.value, [0, 0.3], [1, 0], 'clamp') }));

    if (!shown) return null;
    // Android phones with their own island / status-bar chip show the status there (liveActivity.ts): never draw a second one.
    const phoneShowsIt = Platform.OS === 'android' && androidSystemStatusAvailable();

    const top = hasIsland ? ISLAND_TOP : insets.top + 4;
    const title = mode === 'synced' ? 'Back online' : 'Offline';
    const sub = mode === 'synced'
        ? (syncedCount > 0 ? `${syncedCount} synced` : 'all caught up')
        : (waiting.length > 0 ? `${waiting.length} saved on phone` : 'working from your phone');

    return (
        <View pointerEvents="box-none" style={[styles.wrap, { top }]}>
            {!phoneShowsIt && <Pressable onPress={() => { open.value = withSpring(open.value > 0.5 ? 0 : 1, { damping: 14, stiffness: 180 }); if (timer.current) clearTimeout(timer.current); if (!online) void probe(); else if (user) void flushOutbox({ userId: user.id, orgId: organizationId }); }} accessibilityRole="button" accessibilityLabel={`${title}. ${sub}`}>
                <Animated.View style={[styles.capsule, capsule]}>
                    {/* island-size state: a light beside the camera (island), or the word Offline (other phones) */}
                    <Animated.View style={[StyleSheet.absoluteFill, styles.compact, compactLabel]} pointerEvents="none">
                        {hasIsland
                            ? <Animated.View style={[styles.dot, { backgroundColor: tint, marginRight: 14 }, compactDot]} />
                            : <><Animated.View style={[styles.dot, { backgroundColor: tint, marginRight: 6 }, compactDot]} /><Text style={styles.compactText}>{title}</Text></>}
                    </Animated.View>
                    {/* swollen state: icon + words, split either side of the camera on an island */}
                    <Animated.View style={[StyleSheet.absoluteFill, styles.row, detail]} pointerEvents="none">
                        <View style={styles.left}>
                            {mode === 'synced' ? <Check size={16} color={tint} strokeWidth={3} /> : <WifiOff size={16} color={tint} />}
                            <Text style={[styles.title, { color: tint }]}>{title}</Text>
                        </View>
                        {hasIsland ? <View style={{ width: 104 }} /> : <View style={{ flex: 1 }} />}
                        <Text style={styles.sub} numberOfLines={1}>{sub}</Text>
                    </Animated.View>
                </Animated.View>
            </Pressable>}
            {mode === 'offline' && failed.length > 0 && (
                <View style={styles.failed}>
                    <Text style={styles.failedText} numberOfLines={2}>{failed.length} saved {failed.length === 1 ? 'item' : 'items'} could not sync: {failed[0].failed}</Text>
                    <View style={{ flexDirection: 'row', gap: 14 }}>
                        <Pressable onPress={() => retryFailedItem(failed[0].id)}><Text style={styles.failedAction}>Retry</Text></Pressable>
                        <Pressable onPress={() => discardOutboxItem(failed[0].id)}><Text style={[styles.failedAction, { color: '#FF6B6B' }]}>Remove</Text></Pressable>
                    </View>
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 9999, elevation: 9999 },
    capsule: { backgroundColor: '#000', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
    compact: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 0 },
    compactText: { fontFamily: fonts.bodyBold, fontSize: 12, color: '#FFFFFF' },
    dot: { width: 8, height: 8, borderRadius: 4 },
    row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 },
    left: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    title: { fontFamily: fonts.bodyBold, fontSize: 13 },
    sub: { fontFamily: fonts.bodyMedium, fontSize: 12, color: 'rgba(255,255,255,0.85)', marginLeft: 'auto' },
    failed: { marginTop: 8, marginHorizontal: 24, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 16, backgroundColor: '#1C1C1E', gap: 6 },
    failedText: { fontFamily: fonts.body, fontSize: 12, color: '#FFFFFF' },
    failedAction: { fontFamily: fonts.bodyBold, fontSize: 12, color: '#7BB0FF' },
});

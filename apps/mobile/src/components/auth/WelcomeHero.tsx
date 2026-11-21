import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSequence, Easing, useReducedMotion } from 'react-native-reanimated';
import { Smartphone, Landmark, Wallet, MessageSquareText, Mail, CalendarClock, Bell, TrendingUp, Zap, Wifi } from 'lucide-react-native';
import { colors, fonts, radius } from '../../theme/tokens';

/**
 * Artwork for the welcome carousel, drawn in code (no image assets, nothing to download). Each slide is a soft
 * gradient disc with a few floating cards that drift gently; reduced motion keeps them still.
 */
export type WelcomeSlideKey = 'accounts' | 'capture' | 'bills' | 'grow';

const Float: React.FC<{ delay?: number; style?: any; children: React.ReactNode }> = ({ delay = 0, style, children }) => {
    const reduced = useReducedMotion();
    const y = useSharedValue(0);
    useEffect(() => {
        if (reduced) return;
        const t = setTimeout(() => {
            y.value = withRepeat(withSequence(
                withTiming(-6, { duration: 1600, easing: Easing.inOut(Easing.quad) }),
                withTiming(0, { duration: 1600, easing: Easing.inOut(Easing.quad) }),
            ), -1);
        }, delay);
        return () => clearTimeout(t);
    }, [reduced, delay, y]);
    const a = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
    return <Animated.View style={[styles.float, style, a]}>{children}</Animated.View>;
};

const Chip: React.FC<{ icon: React.ReactNode; title: string; value?: string; tint: string }> = ({ icon, title, value, tint }) => (
    <View style={styles.chip}>
        <View style={[styles.chipIcon, { backgroundColor: tint }]}>{icon}</View>
        <View>
            <Text style={styles.chipTitle}>{title}</Text>
            {!!value && <Text style={styles.chipValue}>{value}</Text>}
        </View>
    </View>
);

export function WelcomeHero({ slide }: { slide: WelcomeSlideKey }) {
    return (
        <View style={styles.root}>
            <LinearGradient colors={['#E6F0FF', '#F7FAFF']} style={StyleSheet.absoluteFill} />
            <LinearGradient colors={['#B9D4FF', '#E3EEFF']} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={styles.disc} />
            {slide === 'accounts' && (
                <>
                    <Float style={{ top: '20%', left: '8%' }}><Chip icon={<Smartphone size={16} color="#FFFFFF" />} tint="#FFC107" title="MTN MoMo" value="K 1,320.50" /></Float>
                    <Float delay={500} style={{ top: '42%', right: '6%' }}><Chip icon={<Landmark size={16} color="#FFFFFF" />} tint={colors.navy} title="Zanaco" value="K 8,450.00" /></Float>
                    <Float delay={1000} style={{ top: '64%', left: '14%' }}><Chip icon={<Wallet size={16} color="#FFFFFF" />} tint={colors.green} title="Cash" value="K 600.00" /></Float>
                </>
            )}
            {slide === 'capture' && (
                <>
                    <Float style={{ top: '18%', left: '8%' }}><Chip icon={<MessageSquareText size={16} color="#FFFFFF" />} tint="#E11D48" title="You have received K250" value="from J. Banda" /></Float>
                    <Float delay={600} style={{ top: '42%', right: '8%' }}><Chip icon={<Zap size={16} color="#FFFFFF" />} tint={colors.blue} title="Captured" value="+ K 250.00 · Income" /></Float>
                    <Float delay={1100} style={{ top: '65%', left: '12%' }}><Chip icon={<Mail size={16} color="#FFFFFF" />} tint={colors.navy} title="Bank alert email" value="− K 420.00 · Groceries" /></Float>
                </>
            )}
            {slide === 'bills' && (
                <>
                    <Float style={{ top: '18%', left: '10%' }}><Chip icon={<CalendarClock size={16} color="#FFFFFF" />} tint={colors.blue} title="Rent" value="Due on the 1st" /></Float>
                    <Float delay={500} style={{ top: '42%', right: '8%' }}><Chip icon={<Zap size={16} color="#FFFFFF" />} tint="#F59E0B" title="ZESCO tokens" value="K 300 · monthly" /></Float>
                    <Float delay={1000} style={{ top: '65%', left: '12%' }}><Chip icon={<Bell size={16} color="#FFFFFF" />} tint={colors.green} title="Data bundle" value="Reminder tomorrow" /></Float>
                </>
            )}
            {slide === 'grow' && (
                <>
                    <Float style={{ top: '22%', left: '10%' }}><Chip icon={<TrendingUp size={16} color="#FFFFFF" />} tint={colors.green} title="Net worth" value="K 24,800 ↑ 12%" /></Float>
                    <Float delay={600} style={{ top: '48%', right: '8%' }}><Chip icon={<Wifi size={16} color="#FFFFFF" />} tint={colors.blue} title="Saving for a laptop" value="K 4,200 of K 9,000" /></Float>
                </>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
    disc: { width: 260, height: 260, borderRadius: 130, opacity: 0.9 },
    float: { position: 'absolute' },
    chip: {
        flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: radius.md,
        backgroundColor: colors.surface, shadowColor: '#0B2A5B', shadowOpacity: 0.12, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 4,
    },
    chipIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    chipTitle: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text },
    chipValue: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, marginTop: 1 },
});

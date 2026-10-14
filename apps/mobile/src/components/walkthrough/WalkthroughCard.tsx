import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRight, Circle, Play, Trophy } from 'lucide-react-native';
import { useWalkthrough } from '../../hooks/useWalkthrough';
import { walkthroughUi } from '../../lib/walkthroughUi';
import { colors, fonts } from '../../theme/tokens';

/**
 * "Welcome to Moneywise": the next step to take, how far along the person is, and a Start button that opens that
 * step's guide. Sits under the Inbox filters. It shows only for new accounts, only while steps remain, and it
 * renders nothing at all if progress can't be loaded.
 */
export const WalkthroughCard: React.FC = () => {
    const { showCard, next, completed, total, type } = useWalkthrough();
    const pct = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.timing(pct, { toValue: total ? completed / total : 0, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    }, [completed, total, pct]);

    if (!showCard || !next) return null;

    const intro = type === 'PERSONAL'
        ? 'Ready to manage your finances? Complete these quick steps to learn how Moneywise helps you stay in control.'
        : 'Ready to run your business on Moneywise? Complete these quick steps to set up your workspace and start moving money.';

    return (
        <View style={styles.card}>
            <View style={styles.titleRow}>
                <View style={styles.titleIcon}><Trophy size={16} color="#1E40AF" strokeWidth={1.8} /></View>
                <Text style={styles.title}>Welcome to Moneywise</Text>
            </View>
            <Text style={styles.intro}>{intro}</Text>

            <View style={styles.task}>
                <Circle size={20} color="#525252" strokeWidth={1.6} style={{ marginTop: 6 }} />
                <View style={styles.taskText}>
                    <Text style={styles.taskTitle} numberOfLines={2}>{next.title}</Text>
                    <Text style={styles.taskBlurb} numberOfLines={3}>{next.blurb}</Text>
                </View>
                <Pressable
                    style={({ pressed }) => [styles.startBtn, pressed && { opacity: 0.85 }]}
                    onPress={() => walkthroughUi.openStep(next.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Start: ${next.title}`}
                >
                    <Play size={12} color="#FFFFFF" fill="#FFFFFF" />
                    <Text style={styles.startText}>Start</Text>
                </Pressable>
            </View>

            <View style={styles.track}>
                <Animated.View style={[styles.fill, { width: pct.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
            </View>
            <View style={styles.footer}>
                <Text style={styles.footerText}>{completed} of {total} Steps Completed</Text>
                <Pressable style={styles.viewAll} onPress={walkthroughUi.openList} hitSlop={8} accessibilityRole="button">
                    <Text style={styles.viewAllText}>View all tasks</Text>
                    <ChevronRight size={16} color={colors.blue} />
                </Pressable>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    card: {
        backgroundColor: '#FFFFFF', borderRadius: 20, padding: 20, gap: 12,
        borderWidth: 1, borderColor: '#E5E7EB',
        shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 4, shadowOffset: { width: 0, height: 4 }, elevation: 3,
        marginBottom: 14,
    },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    titleIcon: { width: 24, alignItems: 'center' },
    title: { fontFamily: fonts.bodyBold, fontSize: 14, color: '#000000' },
    intro: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: '#525252', marginTop: -4 },
    task: {
        flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 16, borderWidth: 1, borderColor: '#F3F4F6',
        paddingLeft: 8, paddingRight: 12, paddingVertical: 8,
    },
    taskText: { flex: 1, gap: 2, paddingVertical: 4 },
    taskTitle: { fontFamily: fonts.bodyBold, fontSize: 12, color: '#000000' },
    taskBlurb: { fontFamily: fonts.body, fontSize: 10, lineHeight: 14, color: '#525252' },
    startBtn: {
        height: 32, paddingHorizontal: 12, borderRadius: 6, backgroundColor: colors.blue,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, alignSelf: 'center',
    },
    startText: { fontFamily: fonts.bodyBold, fontSize: 12, color: '#FFFFFF' },
    track: { height: 4, borderRadius: 12, backgroundColor: '#E5E5E5', overflow: 'hidden' },
    fill: { height: 4, borderRadius: 60, backgroundColor: '#60A5FA' },
    footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    footerText: { fontFamily: fonts.body, fontSize: 12, color: '#525252' },
    viewAll: { flexDirection: 'row', alignItems: 'center' },
    viewAllText: { fontFamily: fonts.body, fontSize: 12, color: colors.blue },
});

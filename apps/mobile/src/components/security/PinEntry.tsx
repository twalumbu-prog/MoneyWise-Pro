import { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Animated, Easing, Vibration } from 'react-native';
import { Delete } from 'lucide-react-native';
import { PIN_LENGTH } from '../../lib/appLock';
import { colors, fonts, radius } from '../../theme/tokens';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

/**
 * A PIN entry: a row of dots and a number pad. Calls onComplete once the last digit is typed. Pass a new `errorKey`
 * (any changing value) to shake the dots and clear them after a wrong PIN.
 */
export const PinEntry: React.FC<{
    title: string;
    subtitle?: string;
    error?: string | null;
    errorKey?: number;
    disabled?: boolean;
    onComplete: (pin: string) => void;
    /** An extra control in the bottom-left corner of the pad (e.g. the Face ID button). */
    leftSlot?: React.ReactNode;
}> = ({ title, subtitle, error, errorKey = 0, disabled, onComplete, leftSlot }) => {
    const [pin, setPin] = useState('');
    const shake = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (!errorKey) return;
        setPin('');
        Vibration.vibrate(60);
        Animated.sequence([6, -6, 4, -4, 0].map((v) => Animated.timing(shake, { toValue: v, duration: 60, easing: Easing.linear, useNativeDriver: true }))).start();
    }, [errorKey, shake]);

    const press = (d: string) => {
        if (disabled || pin.length >= PIN_LENGTH) return;
        const next = pin + d;
        setPin(next);
        if (next.length === PIN_LENGTH) {
            // Hand the PIN over, then empty the dots: the same pad is reused for the next step (e.g. "confirm your PIN"), so it
            // must be ready for fresh digits rather than stay full.
            setTimeout(() => { onComplete(next); setPin(''); }, 120);
        }
    };

    return (
        <View style={styles.root}>
            <Text style={styles.title}>{title}</Text>
            {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
            <Animated.View style={[styles.dots, { transform: [{ translateX: shake }] }]}>
                {Array.from({ length: PIN_LENGTH }).map((_, i) => <View key={i} style={[styles.dot, i < pin.length && styles.dotOn]} />)}
            </Animated.View>
            <Text style={styles.error} numberOfLines={2}>{error || ' '}</Text>

            <View style={styles.pad}>
                {KEYS.map((k) => (
                    <Pressable key={k} onPress={() => press(k)} style={({ pressed }) => [styles.key, pressed && styles.keyDown]} accessibilityLabel={k}><Text style={styles.keyText}>{k}</Text></Pressable>
                ))}
                <View style={styles.key}>{leftSlot}</View>
                <Pressable onPress={() => press('0')} style={({ pressed }) => [styles.key, pressed && styles.keyDown]} accessibilityLabel="0"><Text style={styles.keyText}>0</Text></Pressable>
                <Pressable onPress={() => setPin((p) => p.slice(0, -1))} style={styles.key} accessibilityLabel="Delete"><Delete size={24} color={colors.textMuted} /></Pressable>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    root: { alignItems: 'center', alignSelf: 'stretch' },
    title: { fontFamily: fonts.bodyBold, fontSize: 22, color: colors.navy, textAlign: 'center' },
    subtitle: { fontFamily: fonts.body, fontSize: 14, color: colors.textMuted, marginTop: 6, textAlign: 'center', paddingHorizontal: 24, lineHeight: 20 },
    dots: { flexDirection: 'row', gap: 18, marginTop: 28 },
    dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 1.5, borderColor: colors.borderStrong, backgroundColor: 'transparent' },
    dotOn: { backgroundColor: colors.blue, borderColor: colors.blue },
    error: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.danger, marginTop: 14, minHeight: 36, textAlign: 'center', paddingHorizontal: 24 },
    pad: { flexDirection: 'row', flexWrap: 'wrap', width: 288, marginTop: 8 },
    key: { width: 96, height: 76, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
    keyDown: { backgroundColor: colors.chipActiveBg },
    keyText: { fontFamily: fonts.bodyMedium, fontSize: 30, color: colors.text },
});

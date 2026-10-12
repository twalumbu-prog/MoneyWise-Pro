import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MoneywiseMark } from './icons/MoneywiseMark';
import { fonts } from '../theme/tokens';

/**
 * The app's loading screen: the black stroke logo on white, a quiet "A product by Blue Opus Software" at the
 * bottom. It sits in the same place as the native launch screen (same logo, same white), so the hand-off from
 * the native splash is seamless, then eases in softly instead of showing a spinner.
 */
export const BrandSplash: React.FC = () => {
    const insets = useSafeAreaInsets();
    const logo = useRef(new Animated.Value(0)).current;
    const credit = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.sequence([
            Animated.timing(logo, { toValue: 1, duration: 650, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
            Animated.timing(credit, { toValue: 1, duration: 600, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        ]).start();
    }, [logo, credit]);

    return (
        <View style={styles.root} accessibilityLabel="MoneyWise is loading">
            <Animated.View style={{ opacity: logo, transform: [{ scale: logo.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) }] }}>
                <MoneywiseMark height={56} color="#000000" />
            </Animated.View>
            <Animated.Text style={[styles.credit, { bottom: insets.bottom + 28, opacity: credit }]}>
                A product by Blue Opus Software
            </Animated.Text>
        </View>
    );
};

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
    credit: {
        position: 'absolute', alignSelf: 'center', fontFamily: fonts.body, fontSize: 11.5,
        letterSpacing: 0.3, color: '#9CA3AF',
    },
});

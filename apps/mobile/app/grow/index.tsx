import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { fonts } from '../../src/theme/tokens';
import { useGoBack } from '../../src/hooks/useGoBack';
import { GrowPanel } from '../../src/components/grow/GrowPanel';

/** Deep-link / standalone route. In the app, Grow lives behind the Home | Grow toggle on the Home tab. */
export default function GrowScreen() {
    const insets = useSafeAreaInsets();
    const safeBack = useGoBack('/(tabs)');
    return (
        <View style={[styles.root, { paddingTop: insets.top }]}>
            <Stack.Screen options={{ headerShown: false }} />
            <View style={styles.header}>
                <Pressable onPress={() => safeBack()} hitSlop={12} accessibilityLabel="Go back" style={styles.side}>
                    <ChevronLeft size={26} color="#000" />
                </Pressable>
                <Text style={styles.title}>Grow</Text>
                <View style={styles.side} />
            </View>
            <GrowPanel />
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#FFFFFF' },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
    side: { width: 44 },
    title: { flex: 1, textAlign: 'center', fontFamily: fonts.advercaseRegular, fontSize: 26, color: '#000' },
});

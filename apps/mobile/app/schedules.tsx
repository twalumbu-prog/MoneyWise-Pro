import { View, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, Stack } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { PhasePlaceholder } from '../src/components/PhasePlaceholder';
import { colors } from '../src/theme/tokens';

export default function SchedulesScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    return (
        <View style={styles.root}>
            <Stack.Screen options={{ headerShown: false }} />
            <Pressable
                onPress={() => router.back()}
                hitSlop={12}
                style={[styles.back, { top: insets.top + 14 }]}
                accessibilityLabel="Go back"
            >
                <ChevronLeft size={24} color={colors.textMuted} />
            </Pressable>
            <PhasePlaceholder
                title="Schedules"
                phase="P5"
                scope="Recurring bills, subscriptions, loan repayments and investments — with the run-now action and proof-of-payment settings."
            />
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.canvas },
    back: { position: 'absolute', left: 20, zIndex: 10 },
});

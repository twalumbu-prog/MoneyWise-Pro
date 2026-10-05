import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { colors, fonts } from '../theme/tokens';
import { useGoBack } from '../hooks/useGoBack';

/** Back-button header, mirroring the web mobile header on back-button routes. */
export const ScreenHeader: React.FC<{ title: string; right?: React.ReactNode }> = ({ title, right }) => {
    const safeBack = useGoBack();
    const insets = useSafeAreaInsets();
    return (
        <View style={[styles.root, { paddingTop: insets.top + 12 }]}>
            <Pressable onPress={() => safeBack()} hitSlop={12} accessibilityLabel="Go back">
                <ChevronLeft size={24} color={colors.textMuted} />
            </Pressable>
            <Text style={styles.title} numberOfLines={1}>{title}</Text>
            <View style={styles.right}>{right}</View>
        </View>
    );
};

const styles = StyleSheet.create({
    root: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 20, paddingBottom: 12, gap: 12,
    },
    title: { flex: 1, fontFamily: fonts.bodyBold, fontSize: 17, color: colors.text, textAlign: 'center' },
    right: { minWidth: 24, alignItems: 'flex-end' },
});

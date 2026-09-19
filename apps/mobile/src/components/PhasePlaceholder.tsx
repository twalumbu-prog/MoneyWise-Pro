import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, radius } from '../theme/tokens';

/**
 * An honest stub. Every screen not yet ported names the phase that will port it,
 * so a build handed to a tester never looks broken or finished when it is
 * neither. Removed as each phase lands.
 *
 * `compact` drops the safe-area padding and the heading for screens that already
 * sit under a ScreenHeader, which would otherwise render the title twice.
 */
export const PhasePlaceholder: React.FC<{
    title: string;
    phase: string;
    scope: string;
    compact?: boolean;
}> = ({ title, phase, scope, compact = false }) => {
    const insets = useSafeAreaInsets();
    return (
        <View style={[styles.root, !compact && { paddingTop: insets.top + 24 }]}>
            {!compact && <Text style={styles.title}>{title}</Text>}
            <View style={styles.card}>
                <Text style={styles.phase}>{phase}</Text>
                <Text style={styles.scope}>{scope}</Text>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    root: { flex: 1, paddingHorizontal: 24 },
    title: { fontFamily: fonts.display, fontSize: 28, color: colors.navy, marginBottom: 20 },
    card: {
        backgroundColor: colors.surface, borderRadius: radius.lg, padding: 20,
        borderWidth: 1, borderColor: colors.border,
    },
    phase: {
        fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 1.2,
        color: colors.blue, marginBottom: 8,
    },
    scope: { fontFamily: fonts.body, fontSize: 14, color: colors.textMuted, lineHeight: 21 },
});

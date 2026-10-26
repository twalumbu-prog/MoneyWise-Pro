import { View, Text, Pressable, StyleSheet } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { fonts } from '../../theme/tokens';

/** The white rounded card every Home section sits in (title row with an optional "See all ›" link, then content). */
export const HomeCard: React.FC<{ title: string; actionLabel?: string; onAction?: () => void; children: React.ReactNode }> = ({ title, actionLabel, onAction, children }) => (
    <View style={styles.card}>
        <View style={styles.head}>
            <Text style={styles.title}>{title}</Text>
            {!!actionLabel && (
                <Pressable onPress={onAction} hitSlop={10} style={styles.action} accessibilityRole="button" accessibilityLabel={actionLabel}>
                    <Text style={styles.actionText}>{actionLabel}</Text>
                    <ChevronRight size={14} color="#111827" />
                </Pressable>
            )}
        </View>
        {children}
    </View>
);

export const cardShadow = {
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 3,
} as const;

const styles = StyleSheet.create({
    card: {
        backgroundColor: '#FFFFFF', borderRadius: 24, borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20,
        ...cardShadow,
    },
    head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 20, marginBottom: 16 },
    title: { fontFamily: fonts.bodyBold, fontSize: 14, color: '#000000' },
    action: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    actionText: { fontFamily: fonts.body, fontSize: 14, color: '#111827' },
});

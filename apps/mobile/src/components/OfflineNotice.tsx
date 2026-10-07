import { View, Text, StyleSheet } from 'react-native';
import { WifiOff } from 'lucide-react-native';
import { fonts, radius } from '../theme/tokens';

/** Shown instead of an error when a refresh fails but the device still has saved data to show. */
export const OfflineNotice: React.FC<{ style?: object }> = ({ style }) => (
    <View style={[styles.box, style]} accessibilityRole="alert">
        <WifiOff size={14} color="#9A5B00" />
        <Text style={styles.text}>Can’t reach MoneyWise right now — showing your last saved data. Pull down to try again.</Text>
    </View>
);

const styles = StyleSheet.create({
    box: {
        flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 20, marginBottom: 12,
        paddingVertical: 10, paddingHorizontal: 12, borderRadius: radius.md, backgroundColor: '#FFF7E6',
    },
    text: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 12, color: '#9A5B00', lineHeight: 17 },
});

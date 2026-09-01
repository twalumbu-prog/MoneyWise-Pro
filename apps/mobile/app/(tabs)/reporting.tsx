import { View, StyleSheet } from 'react-native';
import { PhasePlaceholder } from '../../src/components/PhasePlaceholder';
import { colors } from '../../src/theme/tokens';

export default function ReportingScreen() {
    return (
        <View style={styles.root}>
        <PhasePlaceholder
            title="Reporting"
            phase="P4"
            scope="Financial reports with native charts, plus PDF and Excel exports rendered server-side and shared through the OS share sheet."
        />
        </View>
    );
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: colors.canvas } });

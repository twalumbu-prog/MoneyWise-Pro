import { View, StyleSheet } from 'react-native';
import { PhasePlaceholder } from '../../src/components/PhasePlaceholder';
import { colors } from '../../src/theme/tokens';

export default function BusinessIntelligenceScreen() {
    return (
        <View style={styles.root}>
        <PhasePlaceholder
            title="Business Intelligence"
            phase="P4"
            scope="The streaming assistant — chat, tool timeline, approval cards and generated chart, table and KPI widgets."
        />
        </View>
    );
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: colors.canvas } });

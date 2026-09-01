import { View, StyleSheet } from 'react-native';
import { PhasePlaceholder } from '../../src/components/PhasePlaceholder';
import { colors } from '../../src/theme/tokens';

export default function MenuScreen() {
    return (
        <View style={styles.root}>
        <PhasePlaceholder
            title="Menu"
            phase="P5"
            scope="Profile, organisation settings, team members, integrations and billing — plus the Other Services grid: Audit, Products, Apps, Invest."
        />
        </View>
    );
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: colors.canvas } });

import { View, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { PhasePlaceholder } from '../../src/components/PhasePlaceholder';
import { colors } from '../../src/theme/tokens';

export default function Screen() {
    return (
        <View style={styles.root}>
            <Stack.Screen options={{ headerShown: false }} />
            <ScreenHeader title="Transfer" />
            <PhasePlaceholder title="Transfer" phase="P2" compact scope="Move funds between sub-wallets, and from cash to a MoneyWise wallet." />
        </View>
    );
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: colors.canvasAlt } });

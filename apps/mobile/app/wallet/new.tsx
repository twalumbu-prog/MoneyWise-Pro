import { View, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { PhasePlaceholder } from '../../src/components/PhasePlaceholder';
import { colors } from '../../src/theme/tokens';

export default function Screen() {
    return (
        <View style={styles.root}>
            <Stack.Screen options={{ headerShown: false }} />
            <ScreenHeader title="Add Wallet" />
            <PhasePlaceholder title="Add Wallet" phase="P2" compact scope="Create a MoneyWise sub-wallet or link an external bank account for statement reconciliation." />
        </View>
    );
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: colors.canvasAlt } });

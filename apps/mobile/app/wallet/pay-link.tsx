import { View, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { PhasePlaceholder } from '../../src/components/PhasePlaceholder';
import { colors } from '../../src/theme/tokens';

export default function Screen() {
    return (
        <View style={styles.root}>
            <Stack.Screen options={{ headerShown: false }} />
            <ScreenHeader title="Pay Link" />
            <PhasePlaceholder title="Pay Link" phase="P5" compact scope="Generate and share a customer payment link for this wallet." />
        </View>
    );
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: colors.canvasAlt } });

import { View, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { RequisitionQueue, AWAITING_APPROVAL } from '../src/components/RequisitionQueue';
import { colors } from '../src/theme/tokens';

export default function ApprovalsScreen() {
    return (
        <View style={styles.root}>
            <Stack.Screen options={{ headerShown: false }} />
            <ScreenHeader title="Approvals" />
            <RequisitionQueue
                statuses={AWAITING_APPROVAL}
                emptyText="Nothing is waiting for approval."
            />
        </View>
    );
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: colors.canvas } });

import { View, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { RequisitionQueue, AWAITING_DISBURSEMENT } from '../src/components/RequisitionQueue';
import { colors } from '../src/theme/tokens';

export default function DisbursementsScreen() {
    return (
        <View style={styles.root}>
            <Stack.Screen options={{ headerShown: false }} />
            <ScreenHeader title="Disbursements" />
            <RequisitionQueue
                statuses={AWAITING_DISBURSEMENT}
                emptyText="No approved requests are waiting to be paid out."
            />
        </View>
    );
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: colors.canvas } });

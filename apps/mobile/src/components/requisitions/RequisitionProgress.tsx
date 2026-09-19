import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { getStatusConfig } from 'core';
import { colors, fonts, radius } from '../../theme/tokens';

const ALL_COMPLETED_STATUSES = ['CATEGORIZED', 'COMPLETED', 'ACCOUNTED'];

const UI_STEPS = [
    { label: 'Draft', statuses: ['DRAFT'] },
    { label: 'Approved', statuses: ['PENDING_APPROVAL', 'AUTHORISED'] },
    { label: 'Disbursed', statuses: ['DISBURSED', 'PROCESSING'] },
    { label: 'Expensed', statuses: ['EXPENSED'] },
    { label: 'Returns', statuses: ['RECEIVED', 'CHANGE_SUBMITTED'] },
];

/** Native port of apps/web/src/components/requisitions/RequisitionProgress.tsx's mobile capsule variant. */
export const RequisitionProgress: React.FC<{ currentStatus: string; isPrivileged: boolean }> = ({ currentStatus, isPrivileged }) => {
    const steps = isPrivileged ? [...UI_STEPS, { label: 'Complete', statuses: ALL_COMPLETED_STATUSES }] : UI_STEPS;
    const currentIndex = steps.findIndex((s) => s.statuses.includes(currentStatus));
    const isTerminal = getStatusConfig(currentStatus).isCompleted
        || (!isPrivileged && (currentStatus === 'CHANGE_SUBMITTED' || currentStatus === 'RECEIVED'));

    return (
        <View style={styles.root}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
                {steps.map((step, index) => {
                    const isCompleted = index < currentIndex || (index === currentIndex && isTerminal);
                    const isCurrent = index === currentIndex && !isTerminal;
                    return (
                        <View
                            key={step.label}
                            style={[styles.pill, isCurrent && styles.pillCurrent]}
                        >
                            <Text style={[styles.pillText, isCompleted && styles.pillTextCompleted, isCurrent && styles.pillTextCurrent]}>
                                {step.label}
                            </Text>
                        </View>
                    );
                })}
            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    root: { backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
    row: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingVertical: 12 },
    pill: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: radius.pill },
    pillCurrent: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.blue },
    pillText: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint },
    pillTextCompleted: { fontFamily: fonts.bodyMedium, color: colors.text },
    pillTextCurrent: { fontFamily: fonts.bodyBold, color: colors.blue },
});

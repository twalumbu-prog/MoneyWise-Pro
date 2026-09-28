import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, ScrollView } from 'react-native';
import { Trophy, CheckCircle2, Play, X, Zap } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import {
    loadAchievementsState,
    saveAchievementsState,
    OnboardingAchievement,
} from 'core';
import { colors, fonts, radius } from '../../theme/tokens';

interface Props {
    visible: boolean;
    onClose: () => void;
}

export const GuidedMissionsModal: React.FC<Props> = ({ visible, onClose }) => {
    const router = useRouter();
    const [achievements, setAchievements] = useState<OnboardingAchievement[]>(() => loadAchievementsState());

    const completedCount = achievements.filter((a) => a.completed).length;
    const totalCount = achievements.length;
    const totalXp = achievements.reduce((acc, curr) => acc + curr.xp, 0);
    const earnedXp = achievements.filter((a) => a.completed).reduce((acc, curr) => acc + curr.xp, 0);
    const percentage = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

    const handleStartMission = (mission: OnboardingAchievement) => {
        // Mark mission as completed
        const updated = achievements.map((a) =>
            a.id === mission.id ? { ...a, completed: true, completedAt: new Date().toISOString() } : a,
        );
        setAchievements(updated);
        saveAchievementsState(updated);
        onClose();

        // Navigate to target route if available
        const firstStep = mission.steps[0];
        if (firstStep?.targetPath) {
            const target = firstStep.targetPath;
            if (target === '/cashbook' || target === '/wallets') {
                router.push('/wallet');
            } else if (target === '/reporting') {
                router.push('/reporting');
            } else if (target === '/requisitions/new') {
                router.push('/requisition/new');
            } else if (target === '/schedules') {
                router.push('/schedules');
            } else {
                router.push('/(tabs)');
            }
        }
    };

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <View style={styles.overlay}>
                <View style={styles.card}>
                    {/* Header */}
                    <View style={styles.header}>
                        <View style={styles.headerTitleRow}>
                            <View style={styles.iconBox}>
                                <Trophy size={20} color={colors.blue} />
                            </View>
                            <View>
                                <Text style={styles.title}>Guided Missions</Text>
                                <Text style={styles.subtitle}>Learn MoneyWise Pro, step by step</Text>
                            </View>
                        </View>
                        <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={10}>
                            <X size={20} color={colors.textMuted} />
                        </Pressable>
                    </View>

                    {/* Progress Bar */}
                    <View style={styles.progressSection}>
                        <View style={styles.progressRow}>
                            <Text style={styles.progressText}>
                                {completedCount} of {totalCount} missions completed
                            </Text>
                            <Text style={styles.xpText}>{earnedXp} / {totalXp} XP</Text>
                        </View>
                        <View style={styles.track}>
                            <View style={[styles.fill, { width: `${percentage}%` }]} />
                        </View>
                    </View>

                    {/* Missions List */}
                    <ScrollView style={styles.list} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
                        {achievements.map((item) => (
                            <View key={item.id} style={[styles.missionCard, item.completed && styles.missionCardDone]}>
                                <View style={styles.missionMetaRow}>
                                    <Text style={styles.categoryText}>{item.category.replace('_', ' ')}</Text>
                                    <View style={styles.xpBadge}>
                                        <Zap size={11} color="#059669" />
                                        <Text style={styles.xpBadgeText}>+{item.xp} XP</Text>
                                    </View>
                                </View>

                                <Text style={styles.missionTitle}>{item.title}</Text>
                                <Text style={styles.missionDesc}>{item.description}</Text>

                                <View style={styles.actionRow}>
                                    {item.completed ? (
                                        <View style={styles.completedBadge}>
                                            <CheckCircle2 size={14} color="#059669" />
                                            <Text style={styles.completedBadgeText}>Completed</Text>
                                        </View>
                                    ) : (
                                        <Pressable
                                            onPress={() => handleStartMission(item)}
                                            style={({ pressed }) => [styles.startBtn, { opacity: pressed ? 0.85 : 1 }]}
                                        >
                                            <Play size={12} color="#FFFFFF" />
                                            <Text style={styles.startBtnText}>Start Now</Text>
                                        </Pressable>
                                    )}
                                </View>
                            </View>
                        ))}
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    card: {
        backgroundColor: colors.surface,
        borderTopLeftRadius: radius.xl,
        borderTopRightRadius: radius.xl,
        maxHeight: '82%',
        paddingBottom: 24,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: 20,
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    headerTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    iconBox: {
        width: 40,
        height: 40,
        borderRadius: radius.md,
        backgroundColor: '#EFF6FF',
        alignItems: 'center',
        justifyContent: 'center',
    },
    title: {
        fontFamily: fonts.bodyBold,
        fontSize: 16,
        color: colors.navy,
    },
    subtitle: {
        fontFamily: fonts.body,
        fontSize: 12,
        color: colors.textMuted,
        marginTop: 2,
    },
    closeBtn: {
        padding: 4,
    },
    progressSection: {
        paddingHorizontal: 20,
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        backgroundColor: colors.canvas,
    },
    progressRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    progressText: {
        fontFamily: fonts.bodyBold,
        fontSize: 12,
        color: colors.navy,
    },
    xpText: {
        fontFamily: fonts.bodyMedium,
        fontSize: 12,
        color: colors.textMuted,
    },
    track: {
        height: 8,
        backgroundColor: colors.border,
        borderRadius: 4,
        overflow: 'hidden',
    },
    fill: {
        height: '100%',
        backgroundColor: colors.blue,
        borderRadius: 4,
    },
    list: {
        maxHeight: 400,
    },
    listContent: {
        padding: 20,
        gap: 12,
    },
    missionCard: {
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.borderStrong,
        padding: 14,
    },
    missionCardDone: {
        backgroundColor: colors.canvas,
        opacity: 0.8,
    },
    missionMetaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 6,
    },
    categoryText: {
        fontFamily: fonts.bodyBold,
        fontSize: 10,
        color: colors.textFaint,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    xpBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    xpBadgeText: {
        fontFamily: fonts.bodyBold,
        fontSize: 11,
        color: '#059669',
    },
    missionTitle: {
        fontFamily: fonts.bodyBold,
        fontSize: 14,
        color: colors.navy,
        marginBottom: 4,
    },
    missionDesc: {
        fontFamily: fonts.body,
        fontSize: 12,
        color: colors.textMuted,
        lineHeight: 18,
        marginBottom: 12,
    },
    actionRow: {
        alignItems: 'flex-start',
    },
    completedBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: '#ECFDF5',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: '#A7F3D0',
    },
    completedBadgeText: {
        fontFamily: fonts.bodyBold,
        fontSize: 12,
        color: '#059669',
    },
    startBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: colors.blue,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: radius.pill,
    },
    startBtnText: {
        fontFamily: fonts.bodyBold,
        fontSize: 12,
        color: '#FFFFFF',
    },
});

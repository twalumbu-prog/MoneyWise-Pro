import { View, Text, Pressable, StyleSheet, Image } from 'react-native';
import { ChevronRight, Download, Link2, Building2 } from 'lucide-react-native';
import type { RewardCard } from 'core';
import { AnimatedSegmented } from '../AnimatedTabs';
import { colors, fonts } from '../../theme/tokens';

export const fmtPoints = (n: number) => Math.round(n).toLocaleString('en-US');

/**
 * The General | Rewards (or Points | Achievements) pill toggle. Same motion as the wallet's Main Wallets | External Accounts
 * switch: the white pill springs from one side to the other (AnimatedSegmented).
 */
export function SegmentedToggle<T extends string>({ options, value, onChange }: {
    options: { value: T; label: string; icon: React.ComponentType<{ size?: number; color?: string }>; dot?: boolean }[];
    value: T;
    onChange: (v: T) => void;
}) {
    return (
        <AnimatedSegmented
            value={value}
            onChange={(v) => onChange(v as T)}
            trackStyle={styles.toggle}
            indicatorStyle={styles.toggleIndicator}
            itemStyle={styles.toggleItem}
            items={options.map((o) => {
                const on = o.value === value;
                const Icon = o.icon;
                return {
                    value: o.value,
                    content: (
                        <View style={styles.toggleInner}>
                            <Icon size={13} color={on ? colors.blue : colors.textMuted} />
                            <Text style={[styles.toggleText, on && { color: colors.blue }]}>{o.label}</Text>
                            {o.dot && <View style={styles.dot} />}
                        </View>
                    ),
                };
            })}
        />
    );
}

/** Redeem Rewards | Invite Friends. */
export const RewardsActionBar: React.FC<{ onRedeem: () => void; onInvite: () => void }> = ({ onRedeem, onInvite }) => (
    <View style={styles.actionBar}>
        <Pressable onPress={onRedeem} style={({ pressed }) => [styles.action, pressed && { opacity: 0.6 }]}>
            <Download size={16} color="#000000" />
            <Text style={styles.actionText}>Redeem Rewards</Text>
        </Pressable>
        <View style={styles.actionDivider} />
        <Pressable onPress={onInvite} style={({ pressed }) => [styles.action, pressed && { opacity: 0.6 }]}>
            <Link2 size={16} color="#000000" />
            <Text style={styles.actionText}>Invite Friends</Text>
        </Pressable>
    </View>
);

/** A business's logo, or MoneyWise's own mark, or a neutral building when it hasn't uploaded one. */
export const ProgrammeLogo: React.FC<{ card: Pick<RewardCard, 'logoUrl' | 'isPlatform'>; size: number }> = ({ card, size }) => {
    if (card.isPlatform) return <Image source={require('../../../assets/icon.png')} style={{ width: size, height: size, borderRadius: size / 2 }} />;
    if (card.logoUrl) return <Image source={{ uri: card.logoUrl }} style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 1, borderColor: colors.border, backgroundColor: '#FFFFFF' }} resizeMode="cover" />;
    return (
        <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#F3D2D4', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#000000' }}>
            <Building2 size={size * 0.5} color="#000000" />
        </View>
    );
};

export const ProgressBar: React.FC<{ progress: number }> = ({ progress }) => (
    <View style={styles.track}><View style={[styles.fill, { width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%` }]} /></View>
);

/** One programme in the list: logo, name, member status, and progress to the next reward. */
export const RewardCardRow: React.FC<{ card: RewardCard; onPress: () => void }> = ({ card, onPress }) => (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.rowWrap, pressed && { opacity: 0.7 }]} accessibilityRole="button" accessibilityLabel={card.name}>
        <View style={styles.rowTop}>
            <ProgrammeLogo card={card} size={36} />
            <View style={{ flex: 1 }}>
                <Text style={styles.rowName} numberOfLines={1}>{card.name}</Text>
                <Text style={styles.rowStatus} numberOfLines={1}>{card.status}</Text>
            </View>
            <ChevronRight size={18} color="#000000" />
        </View>
        {card.threshold ? (
            <>
                <ProgressBar progress={card.progress} />
                <View style={styles.rowFoot}>
                    <Text style={styles.footText}>{card.rewardReady ? 'Reward ready to redeem' : 'Points to next reward'}</Text>
                    <Text style={styles.footText}>{Math.round(card.progress * 100)}%</Text>
                </View>
            </>
        ) : (
            <View style={styles.rowFoot}>
                <Text style={styles.footText}>Earned by inviting friends</Text>
                <Text style={styles.footText}>{fmtPoints(card.balance)} pts</Text>
            </View>
        )}
    </Pressable>
);

const styles = StyleSheet.create({
    toggle: { flexDirection: 'row', padding: 2, backgroundColor: '#E5E7EB', borderRadius: 80 },
    toggleItem: { flex: 1, paddingVertical: 9, borderRadius: 80, alignItems: 'center', justifyContent: 'center' },
    toggleInner: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    toggleIndicator: { borderRadius: 80, backgroundColor: '#FFFFFF', shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 2, borderWidth: 0.5, borderColor: 'rgba(0,0,0,0.05)' },
    toggleText: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted },
    dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.blue },

    actionBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingVertical: 4 },
    action: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16 },
    actionText: { fontFamily: fonts.bodyMedium, fontSize: 14, color: '#000000' },
    actionDivider: { width: 1, height: 20, backgroundColor: '#D4D4D4' },

    track: { height: 6, backgroundColor: '#E5E5E5', borderRadius: 12, overflow: 'hidden' },
    fill: { height: 6, backgroundColor: '#3B82F6', borderRadius: 60 },
    rowWrap: { gap: 8, paddingVertical: 6 },
    rowTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    rowName: { fontFamily: fonts.bodyBold, fontSize: 16, color: '#000000' },
    rowStatus: { fontFamily: fonts.body, fontSize: 12, color: '#71717A' },
    rowFoot: { flexDirection: 'row', justifyContent: 'space-between' },
    footText: { fontFamily: fonts.bodyBold, fontSize: 12, color: '#737373' },
});

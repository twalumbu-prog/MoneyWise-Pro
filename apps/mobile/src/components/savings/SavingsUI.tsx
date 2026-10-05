import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Path } from 'react-native-svg';
import { formatKwacha } from 'core';
import { MoneywiseMark } from '../icons/MoneywiseMark';
import { SpringProgress } from '../invest/application/SpringProgress';
import { colors, fonts, radius } from '../../theme/tokens';

/** The navy balance card at the top of each Savings tab (same treatment as the Wallet card). */
export const SavingsBalanceCard: React.FC<{ label: string; amount: number }> = ({ label, amount }) => (
    <LinearGradient colors={['#0F172A', '#172554']} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={styles.card}>
        <View style={styles.cardTop}>
            <Text style={styles.cardLabel} numberOfLines={1}>{label.toUpperCase()}</Text>
            <MoneywiseMark color="#FFFFFF" height={20} />
        </View>
        <Text style={styles.cardAmount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{formatKwacha(amount)}</Text>
    </LinearGradient>
);

const money = (n: number) => `K${n.toLocaleString('en-ZM', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

/** Progress bar + "K190 / K249.99 · 76%" line used by every savings row. */
export const SavingsProgress: React.FC<{ balance: number; target: number | null }> = ({ balance, target }) => {
    const pct = target ? Math.min(100, Math.round((balance / target) * 100)) : 0;
    return (
        <View style={{ gap: 5, alignSelf: 'stretch' }}>
            {target ? <SpringProgress value={pct} height={6} trackColor="#E5E5E5" fillColor="#60A5FA" /> : null}
            <View style={styles.progressRow}>
                <Text style={styles.progressText}>{target ? `${money(balance)} / ${money(target)}` : `${money(balance)} saved`}</Text>
                {target ? <Text style={styles.progressText}>{pct}%</Text> : null}
            </View>
        </View>
    );
};

const AVATAR_TINTS = ['#A5B4FC', '#FFFFFF', '#FDA4AF', '#86EFAC', '#FCD34D'];

/** Overlapping member avatars (person glyphs on soft tints), as in the Group Savings design. */
export const MemberAvatars: React.FC<{ count: number; size?: number }> = ({ count, size = 22 }) => {
    const shown = Math.min(count, 3);
    return (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {Array.from({ length: shown }).map((_, i) => (
                <View key={i} style={{ marginLeft: i === 0 ? 0 : -7 }}>
                    <Svg width={size} height={size} viewBox="0 0 24 24">
                        <Circle cx={12} cy={12} r={11} fill={AVATAR_TINTS[i % AVATAR_TINTS.length]} stroke="#111827" strokeWidth={1} />
                        <Circle cx={12} cy={9.5} r={3.4} fill="none" stroke="#111827" strokeWidth={1.2} />
                        <Path d="M6.5 18.5c.9-2.7 3-4 5.5-4s4.6 1.3 5.5 4" fill="none" stroke="#111827" strokeWidth={1.2} strokeLinecap="round" />
                    </Svg>
                </View>
            ))}
            {count > 3 && <Text style={styles.moreMembers}>+{count - 3}</Text>}
        </View>
    );
};

export const SectionTitle: React.FC<{ title: string }> = ({ title }) => <Text style={styles.sectionTitle}>{title}</Text>;

const styles = StyleSheet.create({
    card: {
        borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 20, gap: 16, overflow: 'hidden',
        shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 4,
    },
    cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    cardLabel: { flex: 1, fontFamily: fonts.body, fontSize: 12, letterSpacing: 0.6, color: '#FFFFFF' },
    cardAmount: { fontFamily: fonts.bodyBold, fontSize: 34, lineHeight: 38, color: '#FFFFFF' },
    progressRow: { flexDirection: 'row', justifyContent: 'space-between' },
    progressText: { fontFamily: fonts.bodyBold, fontSize: 12, color: '#737373' },
    moreMembers: { fontFamily: fonts.bodyBold, fontSize: 11, color: colors.textMuted, marginLeft: 4 },
    sectionTitle: { fontFamily: fonts.bodyBold, fontSize: 16, color: '#000000', paddingHorizontal: 20, marginTop: 22, marginBottom: 8 },
});

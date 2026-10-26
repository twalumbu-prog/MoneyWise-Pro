import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { cashbookService, formatKwacha } from 'core';
import { useAuth } from '../../context/AuthContext';
import { MoneywiseMark } from '../icons/MoneywiseMark';
import { HomeCard } from './HomeCard';
import { colors, fonts } from '../../theme/tokens';

const MAX_ROWS = 3;

/** The MoneyWise wallet's own mark on a soft tile — these are all MoneyWise wallets, so they all carry the MoneyWise logo. */
const WalletLogo: React.FC = () => (
    <View style={styles.logo}><MoneywiseMark color={colors.navy} height={13} /></View>
);

/** Accounts: the person's MoneyWise wallets (main first) with their balances; "See all" opens the Wallet tab. */
export const AccountsCard: React.FC = () => {
    const router = useRouter();
    const { organizationId } = useAuth();
    const { data, isLoading } = useQuery({
        queryKey: ['cashbook-entries', 'overview', organizationId],
        queryFn: () => cashbookService.getOverview(),
        enabled: !!organizationId,
    });

    const wallets = ((data?.wallets ?? []) as any[])
        .map((w) => ({ id: String(w.id), name: String(w.name ?? 'Wallet'), balance: Number(w.balance ?? 0), isMain: !!w.is_main }))
        .sort((a, b) => Number(b.isMain) - Number(a.isMain));
    const rows = wallets.slice(0, MAX_ROWS);
    const goWallets = () => router.navigate('/wallet');

    return (
        <HomeCard title="Accounts" actionLabel="See All" onAction={goWallets}>
            {isLoading ? (
                <ActivityIndicator color={colors.blue} style={{ paddingVertical: 12 }} />
            ) : rows.length === 0 ? (
                <Text style={styles.empty}>No wallets yet.</Text>
            ) : (
                <View style={{ gap: 18 }}>
                    {rows.map((w) => (
                        <Pressable key={w.id} onPress={goWallets} style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]} accessibilityRole="button" accessibilityLabel={`${w.name}, ${formatKwacha(w.balance)}`}>
                            <WalletLogo />
                            <Text style={styles.name} numberOfLines={1}>{w.name}</Text>
                            <Text style={styles.amount}>{formatKwacha(w.balance)}</Text>
                            <ChevronRight size={16} color="#000000" />
                        </Pressable>
                    ))}
                </View>
            )}
        </HomeCard>
    );
};

const styles = StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    logo: { width: 32, height: 32, borderRadius: 10, backgroundColor: colors.tabActiveBg, alignItems: 'center', justifyContent: 'center' },
    name: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 16, color: '#000000' },
    amount: { fontFamily: fonts.bodyMedium, fontSize: 16, color: '#000000' },
    empty: { fontFamily: fonts.body, fontSize: 13, color: colors.textFaint },
});

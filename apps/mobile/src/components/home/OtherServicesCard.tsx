import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { TrendingUp, Landmark, Store } from 'lucide-react-native';
import { OtherServiceIcon } from '../icons/OtherServiceIcon';
import { HomeCard } from './HomeCard';
import { fonts } from '../../theme/tokens';

/** Invest / Loans / Marketplace — the same tiles as the Menu's "Other Services". */
export const OtherServicesCard: React.FC = () => {
    const router = useRouter();
    const soon = (name: string) => Alert.alert(name, 'This lands in a later phase of the app rollout. It’s available on the web app now.');
    const items = [
        { icon: TrendingUp, label: 'Invest', go: () => router.push('/apps/invest') },
        { icon: Landmark, label: 'Loans', go: () => soon('Loans') },
        { icon: Store, label: 'Marketplace', go: () => soon('Marketplace') },
    ];
    return (
        <HomeCard title="Services">
            <View style={styles.row}>
                {items.map(({ icon: Icon, label, go }) => (
                    <Pressable key={label} onPress={go} style={({ pressed }) => [styles.item, pressed && { opacity: 0.6 }]} accessibilityRole="button" accessibilityLabel={label}>
                        <OtherServiceIcon><Icon size={22} color="#FFFFFF" strokeWidth={2} /></OtherServiceIcon>
                        <Text style={styles.label}>{label}</Text>
                    </Pressable>
                ))}
            </View>
        </HomeCard>
    );
};

const styles = StyleSheet.create({
    row: { flexDirection: 'row', gap: 12 },
    item: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 24, borderWidth: 1, borderColor: '#E4E4E7', gap: 4 },
    label: { fontFamily: fonts.bodyMedium, fontSize: 12, color: '#000000' },
});

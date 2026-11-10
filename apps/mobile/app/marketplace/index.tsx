import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Scale, ClipboardList, Globe, PackageCheck, ChevronRight } from 'lucide-react-native';
import { Screen, Card } from '../../src/components/marketplace/ui';
import { colors, fonts } from '../../src/theme/tokens';

const ENTRIES = [
    { icon: Scale, label: 'Compare prices', hint: 'Find the cheapest place to buy', to: '/marketplace/compare' },
    { icon: ClipboardList, label: 'Requests for quote', hint: 'Ask suppliers for a price, or quote a request', to: '/marketplace/requests' },
    { icon: Globe, label: 'Imported products', hint: 'Ordered for you from overseas', to: '/marketplace/imported' },
    { icon: PackageCheck, label: 'Import orders', hint: 'Follow what you ordered from overseas', to: '/marketplace/imported/orders' },
] as const;

export default function MarketplaceHome() {
    const router = useRouter();
    return (
        <Screen title="Marketplace">
            <Text style={styles.lead}>Find the best price in Zambia, ask suppliers to quote you, or have things brought in from overseas.</Text>
            {ENTRIES.map((e) => (
                <Card key={e.to} onPress={() => router.push(e.to as any)}>
                    <View style={styles.row}>
                        <View style={styles.icon}><e.icon size={20} color={colors.blue} /></View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.title}>{e.label}</Text>
                            <Text style={styles.hint}>{e.hint}</Text>
                        </View>
                        <ChevronRight size={18} color={colors.textFaint} />
                    </View>
                </Card>
            ))}
            <Text style={styles.foot}>Stores, services, food, Pay in 4 and the team desks are on the web app.</Text>
        </Screen>
    );
}

const styles = StyleSheet.create({
    lead: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, lineHeight: 19 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    icon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#EAF1FF', alignItems: 'center', justifyContent: 'center' },
    title: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
    hint: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, marginTop: 2 },
    foot: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint, textAlign: 'center', marginTop: 8 },
});

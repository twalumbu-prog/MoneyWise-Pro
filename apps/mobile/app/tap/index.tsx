import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { ArrowDownToLine, ScanLine, Nfc, ChevronRight } from 'lucide-react-native';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { colors, fonts, radius } from '../../src/theme/tokens';

/** Tap to pay between MoneyWise users: ask for money, pay someone, and choose who can pay you. */
export default function TapHome() {
    const router = useRouter();
    const items = [
        { icon: ArrowDownToLine, title: 'Receive money', text: 'Show a code or share a link for someone to pay you.', to: '/tap/receive' },
        { icon: ScanLine, title: 'Pay someone', text: 'Scan their code, or paste their link.', to: '/tap/pay' },
        { icon: Nfc, title: 'Tap to receive', text: 'Choose who can pay you: no one, your contacts or everyone.', to: '/settings/tap-to-receive' },
    ];
    return (
        <View style={s.root}>
            <Stack.Screen options={{ headerShown: false }} />
            <ScreenHeader title="Tap to pay" />
            <ScrollView contentContainerStyle={s.scroll}>
                <Text style={s.lead}>Send and receive money with other MoneyWise users in seconds.</Text>
                {items.map((i) => (
                    <Pressable key={i.to} onPress={() => router.push(i.to as any)} style={({ pressed }) => [s.card, pressed && { opacity: 0.85 }]}>
                        <View style={s.icon}><i.icon size={20} color={colors.blue} /></View>
                        <View style={{ flex: 1 }}><Text style={s.title}>{i.title}</Text><Text style={s.text}>{i.text}</Text></View>
                        <ChevronRight size={18} color={colors.textFaint} />
                    </Pressable>
                ))}
            </ScrollView>
        </View>
    );
}

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.canvasAlt },
    scroll: { padding: 20, gap: 12 },
    lead: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, lineHeight: 19 },
    card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 14, borderWidth: 1, borderColor: colors.border },
    icon: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#EAF1FF', alignItems: 'center', justifyContent: 'center' },
    title: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
    text: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, marginTop: 2, lineHeight: 17 },
});

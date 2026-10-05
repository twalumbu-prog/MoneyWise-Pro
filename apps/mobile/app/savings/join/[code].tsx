import { useState } from 'react';
import { View } from 'react-native';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { JoinGroupSheet } from '../../../src/components/savings/SavingsSheets';
import { colors } from '../../../src/theme/tokens';

/** Opened from an invite link (moneywise.blueopus.cloud/savings/join/CODE): join with the code pre-filled. */
export default function JoinSavingsScreen() {
    const router = useRouter();
    const { code } = useLocalSearchParams<{ code: string }>();
    const [open, setOpen] = useState(true);
    return (
        <View style={{ flex: 1, backgroundColor: colors.canvas }}>
            <Stack.Screen options={{ headerShown: false }} />
            <JoinGroupSheet
                visible={open}
                initialCode={String(code ?? '').toUpperCase()}
                onClose={() => { setOpen(false); router.replace('/savings'); }}
                onJoined={(id) => { setOpen(false); router.replace(`/savings/${id}`); }}
            />
        </View>
    );
}

import { Alert, View } from 'react-native';
import { Stack } from 'expo-router';
import { KycProfileForm } from '../../src/components/invest/application/KycProfileForm';
import { useGoBack } from '../../src/hooks/useGoBack';

/**
 * KYC profile — everything an investment company asks for, saved once and editable here. Opening an account
 * with any investment company then needs a single tap instead of re-entering it all.
 */
export default function KycProfileScreen() {
    const goBack = useGoBack();
    return (
        <View style={{ flex: 1 }}>
            <Stack.Screen options={{ headerShown: false }} />
            <KycProfileForm
                onSaved={() => {
                    Alert.alert('KYC profile saved', 'Next time you open an investment account, you can submit these details in one tap.');
                    goBack();
                }}
            />
        </View>
    );
}

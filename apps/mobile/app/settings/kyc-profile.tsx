import { Alert, View } from 'react-native';
import { Stack } from 'expo-router';
import { InvestApplicationWizard } from '../../src/components/invest/application/InvestApplicationWizard';
import { useGoBack } from '../../src/hooks/useGoBack';

/**
 * KYC profile — everything an investment company asks for (ID, personal and contact details, occupation,
 * bank account, next of kin, photo and proof of residence), saved once. Opening an account with any
 * investment company then needs a single tap instead of re-entering it all.
 */
export default function KycProfileScreen() {
    const goBack = useGoBack();
    return (
        <View style={{ flex: 1 }}>
            <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
            <InvestApplicationWizard
                mode="profile"
                onClose={() => goBack()}
                onSaved={() => {
                    Alert.alert('KYC profile saved', 'Next time you open an investment account, you can submit these details in one tap.');
                    goBack();
                }}
            />
        </View>
    );
}

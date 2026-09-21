import { Stack, Redirect } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { colors } from '../../src/theme/tokens';

export default function AuthLayout() {
    const { session, loading } = useAuth();

    // Someone already signed in has no business on the login screen.
    if (!loading && session) return <Redirect href="/(tabs)" />;

    return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }} />;
}

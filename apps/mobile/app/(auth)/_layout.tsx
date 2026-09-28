import { Stack, Redirect } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { colors } from '../../src/theme/tokens';

export default function AuthLayout() {
    const { session, loading } = useAuth();

    // Someone already signed in has no business on the login screen. Hand off
    // to the root index route rather than the tabs directly — it's the single
    // place that also handles a pending join request or a multi-org pick.
    if (!loading && session) return <Redirect href="/" />;

    return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }} />;
}

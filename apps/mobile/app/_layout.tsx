import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import * as SplashScreen from 'expo-splash-screen';
import {
    useFonts,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_700Bold,
} from '@expo-google-fonts/dm-sans';

import { initCore } from '../src/platform';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { queryClient, persister, MAX_CACHE_AGE_MS } from '../src/lib/queryClient';
import { colors } from '../src/theme/tokens';

// Hand `core` its native implementations before any service call can fire.
// Module scope, not an effect: services are reachable from the first render.
initCore();

SplashScreen.preventAutoHideAsync().catch(() => {});

/**
 * Holds the splash until the session is known.
 *
 * The redirect itself lives in the group layouts, not here. Router hooks must be
 * used BELOW the navigator, and an earlier version of this file called
 * useSegments()/useRouter() in the same component that rendered <Stack> — which
 * React rejects as an invalid hook call and takes the whole app down.
 */
const SessionGate: React.FC = () => {
    const { loading } = useAuth();
    if (!loading) return null;
    return (
        <View style={styles.splash}>
            <ActivityIndicator size="large" color={colors.blue} />
        </View>
    );
};

export default function RootLayout() {
    const [fontsLoaded, fontError] = useFonts({
        DMSans_400Regular,
        DMSans_500Medium,
        DMSans_700Bold,
    });

    useEffect(() => {
        // Hide on font error too — a fallback face beats an app stuck on splash.
        if (fontsLoaded || fontError) SplashScreen.hideAsync().catch(() => {});
    }, [fontsLoaded, fontError]);

    if (!fontsLoaded && !fontError) return null;

    return (
        <SafeAreaProvider>
            <PersistQueryClientProvider
                client={queryClient}
                persistOptions={{ persister, maxAge: MAX_CACHE_AGE_MS }}
            >
                <AuthProvider>
                    <StatusBar style="dark" />
                    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }}>
                        <Stack.Screen name="index" />
                        <Stack.Screen name="(auth)" />
                        <Stack.Screen name="(tabs)" />
                        <Stack.Screen name="requisition/[id]" options={{ animation: 'slide_from_right' }} />
                        <Stack.Screen name="requisition/new" options={{ animation: 'slide_from_bottom' }} />
                        <Stack.Screen name="requisition/new-loan" options={{ animation: 'slide_from_bottom' }} />
                        <Stack.Screen name="requisition/new-advance" options={{ animation: 'slide_from_bottom' }} />
                        <Stack.Screen name="requisition/new-invest" options={{ animation: 'slide_from_bottom' }} />
                        <Stack.Screen name="schedules" options={{ animation: 'slide_from_right' }} />
                        <Stack.Screen name="wallet/entry/[id]" options={{ animation: 'slide_from_right' }} />
                        <Stack.Screen name="wallet/deposit" options={{ animation: 'slide_from_bottom' }} />
                        <Stack.Screen name="wallet/transfer" options={{ animation: 'slide_from_bottom' }} />
                        <Stack.Screen name="wallet/new" options={{ animation: 'slide_from_bottom' }} />
                        <Stack.Screen name="wallet/pay-link" options={{ animation: 'slide_from_bottom' }} />
                        <Stack.Screen name="wallet/import" options={{ animation: 'slide_from_bottom' }} />
                        <Stack.Screen name="wallet/lenco-transfer" options={{ animation: 'slide_from_bottom' }} />
                        <Stack.Screen name="approvals" options={{ animation: 'slide_from_right' }} />
                        <Stack.Screen name="disbursements" options={{ animation: 'slide_from_right' }} />
                        <Stack.Screen name="vouchers/index" options={{ animation: 'slide_from_right' }} />
                        <Stack.Screen name="vouchers/[id]" options={{ animation: 'slide_from_right' }} />
                        <Stack.Screen name="audit" options={{ animation: 'slide_from_right' }} />
                        <Stack.Screen name="products/index" options={{ animation: 'slide_from_right' }} />
                        <Stack.Screen name="products/[id]" options={{ animation: 'slide_from_bottom' }} />
                        <Stack.Screen name="settings/profile" options={{ animation: 'slide_from_right' }} />
                        <Stack.Screen name="settings/general" options={{ animation: 'slide_from_right' }} />
                        <Stack.Screen name="settings/team" options={{ animation: 'slide_from_right' }} />
                        <Stack.Screen name="settings/integrations" options={{ animation: 'slide_from_right' }} />
                        <Stack.Screen name="apps/index" options={{ animation: 'slide_from_right' }} />
                        <Stack.Screen name="apps/payroll/index" options={{ animation: 'slide_from_right' }} />
                        <Stack.Screen name="apps/payroll/config" options={{ animation: 'slide_from_right' }} />
                        <Stack.Screen name="apps/payroll/run/index" options={{ animation: 'slide_from_bottom' }} />
                        <Stack.Screen name="apps/payroll/run/[id]" options={{ animation: 'slide_from_right' }} />
                        <Stack.Screen name="apps/payroll/staff/[id]" options={{ animation: 'slide_from_right' }} />
                        <Stack.Screen name="apps/payroll/staff/new" options={{ animation: 'slide_from_bottom' }} />
                        <Stack.Screen name="apps/payroll/staff/import" options={{ animation: 'slide_from_bottom' }} />
                        <Stack.Screen name="apps/invest/index" options={{ animation: 'slide_from_right' }} />
                        <Stack.Screen name="apps/invest/company/[id]" options={{ animation: 'slide_from_right' }} />
                        <Stack.Screen name="apps/invest/product/[id]" options={{ animation: 'slide_from_right' }} />
                    </Stack>
                    <SessionGate />
                </AuthProvider>
            </PersistQueryClientProvider>
        </SafeAreaProvider>
    );
}

const styles = StyleSheet.create({
    splash: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center', justifyContent: 'center', backgroundColor: colors.canvas,
    },
});

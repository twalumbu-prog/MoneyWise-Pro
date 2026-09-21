import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useIsRestoring } from '@tanstack/react-query';
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
import { useNotificationNavigation } from '../src/hooks/useNotificationNavigation';
import { colors } from '../src/theme/tokens';

// Hand `core` its native implementations before any service call can fire.
// Module scope, not an effect: services are reachable from the first render.
initCore();

SplashScreen.preventAutoHideAsync().catch(() => {});

/**
 * Holds the splash until the session is known AND the persisted query cache
 * has finished restoring from disk.
 *
 * Without the isRestoring check, screens mount and call useQuery() before
 * AsyncStorage has handed the persister its data back — so `data` is briefly
 * undefined and `isLoading` is briefly true even though a perfectly good
 * cached copy is about to land a moment later. Every screen's loading
 * spinner then flashes on and off, and any conditional "loading ? spinner :
 * content" layout jumps because the two branches aren't the same size. This
 * gate keeps that flash behind the splash instead of on-screen: <Stack> and
 * its screens still mount and fire their queries underneath it (so the
 * restore + first paint happen in parallel, not in series), and the gate
 * only ever lifts once there's nothing left to flash.
 *
 * The redirect itself lives in the group layouts, not here. Router hooks must be
 * used BELOW the navigator, and an earlier version of this file called
 * useSegments()/useRouter() in the same component that rendered <Stack> — which
 * React rejects as an invalid hook call and takes the whole app down.
 */
const SessionGate: React.FC = () => {
    const { loading } = useAuth();
    const isRestoring = useIsRestoring();
    if (!loading && !isRestoring) return null;
    return (
        <View style={styles.splash}>
            <ActivityIndicator size="large" color={colors.blue} />
        </View>
    );
};

/** Tapping a push notification navigates to the screen it's about. No UI of its own. */
const PushNotificationTapHandler: React.FC = () => {
    useNotificationNavigation();
    return null;
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
                    <PushNotificationTapHandler />
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

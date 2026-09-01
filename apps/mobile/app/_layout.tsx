import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
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

/** Routes the user between the auth stack and the tab shell as the session resolves. */
const AuthGate: React.FC = () => {
    const { session, loading } = useAuth();
    const segments = useSegments();
    const router = useRouter();

    useEffect(() => {
        if (loading) return;
        const inAuthGroup = segments[0] === '(auth)';
        if (!session && !inAuthGroup) router.replace('/(auth)/login');
        else if (session && inAuthGroup) router.replace('/(tabs)');
    }, [session, loading, segments, router]);

    if (loading) {
        return (
            <View style={styles.centre}>
                <ActivityIndicator size="large" color={colors.blue} />
            </View>
        );
    }

    return (
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }}>
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="requisition/[id]" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="requisition/new" options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="schedules" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="wallet/entry/[id]" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="wallet/deposit" options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="wallet/transfer" options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="wallet/new" options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="wallet/pay-link" options={{ animation: 'slide_from_bottom' }} />
        </Stack>
    );
};

export default function RootLayout() {
    const [fontsLoaded, fontError] = useFonts({
        DMSans_400Regular,
        DMSans_500Medium,
        DMSans_700Bold,
    });

    useEffect(() => {
        // Hide on font error too — a fallback face is a far better outcome than
        // an app stuck on the splash screen.
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
                    <AuthGate />
                </AuthProvider>
            </PersistQueryClientProvider>
        </SafeAreaProvider>
    );
}

const styles = StyleSheet.create({
    centre: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.canvas },
});

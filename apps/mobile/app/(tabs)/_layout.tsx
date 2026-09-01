import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Navigation, Wallet, Sparkles, TrendingUp, Menu } from 'lucide-react-native';
import { isRequestorRole } from 'core';
import { useAuth } from '../../src/context/AuthContext';
import { colors } from '../../src/theme/tokens';

/**
 * The five tabs, and the role rule, come straight from the web mobile nav in
 * apps/web/src/components/Layout.tsx: a REQUESTOR sees neither Wallet nor BI.
 * Icons are labelless there; native convention wants labels, so they are shown
 * here — the one intentional divergence.
 */
export default function TabsLayout() {
    const { userRole } = useAuth();
    const insets = useSafeAreaInsets();
    const isRequestor = isRequestorRole(userRole);

    return (
        <Tabs
            screenOptions={{
                headerShown: false,
                tabBarActiveTintColor: colors.blue,
                tabBarInactiveTintColor: colors.textFaint,
                tabBarStyle: {
                    backgroundColor: colors.surface,
                    borderTopColor: colors.border,
                    height: 58 + insets.bottom,
                    paddingTop: 8,
                    paddingBottom: insets.bottom,
                },
                tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
            }}
        >
            <Tabs.Screen
                name="index"
                options={{ title: 'Inbox', tabBarIcon: ({ color, size }) => <Navigation color={color} size={size} /> }}
            />
            <Tabs.Screen
                name="wallet"
                options={{
                    title: 'Wallet',
                    href: isRequestor ? null : undefined,
                    tabBarIcon: ({ color, size }) => <Wallet color={color} size={size} />,
                }}
            />
            <Tabs.Screen
                name="bi"
                options={{
                    title: 'BI',
                    href: isRequestor ? null : undefined,
                    tabBarIcon: ({ color, size }) => <Sparkles color={color} size={size} />,
                }}
            />
            <Tabs.Screen
                name="reporting"
                options={{ title: 'Reporting', tabBarIcon: ({ color, size }) => <TrendingUp color={color} size={size} /> }}
            />
            <Tabs.Screen
                name="menu"
                options={{ title: 'Menu', tabBarIcon: ({ color, size }) => <Menu color={color} size={size} /> }}
            />
        </Tabs>
    );
}

import { Tabs, Redirect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Navigation, TrendingUp, Menu } from 'lucide-react-native';
import { isRequestorRole } from 'core';
import { useAuth } from '../../src/context/AuthContext';
import { AstroidIcon } from '../../src/components/icons/AstroidIcon';
import { WalletCardsIcon } from '../../src/components/icons/WalletCardsIcon';
import { colors } from '../../src/theme/tokens';

/**
 * The five tabs, and the role rule, come straight from the web mobile nav in
 * apps/web/src/components/Layout.tsx: a REQUESTOR sees neither Wallet nor BI.
 * Icons are labelless there; native convention wants labels, so they are shown
 * here — the one intentional divergence.
 */
export default function TabsLayout() {
    const { userRole, session, loading } = useAuth();
    const insets = useSafeAreaInsets();
    const isRequestor = isRequestorRole(userRole);

    // Signing out anywhere in the app drops straight back to login.
    if (!loading && !session) return <Redirect href="/(auth)/login" />;

    return (
        <Tabs
            screenOptions={{
                headerShown: false,
                // Cross-fade + slight horizontal shift between tabs instead of
                // the flat instant swap — react-navigation v7's built-in tab
                // transition (bottom-tabs only offers 'none' | 'fade' | 'shift').
                animation: 'shift',
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
                    tabBarIcon: ({ color, size }) => <WalletCardsIcon color={color} size={size} />,
                }}
            />
            <Tabs.Screen
                name="bi"
                options={{
                    title: 'Intelligence',
                    href: isRequestor ? null : undefined,
                    tabBarIcon: ({ color, size }) => <AstroidIcon color={color} size={size} />,
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

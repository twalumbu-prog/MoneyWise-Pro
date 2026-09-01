import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import { colors } from '../src/theme/tokens';

/** Mirrors the web HomeRedirect: signed in goes to the tabs, otherwise login. */
export default function Index() {
    const { session, loading } = useAuth();

    if (loading) {
        return (
            <View style={styles.centre}>
                <ActivityIndicator size="large" color={colors.blue} />
            </View>
        );
    }
    return <Redirect href={session ? '/(tabs)' : '/(auth)/login'} />;
}

const styles = StyleSheet.create({
    centre: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.canvas },
});

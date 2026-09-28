import {
    View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator,
    RefreshControl, Image, Switch,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Package } from 'lucide-react-native';
import { productService, formatKwacha } from 'core';
import type { Product } from 'core';
import { useAuth } from '../../src/context/AuthContext';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { colors, fonts, radius } from '../../src/theme/tokens';

export default function ProductsScreen() {
    const router = useRouter();
    const qc = useQueryClient();
    const { userRole } = useAuth();
    const isAdmin = userRole === 'ADMIN';

    const { data, isLoading, refetch, isRefetching } = useQuery({
        queryKey: ['products'],
        queryFn: () => productService.getProducts(),
    });
    const products: Product[] = data ?? [];

    const toggleActive = useMutation({
        mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
            productService.updateProduct(id, { is_active }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
    });

    return (
        <View style={styles.root}>
            <Stack.Screen options={{ headerShown: false }} />
            <ScreenHeader title="Products & Services" right={
                isAdmin ? (
                    <Pressable onPress={() => router.push('/products/new')} hitSlop={8} accessibilityLabel="Add product">
                        <Plus size={22} color={colors.blue} />
                    </Pressable>
                ) : undefined
            } />

            {isLoading ? (
                <View style={styles.centre}><ActivityIndicator color={colors.blue} /></View>
            ) : (
                <FlatList
                    data={products}
                    keyExtractor={(p) => p.id}
                    contentContainerStyle={styles.list}
                    refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => { void refetch(); }} tintColor={colors.blue} />}
                    renderItem={({ item }) => (
                        <Pressable
                            style={styles.card}
                            onPress={() => isAdmin && router.push(`/products/${item.id}`)}
                        >
                            {item.image_url ? (
                                <Image source={{ uri: item.image_url }} style={styles.thumb} />
                            ) : (
                                <View style={[styles.thumb, styles.thumbPlaceholder]}>
                                    <Package size={20} color={colors.textFaint} />
                                </View>
                            )}
                            <View style={styles.cardMain}>
                                <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                                <Text style={styles.price}>{formatKwacha(item.price)}</Text>
                            </View>
                            {isAdmin && (
                                <Switch
                                    value={item.is_active}
                                    onValueChange={(v) => toggleActive.mutate({ id: item.id, is_active: v })}
                                    trackColor={{ true: colors.blue, false: colors.borderStrong }}
                                />
                            )}
                        </Pressable>
                    )}
                    ListEmptyComponent={
                        <View style={styles.empty}>
                            <Text style={styles.emptyText}>No products or services yet.</Text>
                        </View>
                    }
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.canvas },
    centre: { paddingVertical: 64, alignItems: 'center' },
    list: { padding: 20, gap: 10, paddingBottom: 48 },
    card: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        backgroundColor: colors.surface, borderRadius: radius.lg, padding: 12,
        borderWidth: 1, borderColor: colors.border,
    },
    thumb: { width: 48, height: 48, borderRadius: radius.sm },
    thumbPlaceholder: { backgroundColor: colors.canvasAlt, alignItems: 'center', justifyContent: 'center' },
    cardMain: { flex: 1 },
    name: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text },
    price: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.navy, marginTop: 2 },
    empty: { paddingVertical: 64, alignItems: 'center' },
    emptyText: { fontFamily: fonts.body, fontSize: 14, color: colors.textFaint },
});

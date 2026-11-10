import { View, Text, Image, StyleSheet } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { apiJson, formatKwacha } from 'core';
import { Screen, Card, Pill, Loading, Empty, ErrorNote } from '../../../src/components/marketplace/ui';
import type { ImportOrder } from '../../../src/lib/marketplace';
import { IMPORT_STEPS } from '../../../src/lib/marketplace';
import { resized } from '../../../src/lib/images';
import { colors, fonts } from '../../../src/theme/tokens';

const DONE_STATES = ['CANCELLED', 'REFUNDED', 'FAILED'];

/** Follow what you ordered from overseas, step by step. */
export default function ImportOrders() {
    const { data, isPending, isError, error, refetch, isRefetching } = useQuery({
        queryKey: ['marketplace', 'imports', 'orders'], queryFn: () => apiJson<{ orders: ImportOrder[] }>('/marketplace/imports/orders'), refetchInterval: 60_000,
    });
    const orders = data?.orders ?? [];

    return (
        <Screen title="Import orders" onRefresh={() => { void refetch(); }} refreshing={isRefetching}>
            {isPending ? <Loading /> : isError ? <ErrorNote text={(error as any)?.message || 'Couldn’t load your orders.'} onRetry={() => refetch()} />
                : orders.length === 0 ? <Empty text="You haven’t ordered anything from overseas yet." />
                : orders.map((o) => {
                    const idx = IMPORT_STEPS.findIndex((s) => s.id === o.status);
                    const dead = DONE_STATES.includes(o.status);
                    return (
                        <Card key={o.id}>
                            <View style={styles.top}>
                                {o.image_url ? <Image source={{ uri: resized(o.image_url, 160, { square: true }) }} style={styles.img} /> : <View style={styles.img} />}
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.title} numberOfLines={2}>{o.title}</Text>
                                    <Text style={styles.sub}>{o.quantity} × · {formatKwacha(o.total_zmw)} · {new Date(o.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</Text>
                                    {dead ? <Pill label={o.status === 'REFUNDED' ? 'Refunded' : o.status === 'CANCELLED' ? 'Cancelled' : 'Failed'} bg="#FCE8E6" fg="#B31412" />
                                        : <Pill label={IMPORT_STEPS[idx]?.label ?? 'Processing'} bg={o.status === 'DELIVERED' ? '#E6F4EA' : '#EAF1FF'} fg={o.status === 'DELIVERED' ? '#137333' : colors.blue} />}
                                </View>
                            </View>
                            {!dead ? (
                                <View style={styles.steps}>
                                    {IMPORT_STEPS.map((s, i) => <View key={s.id} style={[styles.step, i <= idx && styles.stepOn]} />)}
                                </View>
                            ) : null}
                            {o.tracking_number ? <Text style={styles.sub}>{o.carrier ? `${o.carrier} · ` : ''}Tracking {o.tracking_number}</Text> : null}
                            {o.delivery_address ? <Text style={styles.sub}>Delivering to {o.delivery_address}</Text> : null}
                            {o.events?.length ? <Text style={styles.sub}>Latest: {o.events[o.events.length - 1].note || o.events[o.events.length - 1].status}</Text> : null}
                        </Card>
                    );
                })}
        </Screen>
    );
}

const styles = StyleSheet.create({
    top: { flexDirection: 'row', gap: 12 },
    img: { width: 56, height: 56, borderRadius: 10, backgroundColor: '#F1F3F4' },
    title: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text },
    sub: { fontFamily: fonts.body, fontSize: 11.5, color: colors.textMuted, lineHeight: 16, marginVertical: 2 },
    steps: { flexDirection: 'row', gap: 4, marginTop: 6 },
    step: { flex: 1, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB' },
    stepOn: { backgroundColor: colors.blue },
});

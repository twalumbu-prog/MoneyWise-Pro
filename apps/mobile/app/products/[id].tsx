import { useEffect, useState } from 'react';
import {
    View, Text, TextInput, Pressable, ScrollView, StyleSheet,
    ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Camera } from 'lucide-react-native';
import {
    productService, formatKwacha, requireCapability, PRODUCT_TYPE_OPTIONS,
} from 'core';
import type { ProductType } from 'core';
import { uploadToBucket } from '../../src/lib/uploads';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { colors, fonts, radius } from '../../src/theme/tokens';

/** `/products/new` and `/products/[id]` share this screen — the only
 * difference is whether an id was in the route. */
export default function ProductEditScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const isNew = id === 'new';
    const router = useRouter();
    const qc = useQueryClient();

    const { data: products } = useQuery({
        queryKey: ['products'],
        queryFn: () => productService.getProducts(),
        enabled: !isNew,
    });
    const existing = products?.find((p) => p.id === id);

    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [price, setPrice] = useState('');
    const [type, setType] = useState<ProductType>('PRODUCT');
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [uploadingImage, setUploadingImage] = useState(false);

    useEffect(() => {
        if (existing) {
            setName(existing.name);
            setDescription(existing.description ?? '');
            setPrice(String(existing.price ?? ''));
            setType(existing.product_type ?? 'PRODUCT');
            setImageUrl(existing.image_url ?? null);
        }
    }, [existing]);

    const numericPrice = Number(price) || 0;
    const valid = name.trim().length > 0 && (type === 'DONATION' || numericPrice > 0);

    const save = useMutation({
        mutationFn: () => {
            const payload = {
                name: name.trim(),
                description: description.trim(),
                price: numericPrice,
                product_type: type,
                image_url: imageUrl,
            };
            return isNew ? productService.createProduct(payload) : productService.updateProduct(String(id), payload);
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['products'] });
            router.back();
        },
        onError: (e: Error) => Alert.alert('Could not save', e.message),
    });

    const pickImage = async () => {
        try {
            const [file] = await requireCapability('files').pick({ kind: 'image' });
            if (!file) return;
            setUploadingImage(true);
            const compressed = await requireCapability('files').compressImage(file, 2 * 1024 * 1024);
            const ext = compressed.name.split('.').pop() || 'jpg';
            const path = `${Date.now()}_${ext === 'jpg' ? 'product' : 'image'}.${ext}`;
            await uploadToBucket('product-images', path, compressed);
            const { getCore } = await import('core');
            const { data } = getCore().supabase.storage.from('product-images').getPublicUrl(path);
            setImageUrl(data.publicUrl);
        } catch (e: any) {
            Alert.alert('Could not upload image', e?.message ?? 'Please try again.');
        } finally {
            setUploadingImage(false);
        }
    };

    return (
        <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <Stack.Screen options={{ headerShown: false }} />
            <ScreenHeader title={isNew ? 'New Product' : 'Edit Product'} />

            <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
                <Pressable onPress={pickImage} style={styles.imagePicker} disabled={uploadingImage}>
                    {imageUrl ? (
                        <Image source={{ uri: imageUrl }} style={styles.image} />
                    ) : (
                        <View style={[styles.image, styles.imagePlaceholder]}>
                            {uploadingImage
                                ? <ActivityIndicator color={colors.blue} />
                                : <><Camera size={22} color={colors.textFaint} /><Text style={styles.imageHint}>Add photo</Text></>}
                        </View>
                    )}
                </Pressable>

                <View style={styles.card}>
                    <Text style={styles.label}>Type</Text>
                    <View style={styles.chips}>
                        {PRODUCT_TYPE_OPTIONS.filter((o) => !o.value.startsWith('SERVICE_BOOKING')).map((o) => (
                            <Pressable key={o.value} onPress={() => setType(o.value)} style={[styles.chip, type === o.value && styles.chipActive]}>
                                <Text style={[styles.chipText, type === o.value && styles.chipTextActive]}>{o.label}</Text>
                            </Pressable>
                        ))}
                    </View>

                    <Text style={[styles.label, styles.spaced]}>Name</Text>
                    <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="e.g. Weekend Delivery" placeholderTextColor={colors.textFaint} />

                    <Text style={[styles.label, styles.spaced]}>Description</Text>
                    <TextInput
                        style={[styles.input, styles.multiline]} value={description} onChangeText={setDescription}
                        multiline placeholder="What the customer is buying" placeholderTextColor={colors.textFaint}
                    />

                    {type !== 'DONATION' && (
                        <>
                            <Text style={[styles.label, styles.spaced]}>
                                Price (K){type === 'SERVICE_VARIABLE' ? ' — set per link instead' : ''}
                            </Text>
                            <TextInput
                                style={styles.input} value={price}
                                onChangeText={(v) => setPrice(v.replace(/[^0-9.]/g, ''))}
                                keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.textFaint}
                                editable={type !== 'SERVICE_VARIABLE'}
                            />
                        </>
                    )}
                </View>

                {numericPrice > 0 && (
                    <View style={styles.previewCard}>
                        <Text style={styles.previewLabel}>Price shown to customers</Text>
                        <Text style={styles.previewValue}>{formatKwacha(numericPrice)}</Text>
                    </View>
                )}
            </ScrollView>

            <View style={styles.footer}>
                <Pressable
                    style={[styles.saveBtn, !valid && styles.saveBtnDisabled]}
                    onPress={() => save.mutate()}
                    disabled={!valid || save.isPending}
                >
                    {save.isPending
                        ? <ActivityIndicator color="#FFFFFF" />
                        : <Text style={styles.saveBtnText}>{isNew ? 'Add product' : 'Save changes'}</Text>}
                </Pressable>
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.canvas },
    scroll: { padding: 20, gap: 14, paddingBottom: 32 },
    imagePicker: { alignSelf: 'center' },
    image: { width: 120, height: 120, borderRadius: radius.lg },
    imagePlaceholder: { backgroundColor: colors.canvasAlt, alignItems: 'center', justifyContent: 'center', gap: 6 },
    imageHint: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint },
    card: {
        backgroundColor: colors.surface, borderRadius: radius.lg, padding: 20,
        borderWidth: 1, borderColor: colors.border,
    },
    label: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textMuted, marginBottom: 8 },
    spaced: { marginTop: 16 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong },
    chipActive: { backgroundColor: colors.tabActiveBg, borderColor: colors.blue },
    chipText: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.textMuted },
    chipTextActive: { color: colors.blue },
    input: {
        fontFamily: fonts.body, fontSize: 14, color: colors.text,
        borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md,
        paddingHorizontal: 14, paddingVertical: 11,
    },
    multiline: { minHeight: 80, textAlignVertical: 'top' },
    previewCard: {
        backgroundColor: colors.surface, borderRadius: radius.lg, padding: 18,
        borderWidth: 1, borderColor: colors.border,
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    },
    previewLabel: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textMuted },
    previewValue: { fontFamily: fonts.display, fontSize: 22, color: colors.navy },
    footer: {
        paddingHorizontal: 20, paddingVertical: 12, backgroundColor: colors.surface,
        borderTopWidth: 1, borderTopColor: colors.border,
    },
    saveBtn: {
        backgroundColor: colors.blue, borderRadius: radius.md, paddingVertical: 16,
        alignItems: 'center', justifyContent: 'center', minHeight: 52,
    },
    saveBtnDisabled: { opacity: 0.4 },
    saveBtnText: { fontFamily: fonts.bodyBold, fontSize: 16, color: '#FFFFFF' },
});

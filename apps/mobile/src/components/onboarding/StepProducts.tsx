import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Image, Modal, ScrollView, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Plus, Pencil, Trash2, Copy, ShoppingBag, PackageOpen, ImagePlus, X } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { productService, Product, ProductType, PRODUCT_TYPE_OPTIONS } from 'core';
import { StepFooter, ErrorBanner, PrimaryButton, GhostButton, TextField, Toggle } from './ui';
import { colors, fonts, radius } from '../../theme/tokens';

interface Props {
    organizationId: string;
    storeCategories: string[];
    onBack: () => void;
    onContinue: (count: number) => void;
    saving: boolean;
}

const typeLabel = (t?: ProductType) =>
    PRODUCT_TYPE_OPTIONS.find(o => o.value === (t || 'PRODUCT'))?.label || 'Product';

export const StepProducts: React.FC<Props> = ({ organizationId, storeCategories, onBack, onContinue, saving }) => {
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [modalProduct, setModalProduct] = useState<Partial<Product> | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);

    useEffect(() => {
        productService.getProducts()
            .then(setProducts)
            .catch(() => setError('Failed to load your products.'))
            .finally(() => setLoading(false));
    }, []);

    const handleSaved = (saved: Product, isNew: boolean) => {
        setProducts(prev => isNew ? [...prev, saved] : prev.map(p => p.id === saved.id ? saved : p));
        setModalProduct(null);
    };

    const handleDelete = async (product: Product) => {
        setBusyId(product.id);
        setError(null);
        setProducts(prev => prev.filter(p => p.id !== product.id));
        try {
            await productService.deleteProduct(product.id);
        } catch (err: any) {
            setProducts(prev => [...prev, product]);
            setError(err.message || 'Failed to delete listing.');
        } finally {
            setBusyId(null);
        }
    };

    const handleDuplicate = async (product: Product) => {
        setBusyId(product.id);
        setError(null);
        try {
            const copy = await productService.createProduct({
                name: `${product.name} (Copy)`,
                description: product.description,
                price: product.price,
                image_url: product.image_url,
                product_type: product.product_type,
                category: product.category,
            });
            setProducts(prev => [...prev, copy]);
        } catch (err: any) {
            setError(err.message || 'Failed to duplicate listing.');
        } finally {
            setBusyId(null);
        }
    };

    return (
        <View style={styles.root}>
            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >
                <ErrorBanner message={error} />

                {loading ? (
                    <View style={styles.centerLoading}>
                        <ActivityIndicator size="large" color={colors.blue} />
                    </View>
                ) : products.length === 0 ? (
                    <Pressable
                        onPress={() => setModalProduct({})}
                        style={({ pressed }) => [styles.emptyState, { opacity: pressed ? 0.85 : 1 }]}
                    >
                        <View style={styles.emptyIconBox}>
                            <PackageOpen size={36} color={colors.blue} />
                        </View>
                        <Text style={styles.emptyTitle}>Your store is empty</Text>
                        <Text style={styles.emptySubtitle}>
                            Add your first product or service and it will appear here.
                        </Text>
                        <View style={styles.addFirstBtn}>
                            <Plus size={16} color="#FFFFFF" />
                            <Text style={styles.addFirstBtnText}>Add your first listing</Text>
                        </View>
                    </Pressable>
                ) : (
                    <View>
                        {products.map(product => (
                            <View key={product.id} style={styles.productCard}>
                                <View style={styles.productImageContainer}>
                                    {product.image_url ? (
                                        <Image source={{ uri: product.image_url }} style={styles.productImage} />
                                    ) : (
                                        <ShoppingBag size={24} color={colors.textFaint} />
                                    )}
                                </View>

                                <View style={styles.productInfo}>
                                    <Text style={styles.productName} numberOfLines={1}>{product.name}</Text>
                                    <Text style={styles.productPrice}>
                                        K {Number(product.price).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </Text>
                                    <Text style={styles.productMeta}>
                                        {product.category || 'General'} · {typeLabel(product.product_type)}
                                    </Text>
                                </View>

                                <View style={styles.cardActions}>
                                    {busyId === product.id ? (
                                        <ActivityIndicator size="small" color={colors.blue} />
                                    ) : (
                                        <>
                                            <Pressable onPress={() => setModalProduct(product)} style={styles.actionBtn}>
                                                <Pencil size={16} color={colors.textMuted} />
                                            </Pressable>
                                            <Pressable onPress={() => handleDuplicate(product)} style={styles.actionBtn}>
                                                <Copy size={16} color={colors.textMuted} />
                                            </Pressable>
                                            <Pressable onPress={() => handleDelete(product)} style={styles.actionBtn}>
                                                <Trash2 size={16} color={colors.danger} />
                                            </Pressable>
                                        </>
                                    )}
                                </View>
                            </View>
                        ))}

                        <Pressable
                            onPress={() => setModalProduct({})}
                            style={({ pressed }) => [styles.addMoreBtn, { opacity: pressed ? 0.8 : 1 }]}
                        >
                            <Plus size={16} color={colors.blue} />
                            <Text style={styles.addMoreBtnText}>Add another listing</Text>
                        </Pressable>
                    </View>
                )}
            </ScrollView>

            {modalProduct !== null ? (
                <ProductModal
                    organizationId={organizationId}
                    storeCategories={storeCategories}
                    product={modalProduct}
                    onClose={() => setModalProduct(null)}
                    onSaved={handleSaved}
                />
            ) : null}

            <StepFooter
                onBack={onBack}
                loading={saving}
                continueLabel={products.length === 0 ? 'Skip for now' : 'Continue'}
                onContinue={() => onContinue(products.length)}
            />
        </View>
    );
};

interface ModalProps {
    organizationId: string;
    storeCategories: string[];
    product: Partial<Product>;
    onClose: () => void;
    onSaved: (p: Product, isNew: boolean) => void;
}

const ProductModal: React.FC<ModalProps> = ({ organizationId, storeCategories, product, onClose, onSaved }) => {
    const isNew = !product.id;
    const [name, setName] = useState(product.name || '');
    const [description, setDescription] = useState(product.description || '');
    const [category, setCategory] = useState(product.category || (storeCategories[0] || ''));
    const [price, setPrice] = useState(product.price != null ? String(product.price) : '');
    const [imageUrl, setImageUrl] = useState<string | null>(product.image_url || null);
    const productType: ProductType = (product.product_type || 'PRODUCT') as ProductType;
    const [isActive, setIsActive] = useState(product.is_active !== false);

    const [uploadingImage, setUploadingImage] = useState(false);
    const [savingProduct, setSavingProduct] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const pickImage = async () => {
        try {
            const res = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.8,
            });
            if (res.canceled || !res.assets?.[0]) return;

            setUploadingImage(true);
            const asset = res.assets[0];
            const response = await fetch(asset.uri);
            const blob = await response.blob();
            const ext = asset.mimeType?.split('/')[1] || 'jpg';
            const path = `${organizationId}/product-${Date.now()}.${ext}`;

            const { data, error: uploadErr } = await supabase.storage
                .from('product-images')
                .upload(path, blob, { cacheControl: '3600', upsert: true, contentType: asset.mimeType || 'image/jpeg' });

            if (uploadErr) throw uploadErr;
            const url = supabase.storage.from('product-images').getPublicUrl(data.path).data.publicUrl;
            setImageUrl(url);
        } catch (err: any) {
            setError('Image upload failed.');
        } finally {
            setUploadingImage(false);
        }
    };

    const handleSubmit = async () => {
        if (!name.trim()) {
            setError('Please give this listing a name.');
            return;
        }

        const numericPrice = Number(price || 0);
        if (isNaN(numericPrice) || numericPrice < 0) {
            setError('Please enter a valid price.');
            return;
        }

        setSavingProduct(true);
        setError(null);
        try {
            const payload: Partial<Product> = {
                name: name.trim(),
                description: description.trim() || undefined,
                category: category || null,
                price: numericPrice,
                image_url: imageUrl,
                product_type: productType,
                is_active: isActive,
            };

            const saved = isNew
                ? await productService.createProduct(payload)
                : await productService.updateProduct(product.id!, payload);

            onSaved(saved, isNew);
        } catch (err: any) {
            setError(err.message || 'Failed to save listing.');
        } finally {
            setSavingProduct(false);
        }
    };

    return (
        <Modal visible animationType="slide" presentationStyle="pageSheet">
            <View style={styles.modalContainer}>
                <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>{isNew ? 'Add Listing' : 'Edit Listing'}</Text>
                    <Pressable onPress={onClose} style={styles.closeBtn}>
                        <X size={20} color={colors.textMuted} />
                    </Pressable>
                </View>

                <ScrollView contentContainerStyle={styles.modalBody}>
                    <ErrorBanner message={error} />

                    {/* Image picker */}
                    <Pressable onPress={pickImage} style={styles.imagePickerBox}>
                        {uploadingImage ? (
                            <ActivityIndicator size="small" color={colors.blue} />
                        ) : imageUrl ? (
                            <Image source={{ uri: imageUrl }} style={styles.pickedImage} />
                        ) : (
                            <View style={styles.imagePickerPlaceholder}>
                                <ImagePlus size={24} color={colors.textFaint} />
                                <Text style={styles.imagePickerText}>Upload Image</Text>
                            </View>
                        )}
                    </Pressable>

                    <TextField
                        label="Name"
                        value={name}
                        onChangeText={setName}
                        placeholder="e.g. Executive Lunch"
                    />

                    <TextField
                        label="Description"
                        value={description}
                        onChangeText={setDescription}
                        placeholder="Short description for customers"
                        optional
                        multiline
                    />

                    <TextField
                        label="Category"
                        value={category}
                        onChangeText={setCategory}
                        placeholder="e.g. Services"
                        optional
                    />

                    <TextField
                        label="Price (ZMW)"
                        value={price}
                        onChangeText={setPrice}
                        placeholder="0.00"
                        keyboardType="decimal-pad"
                    />

                    <Toggle
                        label="Active Listing"
                        description="Visible in your catalog"
                        checked={isActive}
                        onChange={setIsActive}
                    />

                    <View style={styles.modalActions}>
                        <GhostButton onPress={onClose}>Cancel</GhostButton>
                        <PrimaryButton onPress={handleSubmit} loading={savingProduct} disabled={uploadingImage}>
                            {isNew ? 'Add Listing' : 'Save Changes'}
                        </PrimaryButton>
                    </View>
                </ScrollView>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    root: {
        flex: 1,
    },
    scroll: {
        flex: 1,
    },
    scrollContent: {
        paddingVertical: 12,
        paddingHorizontal: 16,
    },
    centerLoading: {
        paddingVertical: 40,
        alignItems: 'center',
    },
    emptyState: {
        alignItems: 'center',
        padding: 32,
        borderWidth: 2,
        borderColor: colors.borderStrong,
        borderStyle: 'dashed',
        borderRadius: radius.xl,
        backgroundColor: colors.surface,
        marginBottom: 20,
    },
    emptyIconBox: {
        width: 64,
        height: 64,
        borderRadius: radius.xl,
        backgroundColor: '#EFF6FF',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    emptyTitle: {
        fontFamily: fonts.bodyBold,
        fontSize: 18,
        color: colors.navy,
        marginBottom: 4,
    },
    emptySubtitle: {
        fontFamily: fonts.body,
        fontSize: 14,
        color: colors.textMuted,
        textAlign: 'center',
        marginBottom: 20,
    },
    addFirstBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.navy,
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: radius.pill,
        gap: 8,
    },
    addFirstBtnText: {
        fontFamily: fonts.bodyBold,
        fontSize: 14,
        color: '#FFFFFF',
    },
    productCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.borderStrong,
        padding: 12,
        marginBottom: 10,
        gap: 12,
    },
    productImageContainer: {
        width: 54,
        height: 54,
        borderRadius: radius.md,
        backgroundColor: colors.canvas,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    productImage: {
        width: '100%',
        height: '100%',
    },
    productInfo: {
        flex: 1,
    },
    productName: {
        fontFamily: fonts.bodyBold,
        fontSize: 15,
        color: colors.navy,
    },
    productPrice: {
        fontFamily: fonts.bodyBold,
        fontSize: 13,
        color: colors.blue,
        marginTop: 2,
    },
    productMeta: {
        fontFamily: fonts.body,
        fontSize: 11,
        color: colors.textFaint,
        marginTop: 2,
    },
    cardActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    actionBtn: {
        padding: 8,
        borderRadius: radius.md,
        backgroundColor: colors.canvas,
    },
    addMoreBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 48,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.blue,
        borderStyle: 'dashed',
        backgroundColor: '#EFF6FF',
        marginTop: 8,
        marginBottom: 16,
        gap: 8,
    },
    addMoreBtnText: {
        fontFamily: fonts.bodyBold,
        fontSize: 14,
        color: colors.blue,
    },
    modalContainer: {
        flex: 1,
        backgroundColor: colors.canvas,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingTop: 16,
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        backgroundColor: colors.surface,
    },
    modalTitle: {
        fontFamily: fonts.bodyBold,
        fontSize: 18,
        color: colors.navy,
    },
    closeBtn: {
        padding: 6,
    },
    modalBody: {
        padding: 20,
    },
    imagePickerBox: {
        width: 100,
        height: 100,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.borderStrong,
        backgroundColor: colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
        alignSelf: 'center',
        marginBottom: 20,
        overflow: 'hidden',
    },
    pickedImage: {
        width: '100%',
        height: '100%',
    },
    imagePickerPlaceholder: {
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
    },
    imagePickerText: {
        fontFamily: fonts.bodyMedium,
        fontSize: 11,
        color: colors.textFaint,
    },
    modalActions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: 12,
        marginTop: 24,
    },
});

import React, { useEffect, useRef, useState } from 'react';
import imageCompression from 'browser-image-compression';
import {
    Plus, Pencil, Trash2, Copy, X, ShoppingBag, Loader2, ImagePlus, PackageOpen,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { productService, Product, ProductType, PRODUCT_TYPE_OPTIONS, isBookingProductType } from '../../services/product.service';
import { StepFooter, ErrorBanner, PrimaryButton, GhostButton, Toggle, TextField } from './ui';
import { ProductTypeSelect } from './ProductTypeSelect';

const typeLabel = (t?: ProductType) =>
    PRODUCT_TYPE_OPTIONS.find(o => o.value === (t || 'PRODUCT'))?.label || 'Product';

interface Props {
    organizationId: string;
    storeCategories: string[];
    onBack: () => void;
    onContinue: (productCount: number) => void;
    saving: boolean;
}

/** Step 7 — build the store: add, edit, duplicate and delete listings. */
export const StepProducts: React.FC<Props> = ({ organizationId, storeCategories, onBack, onContinue, saving }) => {
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [modalProduct, setModalProduct] = useState<Partial<Product> | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);

    useEffect(() => {
        productService.getProducts()
            .then(setProducts)
            .catch(() => setError('Failed to load your products. Please refresh.'))
            .finally(() => setLoading(false));
    }, []);

    const handleSaved = (saved: Product, isNew: boolean) => {
        setProducts(prev => isNew ? [...prev, saved] : prev.map(p => p.id === saved.id ? saved : p));
        setModalProduct(null);
    };

    const handleDelete = async (product: Product) => {
        setBusyId(product.id);
        setError(null);
        // Optimistic removal; restore on failure.
        setProducts(prev => prev.filter(p => p.id !== product.id));
        try {
            await productService.deleteProduct(product.id);
        } catch (err: any) {
            setProducts(prev => [...prev, product]);
            setError(err.message || 'Failed to delete the listing.');
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
            setError(err.message || 'Failed to duplicate the listing.');
        } finally {
            setBusyId(null);
        }
    };

    return (
        <div>
            <ErrorBanner message={error} />

            {loading ? (
                <div className="flex justify-center py-16">
                    <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
                </div>
            ) : products.length === 0 ? (
                <button
                    type="button"
                    onClick={() => setModalProduct({})}
                    className="w-full rounded-3xl border-2 border-dashed border-gray-200 p-12 flex flex-col items-center text-center hover:border-blue-600/60 hover:bg-gray-50 transition-all focus:outline-none focus:ring-2 focus:ring-blue-600/30"
                >
                    <div className="w-20 h-20 rounded-3xl bg-blue-50 flex items-center justify-center mb-5">
                        <PackageOpen className="h-10 w-10 text-blue-600" />
                    </div>
                    <p className="text-base font-bold text-gray-800">Your store is empty</p>
                    <p className="mt-1 text-sm text-gray-400 max-w-xs">
                        Add your first product or service and it will show up here.
                    </p>
                    <span className="mt-6 inline-flex items-center gap-2 py-3 px-6 rounded-full bg-black text-white text-sm font-semibold">
                        <Plus className="h-4 w-4" />
                        Add your first listing
                    </span>
                </button>
            ) : (
                <>
                    <ul className="space-y-3">
                        {products.map(product => (
                            <li
                                key={product.id}
                                className="flex items-center gap-4 p-3 bg-white border border-gray-100 rounded-2xl hover:shadow-sm transition-shadow mw-anim"
                                style={{ animation: 'mw-fade-up 0.25s ease-out both' }}
                            >
                                <div className="w-16 h-16 rounded-xl overflow-hidden bg-gray-50 flex-shrink-0 flex items-center justify-center">
                                    {product.image_url ? (
                                        <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                                    ) : (
                                        <ShoppingBag className="h-6 w-6 text-gray-300" />
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold text-gray-800 text-sm truncate">{product.name}</span>
                                        {!product.is_active && (
                                            <span className="text-[10px] font-bold uppercase px-2 py-0.5 bg-gray-100 text-gray-400 rounded-full">Hidden</span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400">
                                        <span className="font-bold text-blue-700">
                                            K {Number(product.price).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </span>
                                        {product.category && <>· <span className="truncate">{product.category}</span></>}
                                        <span>· {typeLabel(product.product_type)}</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1">
                                    {busyId === product.id ? (
                                        <Loader2 className="h-4 w-4 text-gray-400 animate-spin mx-2" />
                                    ) : (
                                        <>
                                            <button
                                                onClick={() => setModalProduct(product)}
                                                aria-label={`Edit ${product.name}`}
                                                title="Edit"
                                                className="p-2.5 rounded-xl text-gray-400 hover:text-blue-700 hover:bg-blue-50 transition-colors"
                                            >
                                                <Pencil className="h-4 w-4" />
                                            </button>
                                            <button
                                                onClick={() => handleDuplicate(product)}
                                                aria-label={`Duplicate ${product.name}`}
                                                title="Duplicate"
                                                className="p-2.5 rounded-xl text-gray-400 hover:text-blue-700 hover:bg-blue-50 transition-colors"
                                            >
                                                <Copy className="h-4 w-4" />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(product)}
                                                aria-label={`Delete ${product.name}`}
                                                title="Delete"
                                                className="p-2.5 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </>
                                    )}
                                </div>
                            </li>
                        ))}
                    </ul>

                    <button
                        type="button"
                        onClick={() => setModalProduct({})}
                        className="mt-4 w-full py-4 rounded-2xl border-2 border-dashed border-gray-200 text-sm font-bold text-gray-400 hover:text-blue-700 hover:border-blue-600/50 transition-all flex items-center justify-center gap-2"
                    >
                        <Plus className="h-4 w-4" />
                        Add another listing
                    </button>
                </>
            )}

            {modalProduct !== null && (
                <ProductModal
                    organizationId={organizationId}
                    storeCategories={storeCategories}
                    product={modalProduct}
                    onClose={() => setModalProduct(null)}
                    onSaved={handleSaved}
                />
            )}

            <StepFooter
                onBack={onBack}
                loading={saving}
                continueLabel={products.length === 0 ? 'Skip for now' : 'Continue'}
                onContinue={() => onContinue(products.length)}
            />
        </div>
    );
};

// ── Add / edit modal ──────────────────────────────────────────────────────────

const ProductModal: React.FC<{
    organizationId: string;
    storeCategories: string[];
    product: Partial<Product>;
    onClose: () => void;
    onSaved: (product: Product, isNew: boolean) => void;
}> = ({ organizationId, storeCategories, product, onClose, onSaved }) => {
    const isNew = !product.id;
    const [form, setForm] = useState({
        name: product.name || '',
        description: product.description || '',
        category: product.category || '',
        price: product.price != null ? String(product.price) : '',
        image_url: product.image_url || null as string | null,
        product_type: (product.product_type || 'PRODUCT') as ProductType,
        is_active: product.is_active !== false,
    });
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [savingProduct, setSavingProduct] = useState(false);
    const [uploadingImage, setUploadingImage] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const dialogRef = useRef<HTMLDivElement>(null);

    // Close on Escape.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    const isDonation = form.product_type === 'DONATION';

    const uploadImage = async (file: File) => {
        setUploadingImage(true);
        setError(null);
        try {
            const compressed = await imageCompression(file, {
                maxSizeMB: 0.5, maxWidthOrHeight: 1024, useWebWorker: true,
            }).catch(() => file);
            const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
            const path = `${organizationId}/product-${Date.now()}.${ext}`;
            const { data, error: uploadError } = await supabase.storage
                .from('product-images')
                .upload(path, compressed, { cacheControl: '3600', upsert: true });
            if (uploadError) throw uploadError;
            const url = supabase.storage.from('product-images').getPublicUrl(data.path).data.publicUrl;
            setForm(f => ({ ...f, image_url: url }));
        } catch (err: any) {
            setError(err.message || 'Image upload failed.');
        } finally {
            setUploadingImage(false);
        }
    };

    const isVariable = form.product_type === 'SERVICE_VARIABLE';
    const isBooking = isBookingProductType(form.product_type);
    const isDailyBooking = form.product_type === 'SERVICE_BOOKING_DAILY';
    const priceRequired = !isDonation && !isVariable;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const next: Record<string, string> = {};
        if (!form.name.trim()) next.name = 'Give this listing a name';
        let price = 0;
        if (!isDonation) {
            price = Number(form.price || 0);
            if (isNaN(price) || price < 0) next.price = 'Enter a valid selling price';
            else if (priceRequired && form.price === '') next.price = 'Enter a selling price';
        }
        setErrors(next);
        if (Object.keys(next).length > 0) return;

        setSavingProduct(true);
        setError(null);
        try {
            const payload: Partial<Product> = {
                name: form.name.trim(),
                description: form.description.trim() || undefined,
                category: form.category || null,
                price,
                image_url: form.image_url,
                product_type: form.product_type,
                is_active: form.is_active,
            };
            const saved = isNew
                ? await productService.createProduct(payload)
                : await productService.updateProduct(product.id!, payload);
            onSaved(saved, isNew);
        } catch (err: any) {
            setError(err.response?.data?.error || err.message || 'Failed to save the listing.');
        } finally {
            setSavingProduct(false);
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center sm:p-4"
            role="dialog"
            aria-modal="true"
            aria-label={isNew ? 'Add listing' : 'Edit listing'}
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div
                ref={dialogRef}
                className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-lg max-h-[92vh] overflow-y-auto p-6 sm:p-8 mw-anim"
                style={{ animation: 'mw-fade-up 0.25s ease-out both' }}
            >
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-lg font-bold text-gray-800">
                        {isNew ? 'Add a listing' : 'Edit listing'}
                    </h2>
                    <button onClick={onClose} aria-label="Close" className="p-2 rounded-full text-gray-400 hover:bg-gray-100 transition-colors">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <ErrorBanner message={error} />

                <form onSubmit={handleSubmit} noValidate className="space-y-5">
                    {/* Image */}
                    <button
                        type="button"
                        onClick={() => fileRef.current?.click()}
                        aria-label="Upload product image"
                        className="relative w-24 h-24 rounded-2xl bg-gray-50 border border-gray-200 flex items-center justify-center overflow-hidden hover:border-blue-600/50 transition-colors"
                    >
                        {uploadingImage ? (
                            <Loader2 className="h-6 w-6 text-blue-600 animate-spin" />
                        ) : form.image_url ? (
                            <img src={form.image_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                            <ImagePlus className="h-6 w-6 text-gray-300" />
                        )}
                    </button>
                    <input
                        ref={fileRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) uploadImage(file);
                            e.target.value = '';
                        }}
                    />

                    <TextField
                        label="Name"
                        placeholder="e.g. Men's Sneakers"
                        value={form.name}
                        onChange={(e) => { setForm(f => ({ ...f, name: e.target.value })); setErrors(({ name: _, ...r }) => r); }}
                        error={errors.name}
                    />

                    <div>
                        <label htmlFor="product-desc" className="block text-sm font-bold text-gray-800 mb-1">
                            Description <span className="ml-1.5 text-xs font-medium text-gray-400">Optional</span>
                        </label>
                        <textarea
                            id="product-desc"
                            rows={2}
                            placeholder="A short description customers will see"
                            value={form.description}
                            onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                            className="appearance-none block w-full px-4 py-3 border border-gray-200 rounded-2xl bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 text-sm transition-all resize-none"
                        />
                    </div>

                    {/* Type — same options used in Settings > Products */}
                    <ProductTypeSelect
                        value={form.product_type}
                        onChange={(product_type) => setForm(f => ({ ...f, product_type }))}
                    />

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="product-category" className="block text-sm font-bold text-gray-800 mb-1">Category</label>
                            <select
                                id="product-category"
                                value={form.category}
                                onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))}
                                className="block w-full px-4 py-3 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 text-sm transition-all bg-white"
                            >
                                <option value="">No category</option>
                                {storeCategories.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        {!isDonation && (
                            <div>
                                <label htmlFor="product-price" className="block text-sm font-bold text-gray-800 mb-1">
                                    {isBooking ? `Price per ${isDailyBooking ? 'day' : 'night'}` : isVariable ? 'Default / quoted price' : 'Selling Price'}
                                </label>
                                <div className="relative">
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-gray-400">ZMW</span>
                                    <input
                                        id="product-price"
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        inputMode="decimal"
                                        placeholder="0.00"
                                        value={form.price}
                                        onChange={(e) => { setForm(f => ({ ...f, price: e.target.value })); setErrors(({ price: _, ...r }) => r); }}
                                        className={`appearance-none block w-full pl-14 pr-4 py-3 border rounded-2xl bg-white placeholder-gray-400 focus:outline-none focus:ring-2 text-sm transition-all ${
                                            errors.price ? 'border-red-300 focus:ring-red-100' : 'border-gray-200 focus:ring-blue-600/20 focus:border-blue-600'
                                        }`}
                                    />
                                </div>
                                {errors.price && <p className="mt-1.5 text-xs font-bold text-red-600">{errors.price}</p>}
                                {isVariable && <p className="mt-1.5 text-xs text-gray-400">You'll confirm the final amount when sharing a link.</p>}
                            </div>
                        )}
                    </div>

                    <div className="pt-1 border-t border-gray-100">
                        <Toggle
                            label="Active"
                            description="Visible on your payment page"
                            checked={form.is_active}
                            onChange={(v) => setForm(f => ({ ...f, is_active: v }))}
                        />
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                        <GhostButton onClick={onClose} className="!min-h-0 !py-2.5 !px-4 !text-sm">Cancel</GhostButton>
                        <PrimaryButton type="submit" loading={savingProduct} disabled={uploadingImage} className="!min-h-0 !py-2.5 !px-5 !text-sm">
                            {isNew ? 'Add listing' : 'Save changes'}
                        </PrimaryButton>
                    </div>
                </form>
            </div>
        </div>
    );
};

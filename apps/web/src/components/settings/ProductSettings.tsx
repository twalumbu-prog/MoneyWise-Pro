import React, { useState, useEffect } from 'react';
import { productService, Product, ProductType, PRODUCT_TYPE_OPTIONS, isBookingProductType, DigitalAsset, CheckoutField, AppointmentConfig, DEFAULT_APPOINTMENT_CONFIG } from '../../services/product.service';
import { accountService } from '../../services/account.service';
import { cashbookService } from '../../services/cashbook.service';
import { masterFeesService, MasterFeesStatus, MasterFeesCategory } from '../../services/integration.service';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { StoreAdvancedSettings } from './StoreAdvancedSettings';
import { ProductList, canAuction } from './ProductList';
import type { AuctionInfo } from './ProductList';
import { StartAuctionDialog } from '../marketplace/StartAuctionDialog';
import { AuctionFields, auctionBody, auctionProblem, defaultAuction } from '../marketplace/AuctionFields';
import type { AuctionForm } from '../marketplace/AuctionFields';
import { useQuery } from '@tanstack/react-query';
import { apiJson } from 'core';
import { LISTINGS_KEY } from '../marketplace/parts';
import { CatalogPicker } from '../marketplace/CatalogPicker';
import type { MarketplaceData } from '../marketplace/parts';
import { compressImage } from '../../utils/file_utils';
import ShareProductLinkModal from '../ShareProductLinkModal';
import {
    ShoppingBag,
    Plus,
    Trash2,
    Loader2,
    CheckCircle,
    AlertCircle,
    X,
    Eye,
    ImagePlus,
    Wallet,
    BookOpen,
    FileUp,
    FileText,
    GraduationCap,
    RefreshCw,
    ArrowUpRight
} from 'lucide-react';

interface WalletOption { id: string; name: string; is_main?: boolean; }
interface AccountOption { id: string; code: string; name: string; type: string; }

interface ProductSettingsProps {
    onRequestAdd?: (openFn: () => void) => void;
}

export const ProductSettings: React.FC<ProductSettingsProps> = ({ onRequestAdd }) => {
    const [products, setProducts] = useState<Product[]>([]);
    const [wallets, setWallets] = useState<WalletOption[]>([]);
    const [incomeAccounts, setIncomeAccounts] = useState<AccountOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [uploadingImage, setUploadingImage] = useState(false);
    const [uploadingAsset, setUploadingAsset] = useState(false);
    // Digital-product files (kept separate from formData since they're an array of objects).
    const [digitalAssets, setDigitalAssets] = useState<DigitalAsset[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const { userRole, organizationId } = useAuth();
    const isAdmin = userRole === 'ADMIN';

    // Modal / Form state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [showMore, setShowMore] = useState(false);
    // Selling by auction: how this item is sold, and the auction details when it is.
    const [sellAs, setSellAs] = useState<'FIXED' | 'AUCTION'>('FIXED');
    const [auctionForm, setAuctionForm] = useState<AuctionForm>(() => defaultAuction(null));
    const [auctionFor, setAuctionFor] = useState<Product | null>(null);
    // Stock: whether to count it, how many, when to warn buyers, and the colours and sizes it comes in (each with its own count).
    const [trackStock, setTrackStock] = useState(false);
    const [stockQty, setStockQty] = useState('');
    const [lowStock, setLowStock] = useState('5');
    const [variantRows, setVariantRows] = useState<{ id?: string; color: string; size: string; stock: string }[]>([]);
    const stockTotal = variantRows.length ? variantRows.reduce((n, v) => n + (Number(v.stock) || 0), 0) : Number(stockQty) || 0;
    const { data: market, refetch: refetchMarket } = useQuery({ queryKey: LISTINGS_KEY, queryFn: () => apiJson<MarketplaceData>('/marketplace/listings'), staleTime: 60_000, enabled: isAdmin });
    const onMarketplace = React.useMemo(() => new Set((market?.listings ?? []).filter((l) => l.isMine).map((l) => l.id)), [market]);
    const auctionMap = React.useMemo(() => new Map<string, AuctionInfo>((market?.listings ?? []).filter((l) => l.isMine && l.auction).map((l) => [l.id, { id: l.auction!.id, status: l.auction!.status as 'OPEN' | 'SOLD', endsAt: l.auction!.endsAt, serverNow: l.auction!.serverNow, bidCount: l.auction!.bidCount, currentBid: l.auction!.status === 'SOLD' ? l.auction!.winningAmount : l.auction!.currentBid, startPrice: l.auction!.startPrice }])), [market]);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        price: '',
        product_type: 'PRODUCT' as ProductType,
        wallet_id: '',
        income_account_id: '',
        image_url: '',
        category: '',
        catalog_item_id: '',
        is_active: true,
        marketplace_listed: true,
        requires_delivery: false,
        allow_external_delivery: false,
        own_delivery_charge: '',
        weight_kg: '',
        parcel_size: '',
    });
    // Additional gallery images (ordered list of public URLs)
    const [additionalImages, setAdditionalImages] = useState<string[]>([]);
    const [uploadingAdditionalImage, setUploadingAdditionalImage] = useState(false);
    // "What's Included" bullet list
    const [whatsIncluded, setWhatsIncluded] = useState<string[]>([]);
    // Customer-information fields shown on the store's own info page before payment.
    // `optionsText` is the raw comma-separated input for select fields (parsed on save).
    type UiCheckoutField = CheckoutField & { optionsText?: string };
    const [checkoutFields, setCheckoutFields] = useState<UiCheckoutField[]>([]);
    const [collectInfo, setCollectInfo] = useState(false);
    const [apptConfig, setApptConfig] = useState<AppointmentConfig>(DEFAULT_APPOINTMENT_CONFIG);
    const newFieldId = () => `f_${Math.random().toString(36).slice(2, 9)}`;
    const addCheckoutField = (preset: 'name' | 'email' | 'size' | 'custom') => {
        const f: UiCheckoutField =
            preset === 'name' ? { id: newFieldId(), label: 'Full name', type: 'text', required: true }
            : preset === 'email' ? { id: newFieldId(), label: 'Email address', type: 'text', required: true }
            : preset === 'size' ? { id: newFieldId(), label: 'Size', type: 'select', required: true, options: ['S', 'M', 'L'], optionsText: 'S, M, L' }
            : { id: newFieldId(), label: '', type: 'text', required: true };
        setCheckoutFields(prev => [...prev, f]);
    };
    const updateCheckoutField = (id: string, patch: Partial<UiCheckoutField>) =>
        setCheckoutFields(prev => prev.map(f => f.id === id ? { ...f, ...patch } : f));

    // Share-link modal state
    const [shareProduct, setShareProduct] = useState<Product | null>(null);
    const [activeTab, setActiveTab] = useState('ALL');
    // Master Fees tab state — a separate synced product/service source, not part
    // of the local `products` catalog.
    const [mfStatus, setMfStatus] = useState<MasterFeesStatus | null>(null);
    const [mfCategories, setMfCategories] = useState<MasterFeesCategory[]>([]);
    const [mfLoading, setMfLoading] = useState(false);
    const [mfSyncing, setMfSyncing] = useState(false);
    const [mfLoaded, setMfLoaded] = useState(false);
    const [mfLogoFailed, setMfLogoFailed] = useState(false);
    // Whether this org has an active Master Fees integration — controls tab visibility.
    // null = still checking (hide tab until confirmed), true/false = resolved.
    const [mfConnected, setMfConnected] = useState<boolean | null>(null);

    useEffect(() => {
        loadProducts();
        loadMappingOptions();
        // Check MF connection status eagerly so we know whether to show the tab at all.
        masterFeesService.getStatus()
            .then(s => setMfConnected(s.connected))
            .catch(() => setMfConnected(false));
    }, []);

    useEffect(() => {
        if (activeTab === 'MASTERFEES' && !mfLoaded) {
            loadMasterFeesTab();
        }
    }, [activeTab]);

    const loadMasterFeesTab = async () => {
        try {
            setMfLoading(true);
            const status = await masterFeesService.getStatus();
            setMfStatus(status);
            if (status.connected) {
                setMfCategories(await masterFeesService.getFeeCategories().catch(() => []));
            }
        } catch (err) {
            console.error('Failed to load Master Fees data:', err);
        } finally {
            setMfLoading(false);
            setMfLoaded(true);
        }
    };

    const handleMasterFeesSync = async () => {
        try {
            setMfSyncing(true);
            setError(null);
            await masterFeesService.sync();
            const [status, cats] = await Promise.all([
                masterFeesService.getStatus(),
                masterFeesService.getFeeCategories().catch(() => []),
            ]);
            setMfStatus(status);
            setMfCategories(cats);
        } catch (err: any) {
            setError(err.message || 'Failed to sync Master Fees');
        } finally {
            setMfSyncing(false);
        }
    };

    const loadProducts = async () => {
        try {
            setLoading(true);
            setError(null);
            const data = await productService.getProducts();
            setProducts(data);
        } catch (err: any) {
            console.error('Failed to load products:', err);
            setError('Failed to load products and services.');
        } finally {
            setLoading(false);
        }
    };

    const loadMappingOptions = async () => {
        try {
            const [walletData, accountData] = await Promise.all([
                cashbookService.getWallets().catch(() => []),
                accountService.getAll().catch(() => [])
            ]);
            setWallets(Array.isArray(walletData) ? walletData : []);
            setIncomeAccounts(
                (Array.isArray(accountData) ? accountData : []).filter((a: AccountOption) => a.type === 'INCOME')
            );
        } catch (err) {
            console.error('Failed to load wallet/account mapping options:', err);
        }
    };

    const handleOpenAddModal = () => {
        setSellAs('FIXED'); setAuctionForm(defaultAuction(null));
        setTrackStock(false); setStockQty(''); setLowStock('5'); setVariantRows([]);
        setEditingProduct(null);
        setAdditionalImages([]);
        setWhatsIncluded([]);
        setCheckoutFields([]);
        setCollectInfo(false);
        setFormData({
            name: '',
            description: '',
            price: '',
            product_type: 'PRODUCT',
            wallet_id: '',
            income_account_id: '',
            image_url: '',
            category: '',
            catalog_item_id: '',
            is_active: true,
            marketplace_listed: true,
            requires_delivery: false,
            allow_external_delivery: false,
            own_delivery_charge: '',
        weight_kg: '',
        parcel_size: '',
        });
        setDigitalAssets([]);
        setApptConfig(DEFAULT_APPOINTMENT_CONFIG);
        setError(null);
        setIsModalOpen(true);
    };

    // Expose opener to parent for mobile header button
    React.useEffect(() => {
        if (onRequestAdd) onRequestAdd(handleOpenAddModal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [onRequestAdd]);

    const handleOpenEditModal = (product: Product) => {
        setSellAs('FIXED'); setAuctionForm(defaultAuction(product.price));
        {
            const sp = product as any;
            setTrackStock(!!sp.track_stock); setStockQty(sp.stock_quantity != null ? String(sp.stock_quantity) : ''); setLowStock(String(sp.low_stock_threshold ?? 5));
            setVariantRows(Array.isArray(sp.variants) ? sp.variants.map((v: any) => ({ id: v.id, color: v.color ?? '', size: v.size ?? '', stock: String(v.stock ?? 0) })) : []);
        }
        setEditingProduct(product);
        setDigitalAssets(Array.isArray(product.digital_assets) ? product.digital_assets : []);
        setAdditionalImages(Array.isArray(product.additional_images) ? product.additional_images : []);
        setWhatsIncluded(Array.isArray(product.whats_included) ? product.whats_included : []);
        const existingFields = Array.isArray(product.checkout_fields) ? product.checkout_fields : [];
        setCheckoutFields(existingFields.map(f => ({ ...f, optionsText: (f.options || []).join(', ') })));
        setCollectInfo(existingFields.length > 0);
        setApptConfig(product.appointment_config ? { ...DEFAULT_APPOINTMENT_CONFIG, ...product.appointment_config } : DEFAULT_APPOINTMENT_CONFIG);
        setFormData({
            name: product.name,
            description: product.description || '',
            price: product.price?.toString() ?? '',
            product_type: product.product_type || 'PRODUCT',
            wallet_id: product.wallet_id || '',
            income_account_id: product.income_account_id || '',
            image_url: product.image_url || '',
            category: product.category || '',
            catalog_item_id: (product as any).catalog_item_id || '',
            is_active: product.is_active,
            marketplace_listed: product.marketplace_listed ?? false,
            requires_delivery: product.requires_delivery ?? false,
            allow_external_delivery: product.allow_external_delivery ?? false,
            own_delivery_charge: product.own_delivery_charge?.toString() ?? '',
            weight_kg: (product as any).weight_kg?.toString() ?? '',
            parcel_size: (product as any).parcel_size ?? '',
        });
        setError(null);
        setIsModalOpen(true);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleUploadImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !isAdmin) return;

        try {
            setUploadingImage(true);
            setError(null);

            // Product images only ever render as small thumbnails on the portal —
            // compress/resize aggressively so they load instantly instead of pulling
            // multi-megabyte full-resolution photos. Outputs JPEG.
            const compressed = await compressImage(file, { maxSizeMB: 0.3, maxWidthOrHeight: 1000, initialQuality: 0.72 });
            const folder = organizationId || 'shared';
            const filePath = `${folder}/product-${Date.now()}.jpg`;

            const { data: uploadData, error: uploadError } = await supabase.storage
                .from('product-images')
                // Long cache: filenames are unique per upload, so they never go stale.
                .upload(filePath, compressed, { cacheControl: '31536000', upsert: true, contentType: 'image/jpeg' });

            if (uploadError) throw uploadError;

            const publicUrl = supabase.storage
                .from('product-images')
                .getPublicUrl(uploadData.path).data.publicUrl;

            setFormData(prev => ({ ...prev, image_url: publicUrl }));
        } catch (err: any) {
            console.error('Image upload failed:', err);
            setError(err.message || 'Failed to upload image.');
        } finally {
            setUploadingImage(false);
        }
    };

    // Upload one or more extra gallery photos (choose several at once) and append their public URLs to additionalImages.
    const MAX_GALLERY_IMAGES = 10;
    const handleUploadAdditionalImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files ?? []);
        e.target.value = '';
        if (files.length === 0 || !isAdmin) return;
        const room = MAX_GALLERY_IMAGES - additionalImages.length;
        if (room <= 0) { setError(`A listing can have up to ${MAX_GALLERY_IMAGES} extra photos.`); return; }
        try {
            setUploadingAdditionalImage(true);
            setError(null);
            const folder = organizationId || 'shared';
            const urls: string[] = [];
            for (const [i, file] of files.slice(0, room).entries()) {
                const compressed = await compressImage(file, { maxSizeMB: 0.3, maxWidthOrHeight: 1000, initialQuality: 0.72 });
                const filePath = `${folder}/product-gallery-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}.jpg`;
                const { data: uploadData, error: uploadError } = await supabase.storage
                    .from('product-images')
                    .upload(filePath, compressed, { cacheControl: '31536000', upsert: true, contentType: 'image/jpeg' });
                if (uploadError) throw uploadError;
                urls.push(supabase.storage.from('product-images').getPublicUrl(uploadData.path).data.publicUrl);
            }
            setAdditionalImages(prev => [...prev, ...urls]);
            if (files.length > room) setError(`Only ${room} more photo${room === 1 ? '' : 's'} fitted: a listing can have up to ${MAX_GALLERY_IMAGES} extra photos.`);
        } catch (err: any) {
            console.error('Gallery image upload failed:', err);
            setError(err.message || 'Failed to upload gallery image.');
        } finally {
            setUploadingAdditionalImage(false);
        }
    };

    // Upload one or more digital-product files to the PRIVATE product-assets bucket.
    // Unlike images these are not compressed and never get a public URL — only the
    // object path is stored; the API fetches them server-side for email delivery.
    const handleUploadAssets = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0 || !isAdmin) return;

        try {
            setUploadingAsset(true);
            setError(null);
            const folder = organizationId || 'shared';
            const uploaded: DigitalAsset[] = [];

            for (const file of Array.from(files)) {
                const safeName = file.name.replace(/[^\w.\-]+/g, '_');
                const filePath = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;
                const { data, error: uploadError } = await supabase.storage
                    .from('product-assets')
                    .upload(filePath, file, { upsert: false, contentType: file.type || 'application/octet-stream' });
                if (uploadError) throw uploadError;
                uploaded.push({
                    name: file.name,
                    path: data.path,
                    size: file.size,
                    content_type: file.type || undefined,
                });
            }
            setDigitalAssets(prev => [...prev, ...uploaded]);
        } catch (err: any) {
            console.error('Digital asset upload failed:', err);
            setError(err.message || 'Failed to upload file.');
        } finally {
            setUploadingAsset(false);
            e.target.value = ''; // allow re-selecting the same file
        }
    };

    const handleRemoveAsset = (path: string) => {
        // Only drops it from this product's asset list; the stored object is left
        // in the bucket (harmless, and other products could theoretically reuse it).
        setDigitalAssets(prev => prev.filter(a => a.path !== path));
    };

    const formatBytes = (n?: number): string => {
        if (!n || n <= 0) return '';
        if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
        return `${(n / (1024 * 1024)).toFixed(1)} MB`;
    };

    const isDonation = formData.product_type === 'DONATION';
    const isVariable = formData.product_type === 'SERVICE_VARIABLE';
    const isDigital = formData.product_type === 'DIGITAL';
    const isBooking = isBookingProductType(formData.product_type);
    const isDailyBooking = formData.product_type === 'SERVICE_BOOKING_DAILY';
    const isAppointment = formData.product_type === 'SERVICE_APPOINTMENT';
    const priceRequired = !isDonation && !isVariable;
    // Delivery only makes sense for tangible physical products
    const canHaveDelivery = formData.product_type === 'PRODUCT';
    // Listing on the Marketplace asks for the full set of details; otherwise the form stays simple. An item that already has the extras
    // keeps showing them, so editing never hides what was saved.
    const hasExtras = !!(additionalImages.length || whatsIncluded.some((w) => w.trim()) || collectInfo || formData.requires_delivery || formData.parcel_size || formData.weight_kg);
    const full = formData.marketplace_listed || showMore || hasExtras;
    useEffect(() => { if (!isModalOpen) setShowMore(false); }, [isModalOpen]);

    // Existing categories across the catalog — offered as suggestions so admins
    // reuse consistent names (these drive the toggle tabs on the public portal).
    const existingCategories = Array.from(
        new Set(products.map(p => (p.category || '').trim()).filter(Boolean))
    ).sort();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!isAdmin) return;

        if (!formData.name.trim()) {
            setError('Product name is required.');
            return;
        }

        let priceNum = 0;
        if (!isDonation) {
            priceNum = Number(formData.price || 0);
            if (isNaN(priceNum) || priceNum < 0) {
                setError('Please enter a valid price (greater than or equal to 0).');
                return;
            }
            if (priceRequired && formData.price === '') {
                setError('Please enter a price for this product/service.');
                return;
            }
        }

        if (sellAs === 'AUCTION' && canAuction({ product_type: formData.product_type }) && !(editingProduct && auctionMap.get(editingProduct.id)?.status === 'OPEN')) {
            const problem = auctionProblem(auctionForm);
            if (problem) { setError(problem); return; }
        }

        if (isDigital && digitalAssets.length === 0) {
            setError('Please upload at least one file for this digital product.');
            return;
        }

        const cleanedCheckoutFields: CheckoutField[] = checkoutFields
            .map(({ optionsText, ...f }) => ({
                ...f,
                label: f.label.trim(),
                ...(f.type === 'select'
                    ? { options: (optionsText ?? (f.options || []).join(',')).split(',').map(o => o.trim()).filter(Boolean) }
                    : {}),
            }))
            .filter(f => f.label);
        if (collectInfo) {
            if (cleanedCheckoutFields.length === 0) {
                setError('Add at least one information field, or switch "Collect customer information" off.');
                return;
            }
            const badSelect = cleanedCheckoutFields.find(f => f.type === 'select' && (!f.options || f.options.length === 0));
            if (badSelect) {
                setError(`"${badSelect.label}" needs at least one option (separate options with commas).`);
                return;
            }
        }

        if (isAppointment) {
            const open = Object.entries(apptConfig.hours);
            if (open.length === 0) { setError('Choose at least one opening day for appointments.'); return; }
            const bad = open.find(([, h]) => !h.start || !h.end || h.end <= h.start);
            if (bad) { setError('Each opening day needs a closing time after its opening time.'); return; }
            if (apptConfig.slot_interval_minutes < 5 || apptConfig.duration_minutes < 5) { setError('Service length and slot spacing must be at least 5 minutes.'); return; }
        }

        try {
            setSubmitting(true);
            setError(null);
            setSuccessMessage(null);

            const payload = {
                name: formData.name.trim(),
                description: formData.description.trim() || undefined,
                price: priceNum,
                product_type: formData.product_type,
                wallet_id: formData.wallet_id || null,
                income_account_id: formData.income_account_id || null,
                image_url: formData.image_url || null,
                category: formData.category.trim() || null,
                catalog_item_id: formData.catalog_item_id || null,
                digital_assets: isDigital ? digitalAssets : null,
                is_active: formData.is_active,
                marketplace_listed: formData.marketplace_listed,
                requires_delivery: formData.requires_delivery,
                allow_external_delivery: formData.allow_external_delivery,
                own_delivery_charge: Number(formData.own_delivery_charge) || 0,
                // Sent only when set (or when clearing a value that was saved), so saving works before these columns exist.
                ...(formData.weight_kg || (editingProduct as any)?.weight_kg ? { weight_kg: Number(formData.weight_kg) || null } : {}),
                ...(formData.parcel_size || (editingProduct as any)?.parcel_size ? { parcel_size: formData.parcel_size || null } : {}),
                ...(trackStock || (editingProduct as any)?.track_stock ? {
                    track_stock: trackStock, stock_quantity: Number(stockQty) || 0, low_stock_threshold: Math.max(0, Number(lowStock) || 0),
                    variants: trackStock ? variantRows.filter((v) => v.color.trim() || v.size.trim()).map((v) => ({ id: v.id, color: v.color.trim(), size: v.size.trim(), stock: Number(v.stock) || 0 })) : [],
                } : {}),
                additional_images: additionalImages,
                whats_included: whatsIncluded.filter(s => s.trim()),
                checkout_fields: collectInfo ? cleanedCheckoutFields : [],
                appointment_config: isAppointment ? apptConfig : null,
            };

            let savedId = editingProduct?.id ?? '';
            if (editingProduct) {
                await productService.updateProduct(editingProduct.id, payload);
                setSuccessMessage('Product updated successfully.');
            } else {
                const created = await productService.createProduct(payload);
                savedId = (created as any)?.id ?? (created as any)?.product?.id ?? '';
                setSuccessMessage('Product created successfully.');
            }

            // Selling by auction: the item is saved first, then the auction starts.
            const wantsAuction = sellAs === 'AUCTION' && canAuction({ product_type: formData.product_type }) && !(editingProduct && auctionMap.get(editingProduct.id)?.status === 'OPEN');
            if (wantsAuction) {
                if (!savedId) throw new Error('The item was saved but the auction could not be started. Use the Auction button on the item.');
                try {
                    await apiJson('/marketplace/auctions', { method: 'POST', body: JSON.stringify(auctionBody(savedId, auctionForm)) });
                    setSuccessMessage('Saved, and the auction is live.');
                } catch (auctionErr: any) {
                    setIsModalOpen(false);
                    loadProducts();
                    throw new Error(`Saved, but the auction didn’t start: ${auctionErr?.message || 'try the Auction button on the item.'}`);
                }
            }
            refetchMarket();

            setIsModalOpen(false);
            loadProducts();
            setTimeout(() => setSuccessMessage(null), 3000);
        } catch (err: any) {
            console.error('Failed to save product:', err);
            setError(err.response?.data?.error || err.message || 'Failed to save product.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleToggleActive = async (product: Product, active: boolean) => {
        if (!isAdmin) return;
        try {
            setError(null);
            await productService.updateProduct(product.id, { is_active: active });
            await loadProducts();
        } catch (err: any) {
            setError(err.response?.data?.error || err.message || 'Could not change that item.');
        }
    };

    const handleDelete = async (id: string, name: string) => {
        if (!isAdmin) return;
        const confirmed = window.confirm(`Are you sure you want to permanently delete "${name}"?`);
        if (!confirmed) return;

        try {
            setLoading(true);
            setError(null);
            await productService.deleteProduct(id);
            setSuccessMessage('Product deleted successfully.');
            loadProducts();
            setTimeout(() => setSuccessMessage(null), 3000);
        } catch (err: any) {
            console.error('Failed to delete product:', err);
            setError(err.response?.data?.error || err.message || 'Failed to delete product.');
            setLoading(false);
        }
    };

    const [downloadingId, setDownloadingId] = useState<string | null>(null);

    const handleDownloadSalesCSV = async (productId: string, productName: string) => {
        try {
            setDownloadingId(productId);
            setError(null);

            const sales = await productService.getProductSales(productId);

            if (!sales || sales.length === 0) {
                alert(`No sales have been logged yet for product/service "${productName}".`);
                return;
            }

            // Define headers
            const headers = ['Customer Name', 'Payment Date', 'Unique QR Code Number', 'Amount Paid (ZMW)'];

            // Format rows
            const rows = sales.map(sale => {
                const date = new Date(sale.created_at).toLocaleDateString() + ' ' +
                             new Date(sale.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const name = `"${sale.customer_name.replace(/"/g, '""')}"`;
                const ref = `"${sale.reference.replace(/"/g, '""')}"`;
                const amount = Number(sale.amount_paid).toFixed(2);

                return [name, date, ref, amount];
            });

            // Combine CSV
            const csvContent = [
                headers.join(','),
                ...rows.map(row => row.join(','))
            ].join('\n');

            // Trigger download
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            if (link.download !== undefined) {
                const url = URL.createObjectURL(blob);
                link.setAttribute('href', url);
                link.setAttribute('download', `${productName.toLowerCase().replace(/\s+/g, '_')}_sales.csv`);
                link.style.visibility = 'hidden';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }
        } catch (err: any) {
            console.error('Failed to download product sales CSV:', err);
            setError(err.response?.data?.error || err.message || 'Failed to download sales CSV.');
        } finally {
            setDownloadingId(null);
        }
    };

    if (loading && products.length === 0) {
        return (
            <div className="bg-white shadow-sm rounded-xl border border-gray-200 p-12 flex justify-center items-center">
                <Loader2 className="h-8 w-8 animate-spin text-[#0B57D0]" />
                <span className="ml-3 text-gray-500 font-medium">Loading products & services...</span>
            </div>
        );
    }

    return (
        <div className="flex-1 h-[calc(100vh-64px)] p-4 bg-gray-50 md:bg-transparent md:pt-0 flex flex-col justify-start items-start w-full overflow-hidden">
            <div className="self-stretch flex-1 flex justify-start items-start gap-2.5 w-full overflow-hidden">
                <div className="flex-1 h-full p-3.5 bg-white rounded-[20px] flex flex-col justify-start items-stretch gap-5 overflow-hidden shadow-sm w-full md:border md:border-gray-200 relative">
                    
                    {/* Header — desktop only; mobile header is the Layout top bar */}
                    <div className="hidden md:flex justify-between items-center shrink-0 w-full p-2">
                        <div className="flex justify-start items-center gap-2">
                            <ShoppingBag className="w-4 h-4 text-gray-900" />
                            <div className="justify-center text-[#1F1F1F] text-lg font-bold font-['DM_Sans'] leading-5">Products &amp; Services <span className="ml-2 text-xs font-normal text-[#5F6368]">Everything you sell, in one place. Turn on “List on the Marketplace” and choose Fixed price or Auction when you add or edit one.</span></div>
                        </div>
                    </div>

                    {/* Filters and Actions Row */}
                    <div className="flex justify-between items-center w-full shrink-0 px-2">
                        {/* Tabs */}
                        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                            {[
                                { value: 'ALL', label: 'All' },
                                { value: 'PRODUCT', label: 'Physical' },
                                { value: 'SERVICE', label: 'Services' },
                                { value: 'DIGITAL', label: 'Digital' },
                                { value: 'DONATION', label: 'Donations' },
                                ...(isAdmin ? [{ value: 'ADVANCED', label: 'Advanced' }] : []),
                                ...(mfConnected ? [{ value: 'MASTERFEES', label: 'Master Fees' }] : [])
                            ].map(tab => {
                                const isActive = activeTab === tab.value;
                                return (
                                    <button
                                        key={tab.value}
                                        onClick={() => setActiveTab(tab.value)}
                                        className={`h-9 px-4 rounded-full text-sm whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                                            isActive ? 'font-bold bg-[#D3E3FD] text-[#041E49]' : 'font-medium text-[#5F6368] shadow-[inset_0_0_0_1px_#C4C7C5] hover:bg-[#F1F3F4]'
                                        }`}
                                    >
                                        {tab.value === 'MASTERFEES' && (
                                            mfLogoFailed ? (
                                                <GraduationCap size={12} className="text-[#1F1F1F] flex-shrink-0" />
                                            ) : (
                                                <img
                                                    src="/masterfees-logo.png"
                                                    alt=""
                                                    className="w-3 h-3 object-contain rounded-sm flex-shrink-0"
                                                    onError={() => setMfLogoFailed(true)}
                                                />
                                            )
                                        )}
                                        {tab.label}
                                    </button>
                                );
                            })}
                        </div>

                        {activeTab === 'MASTERFEES' ? (
                            <div className="flex items-center gap-3 flex-shrink-0">
                                <a
                                    href="/settings?tab=integrations"
                                    className="text-xs font-bold text-gray-500 hover:text-gray-700 flex items-center gap-1"
                                >
                                    Manage in Settings
                                    <ArrowUpRight size={12} />
                                </a>
                                {mfStatus?.connected && (
                                    <button
                                        onClick={handleMasterFeesSync}
                                        disabled={mfSyncing}
                                        className="h-8 pl-4 pr-3 bg-brand-navy rounded-lg flex items-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
                                    >
                                        <span className="text-white text-xs font-bold">{mfSyncing ? 'Syncing…' : 'Sync Now'}</span>
                                        <RefreshCw size={14} className={`text-white ${mfSyncing ? 'animate-spin' : ''}`} />
                                    </button>
                                )}
                            </div>
                        ) : isAdmin && activeTab !== 'ADVANCED' && (
                            <button
                                onClick={handleOpenAddModal}
                                className="hidden md:flex h-10 pl-5 pr-4 bg-[#0B57D0] rounded-full items-center gap-2 hover:bg-[#0842A0] transition-colors flex-shrink-0"
                            >
                                <span className="text-white text-sm font-bold">Add item</span>
                                <Plus size={14} className="text-white" />
                            </button>
                        )}
                    </div>

                    {error && (
                        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 mx-2 rounded-xl text-sm animate-in fade-in slide-in-from-top-2 shrink-0 flex items-center">
                            <AlertCircle className="h-4 w-4 mr-2" />
                            {error}
                        </div>
                    )}
                    {successMessage && (
                        <div className="bg-green-50 border border-[#34A853] text-green-700 px-4 py-3 mx-2 rounded-xl text-sm animate-in fade-in slide-in-from-top-2 shrink-0 flex items-center">
                            <CheckCircle className="h-4 w-4 mr-2" />
                            {successMessage}
                        </div>
                    )}
                    {!isAdmin && (
                        <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 mx-2 rounded-xl text-sm flex items-start shrink-0">
                            <Eye className="h-5 w-5 mr-2 mt-0.5" />
                            <p>You are viewing this information in read-only mode because you are not an Administrator.</p>
                        </div>
                    )}

                    {/* Table Container */}
                    <div className="flex-1 overflow-auto rounded-xl outline outline-1 outline-offset-[-1px] outline-[#E9EEF6] custom-scrollbar mx-2 mb-2">
                        {activeTab === 'ADVANCED' ? (
                            <StoreAdvancedSettings />
                        ) : activeTab === 'MASTERFEES' ? (
                            (() => {
                                if (mfLoading) {
                                    return (
                                        <div className="flex flex-col items-center justify-center h-full py-16 text-center">
                                            <Loader2 className="h-8 w-8 text-[#0B57D0] animate-spin mb-4" />
                                            <p className="text-gray-500 text-sm">Loading Master Fees…</p>
                                        </div>
                                    );
                                }

                                if (!mfStatus?.connected) {
                                    return (
                                        <div className="flex flex-col items-center justify-center h-full py-16 text-center">
                                            <div className="h-16 w-16 bg-gray-50 rounded-full flex items-center justify-center mb-4 border border-gray-100">
                                                <GraduationCap className="h-8 w-8 text-gray-300" />
                                            </div>
                                            <h4 className="text-gray-900 font-bold mb-1">Master Fees isn't connected</h4>
                                            <p className="text-gray-500 text-sm max-w-sm mb-4">
                                                Connect Master Fees from Settings → Integrations to sync school fee categories, invoices and receivables here.
                                            </p>
                                            <a
                                                href="/settings?tab=integrations"
                                                className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand-navy text-white text-xs font-bold rounded-xl hover:opacity-90 transition-opacity"
                                            >
                                                Go to Integrations <ArrowUpRight size={14} />
                                            </a>
                                        </div>
                                    );
                                }

                                if (mfCategories.length === 0) {
                                    return (
                                        <div className="flex flex-col items-center justify-center h-full py-16 text-center">
                                            <div className="h-16 w-16 bg-gray-50 rounded-full flex items-center justify-center mb-4 border border-gray-100">
                                                <GraduationCap className="h-8 w-8 text-gray-300" />
                                            </div>
                                            <h4 className="text-gray-900 font-bold mb-1">No fee categories synced yet</h4>
                                            <p className="text-gray-500 text-sm max-w-sm">
                                                Run "Sync Now" to pull fee categories from Master Fees.
                                            </p>
                                        </div>
                                    );
                                }

                                const accountName = (id: string | null) =>
                                    id ? (incomeAccounts.find(a => a.id === id)?.name || 'Unmapped account') : null;

                                return (
                                    <table className="w-full text-left">
                                        <thead className="bg-white">
                                            <tr className="border-b border-[rgba(116,119,117,0.22)]">
                                                <th className="py-2.5 px-6 text-xs font-semibold text-[#1F1F1F]">Fee Category</th>
                                                <th className="py-2.5 px-3 text-xs font-semibold text-[#1F1F1F]">Price</th>
                                                <th className="py-2.5 px-3 text-xs font-semibold text-[#1F1F1F]">Type</th>
                                                <th className="py-2.5 px-3 text-xs font-semibold text-[#1F1F1F]">Income Account</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {mfCategories.map((cat) => (
                                                <tr key={cat.id} className="group transition-colors border-b border-[rgba(116,119,117,0.22)]/40 hover:bg-gray-50/70">
                                                    <td className="py-3.5 px-6">
                                                        <div className="flex items-center">
                                                            <div className="flex-shrink-0 h-10 w-10 rounded-xl bg-brand-navy/10 overflow-hidden flex items-center justify-center shadow-inner">
                                                                <GraduationCap className="h-5 w-5 text-[#1F1F1F]" />
                                                            </div>
                                                            <div className="ml-4">
                                                                <div className="text-sm font-bold text-gray-900 leading-tight">{cat.name}</div>
                                                                <div className="text-xs text-gray-500 font-medium">Synced from Master Fees</div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="py-3.5 px-3 whitespace-nowrap">
                                                        <div className="text-sm font-bold text-gray-900">
                                                            {cat.amount != null ? `K${Number(cat.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : <span className="text-gray-400 font-medium text-xs">Variable</span>}
                                                        </div>
                                                    </td>
                                                    <td className="py-3.5 px-3 whitespace-nowrap">
                                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-blue-50 text-blue-700">
                                                            School Fee
                                                        </span>
                                                    </td>
                                                    <td className="py-3.5 px-3 whitespace-nowrap">
                                                        {accountName(cat.accountId) ? (
                                                            <span className="text-xs font-medium text-gray-700">{accountName(cat.accountId)}</span>
                                                        ) : (
                                                            <span className="px-2.5 py-0.5 inline-flex text-[10px] font-bold leading-5 rounded-full border bg-gray-50 text-gray-700 border-gray-100">
                                                                AUTO ON SYNC
                                                            </span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                );
                            })()
                        ) : (() => {
                            const filteredProducts = products.filter(p => {
                                if (activeTab === 'ALL') return true;
                                if (activeTab === 'PRODUCT') return p.product_type === 'PRODUCT';
                                if (activeTab === 'SERVICE') return p.product_type?.startsWith('SERVICE');
                                if (activeTab === 'DIGITAL') return p.product_type === 'DIGITAL';
                                if (activeTab === 'DONATION') return p.product_type === 'DONATION';
                                return true;
                            });

                            if (filteredProducts.length === 0) {
                                return (
                                    <div className="flex flex-col items-center justify-center h-full py-16 text-center">
                                        <div className="h-16 w-16 bg-gray-50 rounded-full flex items-center justify-center mb-4 border border-gray-100">
                                            <ShoppingBag className="h-8 w-8 text-gray-300" />
                                        </div>
                                        <h4 className="text-gray-900 font-bold mb-1">No products found</h4>
                                        <p className="text-gray-500 text-sm max-w-sm">
                                            {isAdmin ? "You haven't set up any products or services in this category." : "There are no products or services configured for this category."}
                                        </p>
                                    </div>
                                );
                            }

                            return (
                                <ProductList products={filteredProducts} isAdmin={isAdmin} onMarketplace={onMarketplace} auctions={auctionMap} downloadingId={downloadingId} onEdit={handleOpenEditModal} onShare={setShareProduct} onDelete={(pr) => handleDelete(pr.id, pr.name)} onDownload={(pr) => handleDownloadSalesCSV(pr.id, pr.name)} onAuction={setAuctionFor} onAdd={handleOpenAddModal} onToggleActive={handleToggleActive} />
                            );
                        })()}
                    </div>
                </div>
            </div>


            {isModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm sm:p-4 animate-in fade-in duration-200">
                    <div className={`bg-white rounded-t-3xl sm:rounded-3xl shadow-xl w-full ${full ? 'sm:max-w-5xl' : 'sm:max-w-xl'} overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200 max-h-[94vh] flex flex-col`}>

                        {/* Header */}
                        <div className="px-6 pt-6 pb-4 flex items-center justify-between shrink-0">
                            <div>
                                <h3 className="text-lg font-bold text-gray-900">
                                    {editingProduct ? 'Edit listing' : 'Add a listing'}
                                </h3>
                                <p className="text-xs text-gray-400 mt-0.5">Fill in the details for this product or service</p>
                            </div>
                            <button
                                onClick={() => !submitting && setIsModalOpen(false)}
                                disabled={submitting}
                                className="p-2 rounded-full text-gray-400 hover:bg-gray-100 transition-colors disabled:opacity-50"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="flex flex-col overflow-hidden">
                            <div className="px-6 pb-6 overflow-y-auto flex-1">
    <div className={`mb-4 rounded-2xl p-4 border ${formData.marketplace_listed ? 'border-[#0B57D0]/40 bg-[#F0F6FF]' : 'border-gray-200 bg-gray-50'}`}>
    <button type="button" role="switch" aria-checked={formData.marketplace_listed} onClick={() => setFormData(prev => ({ ...prev, marketplace_listed: !prev.marketplace_listed }))} disabled={submitting} className="w-full flex items-center justify-between gap-4 text-left">
        <div>
            <div className="text-sm font-bold text-gray-900">List on the Marketplace</div>
            <div className="text-xs text-gray-500 mt-0.5">{formData.marketplace_listed ? 'Full listing: photos, size and weight, delivery and details, so people can find and order it.' : 'Simple listing for your own payment links: just the basics.'}</div>
        </div>
        <div className={`relative w-10 h-6 rounded-full transition-colors flex-shrink-0 ${formData.marketplace_listed ? 'bg-[#0B57D0]' : 'bg-gray-300'}`}>
            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${formData.marketplace_listed ? 'translate-x-5' : 'translate-x-1'}`} />
        </div>
    </button>
</div>

{canAuction({ product_type: formData.product_type }) && (
    <div className="mb-4 rounded-2xl border border-gray-200 bg-white p-4">
        <div className="text-sm font-bold text-gray-900">How do you want to sell it?</div>
        {editingProduct && auctionMap.get(editingProduct.id)?.status === 'OPEN' ? (
            <p className="mt-2 rounded-xl bg-[#FEF7E0] px-3 py-2.5 text-xs text-[#B06000]">This item is on auction right now. Price changes won’t affect it. You can cancel an auction from the Marketplace listing until the first bid.</p>
        ) : (
            <>
                <div className="mt-2 grid grid-cols-2 gap-2" role="radiogroup" aria-label="How to sell it">
                    {([['FIXED', 'Fixed price', 'Buyers pay your price straight away.'], ['AUCTION', 'Auction', 'Buyers bid. The highest bid wins when time is up.']] as const).map(([id, label, hint]) => (
                        <button key={id} type="button" role="radio" aria-checked={sellAs === id} disabled={submitting}
                            onClick={() => { setSellAs(id); if (id === 'AUCTION') { setFormData(prev => ({ ...prev, marketplace_listed: true, is_active: true })); setAuctionForm((a) => (a.start && a.start !== '1' ? a : defaultAuction(formData.price))); } }}
                            className={`rounded-xl border p-3 text-left transition ${sellAs === id ? 'border-[#0B57D0] bg-[#F0F6FF]' : 'border-gray-200 hover:border-gray-300'}`}>
                            <span className="block text-sm font-bold text-gray-900">{label}</span><span className="text-xs text-gray-500">{hint}</span>
                        </button>
                    ))}
                </div>
                {sellAs === 'AUCTION' && <div className="mt-4 rounded-2xl bg-[#F8FAFD] p-4"><AuctionFields value={auctionForm} onChange={setAuctionForm} name={formData.name.trim() || undefined} /></div>}
            </>
        )}
    </div>
)}

{error && (
                                    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2.5 rounded-2xl text-sm flex items-center">
                                        <AlertCircle className="h-5 w-5 mr-2 flex-shrink-0" />
                                        {error}
                                    </div>
                                )}

    {/* Two columns, two cards each, so the form stays short */}
    <div className={`grid grid-cols-1 gap-4 ${full ? 'lg:grid-cols-2 lg:items-start' : ''}`}>
        <div className="space-y-4">
<section className="rounded-2xl border border-gray-100 bg-white p-4 space-y-4">
    <div><h4 className="text-sm font-bold text-gray-900">Basics</h4><p className="text-xs text-gray-400 mt-0.5">What it is and what it costs</p></div>
{/* Image upload — prominent, top of form */}
                                <div className="flex items-center gap-4">
                                    <button
                                        type="button"
                                        onClick={() => document.getElementById('product-img-input')?.click()}
                                        aria-label="Upload product image"
                                        className="relative w-20 h-20 rounded-2xl bg-gray-50 border-2 border-dashed border-gray-200 flex items-center justify-center overflow-hidden hover:border-[#0842A0]/50 hover:bg-blue-50/30 transition-all flex-shrink-0"
                                    >
                                        {uploadingImage ? (
                                            <Loader2 className="h-5 w-5 text-[#0B57D0] animate-spin" />
                                        ) : formData.image_url ? (
                                            <img src={formData.image_url} alt="Product" className="h-full w-full object-cover" />
                                        ) : (
                                            <ImagePlus className="h-5 w-5 text-gray-300" />
                                        )}
                                    </button>
                                    <input id="product-img-input" type="file" accept="image/*" className="hidden" onChange={handleUploadImage} disabled={submitting || uploadingImage} />
                                    <div>
                                        <p className="text-sm font-bold text-gray-800">Product photo</p>
                                        <p className="text-xs text-gray-400 mt-0.5">Tap the box to upload. Optional but recommended.</p>
                                        {formData.image_url && (
                                            <button type="button" onClick={() => setFormData(prev => ({ ...prev, image_url: '' }))} className="text-xs font-semibold text-red-500 hover:text-red-700 mt-1">Remove photo</button>
                                        )}
                                    </div>
                                </div>

                                {/* Product name */}
                                <div>
                                    <label className="block text-sm font-bold text-gray-800 mb-1.5">
                                        Name <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        name="name"
                                        value={formData.name}
                                        onChange={handleChange}
                                        disabled={submitting}
                                        required
                                        className="block w-full px-4 py-3 bg-white border border-gray-200 rounded-2xl text-sm focus:ring-2 focus:ring-[#0B57D0]/20 focus:border-[#0B57D0] outline-none transition-all disabled:bg-gray-50 placeholder-gray-400"
                                        placeholder="e.g. Men's Sneakers, Standard Haircut"
                                    />
                                </div>

                                {/* Type + Category in a 2-col grid */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-sm font-bold text-gray-800 mb-1.5">Type</label>
                                        <select
                                            name="product_type"
                                            value={formData.product_type}
                                            onChange={handleChange}
                                            disabled={submitting}
                                            className="block w-full px-3 py-3 bg-white border border-gray-200 rounded-2xl text-sm focus:ring-2 focus:ring-[#0B57D0]/20 focus:border-[#0B57D0] outline-none transition-all disabled:bg-gray-50"
                                        >
                                            {PRODUCT_TYPE_OPTIONS.map(o => (
                                                <option key={o.value} value={o.value}>{o.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-gray-800 mb-1.5">Category</label>
                                        <input
                                            type="text"
                                            name="category"
                                            list="product-categories"
                                            value={formData.category}
                                            onChange={handleChange}
                                            disabled={submitting}
                                            className="block w-full px-3 py-3 bg-white border border-gray-200 rounded-2xl text-sm focus:ring-2 focus:ring-[#0B57D0]/20 focus:border-[#0B57D0] outline-none transition-all disabled:bg-gray-50 placeholder-gray-400"
                                            placeholder="e.g. Shoes"
                                        />
                                        <datalist id="product-categories">
                                            {existingCategories.map(c => <option key={c} value={c} />)}
                                        </datalist>
                                    </div>
                                </div>
                                {formData.marketplace_listed && formData.product_type === 'PRODUCT' && (
                                    <div className="-mt-1">
                                        <label className="block text-sm font-bold text-gray-800 mb-1.5">Same as a catalogue product <span className="font-normal text-gray-400">(optional)</span></label>
                                        <CatalogPicker value={formData.catalog_item_id} onChange={(id) => setFormData(prev => ({ ...prev, catalog_item_id: id }))} disabled={submitting} placeholder="e.g. cement, blocks, river sand" />
                                        <p className="text-xs text-gray-400 mt-1.5">If your product is in the catalogue, buyers can compare your price with other sellers and you show up when they search. Set your price for one unit of the catalogue product.</p>
                                    </div>
                                )}
                                <p className="text-xs text-gray-400 -mt-3">
                                    {PRODUCT_TYPE_OPTIONS.find(o => o.value === formData.product_type)?.hint}
                                </p>

                                {/* Digital assets */}
                                {isDigital && (
                                    <div>
                                        <label className="block text-sm font-bold text-gray-800 mb-1">
                                            Digital file(s) <span className="text-red-500">*</span>
                                        </label>
                                        <p className="text-xs text-gray-400 mb-2">Emailed to the buyer automatically on payment.</p>
                                        {digitalAssets.length > 0 && (
                                            <div className="space-y-2 mb-2">
                                                {digitalAssets.map(asset => (
                                                    <div key={asset.path} className="flex items-center gap-3 px-3 py-2.5 bg-violet-50 border border-violet-100 rounded-2xl">
                                                        <FileText className="h-4 w-4 text-violet-500 flex-shrink-0" />
                                                        <div className="min-w-0 flex-1">
                                                            <div className="text-sm font-semibold text-gray-800 truncate">{asset.name}</div>
                                                            {asset.size ? <div className="text-xs text-gray-400">{formatBytes(asset.size)}</div> : null}
                                                        </div>
                                                        <button type="button" onClick={() => handleRemoveAsset(asset.path)} disabled={submitting} className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"><Trash2 className="h-4 w-4" /></button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        <label className="inline-flex items-center px-4 py-2.5 text-xs font-bold text-gray-700 bg-white border border-gray-200 rounded-2xl hover:bg-gray-50 cursor-pointer transition-colors">
                                            {uploadingAsset ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <FileUp className="h-4 w-4 mr-1.5" />}
                                            {uploadingAsset ? 'Uploading...' : (digitalAssets.length > 0 ? 'Add another file' : 'Upload file')}
                                            <input type="file" multiple className="hidden" onChange={handleUploadAssets} disabled={submitting || uploadingAsset} />
                                        </label>
                                    </div>
                                )}

                                {/* Appointment scheduling */}
                                {isAppointment && (() => {
                                    const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                                    const setCfg = (patch: Partial<AppointmentConfig>) => setApptConfig(c => ({ ...c, ...patch }));
                                    const setDay = (d: number, patch: { start?: string; end?: string } | null) =>
                                        setApptConfig(c => {
                                            const hours = { ...c.hours };
                                            if (patch === null) delete hours[String(d)];
                                            else hours[String(d)] = { ...(hours[String(d)] || { start: '09:00', end: '17:00' }), ...patch };
                                            return { ...c, hours };
                                        });
                                    const num = (label: string, key: 'duration_minutes' | 'slot_interval_minutes' | 'capacity' | 'min_notice_hours' | 'max_advance_days', hint?: string) => (
                                        <div>
                                            <label className="block text-xs font-bold text-gray-700 mb-1">{label}</label>
                                            <input
                                                type="number" min={1} value={apptConfig[key]} disabled={submitting}
                                                onChange={(e) => setCfg({ [key]: Math.max(key === 'min_notice_hours' ? 0 : 1, Number(e.target.value) || 0) } as Partial<AppointmentConfig>)}
                                                className="block w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-[#0058DB]/20 focus:border-[#0058DB] outline-none"
                                            />
                                            {hint && <p className="text-[11px] text-gray-400 mt-1">{hint}</p>}
                                        </div>
                                    );
                                    return (
                                        <div className="space-y-4 p-4 bg-pink-50/50 border border-pink-100 rounded-2xl">
                                            <div>
                                                <p className="text-sm font-bold text-gray-800">Appointment scheduling</p>
                                                <p className="text-xs text-gray-500 mt-0.5">Customers pick a day, then one of the time slots generated from these rules. A slot is held only once it's paid.</p>
                                            </div>
                                            <div className="grid grid-cols-2 gap-3">
                                                {num('Service length (minutes)', 'duration_minutes')}
                                                {num('Slot every (minutes)', 'slot_interval_minutes', 'Gap between start times offered.')}
                                                {num('Clients per slot', 'capacity', 'E.g. 3 if you have 3 stylists.')}
                                                {num('Minimum notice (hours)', 'min_notice_hours')}
                                                {num('Bookable up to (days ahead)', 'max_advance_days')}
                                            </div>
                                            <div>
                                                <p className="text-xs font-bold text-gray-700 mb-2">Opening hours</p>
                                                <div className="space-y-2">
                                                    {[1, 2, 3, 4, 5, 6, 0].map(d => {
                                                        const h = apptConfig.hours[String(d)];
                                                        return (
                                                            <div key={d} className="flex items-center gap-2">
                                                                <label className="flex items-center gap-2 w-28 text-sm text-gray-700">
                                                                    <input type="checkbox" checked={!!h} disabled={submitting} onChange={(e) => setDay(d, e.target.checked ? {} : null)} />
                                                                    {DAYS[d]}
                                                                </label>
                                                                {h ? (
                                                                    <>
                                                                        <input type="time" value={h.start} disabled={submitting} onChange={(e) => setDay(d, { start: e.target.value })} className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm" />
                                                                        <span className="text-gray-400 text-xs">to</span>
                                                                        <input type="time" value={h.end} disabled={submitting} onChange={(e) => setDay(d, { end: e.target.value })} className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm" />
                                                                    </>
                                                                ) : <span className="text-xs text-gray-400">Closed</span>}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-gray-700 mb-1">Days off (holidays)</label>
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="date" disabled={submitting}
                                                        onChange={(e) => {
                                                            const v = e.target.value;
                                                            if (v && !apptConfig.closed_dates.includes(v)) setCfg({ closed_dates: [...apptConfig.closed_dates, v].sort() });
                                                            e.target.value = '';
                                                        }}
                                                        className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm"
                                                    />
                                                    <span className="text-[11px] text-gray-400">Pick a date to block it out.</span>
                                                </div>
                                                {apptConfig.closed_dates.length > 0 && (
                                                    <div className="flex flex-wrap gap-1.5 mt-2">
                                                        {apptConfig.closed_dates.map(d => (
                                                            <button key={d} type="button" onClick={() => setCfg({ closed_dates: apptConfig.closed_dates.filter(x => x !== d) })}
                                                                className="px-2.5 py-1 bg-white border border-pink-200 text-pink-700 rounded-full text-xs font-semibold hover:bg-pink-50">
                                                                {d} ✕
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })()}

                                {/* Price */}
                                {!isDonation && (
                                    <div>
                                        <label className="block text-sm font-bold text-gray-800 mb-1.5">
                                            {isBooking ? `Price per ${isDailyBooking ? 'day' : 'night'}` : isAppointment ? 'Price per appointment' : isVariable ? 'Default / quoted price' : 'Selling price'}
                                            {priceRequired && <span className="text-red-500"> *</span>}
                                        </label>
                                        <div className="relative">
                                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-gray-400">ZMW</span>
                                            <input
                                                type="number"
                                                name="price"
                                                step="0.01"
                                                min="0"
                                                value={formData.price}
                                                onChange={handleChange}
                                                disabled={submitting}
                                                required={priceRequired}
                                                className="block w-full pl-14 pr-4 py-3 bg-white border border-gray-200 rounded-2xl text-sm focus:ring-2 focus:ring-[#0B57D0]/20 focus:border-[#0B57D0] outline-none transition-all disabled:bg-gray-50"
                                                placeholder="0.00"
                                            />
                                        </div>
                                        {isVariable && <p className="text-xs text-gray-400 mt-1">You'll confirm the final amount when sharing a link.</p>}
                                    </div>
                                )}

                                {/* Description */}
                                <div>
                                    <label className="block text-sm font-bold text-gray-800 mb-1.5">
                                        Description <span className="text-xs font-medium text-gray-400 ml-1">Optional</span>
                                    </label>
                                    <textarea
                                        name="description"
                                        value={formData.description}
                                        onChange={handleChange}
                                        disabled={submitting}
                                        rows={2}
                                        className="block w-full px-4 py-3 bg-white border border-gray-200 rounded-2xl text-sm focus:ring-2 focus:ring-[#0B57D0]/20 focus:border-[#0B57D0] outline-none transition-all disabled:bg-gray-50 resize-none placeholder-gray-400"
                                        placeholder="A short description customers will see..."
                                    />
                                </div>
</section>
{full && (<section className="rounded-2xl border border-gray-100 bg-white p-4 space-y-4">
    <div><h4 className="text-sm font-bold text-gray-900">Photos and details</h4><p className="text-xs text-gray-400 mt-0.5">Pictures and what buyers get</p></div>
{/* ── Additional gallery images ── */}
                                <div>
                                    <label className="block text-sm font-bold text-gray-800 mb-1">
                                        Additional Images <span className="text-xs font-medium text-gray-400 ml-1">Optional</span>
                                    </label>
                                    <p className="text-xs text-gray-400 mb-2">Works for products and services alike. Choose several photos at once; buyers can flip through them on the listing (up to 10). With no photos at all, the Marketplace shows a default picture for the category.</p>
                                    {additionalImages.length > 0 && (
                                        <div className="flex flex-wrap gap-2 mb-2">
                                            {additionalImages.map((url, idx) => (
                                                <div key={url} className="relative w-16 h-16 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0 group">
                                                    <img src={url} alt={`Gallery ${idx + 1}`} className="w-full h-full object-cover" />
                                                    <button
                                                        type="button"
                                                        onClick={() => setAdditionalImages(prev => prev.filter((_, i) => i !== idx))}
                                                        disabled={submitting}
                                                        className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                                    >
                                                        <X className="w-4 h-4 text-white" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    <label className={`inline-flex items-center px-4 py-2.5 text-xs font-bold text-gray-700 bg-white border border-gray-200 rounded-2xl hover:bg-gray-50 transition-colors ${(submitting || uploadingAdditionalImage) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                                        {uploadingAdditionalImage ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <ImagePlus className="h-4 w-4 mr-1.5" />}
                                        {uploadingAdditionalImage ? 'Uploading...' : 'Add Photos'}
                                        <input type="file" accept="image/*" multiple className="hidden" onChange={handleUploadAdditionalImage} disabled={submitting || uploadingAdditionalImage} />
                                    </label>
                                </div>

{/* ── What's Included bullet list ── */}
                                <div>
                                    <label className="block text-sm font-bold text-gray-800 mb-1">
                                        What's Included <span className="text-xs font-medium text-gray-400 ml-1">Optional</span>
                                    </label>
                                    <p className="text-xs text-gray-400 mb-2">Bullet points shown on the product detail page (e.g. "Free shipping", "1-year warranty").</p>
                                    {whatsIncluded.length > 0 && (
                                        <div className="space-y-2 mb-2">
                                            {whatsIncluded.map((item, idx) => (
                                                <div key={idx} className="flex items-center gap-2">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-[#0B57D0] md:bg-[#0B57D0] flex-shrink-0 mt-0.5" />
                                                    <input
                                                        type="text"
                                                        value={item}
                                                        onChange={(e) => setWhatsIncluded(prev => prev.map((s, i) => i === idx ? e.target.value : s))}
                                                        disabled={submitting}
                                                        placeholder="e.g. Free delivery included"
                                                        className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-[#0B57D0]/20 focus:border-[#0B57D0] outline-none transition-all disabled:bg-gray-50 placeholder-gray-400"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => setWhatsIncluded(prev => prev.filter((_, i) => i !== idx))}
                                                        disabled={submitting}
                                                        className="p-1.5 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
                                                    >
                                                        <X className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => setWhatsIncluded(prev => [...prev, ''])}
                                        disabled={submitting}
                                        className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold text-gray-700 bg-white border border-gray-200 rounded-2xl hover:bg-gray-50 transition-colors disabled:opacity-50"
                                    >
                                        <Plus className="h-4 w-4" />
                                        Add Item
                                    </button>
                                </div>
</section>)}
        </div>
        <div className="space-y-4">
            {full && canHaveDelivery && (<section className="rounded-2xl border border-gray-100 bg-white p-4 space-y-4">
    <div><h4 className="text-sm font-bold text-gray-900">Delivery</h4><p className="text-xs text-gray-400 mt-0.5">Size, weight and how it reaches the buyer</p></div>
{/* ── Size and weight (physical products): prices the Opus Delivery trip ── */}
                                {canHaveDelivery && (
                                    <div className="border border-gray-100 rounded-2xl px-4 py-4">
                                        <div className="text-sm font-bold text-gray-800">Size and weight</div>
                                        <div className="text-xs text-gray-400 mb-3">Of one unit. They set the Opus Delivery price. Leave them blank and we estimate them from what the item is.</div>
                                        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 mb-3">
                                            {([['SMALL', 'Small', 'Bag or small box'], ['MEDIUM', 'Medium', 'TV, microwave, carton'], ['LARGE', 'Large', 'Fridge, sofa, wardrobe'], ['BULKY', 'Bulky', 'Full load of materials']] as const).map(([id, label, hint]) => (
                                                <button key={id} type="button" disabled={submitting} onClick={() => setFormData(prev => ({ ...prev, parcel_size: prev.parcel_size === id ? '' : id }))}
                                                    className={`rounded-xl px-3 py-2 text-left border text-xs transition ${formData.parcel_size === id ? 'border-[#0B57D0] bg-[#F0F6FF] font-bold text-[#041E49]' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                                                    <span className="block text-sm font-semibold">{label}</span><span className="text-gray-400">{hint}</span>
                                                </button>
                                            ))}
                                        </div>
                                        <label className="block text-xs font-bold text-gray-700 mb-1.5">Weight of one unit (kg)</label>
                                        <input type="number" name="weight_kg" step="0.1" min="0" value={formData.weight_kg} onChange={handleChange} disabled={submitting}
                                            className="block w-40 px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-[#0B57D0]/20 focus:border-[#0B57D0] outline-none transition-all" placeholder="e.g. 12" />
                                    </div>
                                )}

{/* ── Delivery settings (physical products only) ── */}
                                {canHaveDelivery && (
                                    <div className="border border-gray-100 rounded-2xl overflow-hidden">
                                        {/* Toggle: requires delivery */}
                                        <button
                                            type="button"
                                            onClick={() => setFormData(prev => ({ ...prev, requires_delivery: !prev.requires_delivery }))}
                                            disabled={submitting}
                                            className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-gray-50 transition-colors"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-xl bg-[#0B57D0]/10 flex items-center justify-center flex-shrink-0">
                                                    <svg className="w-4 h-4 text-[#0B57D0]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                                    </svg>
                                                </div>
                                                <div className="text-left">
                                                    <div className="text-sm font-bold text-gray-800">Requires Delivery</div>
                                                    <div className="text-xs text-gray-400">Customer chooses deliver or pick up at checkout</div>
                                                </div>
                                            </div>
                                            {/* Toggle pill */}
                                            <div className={`relative w-10 h-6 rounded-full transition-colors flex-shrink-0 ${formData.requires_delivery ? 'bg-[#0B57D0] md:bg-[#0B57D0]' : 'bg-gray-200'}`}>
                                                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${formData.requires_delivery ? 'translate-x-5' : 'translate-x-1'}`} />
                                            </div>
                                        </button>

                                        {/* Sub-settings when delivery is on */}
                                        {formData.requires_delivery && (
                                            <div className="border-t border-gray-100 bg-gray-50/50 px-4 py-4 space-y-4">
                                                {/* Allow external riders */}
                                                <button
                                                    type="button"
                                                    onClick={() => setFormData(prev => ({ ...prev, allow_external_delivery: !prev.allow_external_delivery }))}
                                                    disabled={submitting}
                                                    className="w-full flex items-center justify-between"
                                                >
                                                    <div className="text-left">
                                                        <div className="text-sm font-bold text-gray-700">Allow External Deliveries</div>
                                                        <div className="text-xs text-gray-400">Show rider service options (Yango, etc.) at checkout</div>
                                                    </div>
                                                    <div className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ml-3 ${formData.allow_external_delivery ? 'bg-[#0B57D0] md:bg-[#0B57D0]' : 'bg-gray-200'}`}>
                                                        <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${formData.allow_external_delivery ? 'translate-x-4' : 'translate-x-0.5'}`} />
                                                    </div>
                                                </button>

                                                {/* Own delivery charge — only when not using external riders */}
                                                {!formData.allow_external_delivery && (
                                                    <div>
                                                        <label className="block text-xs font-bold text-gray-700 mb-1.5">Your flat delivery charge (ZMW)</label>
                                                        <div className="relative">
                                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">K</span>
                                                            <input
                                                                type="number"
                                                                name="own_delivery_charge"
                                                                step="0.01"
                                                                min="0"
                                                                value={formData.own_delivery_charge}
                                                                onChange={handleChange}
                                                                disabled={submitting}
                                                                className="block w-full pl-7 pr-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-[#0B57D0]/20 focus:border-[#0B57D0] outline-none transition-all"
                                                                placeholder="0.00"
                                                            />
                                                        </div>
                                                        <p className="text-xs text-gray-400 mt-1">Shown to customers as the delivery charge at checkout.</p>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
</section>)}
{full && canHaveDelivery && (<section className="rounded-2xl border border-gray-100 bg-white p-4 space-y-4">
    <div><h4 className="text-sm font-bold text-gray-900">Stock</h4><p className="text-xs text-gray-400 mt-0.5">Count what you have, so buyers see “Only 2 left” and can’t order what’s gone</p></div>
    <button type="button" role="switch" aria-checked={trackStock} onClick={() => setTrackStock((v) => !v)} disabled={submitting} className="w-full flex items-center justify-between gap-4 text-left">
        <span><span className="block text-sm font-bold text-gray-800">Track stock</span><span className="block text-xs text-gray-400">Each Marketplace order takes one off, and a payment that fails puts it back</span></span>
        <span className={`relative h-6 w-10 flex-shrink-0 rounded-full transition-colors ${trackStock ? 'bg-[#0B57D0]' : 'bg-gray-200'}`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-transform ${trackStock ? 'translate-x-5' : 'translate-x-1'}`} /></span>
    </button>
    {trackStock && (
        <>
            <div className="grid grid-cols-2 gap-3">
                {variantRows.length === 0 && (
                    <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1.5">How many in stock</label>
                        <input type="number" min="0" step="1" value={stockQty} onChange={(e) => setStockQty(e.target.value)} disabled={submitting} placeholder="e.g. 100" className="block w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-[#0B57D0]/20 focus:border-[#0B57D0] outline-none" />
                    </div>
                )}
                <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1.5">Warn buyers when</label>
                    <div className="relative"><input type="number" min="0" step="1" value={lowStock} onChange={(e) => setLowStock(e.target.value)} disabled={submitting} className="block w-full px-3 py-2.5 pr-14 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-[#0B57D0]/20 focus:border-[#0B57D0] outline-none" /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">or fewer</span></div>
                </div>
            </div>

            <div>
                <p className="text-xs font-bold text-gray-700">Colours and sizes <span className="font-normal text-gray-400">(optional, each with its own count)</span></p>
                <datalist id="stock-colours">{['Black', 'White', 'Red', 'Blue', 'Green', 'Yellow', 'Orange', 'Pink', 'Purple', 'Grey', 'Silver', 'Gold', 'Brown', 'Beige', 'Navy'].map((c) => <option key={c} value={c} />)}</datalist>
                {variantRows.length > 0 && (
                    <div className="mt-2 space-y-2">
                        <div className="grid grid-cols-[1fr_1fr_80px_32px] gap-2 text-[10px] font-bold uppercase tracking-wide text-gray-400"><span>Colour</span><span>Size</span><span>In stock</span><span /></div>
                        {variantRows.map((v, i) => (
                            <div key={v.id ?? i} className="grid grid-cols-[1fr_1fr_80px_32px] items-center gap-2">
                                <input list="stock-colours" value={v.color} onChange={(e) => setVariantRows((rows) => rows.map((r, k) => (k === i ? { ...r, color: e.target.value } : r)))} disabled={submitting} placeholder="Black" className="min-w-0 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm outline-none focus:border-[#0B57D0]" />
                                <input value={v.size} onChange={(e) => setVariantRows((rows) => rows.map((r, k) => (k === i ? { ...r, size: e.target.value } : r)))} disabled={submitting} placeholder="128GB, M…" className="min-w-0 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm outline-none focus:border-[#0B57D0]" />
                                <input type="number" min="0" step="1" value={v.stock} onChange={(e) => setVariantRows((rows) => rows.map((r, k) => (k === i ? { ...r, stock: e.target.value } : r)))} disabled={submitting} className="min-w-0 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm outline-none focus:border-[#0B57D0]" />
                                <button type="button" aria-label="Remove this option" onClick={() => setVariantRows((rows) => rows.filter((_, k) => k !== i))} disabled={submitting} className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500"><X className="w-4 h-4" /></button>
                            </div>
                        ))}
                    </div>
                )}
                <button type="button" onClick={() => setVariantRows((rows) => [...rows, { color: '', size: '', stock: '' }])} disabled={submitting} className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-50"><Plus className="h-4 w-4" /> Add a colour or size</button>
            </div>

            <p className={`rounded-xl px-3 py-2 text-xs ${stockTotal <= 0 ? 'bg-red-50 text-red-700' : stockTotal <= (Number(lowStock) || 0) ? 'bg-amber-50 text-amber-800' : 'bg-green-50 text-green-700'}`}>
                {stockTotal <= 0 ? 'Nothing in stock: buyers will see “Sold out”.' : stockTotal <= (Number(lowStock) || 0) ? `${stockTotal} in stock: buyers will see “Only ${stockTotal} left”.` : `${stockTotal} in stock.`}
            </p>
        </>
    )}
</section>)}
<section className="rounded-2xl border border-gray-100 bg-white p-4 space-y-4">
    <div><h4 className="text-sm font-bold text-gray-900">Selling and visibility</h4><p className="text-xs text-gray-400 mt-0.5">Where the money goes, what buyers fill in, who can see it</p></div>
{/* Revenue wallet + Income account */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-sm font-bold text-gray-800 mb-1.5 flex items-center gap-1"><Wallet className="h-3.5 w-3.5 text-gray-400" />Wallet</label>
                                        <select name="wallet_id" value={formData.wallet_id} onChange={handleChange} disabled={submitting} className="block w-full px-3 py-3 bg-white border border-gray-200 rounded-2xl text-sm focus:ring-2 focus:ring-[#0B57D0]/20 focus:border-[#0B57D0] outline-none transition-all disabled:bg-gray-50">
                                            <option value="">Default</option>
                                            {wallets.map(w => <option key={w.id} value={w.id}>{w.name}{w.is_main ? ' (Main)' : ''}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-gray-800 mb-1.5 flex items-center gap-1"><BookOpen className="h-3.5 w-3.5 text-gray-400" />Account</label>
                                        <select name="income_account_id" value={formData.income_account_id} onChange={handleChange} disabled={submitting} className="block w-full px-3 py-3 bg-white border border-gray-200 rounded-2xl text-sm focus:ring-2 focus:ring-[#0B57D0]/20 focus:border-[#0B57D0] outline-none transition-all disabled:bg-gray-50">
                                            <option value="">Auto (AI)</option>
                                            {incomeAccounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                                        </select>
                                    </div>
                                </div>

{/* ── Customer information collected before payment ── */}
                                {full && formData.product_type !== 'DONATION' && (
                                    <div className="border border-gray-100 rounded-2xl overflow-hidden">
                                        <button
                                            type="button"
                                            onClick={() => setCollectInfo(v => !v)}
                                            disabled={submitting}
                                            className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-gray-50 transition-colors"
                                        >
                                            <div className="text-left">
                                                <div className="text-sm font-bold text-gray-800">Collect customer information</div>
                                                <div className="text-xs text-gray-400">Buyers fill these in on their own page right before paying (e.g. name, size)</div>
                                            </div>
                                            <div className={`relative w-10 h-6 rounded-full transition-colors flex-shrink-0 ml-3 ${collectInfo ? 'bg-[#0B57D0] md:bg-[#0B57D0]' : 'bg-gray-200'}`}>
                                                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${collectInfo ? 'translate-x-5' : 'translate-x-1'}`} />
                                            </div>
                                        </button>

                                        {collectInfo && (
                                            <div className="border-t border-gray-100 bg-gray-50/50 px-4 py-4 space-y-3">
                                                {checkoutFields.map(f => (
                                                    <div key={f.id} className="bg-white border border-gray-200 rounded-xl p-3 space-y-2">
                                                        <div className="flex items-center gap-2">
                                                            <input
                                                                type="text"
                                                                value={f.label}
                                                                onChange={e => updateCheckoutField(f.id, { label: e.target.value })}
                                                                disabled={submitting}
                                                                placeholder="Field label, e.g. Full name"
                                                                className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#0B57D0]/20 focus:border-[#0B57D0] outline-none"
                                                            />
                                                            <select
                                                                value={f.type}
                                                                onChange={e => updateCheckoutField(f.id, e.target.value === 'select'
                                                                    ? { type: 'select', optionsText: f.optionsText ?? '' }
                                                                    : { type: 'text' })}
                                                                disabled={submitting}
                                                                className="px-2 py-2 bg-white border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 outline-none"
                                                            >
                                                                <option value="text">Text</option>
                                                                <option value="select">Choices</option>
                                                            </select>
                                                            <button
                                                                type="button"
                                                                onClick={() => setCheckoutFields(prev => prev.filter(x => x.id !== f.id))}
                                                                disabled={submitting}
                                                                className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                                                            >
                                                                <X className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                        {f.type === 'select' && (
                                                            <input
                                                                type="text"
                                                                value={f.optionsText ?? ''}
                                                                onChange={e => updateCheckoutField(f.id, { optionsText: e.target.value })}
                                                                disabled={submitting}
                                                                placeholder="Options, separated by commas (S, M, L, XL)"
                                                                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#0B57D0]/20 focus:border-[#0B57D0] outline-none"
                                                            />
                                                        )}
                                                        <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                                                            <input
                                                                type="checkbox"
                                                                checked={f.required}
                                                                onChange={e => updateCheckoutField(f.id, { required: e.target.checked })}
                                                                disabled={submitting}
                                                            />
                                                            Required
                                                        </label>
                                                    </div>
                                                ))}
                                                <div className="flex flex-wrap gap-2">
                                                    <button type="button" onClick={() => addCheckoutField('name')} disabled={submitting} className="px-3 py-2 text-xs font-bold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50">+ Name</button>
                                                    {formData.product_type === 'PRODUCT' && (
                                                        <button type="button" onClick={() => addCheckoutField('size')} disabled={submitting} className="px-3 py-2 text-xs font-bold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50">+ Sizes</button>
                                                    )}
                                                    <button type="button" onClick={() => addCheckoutField('email')} disabled={submitting} className="px-3 py-2 text-xs font-bold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50">+ Email</button>
                                                    <button type="button" onClick={() => addCheckoutField('custom')} disabled={submitting} className="px-3 py-2 text-xs font-bold text-[#0B57D0] bg-white border border-[#0B57D0]/30 rounded-xl hover:bg-blue-50">+ Custom field</button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

{/* Active toggle */}
                                <button
                                    type="button"
                                    onClick={() => setFormData(prev => ({ ...prev, is_active: !prev.is_active }))}
                                    disabled={submitting}
                                    className="w-full flex items-center justify-between px-4 py-3.5 bg-gray-50 rounded-2xl hover:bg-gray-100 transition-colors"
                                >
                                    <div className="text-left">
                                        <div className="text-sm font-bold text-gray-800">Active</div>
                                        <div className="text-xs text-gray-400">Visible to customers on the payment portal</div>
                                    </div>
                                    <div className={`relative w-10 h-6 rounded-full transition-colors flex-shrink-0 ${formData.is_active ? 'bg-[#0B57D0] md:bg-[#0B57D0]' : 'bg-gray-200'}`}>
                                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${formData.is_active ? 'translate-x-5' : 'translate-x-1'}`} />
                                    </div>
                                </button>
</section>
        </div>
    </div>
    {!full && (
        <button type="button" onClick={() => setShowMore(true)} className="mt-4 text-sm font-semibold text-[#0B57D0] hover:underline">Show more options (photos, delivery, checkout details)</button>
    )}
</div>

                            {/* Footer */}
                            <div className="px-6 py-4 border-t border-gray-100 bg-white flex justify-end gap-3 shrink-0">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    disabled={submitting}
                                    className="px-5 py-2.5 text-sm font-bold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={submitting || uploadingImage || uploadingAsset || !formData.name.trim()}
                                    className="inline-flex items-center px-6 py-2.5 text-sm font-bold text-white bg-[#0B57D0] hover:bg-[#0B57D0] rounded-xl focus:ring-2 focus:ring-offset-2 focus:ring-black transition-colors disabled:opacity-50"
                                >
                                    {submitting ? (
                                        <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</>
                                    ) : (
                                        editingProduct ? 'Save changes' : 'Add listing'
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {auctionFor && <StartAuctionDialog listing={{ id: auctionFor.id, name: auctionFor.name, price: Number(auctionFor.price) || 0 }} open onClose={() => setAuctionFor(null)} onStarted={() => { refetchMarket(); loadProducts(); }} />}

            <ShareProductLinkModal
                isOpen={!!shareProduct}
                onClose={() => setShareProduct(null)}
                product={shareProduct}
            />
        </div>
    );
};

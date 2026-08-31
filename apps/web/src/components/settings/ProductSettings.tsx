import React, { useState, useEffect, useRef } from 'react';
import { productService, Product, ProductType, PRODUCT_TYPE_OPTIONS, isBookingProductType, DigitalAsset } from '../../services/product.service';
import { accountService } from '../../services/account.service';
import { cashbookService } from '../../services/cashbook.service';
import { masterFeesService, MasterFeesStatus, MasterFeesCategory } from '../../services/integration.service';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { compressImage } from '../../utils/file_utils';
import ShareProductLinkModal from '../ShareProductLinkModal';
import {
    ShoppingBag,
    Plus,
    Edit2,
    Trash2,
    Loader2,
    CheckCircle,
    AlertCircle,
    X,
    Eye,
    Download,
    Share2,
    ImagePlus,
    Wallet,
    BookOpen,
    FileUp,
    FileText,
    MoreHorizontal,
    GraduationCap,
    RefreshCw,
    ArrowUpRight
} from 'lucide-react';

interface WalletOption { id: string; name: string; is_main?: boolean; }
interface AccountOption { id: string; code: string; name: string; type: string; }

const typeBadgeClass = (t?: ProductType) => {
    switch (t) {
        case 'SERVICE_FIXED': return 'bg-indigo-100 text-indigo-800';
        case 'SERVICE_VARIABLE': return 'bg-amber-100 text-amber-800';
        case 'SERVICE_BOOKING': return 'bg-teal-100 text-teal-800';
        case 'SERVICE_BOOKING_DAILY': return 'bg-cyan-100 text-cyan-800';
        case 'DIGITAL': return 'bg-violet-100 text-violet-800';
        case 'DONATION': return 'bg-pink-100 text-pink-800';
        default: return 'bg-slate-100 text-slate-700';
    }
};
const typeLabel = (t?: ProductType) =>
    PRODUCT_TYPE_OPTIONS.find(o => o.value === (t || 'PRODUCT'))?.label || 'Product';

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
        is_active: true,
        requires_delivery: false,
        allow_external_delivery: false,
        own_delivery_charge: '',
    });
    // Additional gallery images (ordered list of public URLs)
    const [additionalImages, setAdditionalImages] = useState<string[]>([]);
    const [uploadingAdditionalImage, setUploadingAdditionalImage] = useState(false);
    // "What's Included" bullet list
    const [whatsIncluded, setWhatsIncluded] = useState<string[]>([]);

    // Share-link modal state
    const [shareProduct, setShareProduct] = useState<Product | null>(null);
    const [activeTab, setActiveTab] = useState('ALL');
    const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

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
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setOpenDropdownId(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

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
        setEditingProduct(null);
        setAdditionalImages([]);
        setWhatsIncluded([]);
        setFormData({
            name: '',
            description: '',
            price: '',
            product_type: 'PRODUCT',
            wallet_id: '',
            income_account_id: '',
            image_url: '',
            category: '',
            is_active: true,
            requires_delivery: false,
            allow_external_delivery: false,
            own_delivery_charge: '',
        });
        setDigitalAssets([]);
        setError(null);
        setIsModalOpen(true);
    };

    // Expose opener to parent for mobile header button
    React.useEffect(() => {
        if (onRequestAdd) onRequestAdd(handleOpenAddModal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [onRequestAdd]);

    const handleOpenEditModal = (product: Product) => {
        setEditingProduct(product);
        setDigitalAssets(Array.isArray(product.digital_assets) ? product.digital_assets : []);
        setAdditionalImages(Array.isArray(product.additional_images) ? product.additional_images : []);
        setWhatsIncluded(Array.isArray(product.whats_included) ? product.whats_included : []);
        setFormData({
            name: product.name,
            description: product.description || '',
            price: product.price?.toString() ?? '',
            product_type: product.product_type || 'PRODUCT',
            wallet_id: product.wallet_id || '',
            income_account_id: product.income_account_id || '',
            image_url: product.image_url || '',
            category: product.category || '',
            is_active: product.is_active,
            requires_delivery: product.requires_delivery ?? false,
            allow_external_delivery: product.allow_external_delivery ?? false,
            own_delivery_charge: product.own_delivery_charge?.toString() ?? '',
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

    // Upload an extra gallery image and append its public URL to additionalImages.
    const handleUploadAdditionalImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !isAdmin) return;
        e.target.value = '';
        try {
            setUploadingAdditionalImage(true);
            setError(null);
            const compressed = await compressImage(file, { maxSizeMB: 0.3, maxWidthOrHeight: 1000, initialQuality: 0.72 });
            const folder = organizationId || 'shared';
            const filePath = `${folder}/product-gallery-${Date.now()}.jpg`;
            const { data: uploadData, error: uploadError } = await supabase.storage
                .from('product-images')
                .upload(filePath, compressed, { cacheControl: '31536000', upsert: true, contentType: 'image/jpeg' });
            if (uploadError) throw uploadError;
            const publicUrl = supabase.storage.from('product-images').getPublicUrl(uploadData.path).data.publicUrl;
            setAdditionalImages(prev => [...prev, publicUrl]);
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
    const priceRequired = !isDonation && !isVariable;
    // Delivery only makes sense for tangible physical products
    const canHaveDelivery = formData.product_type === 'PRODUCT';

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

        if (isDigital && digitalAssets.length === 0) {
            setError('Please upload at least one file for this digital product.');
            return;
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
                digital_assets: isDigital ? digitalAssets : null,
                is_active: formData.is_active,
                requires_delivery: formData.requires_delivery,
                allow_external_delivery: formData.allow_external_delivery,
                own_delivery_charge: Number(formData.own_delivery_charge) || 0,
                additional_images: additionalImages,
                whats_included: whatsIncluded.filter(s => s.trim()),
            };

            if (editingProduct) {
                await productService.updateProduct(editingProduct.id, payload);
                setSuccessMessage('Product updated successfully.');
            } else {
                await productService.createProduct(payload);
                setSuccessMessage('Product created successfully.');
            }

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
                <Loader2 className="h-8 w-8 animate-spin text-brand-green" />
                <span className="ml-3 text-gray-500 font-medium">Loading products & services...</span>
            </div>
        );
    }

    return (
        <div className="flex-1 h-[calc(100vh-64px)] p-4 bg-gray-50 md:bg-slate-100 flex flex-col justify-start items-start w-full overflow-hidden">
            <div className="self-stretch flex-1 flex justify-start items-start gap-2.5 w-full overflow-hidden">
                <div className="flex-1 h-full p-3.5 bg-white rounded-[20px] flex flex-col justify-start items-stretch gap-5 overflow-hidden shadow-sm w-full relative">
                    
                    {/* Header — desktop only; mobile header is the Layout top bar */}
                    <div className="hidden md:flex justify-between items-center shrink-0 w-full p-2">
                        <div className="flex justify-start items-center gap-2">
                            <ShoppingBag className="w-4 h-4 text-gray-900" />
                            <div className="justify-center text-gray-900 text-base font-semibold font-['DM_Sans'] leading-5">Products & Services</div>
                        </div>
                    </div>

                    {/* Filters and Actions Row */}
                    <div className="flex justify-between items-center w-full shrink-0 px-2">
                        {/* Tabs */}
                        <div className="flex items-center gap-1 p-1 bg-[#F3F5FC] rounded-[10px] overflow-x-auto no-scrollbar">
                            {[
                                { value: 'ALL', label: 'All' },
                                { value: 'PRODUCT', label: 'Physical' },
                                { value: 'SERVICE', label: 'Services' },
                                { value: 'DIGITAL', label: 'Digital' },
                                { value: 'DONATION', label: 'Donations' },
                                ...(mfConnected ? [{ value: 'MASTERFEES', label: 'Master Fees' }] : [])
                            ].map(tab => {
                                const isActive = activeTab === tab.value;
                                return (
                                    <button
                                        key={tab.value}
                                        onClick={() => setActiveTab(tab.value)}
                                        className={`px-3.5 py-1.5 rounded-lg text-[11px] whitespace-nowrap transition-all flex items-center gap-1.5 ${
                                            isActive ? 'font-bold bg-white text-[#111827] shadow-sm' : 'font-normal text-gray-500 hover:text-gray-700'
                                        }`}
                                    >
                                        {tab.value === 'MASTERFEES' && (
                                            mfLogoFailed ? (
                                                <GraduationCap size={12} className="text-brand-navy flex-shrink-0" />
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
                        ) : isAdmin && (
                            <button
                                onClick={handleOpenAddModal}
                                className="hidden md:flex h-8 pl-4 pr-3 bg-[#0058DB] rounded-lg items-center gap-2 hover:opacity-90 transition-opacity flex-shrink-0"
                            >
                                <span className="text-white text-xs font-bold">Add Product</span>
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
                        <div className="bg-green-50 border border-[#34D399] text-green-700 px-4 py-3 mx-2 rounded-xl text-sm animate-in fade-in slide-in-from-top-2 shrink-0 flex items-center">
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
                    <div className="flex-1 overflow-auto rounded-xl outline outline-1 outline-offset-[-1px] outline-[#E8EEF8] custom-scrollbar mx-2 mb-2">
                        {activeTab === 'MASTERFEES' ? (
                            (() => {
                                if (mfLoading) {
                                    return (
                                        <div className="flex flex-col items-center justify-center h-full py-16 text-center">
                                            <Loader2 className="h-8 w-8 text-gray-300 animate-spin mb-4" />
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
                                            <tr className="border-b border-[#E8EEF8]">
                                                <th className="py-2.5 px-6 text-xs font-semibold text-[#111827]">Fee Category</th>
                                                <th className="py-2.5 px-3 text-xs font-semibold text-[#111827]">Price</th>
                                                <th className="py-2.5 px-3 text-xs font-semibold text-[#111827]">Type</th>
                                                <th className="py-2.5 px-3 text-xs font-semibold text-[#111827]">Income Account</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {mfCategories.map((cat) => (
                                                <tr key={cat.id} className="group transition-colors border-b border-[#E8EEF8]/40 hover:bg-gray-50/70">
                                                    <td className="py-3.5 px-6">
                                                        <div className="flex items-center">
                                                            <div className="flex-shrink-0 h-10 w-10 rounded-xl bg-brand-navy/10 overflow-hidden flex items-center justify-center shadow-inner">
                                                                <GraduationCap className="h-5 w-5 text-brand-navy" />
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
                                <>
                                    {/* ── Mobile: cards ── */}
                                    <div className="md:hidden divide-y divide-[#E8EEF8]">
                                        {filteredProducts.map((product) => (
                                            <div key={product.id} className="p-4 flex items-start gap-3">
                                                <div className="flex-shrink-0 h-11 w-11 rounded-xl bg-[#0058DB]/10 overflow-hidden flex items-center justify-center shadow-inner">
                                                    {product.image_url ? (
                                                        <img src={product.image_url} alt="" className="h-full w-full object-cover" />
                                                    ) : (
                                                        <ShoppingBag className="h-5 w-5 text-[#0058DB]" />
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div className="min-w-0">
                                                            <div className="text-base font-semibold font-['DM_Sans'] leading-5 text-gray-900 truncate">{product.name}</div>
                                                            <div className="text-[10px] text-gray-400 font-bold tracking-wider uppercase truncate mt-0.5">{product.description || 'No description'}</div>
                                                        </div>
                                                        <div className="relative flex-shrink-0" ref={openDropdownId === product.id ? dropdownRef : null}>
                                                            <button
                                                                onClick={() => setOpenDropdownId(openDropdownId === product.id ? null : product.id)}
                                                                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all"
                                                            >
                                                                <MoreHorizontal size={16} />
                                                            </button>
                                                            {openDropdownId === product.id && (
                                                                <div className="absolute right-0 top-[calc(100%+4px)] z-50 w-48 bg-white rounded-xl shadow-[0px_8px_24px_0px_rgba(17,24,39,0.12)] outline outline-1 outline-offset-[-1px] outline-[#E8EEF8] overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                                                                    <button onClick={() => { setShareProduct(product); setOpenDropdownId(null); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-[#F3F5FC] transition-colors">
                                                                        <Share2 size={14} className="text-[#0058DB]" />
                                                                        <span className="text-xs font-medium text-gray-700">Share Payment Link</span>
                                                                    </button>
                                                                    {isAdmin && (
                                                                        <>
                                                                            <button onClick={() => { handleOpenEditModal(product); setOpenDropdownId(null); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-[#F3F5FC] transition-colors border-t border-[#E8EEF8]/50">
                                                                                <Edit2 size={14} className="text-gray-500" />
                                                                                <span className="text-xs font-medium text-gray-700">Edit Details</span>
                                                                            </button>
                                                                            <button onClick={() => { handleDownloadSalesCSV(product.id, product.name); setOpenDropdownId(null); }} disabled={downloadingId === product.id} className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-[#F3F5FC] transition-colors disabled:opacity-50">
                                                                                {downloadingId === product.id ? <Loader2 size={14} className="animate-spin text-gray-500" /> : <Download size={14} className="text-gray-500" />}
                                                                                <span className="text-xs font-medium text-gray-700">Download Sales CSV</span>
                                                                            </button>
                                                                            <button onClick={() => { handleDelete(product.id, product.name); setOpenDropdownId(null); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-red-50 transition-colors border-t border-[#E8EEF8]/50 group/delete">
                                                                                <Trash2 size={14} className="text-red-400 group-hover/delete:text-red-600" />
                                                                                <span className="text-xs font-medium text-red-500 group-hover/delete:text-red-700">Delete Product</span>
                                                                            </button>
                                                                        </>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                                                        <span className="text-sm font-semibold font-['DM_Sans'] text-gray-900">
                                                            {product.price != null ? `K${Number(product.price).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : <span className="text-gray-400 font-medium text-xs">Variable</span>}
                                                        </span>
                                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase ${typeBadgeClass(product.product_type)}`}>
                                                            {typeLabel(product.product_type)}
                                                        </span>
                                                        <span className={`px-2 py-0.5 inline-flex text-[10px] font-bold leading-5 rounded-full border ${product.is_active ? 'bg-green-50 text-green-700 border-green-100' : 'bg-gray-50 text-gray-700 border-gray-100'}`}>
                                                            {product.is_active ? 'ACTIVE' : 'INACTIVE'}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* ── Desktop: table ── */}
                                    <table className="hidden md:table w-full text-left">
                                        <thead className="bg-white">
                                            <tr className="border-b border-[#E8EEF8]">
                                                <th className="py-2.5 px-6 text-xs font-semibold text-[#111827]">Product / Service</th>
                                                <th className="py-2.5 px-3 text-xs font-semibold text-[#111827]">Price</th>
                                                <th className="py-2.5 px-3 text-xs font-semibold text-[#111827]">Type</th>
                                                <th className="py-2.5 px-3 text-xs font-semibold text-[#111827]">Status</th>
                                                <th className="py-2.5 px-6 w-12"></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredProducts.map((product) => (
                                                <tr key={product.id} className="group transition-colors border-b border-[#E8EEF8]/40 hover:bg-gray-50/70">
                                                    <td className="py-3.5 px-6">
                                                        <div className="flex items-center">
                                                            <div className="flex-shrink-0 h-10 w-10 rounded-xl bg-[#0058DB]/10 overflow-hidden flex items-center justify-center shadow-inner transition-transform group-hover:scale-110">
                                                                {product.image_url ? (
                                                                    <img src={product.image_url} alt="" className="h-full w-full object-cover" />
                                                                ) : (
                                                                    <ShoppingBag className="h-5 w-5 text-[#0058DB]" />
                                                                )}
                                                            </div>
                                                            <div className="ml-4">
                                                                <div className="text-sm font-bold text-gray-900 leading-tight">{product.name}</div>
                                                                <div className="text-xs text-gray-500 font-medium max-w-[280px] truncate">{product.description || 'No description'}</div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="py-3.5 px-3 whitespace-nowrap">
                                                        <div className="text-sm font-bold text-gray-900">
                                                            {product.price != null ? `K${Number(product.price).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : <span className="text-gray-400 font-medium text-xs">Variable</span>}
                                                        </div>
                                                    </td>
                                                    <td className="py-3.5 px-3 whitespace-nowrap">
                                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase ${typeBadgeClass(product.product_type)}`}>
                                                            {typeLabel(product.product_type)}
                                                        </span>
                                                    </td>
                                                    <td className="py-3.5 px-3 whitespace-nowrap">
                                                        <span className={`px-2.5 py-0.5 inline-flex text-[10px] font-bold leading-5 rounded-full border ${
                                                            product.is_active
                                                                ? 'bg-green-50 text-green-700 border-green-100'
                                                                : 'bg-gray-50 text-gray-700 border-gray-100'
                                                        }`}>
                                                            {product.is_active ? 'ACTIVE' : 'INACTIVE'}
                                                        </span>
                                                    </td>
                                                    <td className="py-3.5 px-6 whitespace-nowrap text-center">
                                                        <div className="relative flex justify-end" ref={openDropdownId === product.id ? dropdownRef : null}>
                                                            <button
                                                                onClick={() => setOpenDropdownId(openDropdownId === product.id ? null : product.id)}
                                                                className="p-1.5 rounded-lg border border-transparent hover:border-[#E8EEF8] hover:bg-[#F3F5FC] text-gray-400 hover:text-gray-600 transition-all"
                                                            >
                                                                <MoreHorizontal size={16} />
                                                            </button>
                                                            {openDropdownId === product.id && (
                                                                <div className="absolute right-0 top-[calc(100%+4px)] z-50 w-48 bg-white rounded-xl shadow-[0px_8px_24px_0px_rgba(17,24,39,0.12)] outline outline-1 outline-offset-[-1px] outline-[#E8EEF8] overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                                                                    <button onClick={() => { setShareProduct(product); setOpenDropdownId(null); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-[#F3F5FC] transition-colors">
                                                                        <Share2 size={14} className="text-[#0058DB]" />
                                                                        <span className="text-xs font-medium text-gray-700">Share Payment Link</span>
                                                                    </button>
                                                                    {isAdmin && (
                                                                        <>
                                                                            <button onClick={() => { handleOpenEditModal(product); setOpenDropdownId(null); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-[#F3F5FC] transition-colors border-t border-[#E8EEF8]/50">
                                                                                <Edit2 size={14} className="text-gray-500" />
                                                                                <span className="text-xs font-medium text-gray-700">Edit Details</span>
                                                                            </button>
                                                                            <button onClick={() => { handleDownloadSalesCSV(product.id, product.name); setOpenDropdownId(null); }} disabled={downloadingId === product.id} className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-[#F3F5FC] transition-colors disabled:opacity-50">
                                                                                {downloadingId === product.id ? <Loader2 size={14} className="animate-spin text-gray-500" /> : <Download size={14} className="text-gray-500" />}
                                                                                <span className="text-xs font-medium text-gray-700">Download Sales CSV</span>
                                                                            </button>
                                                                            <button onClick={() => { handleDelete(product.id, product.name); setOpenDropdownId(null); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-red-50 transition-colors border-t border-[#E8EEF8]/50 group/delete">
                                                                                <Trash2 size={14} className="text-red-400 group-hover/delete:text-red-600" />
                                                                                <span className="text-xs font-medium text-red-500 group-hover/delete:text-red-700">Delete Product</span>
                                                                            </button>
                                                                        </>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </>
                            );
                        })()}
                    </div>
                </div>
            </div>


            {isModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm sm:p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-t-3xl sm:rounded-3xl shadow-xl w-full sm:max-w-lg overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200 max-h-[94vh] flex flex-col">

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
                            <div className="px-6 pb-6 space-y-5 overflow-y-auto flex-1">
                                {error && (
                                    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2.5 rounded-2xl text-sm flex items-center">
                                        <AlertCircle className="h-5 w-5 mr-2 flex-shrink-0" />
                                        {error}
                                    </div>
                                )}

                                {/* Image upload — prominent, top of form */}
                                <div className="flex items-center gap-4">
                                    <button
                                        type="button"
                                        onClick={() => document.getElementById('product-img-input')?.click()}
                                        aria-label="Upload product image"
                                        className="relative w-20 h-20 rounded-2xl bg-gray-50 border-2 border-dashed border-gray-200 flex items-center justify-center overflow-hidden hover:border-[#0058DB]/50 hover:bg-blue-50/30 transition-all flex-shrink-0"
                                    >
                                        {uploadingImage ? (
                                            <Loader2 className="h-5 w-5 text-[#0058DB] animate-spin" />
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
                                        className="block w-full px-4 py-3 bg-white border border-gray-200 rounded-2xl text-sm focus:ring-2 focus:ring-[#0058DB]/20 focus:border-[#0058DB] outline-none transition-all disabled:bg-gray-50 placeholder-gray-400"
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
                                            className="block w-full px-3 py-3 bg-white border border-gray-200 rounded-2xl text-sm focus:ring-2 focus:ring-[#0058DB]/20 focus:border-[#0058DB] outline-none transition-all disabled:bg-gray-50"
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
                                            className="block w-full px-3 py-3 bg-white border border-gray-200 rounded-2xl text-sm focus:ring-2 focus:ring-[#0058DB]/20 focus:border-[#0058DB] outline-none transition-all disabled:bg-gray-50 placeholder-gray-400"
                                            placeholder="e.g. Shoes"
                                        />
                                        <datalist id="product-categories">
                                            {existingCategories.map(c => <option key={c} value={c} />)}
                                        </datalist>
                                    </div>
                                </div>
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

                                {/* Price */}
                                {!isDonation && (
                                    <div>
                                        <label className="block text-sm font-bold text-gray-800 mb-1.5">
                                            {isBooking ? `Price per ${isDailyBooking ? 'day' : 'night'}` : isVariable ? 'Default / quoted price' : 'Selling price'}
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
                                                className="block w-full pl-14 pr-4 py-3 bg-white border border-gray-200 rounded-2xl text-sm focus:ring-2 focus:ring-[#0058DB]/20 focus:border-[#0058DB] outline-none transition-all disabled:bg-gray-50"
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
                                        className="block w-full px-4 py-3 bg-white border border-gray-200 rounded-2xl text-sm focus:ring-2 focus:ring-[#0058DB]/20 focus:border-[#0058DB] outline-none transition-all disabled:bg-gray-50 resize-none placeholder-gray-400"
                                        placeholder="A short description customers will see..."
                                    />
                                </div>

                                {/* Revenue wallet + Income account */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-sm font-bold text-gray-800 mb-1.5 flex items-center gap-1"><Wallet className="h-3.5 w-3.5 text-gray-400" />Wallet</label>
                                        <select name="wallet_id" value={formData.wallet_id} onChange={handleChange} disabled={submitting} className="block w-full px-3 py-3 bg-white border border-gray-200 rounded-2xl text-sm focus:ring-2 focus:ring-[#0058DB]/20 focus:border-[#0058DB] outline-none transition-all disabled:bg-gray-50">
                                            <option value="">Default</option>
                                            {wallets.map(w => <option key={w.id} value={w.id}>{w.name}{w.is_main ? ' (Main)' : ''}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-gray-800 mb-1.5 flex items-center gap-1"><BookOpen className="h-3.5 w-3.5 text-gray-400" />Account</label>
                                        <select name="income_account_id" value={formData.income_account_id} onChange={handleChange} disabled={submitting} className="block w-full px-3 py-3 bg-white border border-gray-200 rounded-2xl text-sm focus:ring-2 focus:ring-[#0058DB]/20 focus:border-[#0058DB] outline-none transition-all disabled:bg-gray-50">
                                            <option value="">Auto (AI)</option>
                                            {incomeAccounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                                        </select>
                                    </div>
                                </div>

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
                                                <div className="w-8 h-8 rounded-xl bg-[#0058DB]/10 flex items-center justify-center flex-shrink-0">
                                                    <svg className="w-4 h-4 text-[#0058DB]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
                                            <div className={`relative w-10 h-6 rounded-full transition-colors flex-shrink-0 ${formData.requires_delivery ? 'bg-[#0058DB]' : 'bg-gray-200'}`}>
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
                                                    <div className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ml-3 ${formData.allow_external_delivery ? 'bg-[#0058DB]' : 'bg-gray-200'}`}>
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
                                                                className="block w-full pl-7 pr-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-[#0058DB]/20 focus:border-[#0058DB] outline-none transition-all"
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

                                {/* ── Additional gallery images ── */}
                                <div>
                                    <label className="block text-sm font-bold text-gray-800 mb-1">
                                        Additional Images <span className="text-xs font-medium text-gray-400 ml-1">Optional</span>
                                    </label>
                                    <p className="text-xs text-gray-400 mb-2">Customers can swipe through these on the product detail page.</p>
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
                                        {uploadingAdditionalImage ? 'Uploading...' : 'Add Photo'}
                                        <input type="file" accept="image/*" className="hidden" onChange={handleUploadAdditionalImage} disabled={submitting || uploadingAdditionalImage} />
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
                                                    <div className="w-1.5 h-1.5 rounded-full bg-[#0058DB] flex-shrink-0 mt-0.5" />
                                                    <input
                                                        type="text"
                                                        value={item}
                                                        onChange={(e) => setWhatsIncluded(prev => prev.map((s, i) => i === idx ? e.target.value : s))}
                                                        disabled={submitting}
                                                        placeholder="e.g. Free delivery included"
                                                        className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-[#0058DB]/20 focus:border-[#0058DB] outline-none transition-all disabled:bg-gray-50 placeholder-gray-400"
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
                                    <div className={`relative w-10 h-6 rounded-full transition-colors flex-shrink-0 ${formData.is_active ? 'bg-[#0058DB]' : 'bg-gray-200'}`}>
                                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${formData.is_active ? 'translate-x-5' : 'translate-x-1'}`} />
                                    </div>
                                </button>
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
                                    className="inline-flex items-center px-6 py-2.5 text-sm font-bold text-white bg-black hover:bg-gray-900 rounded-xl focus:ring-2 focus:ring-offset-2 focus:ring-black transition-colors disabled:opacity-50"
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

            <ShareProductLinkModal
                isOpen={!!shareProduct}
                onClose={() => setShareProduct(null)}
                product={shareProduct}
            />
        </div>
    );
};

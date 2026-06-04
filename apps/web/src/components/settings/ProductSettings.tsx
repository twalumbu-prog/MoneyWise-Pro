import React, { useState, useEffect } from 'react';
import { productService, Product } from '../../services/product.service';
import { useAuth } from '../../context/AuthContext';
import { 
    ShoppingBag, 
    Plus, 
    Edit2, 
    Trash2, 
    Loader2, 
    CheckCircle, 
    AlertCircle, 
    DollarSign, 
    Tag, 
    X,
    Eye,
    Download
} from 'lucide-react';

export const ProductSettings: React.FC = () => {
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const { userRole } = useAuth();
    const isAdmin = userRole === 'ADMIN';

    // Modal / Form state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        price: '',
        is_active: true
    });

    useEffect(() => {
        loadProducts();
    }, []);

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

    const handleOpenAddModal = () => {
        setEditingProduct(null);
        setFormData({
            name: '',
            description: '',
            price: '',
            is_active: true
        });
        setIsModalOpen(true);
    };

    const handleOpenEditModal = (product: Product) => {
        setEditingProduct(product);
        setFormData({
            name: product.name,
            description: product.description || '',
            price: product.price.toString(),
            is_active: product.is_active
        });
        setIsModalOpen(true);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, checked } = e.target;
        setFormData(prev => ({ ...prev, [name]: checked }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!isAdmin) return;

        if (!formData.name.trim()) {
            setError('Product name is required.');
            return;
        }

        const priceNum = Number(formData.price);
        if (isNaN(priceNum) || priceNum < 0) {
            setError('Please enter a valid price (greater than or equal to 0).');
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
                is_active: formData.is_active
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
        <div className="space-y-6">
            <div className="bg-white shadow-sm rounded-xl border border-gray-200 overflow-hidden">
                <div className="p-6 border-b border-gray-100 bg-gray-50/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <h3 className="text-lg font-bold text-brand-navy flex items-center">
                            <ShoppingBag className="h-5 w-5 mr-2 text-brand-green" />
                            Products & Services
                        </h3>
                        <p className="text-gray-500 text-sm mt-1 font-brand-family">
                            Configure products and services that your organization offers. Customers can pay for these directly using public wallet links.
                        </p>
                    </div>
                    {isAdmin && (
                        <button
                            onClick={handleOpenAddModal}
                            className="bg-brand-green hover:bg-[#238914] text-white px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest transition-all shadow-sm flex items-center justify-center shrink-0"
                        >
                            <Plus className="h-4 w-4 mr-1.5" strokeWidth={3} />
                            Add Product
                        </button>
                    )}
                </div>

                <div className="p-6">
                    {error && (
                        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex items-center">
                            <AlertCircle className="h-5 w-5 mr-2 flex-shrink-0" />
                            {error}
                        </div>
                    )}

                    {successMessage && (
                        <div className="mb-6 bg-green-50 border border-brand-green text-green-700 px-4 py-3 rounded-xl text-sm flex items-center">
                            <CheckCircle className="h-5 w-5 mr-2 flex-shrink-0" />
                            {successMessage}
                        </div>
                    )}

                    {!isAdmin && (
                        <div className="mb-6 bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded-xl text-sm flex items-start">
                            <Eye className="h-5 w-5 mr-2 flex-shrink-0 mt-0.5" />
                            <p>You are viewing this information in read-only mode because you are not an Administrator.</p>
                        </div>
                    )}

                    {products.length === 0 ? (
                        <div className="text-center py-12 bg-gray-50/50 rounded-2xl border-2 border-dashed border-gray-200">
                            <ShoppingBag className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                            <p className="text-gray-900 font-bold">No products configured yet</p>
                            <p className="text-sm text-gray-400 mt-1">Configure products to let customers make online deposits into specific wallets.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto rounded-xl border border-gray-150 shadow-2xs">
                            <table className="min-w-full divide-y divide-gray-200 text-left">
                                <thead className="bg-gray-50 text-xs font-black uppercase text-gray-400 tracking-wider">
                                    <tr>
                                        <th className="px-6 py-4">Name</th>
                                        <th className="px-6 py-4">Description</th>
                                        <th className="px-6 py-4 text-right">Price</th>
                                        <th className="px-6 py-4 text-center">Status</th>
                                        {isAdmin && <th className="px-6 py-4 text-right">Actions</th>}
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-100 text-sm text-slate-800">
                                    {products.map(product => (
                                        <tr key={product.id} className="hover:bg-gray-50/50 transition-colors">
                                            <td className="px-6 py-4 font-bold text-brand-navy">
                                                {product.name}
                                            </td>
                                            <td className="px-6 py-4 text-gray-500 font-brand-family max-w-xs truncate">
                                                {product.description || <span className="text-gray-300 italic">No description</span>}
                                            </td>
                                            <td className="px-6 py-4 text-right font-black text-slate-900">
                                                K {Number(product.price).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${product.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                                                    {product.is_active ? 'Active' : 'Inactive'}
                                                </span>
                                            </td>
                                            {isAdmin && (
                                                <td className="px-6 py-4 text-right whitespace-nowrap">
                                                    <div className="flex justify-end gap-2">
                                                        <button
                                                            onClick={() => handleDownloadSalesCSV(product.id, product.name)}
                                                            disabled={downloadingId === product.id}
                                                            className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors disabled:opacity-50"
                                                            title="Download Sales CSV"
                                                        >
                                                            {downloadingId === product.id ? (
                                                                <Loader2 className="h-4 w-4 animate-spin text-green-600" />
                                                            ) : (
                                                                <Download className="h-4 w-4" />
                                                            )}
                                                        </button>
                                                        <button
                                                            onClick={() => handleOpenEditModal(product)}
                                                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                            title="Edit Product"
                                                        >
                                                            <Edit2 className="h-4 w-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDelete(product.id, product.name)}
                                                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                            title="Delete Product"
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </button>
                                                    </div>
                                                </td>
                                            )}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {/* Add / Edit Product Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                            <h3 className="font-bold text-brand-navy flex items-center">
                                <ShoppingBag className="h-5 w-5 mr-2 text-brand-green" />
                                {editingProduct ? 'Edit Product/Service' : 'Add Product/Service'}
                            </h3>
                            <button
                                onClick={() => !submitting && setIsModalOpen(false)}
                                disabled={submitting}
                                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit}>
                            <div className="p-6 space-y-4">
                                {error && (
                                    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2.5 rounded-xl text-sm flex items-center">
                                        <AlertCircle className="h-5 w-5 mr-2 flex-shrink-0" />
                                        {error}
                                    </div>
                                )}

                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                                        Product/Service Name <span className="text-red-500">*</span>
                                    </label>
                                    <div className="relative">
                                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                            <Tag className="h-4 w-4 text-gray-400" />
                                        </div>
                                        <input
                                            type="text"
                                            name="name"
                                            value={formData.name}
                                            onChange={handleChange}
                                            disabled={submitting}
                                            required
                                            className="block w-full pl-10 pr-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-green/20 focus:border-brand-green outline-none transition-all disabled:bg-gray-50"
                                            placeholder="e.g. Standard Consultation"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                                        Price (K) <span className="text-red-500">*</span>
                                    </label>
                                    <div className="relative">
                                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                            <DollarSign className="h-4 w-4 text-gray-400" />
                                        </div>
                                        <input
                                            type="number"
                                            name="price"
                                            step="0.01"
                                            min="0"
                                            value={formData.price}
                                            onChange={handleChange}
                                            disabled={submitting}
                                            required
                                            className="block w-full pl-10 pr-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-green/20 focus:border-brand-green outline-none transition-all disabled:bg-gray-50"
                                            placeholder="0.00"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                                        Description
                                    </label>
                                    <textarea
                                        name="description"
                                        value={formData.description}
                                        onChange={handleChange}
                                        disabled={submitting}
                                        rows={3}
                                        className="block w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-green/20 focus:border-brand-green outline-none transition-all disabled:bg-gray-50 resize-none font-brand-family"
                                        placeholder="Describe the product or service..."
                                    />
                                </div>

                                <div className="flex items-center">
                                    <input
                                        type="checkbox"
                                        id="is_active"
                                        name="is_active"
                                        checked={formData.is_active}
                                        onChange={handleCheckboxChange}
                                        disabled={submitting}
                                        className="h-4 w-4 rounded border-gray-300 text-brand-green focus:ring-brand-green"
                                    />
                                    <label htmlFor="is_active" className="ml-2 block text-sm font-semibold text-gray-900">
                                        Active (visible to customers on the payment portal)
                                    </label>
                                </div>
                            </div>

                            <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    disabled={submitting}
                                    className="px-5 py-2.5 text-sm font-bold text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={submitting || !formData.name.trim() || formData.price === ''}
                                    className="inline-flex items-center px-6 py-2.5 text-sm font-bold text-white bg-brand-green hover:bg-[#238914] rounded-xl focus:ring-2 focus:ring-offset-2 focus:ring-brand-green transition-colors disabled:opacity-50"
                                >
                                    {submitting ? (
                                        <>
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                            Saving...
                                        </>
                                    ) : (
                                        'Save Product'
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

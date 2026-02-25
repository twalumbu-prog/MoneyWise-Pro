import React, { useState, useEffect } from 'react';
import { organizationService } from '../../services/organization.service';
import { Building2, Mail, Phone, MapPin, Globe, Loader2, CheckCircle, AlertCircle, FileText, Trash2, AlertTriangle, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export const GeneralSettings: React.FC = () => {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const { userRole, signOut } = useAuth();
    const isAdmin = userRole === 'ADMIN';

    // Delete organization state
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleteConfirmText, setDeleteConfirmText] = useState('');
    const [deleting, setDeleting] = useState(false);

    // Form state
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        phone: '',
        address: '',
        tax_id: '',
        website: ''
    });

    useEffect(() => {
        loadOrganization();
    }, []);

    const loadOrganization = async () => {
        try {
            setLoading(true);
            setError(null);
            const data = await organizationService.getOrganization();
            setFormData({
                name: data.name || '',
                email: data.email || '',
                phone: data.phone || '',
                address: data.address || '',
                tax_id: data.tax_id || '',
                website: data.website || ''
            });
        } catch (err: any) {
            console.error('Failed to load organization:', err);
            setError('Failed to load organization details.');
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!isAdmin) {
            setError('Only administrators can update organization settings.');
            return;
        }

        try {
            setSaving(true);
            setError(null);
            setSuccessMessage(null);

            await organizationService.updateOrganization(formData);
            setSuccessMessage('Organization details successfully updated.');

            setTimeout(() => setSuccessMessage(null), 3000);
        } catch (err: any) {
            console.error('Update failed:', err);
            setError(err.response?.data?.error || err.message || 'Failed to update organization details.');
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteOrganization = async () => {
        if (deleteConfirmText !== formData.name) return;

        try {
            setDeleting(true);
            setError(null);
            await organizationService.deleteOrganization();

            // On success, force close modal and log the user out
            setShowDeleteModal(false);
            await signOut();

        } catch (err: any) {
            console.error('Delete failed:', err);
            setError(err.response?.data?.error || err.message || 'Failed to delete organization.');
            setDeleting(false);
            setShowDeleteModal(false);
        }
    };

    if (loading) {
        return (
            <div className="bg-white shadow-sm rounded-xl border border-gray-200 p-12 flex justify-center items-center">
                <Loader2 className="h-8 w-8 animate-spin text-brand-green" />
                <span className="ml-3 text-gray-500 font-medium">Loading organization details...</span>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="bg-white shadow-sm rounded-xl border border-gray-200 overflow-hidden">
                <div className="p-6 border-b border-gray-100 bg-gray-50/50">
                    <h3 className="text-lg font-bold text-brand-navy flex items-center">
                        <Building2 className="h-5 w-5 mr-2 text-brand-green" />
                        Organization Profile
                    </h3>
                    <p className="text-gray-500 text-sm mt-1">
                        Manage your company's general information and contact details.
                    </p>
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
                            <AlertCircle className="h-5 w-5 mr-2 flex-shrink-0 mt-0.5" />
                            <p>You are viewing this information in read-only mode because you are not an Administrator.</p>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-6">
                        {/* Basic Info */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    Organization Name <span className="text-red-500">*</span>
                                </label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <Building2 className="h-4 w-4 text-gray-400" />
                                    </div>
                                    <input
                                        type="text"
                                        name="name"
                                        value={formData.name}
                                        onChange={handleChange}
                                        disabled={!isAdmin || saving}
                                        required
                                        className="block w-full pl-10 pr-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-green/20 focus:border-brand-green outline-none transition-all disabled:bg-gray-50 disabled:text-gray-500"
                                        placeholder="Enter organization name"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    Tax ID / Registration Number
                                </label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <FileText className="h-4 w-4 text-gray-400" />
                                    </div>
                                    <input
                                        type="text"
                                        name="tax_id"
                                        value={formData.tax_id}
                                        onChange={handleChange}
                                        disabled={!isAdmin || saving}
                                        className="block w-full pl-10 pr-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-green/20 focus:border-brand-green outline-none transition-all disabled:bg-gray-50 disabled:text-gray-500"
                                        placeholder="e.g. VAT-12345678"
                                    />
                                </div>
                            </div>
                        </div>

                        <hr className="border-gray-100" />

                        {/* Contact Info */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    Official Email Address
                                </label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <Mail className="h-4 w-4 text-gray-400" />
                                    </div>
                                    <input
                                        type="email"
                                        name="email"
                                        value={formData.email}
                                        onChange={handleChange}
                                        disabled={!isAdmin || saving}
                                        className="block w-full pl-10 pr-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-green/20 focus:border-brand-green outline-none transition-all disabled:bg-gray-50 disabled:text-gray-500"
                                        placeholder="contact@company.com"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    Contact Phone Number
                                </label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <Phone className="h-4 w-4 text-gray-400" />
                                    </div>
                                    <input
                                        type="tel"
                                        name="phone"
                                        value={formData.phone}
                                        onChange={handleChange}
                                        disabled={!isAdmin || saving}
                                        className="block w-full pl-10 pr-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-green/20 focus:border-brand-green outline-none transition-all disabled:bg-gray-50 disabled:text-gray-500"
                                        placeholder="+1 (555) 000-0000"
                                    />
                                </div>
                            </div>

                            <div className="md:col-span-2">
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    Website URL
                                </label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <Globe className="h-4 w-4 text-gray-400" />
                                    </div>
                                    <input
                                        type="url"
                                        name="website"
                                        value={formData.website}
                                        onChange={handleChange}
                                        disabled={!isAdmin || saving}
                                        className="block w-full pl-10 pr-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-green/20 focus:border-brand-green outline-none transition-all disabled:bg-gray-50 disabled:text-gray-500"
                                        placeholder="https://www.example.com"
                                    />
                                </div>
                            </div>

                            <div className="md:col-span-2">
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    Physical Address
                                </label>
                                <div className="relative">
                                    <div className="absolute top-3 left-3 pointer-events-none">
                                        <MapPin className="h-4 w-4 text-gray-400" />
                                    </div>
                                    <textarea
                                        name="address"
                                        value={formData.address}
                                        onChange={handleChange}
                                        disabled={!isAdmin || saving}
                                        rows={3}
                                        className="block w-full pl-10 pr-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-green/20 focus:border-brand-green outline-none transition-all disabled:bg-gray-50 disabled:text-gray-500 resize-none"
                                        placeholder="123 Business Rd, Suite 100&#10;City, State, ZIP&#10;Country"
                                    />
                                </div>
                            </div>
                        </div>

                        {isAdmin && (
                            <div className="pt-4 flex justify-end gap-3 border-t border-gray-100">
                                <button
                                    type="button"
                                    onClick={loadOrganization}
                                    disabled={saving}
                                    className="px-5 py-2.5 border border-gray-300 shadow-sm text-sm font-bold rounded-xl text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-green disabled:opacity-50 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving || !formData.name.trim()}
                                    className="inline-flex items-center px-6 py-2.5 border border-transparent shadow-sm text-sm font-bold rounded-xl text-white bg-brand-green hover:bg-[#238914] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-green disabled:opacity-50 transition-colors"
                                >
                                    {saving ? (
                                        <>
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                            Saving...
                                        </>
                                    ) : (
                                        'Save Changes'
                                    )}
                                </button>
                            </div>
                        )}
                    </form>
                </div>
            </div>

            {/* Danger Zone */}
            {
                isAdmin && (
                    <div className="mt-8 bg-red-50/30 border border-red-200 rounded-xl overflow-hidden">
                        <div className="p-6 border-b border-red-100 bg-red-50/50">
                            <h3 className="text-lg font-bold text-red-700 flex items-center">
                                <AlertTriangle className="h-5 w-5 mr-2" />
                                Danger Zone
                            </h3>
                            <p className="text-red-900/70 text-sm mt-1">
                                Irreversible and destructive actions for this organization.
                            </p>
                        </div>
                        <div className="p-6 flex items-center justify-between">
                            <div>
                                <h4 className="text-sm font-bold text-gray-900">Delete Organization</h4>
                                <p className="text-sm text-gray-500 mt-1 max-w-xl">
                                    Permanently delete this organization, all of its financial records (vouchers, ledgers, requisitions), and permanently remove all user accounts associated with it. <strong>This action cannot be undone.</strong>
                                </p>
                            </div>
                            <button
                                onClick={() => setShowDeleteModal(true)}
                                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-bold rounded-xl shadow-sm transition-colors focus:ring-2 focus:ring-red-500 focus:ring-offset-2 whitespace-nowrap"
                            >
                                Delete Organization
                            </button>
                        </div>
                    </div>
                )
            }

            {/* Delete Confirmation Modal */}
            {
                showDeleteModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-red-50/30">
                                <div className="flex items-center text-red-600">
                                    <AlertTriangle className="h-5 w-5 mr-2" />
                                    <h3 className="font-bold">Delete Organization</h3>
                                </div>
                                <button
                                    onClick={() => !deleting && setShowDeleteModal(false)}
                                    disabled={deleting}
                                    className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                            </div>

                            <div className="p-6 space-y-4">
                                <div className="bg-red-50 text-red-800 p-4 rounded-xl text-sm border border-red-100 leading-relaxed">
                                    <p className="font-bold mb-2">Warning: This is a permanent action.</p>
                                    <p>This will permanently destroy the organization <strong>{formData.name}</strong>, clear all financial and configuration databases, and permanently delete all user profiles. Your team members will have to sign up again from scratch.</p>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Please type <strong>{formData.name}</strong> to confirm.
                                    </label>
                                    <input
                                        type="text"
                                        value={deleteConfirmText}
                                        onChange={(e) => setDeleteConfirmText(e.target.value)}
                                        disabled={deleting}
                                        className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none transition-all disabled:bg-gray-50"
                                        placeholder={formData.name}
                                    />
                                </div>
                            </div>

                            <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => setShowDeleteModal(false)}
                                    disabled={deleting}
                                    className="px-5 py-2.5 text-sm font-bold text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={handleDeleteOrganization}
                                    disabled={deleteConfirmText !== formData.name || deleting}
                                    className="inline-flex items-center px-6 py-2.5 text-sm font-bold text-white bg-red-600 rounded-xl hover:bg-red-700 focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors disabled:opacity-50 disabled:bg-red-400"
                                >
                                    {deleting ? (
                                        <>
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                            Deleting...
                                        </>
                                    ) : (
                                        <>
                                            <Trash2 className="h-4 w-4 mr-2" />
                                            Permanently Delete
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
};

import React, { useState, useEffect, useRef } from 'react';
import { organizationService } from '../../services/organization.service';
import { departmentService, Department } from '../../services/department.service';
import {
    Building2,
    Loader2,
    AlertCircle,
    Trash2,
    AlertTriangle,
    X,
    Layers,
    Plus,
    Pencil,
    Check,
    CheckCircle,
    ToggleLeft,
    ToggleRight,
    Upload
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

import { supabase } from '../../lib/supabase';

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

    // Department state
    const [useDepartments, setUseDepartments] = useState(false);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [loadingDepts, setLoadingDepts] = useState(false);
    const [savingDeptToggle, setSavingDeptToggle] = useState(false);
    const [newDeptName, setNewDeptName] = useState('');
    const [addingDept] = useState(false);
    const [editingDeptId, setEditingDeptId] = useState<string | null>(null);
    const [editingDeptName, setEditingDeptName] = useState('');
    const [savingDept, setSavingDept] = useState(false);
    const newDeptInputRef = useRef<HTMLInputElement>(null);

    // Form state
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        phone: '',
        address: '',
        tax_id: '',
        website: ''
    });

    const [logoUrl, setLogoUrl] = useState<string | null>(null);
    const [uploadingLogo, setUploadingLogo] = useState(false);

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
            setLogoUrl(data.logo_url || null);
            setUseDepartments(data.use_departments ?? false);

            if (data.use_departments) {
                loadDepartments();
            }
        } catch (err: any) {
            console.error('Failed to load organization:', err);
            setError('Failed to load organization details.');
        } finally {
            setLoading(false);
        }
    };



    const loadDepartments = async () => {
        try {
            setLoadingDepts(true);
            const { departments } = await departmentService.list();
            setDepartments(departments);
        } catch (err) {
            console.error('Failed to load departments:', err);
        } finally {
            setLoadingDepts(false);
        }
    };

    const handleToggleDepartments = async (enabled: boolean) => {
        if (!isAdmin) return;
        try {
            setSavingDeptToggle(true);
            await organizationService.updateOrganization({ use_departments: enabled });
            setUseDepartments(enabled);
            if (enabled && departments.length === 0) {
                await loadDepartments();
            }
        } catch (err: any) {
            setError(err.message || 'Failed to update department setting');
        } finally {
            setSavingDeptToggle(false);
        }
    };

    const handleAddDepartment = async () => {
        if (!newDeptName.trim() || !isAdmin) return;
        try {
            setSavingDept(true);
            const dept = await departmentService.create(newDeptName);
            setDepartments(prev => [...prev, dept].sort((a, b) => a.name.localeCompare(b.name)));
            setNewDeptName('');
        } catch (err: any) {
            setError(err.message || 'Failed to create department');
        } finally {
            setSavingDept(false);
        }
    };

    const handleSaveEditDept = async (id: string) => {
        if (!editingDeptName.trim() || !isAdmin) return;
        try {
            setSavingDept(true);
            const updated = await departmentService.update(id, { name: editingDeptName });
            setDepartments(prev => prev.map(d => d.id === id ? updated : d).sort((a, b) => a.name.localeCompare(b.name)));
            setEditingDeptId(null);
        } catch (err: any) {
            setError(err.message || 'Failed to update department');
        } finally {
            setSavingDept(false);
        }
    };

    const handleDeleteDept = async (id: string, name: string) => {
        if (!isAdmin || !window.confirm(`Delete department "${name}"? This cannot be undone.`)) return;
        try {
            await departmentService.delete(id);
            setDepartments(prev => prev.filter(d => d.id !== id));
        } catch (err: any) {
            setError(err.message || 'Failed to delete department');
        }
    };



    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleUploadLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !isAdmin) return;

        try {
            setUploadingLogo(true);
            setError(null);

            // 1. Upload to Supabase Storage
            const fileExt = file.name.split('.').pop();
            const orgData = await organizationService.getOrganization();
            const filePath = `${orgData.id}/logo-${Date.now()}.${fileExt}`;

            const { data: uploadData, error: uploadError } = await supabase.storage
                .from('organization-logos')
                .upload(filePath, file, { cacheControl: '3600', upsert: true });

            if (uploadError) throw uploadError;

            // 2. Get Public URL
            const publicUrl = supabase.storage
                .from('organization-logos')
                .getPublicUrl(uploadData.path).data.publicUrl;

            // 3. Save in DB
            await organizationService.updateOrganization({ logo_url: publicUrl });

            setLogoUrl(publicUrl);
            setSuccessMessage('Logo uploaded and saved successfully.');
            setTimeout(() => setSuccessMessage(null), 3000);
        } catch (err: any) {
            console.error('Logo upload failed:', err);
            setError(err.message || 'Failed to upload logo.');
        } finally {
            setUploadingLogo(false);
        }
    };

    const handleRemoveLogo = async () => {
        if (!isAdmin) return;
        try {
            setUploadingLogo(true);
            setError(null);

            await organizationService.updateOrganization({ logo_url: null as any });
            setLogoUrl(null);
            setSuccessMessage('Logo removed successfully.');
            setTimeout(() => setSuccessMessage(null), 3000);
        } catch (err: any) {
            console.error('Logo removal failed:', err);
            setError(err.message || 'Failed to remove logo.');
        } finally {
            setUploadingLogo(false);
        }
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
            <div className="overflow-hidden">
                <div className="pb-6 border-b border-gray-100 mb-8">
                    <h3 className="justify-center text-gray-900 text-base font-semibold font-['DM_Sans'] leading-5">
                        General Settings
                    </h3>
                    <p className="text-[10px] text-gray-400 font-bold tracking-wider uppercase mt-1">
                        Manage your organization's basic information and preferences.
                    </p>
                </div>

                <div className="py-6">
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

                    <form onSubmit={handleSubmit} className="space-y-6 max-w-4xl">
                        {/* Logo Upload Section */}
                        <div className="flex items-start gap-6 mb-8">
                            <div className="h-[72px] w-[72px] rounded-xl bg-gray-50 flex items-center justify-center overflow-hidden shrink-0 border border-gray-100">
                                {logoUrl ? (
                                    <img src={logoUrl} alt="Logo" className="h-full w-full object-cover" />
                                ) : (
                                    <Building2 className="h-6 w-6 text-gray-400" />
                                )}
                                {uploadingLogo && (
                                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center rounded-xl">
                                        <Loader2 className="h-5 w-5 animate-spin text-white" />
                                    </div>
                                )}
                            </div>
                            <div className="pt-1">
                                <label className="block text-[10px] text-gray-400 font-bold tracking-wider uppercase mb-2">
                                    Business Logo
                                </label>
                                {isAdmin && (
                                    <div className="flex flex-col gap-2">
                                        <div className="flex items-center gap-3">
                                            <label className="bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors flex items-center justify-center">
                                                <Upload className="w-3.5 h-3.5 mr-1.5" />
                                                Upload Image
                                                <input 
                                                    type="file" 
                                                    accept="image/png, image/jpeg, image/gif, image/webp" 
                                                    onChange={handleUploadLogo} 
                                                    disabled={uploadingLogo} 
                                                    className="hidden" 
                                                />
                                            </label>
                                            {logoUrl && (
                                                <button
                                                    type="button"
                                                    onClick={handleRemoveLogo}
                                                    disabled={uploadingLogo}
                                                    className="bg-white hover:bg-red-50 text-red-600 border border-gray-200 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center"
                                                >
                                                    Remove Logo
                                                </button>
                                            )}
                                        </div>
                                        <p className="text-[10px] text-gray-400 font-medium">PNG or JPG, square image recommended.</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Grid Form Fields */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-6">
                            <div>
                                <label className="block text-[10px] text-gray-400 font-bold tracking-wider uppercase mb-1.5">
                                    Business Name
                                </label>
                                <input
                                    type="text"
                                    name="name"
                                    value={formData.name}
                                    onChange={handleChange}
                                    disabled={!isAdmin || saving}
                                    required
                                    className="block w-full px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-[#10A34A]/20 focus:border-[#10A34A] outline-none transition-all disabled:bg-gray-50 disabled:text-gray-500"
                                    placeholder="Twalumbu Education Centre"
                                />
                            </div>

                            <div>
                                <label className="block text-[10px] text-gray-400 font-bold tracking-wider uppercase mb-1.5">
                                    Contact Email
                                </label>
                                <input
                                    type="email"
                                    name="email"
                                    value={formData.email}
                                    onChange={handleChange}
                                    disabled={!isAdmin || saving}
                                    className="block w-full px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-[#10A34A]/20 focus:border-[#10A34A] outline-none transition-all disabled:bg-gray-50 disabled:text-gray-500"
                                    placeholder="business@example.com"
                                />
                            </div>

                            <div>
                                <label className="block text-[10px] text-gray-400 font-bold tracking-wider uppercase mb-1.5">
                                    Contact Phone
                                </label>
                                <input
                                    type="tel"
                                    name="phone"
                                    value={formData.phone}
                                    onChange={handleChange}
                                    disabled={!isAdmin || saving}
                                    className="block w-full px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-[#10A34A]/20 focus:border-[#10A34A] outline-none transition-all disabled:bg-gray-50 disabled:text-gray-500"
                                    placeholder="e.g. +260 977 000 000"
                                />
                            </div>

                            <div>
                                <label className="block text-[10px] text-gray-400 font-bold tracking-wider uppercase mb-1.5">
                                    Tax ID / Reg No.
                                </label>
                                <input
                                    type="text"
                                    name="tax_id"
                                    value={formData.tax_id}
                                    onChange={handleChange}
                                    disabled={!isAdmin || saving}
                                    className="block w-full px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-[#10A34A]/20 focus:border-[#10A34A] outline-none transition-all disabled:bg-gray-50 disabled:text-gray-500"
                                    placeholder="e.g. VAT-12345678"
                                />
                            </div>

                            <div className="md:col-span-2">
                                <label className="block text-[10px] text-gray-400 font-bold tracking-wider uppercase mb-1.5">
                                    Business Address
                                </label>
                                <textarea
                                    name="address"
                                    value={formData.address}
                                    onChange={handleChange}
                                    disabled={!isAdmin || saving}
                                    rows={3}
                                    className="block w-full px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-[#10A34A]/20 focus:border-[#10A34A] outline-none transition-all disabled:bg-gray-50 disabled:text-gray-500 resize-none"
                                    placeholder="Street, town, province"
                                />
                            </div>

                            <div className="md:col-span-2">
                                <label className="block text-[10px] text-gray-400 font-bold tracking-wider uppercase mb-1.5">
                                    Website URL
                                </label>
                                <input
                                    type="url"
                                    name="website"
                                    value={formData.website}
                                    onChange={handleChange}
                                    disabled={!isAdmin || saving}
                                    className="block w-full px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-[#10A34A]/20 focus:border-[#10A34A] outline-none transition-all disabled:bg-gray-50 disabled:text-gray-500"
                                    placeholder="https://www.example.com"
                                />
                            </div>
                        </div>

                            {/* Departments Section */}
                            <div className="md:col-span-2 pt-6 border-t border-gray-100">
                                <div className="bg-gray-50/50 rounded-2xl p-6 border border-gray-100">
                                    {/* Header row: icon + title + toggle */}
                                    <div className="flex items-start justify-between gap-4 mb-1">
                                        <label className="text-sm font-bold text-brand-navy flex items-center">
                                            <Layers className="h-4 w-4 mr-2 text-[#006AFF]" />
                                            Departments
                                        </label>
                                        {isAdmin && (
                                            <button
                                                type="button"
                                                onClick={() => handleToggleDepartments(!useDepartments)}
                                                disabled={savingDeptToggle}
                                                className="flex items-center gap-2 text-xs font-bold transition-colors flex-shrink-0"
                                            >
                                                {savingDeptToggle ? (
                                                    <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                                                ) : useDepartments ? (
                                                    <ToggleRight className="h-6 w-6 text-[#006AFF]" />
                                                ) : (
                                                    <ToggleLeft className="h-6 w-6 text-gray-300" />
                                                )}
                                                <span className={useDepartments ? 'text-[#006AFF]' : 'text-gray-400'}>
                                                    {useDepartments ? 'Enabled' : 'Disabled'}
                                                </span>
                                            </button>
                                        )}
                                    </div>
                                    <p className="text-xs text-gray-400 mb-4">
                                        When enabled, requisitions can be tagged to a specific department from a list you define here.
                                    </p>

                                    {useDepartments && (
                                        <div className="space-y-2 mt-4">
                                            {loadingDepts ? (
                                                <div className="flex items-center gap-2 text-xs text-gray-400 py-2">
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                    Loading departments...
                                                </div>
                                            ) : (
                                                <>
                                                    {departments.length === 0 && (
                                                        <p className="text-xs text-gray-400 py-2">No departments yet. Add your first one below.</p>
                                                    )}
                                                    {departments.map(dept => (
                                                        <div key={dept.id} className="flex items-center gap-2 bg-white rounded-xl px-4 py-2.5 border border-gray-100 group">
                                                            {editingDeptId === dept.id ? (
                                                                <>
                                                                    <input
                                                                        autoFocus
                                                                        value={editingDeptName}
                                                                        onChange={e => setEditingDeptName(e.target.value)}
                                                                        onKeyDown={e => {
                                                                            if (e.key === 'Enter') handleSaveEditDept(dept.id);
                                                                            if (e.key === 'Escape') setEditingDeptId(null);
                                                                        }}
                                                                        className="flex-1 text-sm font-medium text-brand-navy bg-transparent border-b border-[#006AFF] outline-none pb-0.5"
                                                                    />
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleSaveEditDept(dept.id)}
                                                                        disabled={savingDept}
                                                                        className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 transition-colors"
                                                                        title="Save"
                                                                    >
                                                                        {savingDept ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setEditingDeptId(null)}
                                                                        className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors"
                                                                        title="Cancel"
                                                                    >
                                                                        <X size={14} />
                                                                    </button>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <span className="flex-1 text-sm font-medium text-brand-navy">{dept.name}</span>
                                                                    {isAdmin && (
                                                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => { setEditingDeptId(dept.id); setEditingDeptName(dept.name); }}
                                                                                className="p-1.5 rounded-lg text-gray-400 hover:text-[#006AFF] hover:bg-blue-50 transition-colors"
                                                                                title="Edit"
                                                                            >
                                                                                <Pencil size={13} />
                                                                            </button>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => handleDeleteDept(dept.id, dept.name)}
                                                                                className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                                                                                title="Delete"
                                                                            >
                                                                                <Trash2 size={13} />
                                                                            </button>
                                                                        </div>
                                                                    )}
                                                                </>
                                                            )}
                                                        </div>
                                                    ))}

                                                    {/* Add new department */}
                                                    {isAdmin && (
                                                        <div className="flex items-center gap-2 mt-3">
                                                            <input
                                                                ref={newDeptInputRef}
                                                                type="text"
                                                                value={newDeptName}
                                                                onChange={e => setNewDeptName(e.target.value)}
                                                                onKeyDown={e => { if (e.key === 'Enter') handleAddDepartment(); }}
                                                                placeholder="New department name..."
                                                                className="flex-1 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-[#006AFF]/20 focus:border-[#006AFF] outline-none transition-all"
                                                            />
                                                            <button
                                                                type="button"
                                                                onClick={handleAddDepartment}
                                                                disabled={!newDeptName.trim() || addingDept || savingDept}
                                                                className="flex items-center gap-1.5 px-4 py-2.5 bg-[#006AFF] text-white text-xs font-bold rounded-xl hover:bg-blue-600 disabled:opacity-40 transition-all whitespace-nowrap"
                                                            >
                                                                {savingDept ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                                                                Add
                                                            </button>
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>

                        {isAdmin && (
                            <div className="pt-4 flex justify-start border-t border-gray-100 mt-6 max-w-4xl">
                                <button
                                    type="submit"
                                    disabled={saving || !formData.name.trim()}
                                    className="inline-flex items-center px-5 py-2 border border-transparent shadow-sm text-sm font-semibold rounded-lg text-white bg-[#10A34A] hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 transition-colors"
                                >
                                    {saving ? (
                                        <>
                                            <Loader2 className="animate-spin -ml-1 mr-2 h-4 w-4" />
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
            {isAdmin && (
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
            )}

            {/* Delete Confirmation Modal */}
            {showDeleteModal && (
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
            )}
        </div>
    );
};

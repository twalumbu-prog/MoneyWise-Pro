import React, { useState, useEffect } from 'react';
import { accountService, Account } from '../../services/account.service';
import { Loader2, Plus, MoreVertical, Pencil } from 'lucide-react';

export const ChartOfAccounts: React.FC = () => {
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [editAccount, setEditAccount] = useState<Account | null>(null);
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);

    // New Account Form State
    const [newAccount, setNewAccount] = useState<Partial<Account>>({
        code: '',
        name: '',
        type: 'EXPENSE',
        subtype: '',
        description: '',
        is_active: true
    });

    useEffect(() => {
        loadAccounts();
    }, []);

    const loadAccounts = async () => {
        try {
            setLoading(true);
            const data = await accountService.getAll();
            setAccounts(data);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleAddAccount = async (e: React.FormEvent) => {
        e.preventDefault();

        // Validate before hitting the API so the user gets immediate, in-modal feedback.
        const code = (newAccount.code || '').trim();
        const name = (newAccount.name || '').trim();
        if (!code || !name) {
            setError('Account code and name are required.');
            return;
        }
        if (accounts.some(acc => acc.code.toLowerCase() === code.toLowerCase())) {
            setError(`An account with code "${code}" already exists. Please use a unique code.`);
            return;
        }

        setActionLoading(true);
        setError(null);
        try {
            await accountService.create({ ...newAccount, code, name });
            setIsAddModalOpen(false);
            setNewAccount({ code: '', name: '', type: 'EXPENSE', subtype: '', description: '', is_active: true });
            await loadAccounts();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setActionLoading(false);
        }
    };

    const openAddModal = () => {
        setError(null);
        setIsAddModalOpen(true);
    };

    const openEditModal = (account: Account) => {
        setError(null);
        setOpenMenuId(null);
        setEditAccount({ ...account });
    };

    const handleEditAccount = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editAccount) return;

        const code = (editAccount.code || '').trim();
        const name = (editAccount.name || '').trim();
        if (!code || !name) {
            setError('Account code and name are required.');
            return;
        }
        // Duplicate-code check excludes the account being edited.
        if (accounts.some(acc => acc.id !== editAccount.id && acc.code.toLowerCase() === code.toLowerCase())) {
            setError(`An account with code "${code}" already exists. Please use a unique code.`);
            return;
        }

        setActionLoading(true);
        setError(null);
        try {
            await accountService.update(editAccount.id, {
                code,
                name,
                type: editAccount.type,
                subtype: editAccount.subtype,
                description: editAccount.description,
            });
            setEditAccount(null);
            await loadAccounts();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setActionLoading(false);
        }
    };

    const accountTypes = ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'];
    const subtypesMap: Record<string, string[]> = {
        'ASSET': ['Current Asset', 'Fixed Asset', 'Bank', 'Cash', 'Accounts Receivable'],
        'LIABILITY': ['Current Liability', 'Long Term Liability', 'Accounts Payable', 'Credit Card'],
        'EQUITY': ['Owner\'s Equity', 'Retained Earnings'],
        'INCOME': ['Revenue', 'Other Income'],
        'EXPENSE': ['Operating Expense', 'Cost of Goods Sold', 'Payroll', 'Tax']
    };

    const filteredAccounts = accounts.filter(acc => 
        acc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        acc.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (acc.type && acc.type.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (acc.description && acc.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (acc.subtype && acc.subtype.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    if (loading && accounts.length === 0) {
        return <div className="flex justify-center p-12"><Loader2 className="animate-spin h-8 w-8 text-brand-green" /></div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h3 className="text-lg font-bold text-brand-navy">Chart of Accounts</h3>
                    <p className="text-sm text-gray-500">Configure financial accounts for your organization.</p>
                </div>
                <div className="flex items-center space-x-3 w-full sm:w-auto">
                    <div className="relative flex-1 sm:w-64">
                        <input
                            type="text"
                            placeholder="Search accounts..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-xl focus:ring-brand-green focus:border-brand-green text-sm transition-all shadow-sm"
                        />
                        <div className="absolute left-3 top-2.5 text-gray-400">
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                        </div>
                    </div>
                    <button
                        onClick={openAddModal}
                        className="inline-flex items-center px-4 py-2 border border-transparent rounded-xl shadow-sm text-sm font-bold text-white bg-brand-green hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-green transition-all"
                    >
                        <Plus className="h-4 w-4 mr-2" />
                        Add
                    </button>
                </div>
            </div>

            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
                    {error}
                </div>
            )}

            <div className="bg-white shadow-sm rounded-xl border border-gray-200 overflow-x-auto custom-scrollbar">
                <table className="min-w-[800px] w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-wider">Code</th>
                            <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-wider">Name</th>
                            <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-wider">Type</th>
                            <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-wider">Subtype</th>
                            <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-wider">Description</th>
                            <th className="px-6 py-3 text-right text-xs font-black text-gray-500 uppercase tracking-wider w-12"></th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {filteredAccounts.length > 0 ? (
                            filteredAccounts.map((account) => (
                                <tr key={account.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex-shrink-0 h-8 px-2.5 min-w-[2rem] bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center font-bold text-xs border border-blue-100">
                                            {account.code}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-bold">{account.name}</td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className="px-2.5 py-0.5 inline-flex text-xs leading-5 font-bold rounded-full bg-blue-100 text-blue-800">
                                            {account.type}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-500">{account.subtype || '-'}</td>
                                    <td className="px-6 py-4 text-sm text-gray-600 max-w-xs truncate">{account.description || '-'}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right relative">
                                        <button
                                            onClick={() => setOpenMenuId(openMenuId === account.id ? null : account.id)}
                                            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                                            aria-label="Account actions"
                                        >
                                            <MoreVertical className="h-4 w-4" />
                                        </button>
                                        {openMenuId === account.id && (
                                            <>
                                                <div className="fixed inset-0 z-10" onClick={() => setOpenMenuId(null)} />
                                                <div className="absolute right-6 top-12 z-20 w-44 bg-white rounded-xl shadow-lg border border-gray-100 py-1 text-left">
                                                    <button
                                                        onClick={() => openEditModal(account)}
                                                        className="w-full flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                                                    >
                                                        <Pencil className="h-3.5 w-3.5 mr-2 text-gray-400" />
                                                        Edit details
                                                    </button>
                                                </div>
                                            </>
                                        )}
                                    </td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan={6} className="px-6 py-12 text-center text-sm text-gray-500">
                                    No accounts found matching "{searchQuery}"
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Add Account Modal */}
            {isAddModalOpen && (
                <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
                    <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
                        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" aria-hidden="true" onClick={() => { setIsAddModalOpen(false); setError(null); }}></div>
                        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
                        <div className="inline-block align-bottom bg-white rounded-2xl text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
                            <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                                <div className="sm:flex sm:items-start">
                                    <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-green-100 sm:mx-0 sm:h-10 sm:w-10">
                                        <Plus className="h-6 w-6 text-brand-green" aria-hidden="true" />
                                    </div>
                                    <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left w-full">
                                        <h3 className="text-lg leading-6 font-medium text-gray-900" id="modal-title">
                                            Add New Account
                                        </h3>
                                        {error && (
                                            <div className="mt-3 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">
                                                {error}
                                            </div>
                                        )}
                                        <div className="mt-4 space-y-4">
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700">Type</label>
                                                    <select
                                                        value={newAccount.type}
                                                        onChange={(e) => setNewAccount({ ...newAccount, type: e.target.value as any, subtype: '' })}
                                                        className="mt-1 block w-full border-gray-300 rounded-xl shadow-sm focus:ring-brand-green focus:border-brand-green sm:text-sm p-2 border"
                                                    >
                                                        {accountTypes.map(t => <option key={t} value={t}>{t}</option>)}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700">Subtype</label>
                                                    <select
                                                        value={newAccount.subtype}
                                                        onChange={(e) => setNewAccount({ ...newAccount, subtype: e.target.value })}
                                                        className="mt-1 block w-full border-gray-300 rounded-xl shadow-sm focus:ring-brand-green focus:border-brand-green sm:text-sm p-2 border"
                                                    >
                                                        <option value="">Select Subtype</option>
                                                        {subtypesMap[newAccount.type!]?.map(st => <option key={st} value={st}>{st}</option>)}
                                                    </select>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-3 gap-4">
                                                <div className="col-span-1">
                                                    <label className="block text-sm font-medium text-gray-700">Code</label>
                                                    <input
                                                        type="text"
                                                        value={newAccount.code}
                                                        onChange={(e) => setNewAccount({ ...newAccount, code: e.target.value })}
                                                        className="mt-1 block w-full border-gray-300 rounded-xl shadow-sm focus:ring-brand-green focus:border-brand-green sm:text-sm p-2 border"
                                                    />
                                                </div>
                                                <div className="col-span-2">
                                                    <label className="block text-sm font-medium text-gray-700">Name</label>
                                                    <input
                                                        type="text"
                                                        value={newAccount.name}
                                                        onChange={(e) => setNewAccount({ ...newAccount, name: e.target.value })}
                                                        className="mt-1 block w-full border-gray-300 rounded-xl shadow-sm focus:ring-brand-green focus:border-brand-green sm:text-sm p-2 border"
                                                    />
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700">Description</label>
                                                <input
                                                    type="text"
                                                    value={newAccount.description}
                                                    onChange={(e) => setNewAccount({ ...newAccount, description: e.target.value })}
                                                    className="mt-1 block w-full border-gray-300 rounded-xl shadow-sm focus:ring-brand-green focus:border-brand-green sm:text-sm p-2 border"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                                <button
                                    type="button"
                                    onClick={handleAddAccount}
                                    disabled={actionLoading}
                                    className="w-full inline-flex justify-center rounded-xl border border-transparent shadow-sm px-4 py-2 bg-brand-green text-base font-medium text-white hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-green sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50"
                                >
                                    {actionLoading ? 'Saving...' : 'Save Account'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setIsAddModalOpen(false); setError(null); }}
                                    className="mt-3 w-full inline-flex justify-center rounded-xl border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Account Modal */}
            {editAccount && (
                <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="edit-modal-title" role="dialog" aria-modal="true">
                    <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
                        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" aria-hidden="true" onClick={() => { setEditAccount(null); setError(null); }}></div>
                        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
                        <div className="inline-block align-bottom bg-white rounded-2xl text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
                            <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                                <div className="sm:flex sm:items-start">
                                    <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-blue-100 sm:mx-0 sm:h-10 sm:w-10">
                                        <Pencil className="h-5 w-5 text-blue-600" aria-hidden="true" />
                                    </div>
                                    <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left w-full">
                                        <h3 className="text-lg leading-6 font-medium text-gray-900" id="edit-modal-title">
                                            Edit Account
                                        </h3>
                                        {error && (
                                            <div className="mt-3 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">
                                                {error}
                                            </div>
                                        )}
                                        <div className="mt-4 space-y-4">
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700">Type</label>
                                                    <select
                                                        value={editAccount.type}
                                                        onChange={(e) => setEditAccount({ ...editAccount, type: e.target.value as any, subtype: '' })}
                                                        className="mt-1 block w-full border-gray-300 rounded-xl shadow-sm focus:ring-brand-green focus:border-brand-green sm:text-sm p-2 border"
                                                    >
                                                        {accountTypes.map(t => <option key={t} value={t}>{t}</option>)}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700">Subtype</label>
                                                    <select
                                                        value={editAccount.subtype || ''}
                                                        onChange={(e) => setEditAccount({ ...editAccount, subtype: e.target.value })}
                                                        className="mt-1 block w-full border-gray-300 rounded-xl shadow-sm focus:ring-brand-green focus:border-brand-green sm:text-sm p-2 border"
                                                    >
                                                        <option value="">Select Subtype</option>
                                                        {subtypesMap[editAccount.type]?.map(st => <option key={st} value={st}>{st}</option>)}
                                                    </select>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-3 gap-4">
                                                <div className="col-span-1">
                                                    <label className="block text-sm font-medium text-gray-700">Code</label>
                                                    <input
                                                        type="text"
                                                        value={editAccount.code}
                                                        onChange={(e) => setEditAccount({ ...editAccount, code: e.target.value })}
                                                        className="mt-1 block w-full border-gray-300 rounded-xl shadow-sm focus:ring-brand-green focus:border-brand-green sm:text-sm p-2 border"
                                                    />
                                                </div>
                                                <div className="col-span-2">
                                                    <label className="block text-sm font-medium text-gray-700">Name</label>
                                                    <input
                                                        type="text"
                                                        value={editAccount.name}
                                                        onChange={(e) => setEditAccount({ ...editAccount, name: e.target.value })}
                                                        className="mt-1 block w-full border-gray-300 rounded-xl shadow-sm focus:ring-brand-green focus:border-brand-green sm:text-sm p-2 border"
                                                    />
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700">Description</label>
                                                <input
                                                    type="text"
                                                    value={editAccount.description || ''}
                                                    onChange={(e) => setEditAccount({ ...editAccount, description: e.target.value })}
                                                    className="mt-1 block w-full border-gray-300 rounded-xl shadow-sm focus:ring-brand-green focus:border-brand-green sm:text-sm p-2 border"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                                <button
                                    type="button"
                                    onClick={handleEditAccount}
                                    disabled={actionLoading}
                                    className="w-full inline-flex justify-center rounded-xl border border-transparent shadow-sm px-4 py-2 bg-brand-green text-base font-medium text-white hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-green sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50"
                                >
                                    {actionLoading ? 'Saving...' : 'Save Changes'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setEditAccount(null); setError(null); }}
                                    className="mt-3 w-full inline-flex justify-center rounded-xl border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

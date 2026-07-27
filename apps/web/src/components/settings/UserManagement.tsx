import React, { useState, useEffect } from 'react';
import { userService, UserProfile } from '../../services/user.service';
import { Loader2, Shield, Trash2, Eye, Mail, Plus, MoreHorizontal } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Modal } from '../Modal';

export const UserManagement: React.FC = () => {
    const { userRole } = useAuth();
    const [users, setUsers] = useState<UserProfile[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
    const [viewingUser, setViewingUser] = useState<UserProfile | null>(null);
    const [actionLoading, setActionLoading] = useState(false);
    const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
    const dropdownRef = React.useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setOpenDropdownId(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // New User Form State
    const [newUser, setNewUser] = useState({
        email: '',
        name: '',
        role: 'REQUESTOR',
        employeeId: '',
        username: ''
    });

    useEffect(() => {
        loadUsers();
    }, []);

    const loadUsers = async () => {
        try {
            setLoading(true);
            const data = await userService.getAll();
            setUsers(data);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleAddUser = async (e: React.FormEvent) => {
        e.preventDefault();
        setActionLoading(true);
        setError(null);

        try {
            const result = await userService.create({
                ...newUser
            });
            setIsAddModalOpen(false);
            setNewUser({ email: '', name: '', role: 'REQUESTOR', employeeId: '', username: '' });
            // The backend distinguishes a real invite email from silently linking an
            // already-registered account — surface its actual message instead of a
            // generic one that's wrong half the time.
            alert(result?.message || 'Team member added successfully.');
            await loadUsers();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setActionLoading(false);
        }
    };

    const handleDeleteUser = async (userId: string) => {
        if (!window.confirm('Are you sure you want to remove this user? They will lose access immediately.')) return;

        try {
            setActionLoading(true);
            await userService.delete(userId);
            await loadUsers();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setActionLoading(false);
        }
    };

    const handleResendInvite = async (userId: string) => {
        if (!window.confirm('Are you sure you want to resend the invitation email to this user?')) return;

        try {
            setActionLoading(true);
            await userService.resendInvite(userId);
            alert('Invitation resent successfully!');
        } catch (err: any) {
            setError(err.message);
        } finally {
            setActionLoading(false);
        }
    };

    const handleUpdateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingUser) return;

        setActionLoading(true);
        setError(null);

        try {
            await userService.update(editingUser.id, { role: editingUser.role });
            setEditingUser(null);
            await loadUsers();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setActionLoading(false);
        }
    };

    const handleApproveUser = async (userId: string) => {
        if (!window.confirm('Are you sure you want to approve this user?')) return;

        try {
            setActionLoading(true);
            await userService.update(userId, { status: 'ACTIVE' });
            await loadUsers();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setActionLoading(false);
        }
    };

    if (loading && users.length === 0) {
        return <div className="flex justify-center p-12"><Loader2 className="animate-spin h-8 w-8 text-brand-green" /></div>;
    }

    const isAdmin = userRole === 'ADMIN';

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h3 className="text-xl font-bold text-brand-navy">Team Members</h3>
                    <p className="text-sm text-gray-500 mt-1">Manage users and their roles within your organization.</p>
                </div>
                {isAdmin && (
                    <button
                        onClick={() => setIsAddModalOpen(true)}
                        className="h-8 pl-4 pr-3 bg-[#0058DB] rounded-lg flex items-center gap-2 hover:opacity-90 transition-opacity"
                    >
                        <span className="text-white text-xs font-bold">Add Member</span>
                        <Plus size={14} className="text-white" />
                    </button>
                )}
            </div>

            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm animate-in fade-in slide-in-from-top-2">
                    {error}
                </div>
            )}

            <div className="rounded-xl outline outline-1 outline-offset-[-1px] outline-[#E8EEF8] overflow-hidden overflow-x-auto">
                <table className="w-full text-left">
                    <thead>
                        <tr className="border-b border-[#E8EEF8]">
                            <th className="py-2.5 px-3 text-xs font-semibold text-[#111827]">User</th>
                            <th className="py-2.5 px-3 text-xs font-semibold text-[#111827]">Role</th>
                            <th className="py-2.5 px-3 text-xs font-semibold text-[#111827]">Status</th>
                            <th className="py-2.5 px-3 text-xs font-semibold text-[#111827]">Joined</th>
                            <th className="py-2.5 px-3 w-12"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.map((user) => (
                            <tr key={user.id} className="group transition-colors border-b border-[#E8EEF8]/40 hover:bg-gray-50/70">
                                <td className="py-3.5 px-3 whitespace-nowrap">
                                        <div className="flex items-center">
                                            <div className="flex-shrink-0 h-10 w-10 rounded-xl bg-[#0058DB]/10 flex items-center justify-center text-[#0058DB] font-bold text-sm shadow-inner transition-transform group-hover:scale-110">
                                                {user.name.charAt(0).toUpperCase()}
                                            </div>
                                            <div className="ml-4">
                                                <div className="text-sm font-bold text-gray-900 leading-tight">{user.name}</div>
                                                <div className="text-xs text-gray-500 font-medium">{user.email || 'No email'}</div>
                                                <div className="text-[10px] text-gray-400 font-bold mt-0.5 tracking-wider uppercase">ID: {user.employee_id || user.id.slice(0, 8)}</div>
                                            </div>
                                        </div>
                                </td>
                                <td className="py-3.5 px-3 whitespace-nowrap">
                                        <span className={`inline-flex items-center px-3 py-1 rounded-lg text-[10px] font-bold tracking-wider uppercase ${user.role === 'ADMIN' ? 'bg-purple-50 text-purple-700 border border-purple-100' :
                                            user.role === 'CASHIER' ? 'bg-blue-50 text-blue-700 border border-blue-100' :
                                                user.role === 'ACCOUNTANT' ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' :
                                                    'bg-gray-50 text-gray-600 border border-gray-100'
                                            }`}>
                                            <Shield className="w-3 h-3 mr-1.5" />
                                            {user.role}
                                        </span>
                                </td>
                                <td className="py-3.5 px-3 whitespace-nowrap">
                                        <span className={`px-2.5 py-0.5 inline-flex text-[10px] font-bold leading-5 rounded-full border ${user.status === 'ACTIVE'
                                            ? 'bg-green-50 text-green-700 border-green-100'
                                            : user.status === 'PENDING_APPROVAL'
                                                ? 'bg-yellow-50 text-yellow-700 border-yellow-100'
                                                : 'bg-gray-50 text-gray-700 border-gray-100'
                                            }`}>
                                            {user.status === 'PENDING_APPROVAL' ? 'PENDING' : user.status}
                                        </span>
                                </td>
                                <td className="py-3.5 px-3 whitespace-nowrap text-sm text-gray-500 font-medium font-mono">
                                        {new Date(user.created_at).toLocaleDateString()}
                                </td>
                                <td className="py-3.5 px-3 whitespace-nowrap text-center">
                                    <div className="relative flex justify-end" ref={openDropdownId === user.id ? dropdownRef : null}>
                                        <button
                                            onClick={() => setOpenDropdownId(openDropdownId === user.id ? null : user.id)}
                                            className="p-1.5 rounded-lg border border-transparent hover:border-[#E8EEF8] hover:bg-[#F3F5FC] text-gray-400 hover:text-gray-600 transition-all"
                                        >
                                            <MoreHorizontal size={16} />
                                        </button>
                                        
                                        {openDropdownId === user.id && (
                                            <div className="absolute right-0 top-[calc(100%+4px)] z-50 w-48 bg-white rounded-xl shadow-[0px_8px_24px_0px_rgba(17,24,39,0.12)] outline outline-1 outline-offset-[-1px] outline-[#E8EEF8] overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                                                <button
                                                    onClick={() => { setViewingUser(user); setOpenDropdownId(null); }}
                                                    className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-[#F3F5FC] transition-colors"
                                                >
                                                    <Eye size={14} className="text-gray-400" />
                                                    <span className="text-xs font-medium text-gray-700">View Details</span>
                                                </button>

                                                {isAdmin && (
                                                    <>
                                                        {user.status === 'INVITED' && (
                                                            <button
                                                                onClick={() => { handleResendInvite(user.id); setOpenDropdownId(null); }}
                                                                disabled={actionLoading}
                                                                className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-[#F3F5FC] transition-colors disabled:opacity-50"
                                                            >
                                                                <Mail size={14} className="text-blue-500" />
                                                                <span className="text-xs font-medium text-gray-700">Resend Invitation</span>
                                                            </button>
                                                        )}
                                                        {user.status === 'PENDING_APPROVAL' && (
                                                            <button
                                                                onClick={() => { handleApproveUser(user.id); setOpenDropdownId(null); }}
                                                                disabled={actionLoading}
                                                                className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-[#F3F5FC] transition-colors disabled:opacity-50"
                                                            >
                                                                <Shield size={14} className="text-green-500" />
                                                                <span className="text-xs font-medium text-gray-700">Approve User</span>
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={() => { setEditingUser(user); setOpenDropdownId(null); }}
                                                            className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-[#F3F5FC] transition-colors"
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-pencil text-brand-green"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><path d="m15 5 4 4" /></svg>
                                                            <span className="text-xs font-medium text-gray-700">Edit Role</span>
                                                        </button>
                                                        <button
                                                            onClick={() => { handleDeleteUser(user.id); setOpenDropdownId(null); }}
                                                            disabled={actionLoading}
                                                            className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-red-50 transition-colors disabled:opacity-50 group"
                                                        >
                                                            <Trash2 size={14} className="text-red-500" />
                                                            <span className="text-xs font-medium text-red-600">Remove User</span>
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
            </div>

            {/* View User Modal */}
            <Modal
                isOpen={!!viewingUser}
                onClose={() => setViewingUser(null)}
                title="Member Details"
            >
                {viewingUser && (
                    <div className="space-y-6">
                        <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-2xl">
                            <div className="h-16 w-16 rounded-2xl bg-[#0058DB] text-white flex items-center justify-center text-2xl font-bold">
                                {viewingUser.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                                <h4 className="text-lg font-bold text-brand-navy">{viewingUser.name}</h4>
                                <p className="text-gray-500">{viewingUser.email}</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-4 border border-gray-100 rounded-xl">
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Role</p>
                                <p className="text-sm font-bold text-brand-navy">{viewingUser.role}</p>
                            </div>
                            <div className="p-4 border border-gray-100 rounded-xl">
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Status</p>
                                <p className="text-sm font-bold text-brand-navy">{viewingUser.status}</p>
                            </div>
                            <div className="p-4 border border-gray-100 rounded-xl">
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Employee ID</p>
                                <p className="text-sm font-bold text-brand-navy">{viewingUser.employee_id || 'N/A'}</p>
                            </div>
                            <div className="p-4 border border-gray-100 rounded-xl">
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Joined Date</p>
                                <p className="text-sm font-bold text-brand-navy">{new Date(viewingUser.created_at).toLocaleDateString()}</p>
                            </div>
                        </div>

                        <div className="pt-4 border-t border-gray-100">
                            <button
                                onClick={() => setViewingUser(null)}
                                className="w-full py-3 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition-all"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                )}
            </Modal>

            {/* Add User Modal */}
            <Modal
                isOpen={isAddModalOpen}
                onClose={() => setIsAddModalOpen(false)}
                title="Add New User"
            >
                <form onSubmit={handleAddUser} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Full Name</label>
                        <input
                            type="text"
                            required
                            value={newUser.name}
                            onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                            className="mt-1 block w-full border-gray-300 rounded-xl shadow-sm focus:ring-brand-green focus:border-brand-green sm:text-sm p-2 border"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Email</label>
                        <input
                            type="email"
                            required
                            value={newUser.email}
                            onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                            className="mt-1 block w-full border-gray-300 rounded-xl shadow-sm focus:ring-brand-green focus:border-brand-green sm:text-sm p-2 border"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Username</label>
                        <input
                            type="text"
                            required
                            value={newUser.username}
                            onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                            className="mt-1 block w-full border-gray-300 rounded-xl shadow-sm focus:ring-brand-green focus:border-brand-green sm:text-sm p-2 border"
                            placeholder="Optional but recommended"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Role</label>
                        <select
                            value={newUser.role}
                            onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                            className="mt-1 block w-full border-gray-300 rounded-xl shadow-sm focus:ring-brand-green focus:border-brand-green sm:text-sm p-2 border"
                        >
                            <option value="REQUESTOR">Requestor</option>
                            <option value="AUTHORISER">Authoriser</option>
                            <option value="CASHIER">Cashier</option>
                            <option value="ADMIN">Admin</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Employee ID</label>
                        <input
                            type="text"
                            value={newUser.employeeId}
                            onChange={(e) => setNewUser({ ...newUser, employeeId: e.target.value })}
                            className="mt-1 block w-full border-gray-300 rounded-xl shadow-sm focus:ring-brand-green focus:border-brand-green sm:text-sm p-2 border"
                            placeholder="Optional"
                        />
                    </div>

                    <div className="mt-5 sm:mt-6 sm:grid sm:grid-cols-2 sm:gap-3 sm:grid-flow-row-dense">
                        <button
                            type="submit"
                            disabled={actionLoading}
                            className="w-full inline-flex justify-center rounded-xl border border-transparent shadow-sm px-4 py-2 bg-brand-green text-base font-medium text-white hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-green sm:col-start-2 sm:text-sm disabled:opacity-50"
                        >
                            {actionLoading ? 'Adding...' : 'Add User'}
                        </button>
                        <button
                            type="button"
                            onClick={() => setIsAddModalOpen(false)}
                            className="mt-3 w-full inline-flex justify-center rounded-xl border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:col-start-1 sm:text-sm"
                        >
                            Cancel
                        </button>
                    </div>
                </form>

            </Modal>

            {/* Edit User Modal */}
            <Modal
                isOpen={!!editingUser}
                onClose={() => setEditingUser(null)}
                title="Edit Team Member Role"
            >
                <form onSubmit={handleUpdateUser} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Role</label>
                        <select
                            value={editingUser?.role || 'REQUESTOR'}
                            onChange={(e) => setEditingUser(prev => prev ? { ...prev, role: e.target.value as UserProfile['role'] } : null)}
                            className="mt-1 block w-full border-gray-300 rounded-xl shadow-sm focus:ring-brand-green focus:border-brand-green sm:text-sm p-3 border"
                        >
                            <option value="REQUESTOR">Requestor</option>
                            <option value="AUTHORISER">Authoriser</option>
                            <option value="ACCOUNTANT">Accountant</option>
                            <option value="CASHIER">Cashier</option>
                            <option value="ADMIN">Admin</option>
                        </select>
                        <p className="mt-2 text-xs text-gray-500">
                            <strong>Admin:</strong> Full access to all settings and users.<br />
                            <strong>Accountant:</strong> Can authorize requisitions and view reports.<br />
                            <strong>Cashier:</strong> Can disburse funds and confirm change.<br />
                            <strong>Authoriser:</strong> Can approve requisitions for their department.<br />
                            <strong>Requestor:</strong> Can submit requisitions.
                        </p>
                    </div>

                    <div className="mt-5 sm:mt-6 sm:grid sm:grid-cols-2 sm:gap-3 sm:grid-flow-row-dense">
                        <button
                            type="submit"
                            disabled={actionLoading}
                            className="w-full inline-flex justify-center rounded-xl border border-transparent shadow-sm px-4 py-2 bg-brand-green text-base font-medium text-white hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-green sm:col-start-2 sm:text-sm disabled:opacity-50"
                        >
                            {actionLoading ? 'Updating...' : 'Update Role'}
                        </button>
                        <button
                            type="button"
                            onClick={() => setEditingUser(null)}
                            className="mt-3 w-full inline-flex justify-center rounded-xl border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:col-start-1 sm:text-sm"
                        >
                            Cancel
                        </button>
                    </div>
                </form>
            </Modal>
        </div >
    );
};

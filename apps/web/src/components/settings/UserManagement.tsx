import React, { useState, useEffect } from 'react';
import { userService, UserProfile } from '../../services/user.service';
import { Loader2, UserPlus, Shield, Trash2, Eye } from 'lucide-react';
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
            await userService.create({
                ...newUser
            });
            setIsAddModalOpen(false);
            setNewUser({ email: '', name: '', role: 'REQUESTOR', employeeId: '', username: '' });
            alert('Invitation sent! The user will receive an email to join and set their password.');
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

    if (loading && users.length === 0) {
        return <div className="flex justify-center p-12"><Loader2 className="animate-spin h-8 w-8 text-brand-green" /></div>;
    }

    const isAdmin = userRole === 'ADMIN';

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                <div>
                    <h3 className="text-xl font-bold text-brand-navy">Team Members</h3>
                    <p className="text-sm text-gray-500 mt-1">Manage users and their roles within your organization.</p>
                </div>
                {isAdmin && (
                    <button
                        onClick={() => setIsAddModalOpen(true)}
                        className="inline-flex items-center px-5 py-2.5 border border-transparent rounded-xl shadow-lg shadow-brand-green/20 text-sm font-bold text-white bg-brand-green hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-green transition-all transform active:scale-95"
                    >
                        <UserPlus className="h-4 w-4 mr-2" />
                        Add Member
                    </button>
                )}
            </div>

            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm animate-in fade-in slide-in-from-top-2">
                    {error}
                </div>
            )}

            <div className="bg-white shadow-sm rounded-2xl border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-100">
                        <thead className="bg-gray-50/50">
                            <tr>
                                <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-widest">User</th>
                                <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-widest">Role</th>
                                <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-widest">Status</th>
                                <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-widest">Joined</th>
                                <th scope="col" className="px-6 py-4 text-center text-xs font-bold text-gray-500 uppercase tracking-widest">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-50">
                            {users.map((user) => (
                                <tr key={user.id} className="hover:bg-gray-50/80 transition-colors group">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center">
                                            <div className="flex-shrink-0 h-10 w-10 rounded-xl bg-brand-green/10 flex items-center justify-center text-brand-green font-bold text-sm shadow-inner transition-transform group-hover:scale-110">
                                                {user.name.charAt(0).toUpperCase()}
                                            </div>
                                            <div className="ml-4">
                                                <div className="text-sm font-bold text-gray-900 leading-tight">{user.name}</div>
                                                <div className="text-xs text-gray-500 font-medium">{user.email || 'No email'}</div>
                                                <div className="text-[10px] text-gray-400 font-bold mt-0.5 tracking-wider uppercase">ID: {user.employee_id || user.id.slice(0, 8)}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`inline-flex items-center px-3 py-1 rounded-lg text-[10px] font-bold tracking-wider uppercase ${user.role === 'ADMIN' ? 'bg-purple-50 text-purple-700 border border-purple-100' :
                                            user.role === 'CASHIER' ? 'bg-blue-50 text-blue-700 border border-blue-100' :
                                                user.role === 'ACCOUNTANT' ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' :
                                                    'bg-gray-50 text-gray-600 border border-gray-100'
                                            }`}>
                                            <Shield className="w-3 h-3 mr-1.5" />
                                            {user.role}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`px-2.5 py-0.5 inline-flex text-[10px] font-bold leading-5 rounded-full border ${user.status === 'ACTIVE'
                                            ? 'bg-green-50 text-green-700 border-green-100'
                                            : 'bg-yellow-50 text-yellow-700 border-yellow-100'
                                            }`}>
                                            {user.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-medium font-mono">
                                        {new Date(user.created_at).toLocaleDateString()}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-center">
                                        <div className="flex justify-center items-center space-x-1">
                                            <button
                                                onClick={() => setViewingUser(user)}
                                                className="p-2 text-gray-400 hover:text-brand-navy hover:bg-gray-100 rounded-xl transition-all"
                                                title="View Details"
                                            >
                                                <Eye className="h-4 w-4" />
                                            </button>

                                            {isAdmin && (
                                                <>
                                                    <button
                                                        onClick={() => setEditingUser(user)}
                                                        className="p-2 text-brand-green hover:text-green-700 hover:bg-green-50 rounded-xl transition-all"
                                                        title="Edit Role"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-pencil"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><path d="m15 5 4 4" /></svg>
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteUser(user.id)}
                                                        className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-xl transition-all"
                                                        title="Remove User"
                                                        disabled={actionLoading}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
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
                            <div className="h-16 w-16 rounded-2xl bg-brand-green text-white flex items-center justify-center text-2xl font-bold">
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

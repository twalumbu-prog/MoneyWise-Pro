import React, { useState, useEffect } from 'react';
import { userService, UserProfile } from '../../services/user.service';
import { Loader2, UserPlus, Shield, Trash2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Modal } from '../Modal';

export const UserManagement: React.FC = () => {
    const { userRole } = useAuth();
    const [users, setUsers] = useState<UserProfile[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
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
                ...newUser,
                password: 'TempPassword123!' // In a real app, this would be an invitation flow
            });
            setIsAddModalOpen(false);
            setNewUser({ email: '', name: '', role: 'REQUESTOR', employeeId: '', username: '' });
            await loadUsers();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setActionLoading(false);
        }
    };

    const handleDeleteUser = async (userId: string) => {
        if (!window.confirm('Are you sure you want to remove this user?')) return;

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

    if (loading && users.length === 0) {
        return <div className="flex justify-center p-12"><Loader2 className="animate-spin h-8 w-8 text-brand-green" /></div>;
    }

    const isAdmin = userRole === 'ADMIN';

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h3 className="text-lg font-bold text-brand-navy">Team Members</h3>
                    <p className="text-sm text-gray-500">Manage users and their roles within your organization.</p>
                </div>
                {isAdmin && (
                    <button
                        onClick={() => setIsAddModalOpen(true)}
                        className="inline-flex items-center px-4 py-2 border border-transparent rounded-xl shadow-sm text-sm font-bold text-white bg-brand-green hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-green transition-all"
                    >
                        <UserPlus className="h-4 w-4 mr-2" />
                        Add Member
                    </button>
                )}
            </div>

            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
                    {error}
                </div>
            )}

            <div className="bg-white shadow-sm rounded-xl border border-gray-200 overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">User</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Role</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Joined</th>
                            {isAdmin && <th scope="col" className="relative px-6 py-3"><span className="sr-only">Actions</span></th>}
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {users.map((user) => (
                            <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="flex items-center">
                                        <div className="flex-shrink-0 h-10 w-10 rounded-full bg-brand-green/10 flex items-center justify-center text-brand-green font-bold text-sm">
                                            {user.name.charAt(0).toUpperCase()}
                                        </div>
                                        <div className="ml-4">
                                            <div className="text-sm font-medium text-gray-900">{user.name}</div>
                                            <div className="text-sm text-gray-500">{user.email || 'No email'}</div>
                                            <div className="text-xs text-gray-400 mt-0.5">ID: {user.employee_id}</div>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${user.role === 'ADMIN' ? 'bg-purple-100 text-purple-800' :
                                        user.role === 'CASHIER' ? 'bg-blue-100 text-blue-800' :
                                            'bg-gray-100 text-gray-800'
                                        }`}>
                                        <Shield className="w-3 h-3 mr-1" />
                                        {user.role}
                                    </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${user.status === 'ACTIVE' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                                        }`}>
                                        {user.status}
                                    </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    {new Date(user.created_at).toLocaleDateString()}
                                </td>
                                {isAdmin && (
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <button
                                            onClick={() => handleDeleteUser(user.id)}
                                            className="text-red-600 hover:text-red-900 p-2 hover:bg-red-50 rounded-lg transition-colors"
                                            disabled={actionLoading}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

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
                            <option value="APPROVER">Approver</option>
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
        </div>
    );
};

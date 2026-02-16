import React, { useState, useEffect } from 'react';
import { userService, UserProfile } from '../../services/user.service';
import { Loader2, UserPlus, Shield, Trash2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

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
        employeeId: ''
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
            setNewUser({ email: '', name: '', role: 'REQUESTOR', employeeId: '' });
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
            {isAddModalOpen && (
                <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
                    <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
                        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity" aria-hidden="true" onClick={() => setIsAddModalOpen(false)}></div>
                        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
                        <div className="inline-block align-bottom bg-white rounded-2xl text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
                            <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                                <div className="sm:flex sm:items-start">
                                    <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-green-100 sm:mx-0 sm:h-10 sm:w-10">
                                        <UserPlus className="h-6 w-6 text-brand-green" aria-hidden="true" />
                                    </div>
                                    <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left w-full">
                                        <h3 className="text-lg leading-6 font-medium text-gray-900" id="modal-title">
                                            Add New User
                                        </h3>
                                        <div className="mt-4 space-y-4">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700">Full Name</label>
                                                <input
                                                    type="text"
                                                    value={newUser.name}
                                                    onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                                                    className="mt-1 block w-full border-gray-300 rounded-xl shadow-sm focus:ring-brand-green focus:border-brand-green sm:text-sm p-2 border"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700">Email</label>
                                                <input
                                                    type="email"
                                                    value={newUser.email}
                                                    onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                                                    className="mt-1 block w-full border-gray-300 rounded-xl shadow-sm focus:ring-brand-green focus:border-brand-green sm:text-sm p-2 border"
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
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                                <button
                                    type="button"
                                    onClick={handleAddUser}
                                    disabled={actionLoading}
                                    className="w-full inline-flex justify-center rounded-xl border border-transparent shadow-sm px-4 py-2 bg-brand-green text-base font-medium text-white hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-green sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50"
                                >
                                    {actionLoading ? 'Adding...' : 'Add User'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setIsAddModalOpen(false)}
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

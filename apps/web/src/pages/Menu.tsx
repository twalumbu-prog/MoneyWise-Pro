import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Layout } from '../components/Layout';
import { 
    Settings, 
    ShieldCheck, 
    LogOut, 
    User, 
    ClipboardCheck, 
    Coins, 
    FileSpreadsheet,
    ChevronRight 
} from 'lucide-react';

export const Menu: React.FC = () => {
    const navigate = useNavigate();
    const { user, userRole, userName, signOut } = useAuth();

    const handleSignOut = async () => {
        await signOut();
        navigate('/login');
    };

    const getPosition = (role: string | null) => {
        if (!role) return 'User';
        switch (role.toUpperCase()) {
            case 'ADMIN': return 'Administrator';
            case 'ACCOUNTANT': return 'Senior Accountant';
            case 'CASHIER': return 'Financial Cashier';
            case 'REQUESTOR': return 'Staff Member';
            default: return role;
        }
    };

    // Define menu sections based on role
    const menuItems = [
        {
            label: 'Audit Log',
            description: 'Compliance & audit history',
            path: '/audit',
            icon: ShieldCheck,
            color: 'text-indigo-600',
            bg: 'bg-indigo-50',
            show: true
        },
        {
            label: 'Settings',
            description: 'Profile & preferences',
            path: '/settings',
            icon: Settings,
            color: 'text-gray-600',
            bg: 'bg-gray-50',
            show: true
        },
        {
            label: 'Approvals',
            description: 'Pending requisition reviews',
            path: '/approvals',
            icon: ClipboardCheck,
            color: 'text-blue-600',
            bg: 'bg-blue-50',
            show: userRole !== 'REQUESTOR'
        },
        {
            label: 'Disbursements',
            description: 'Cash distribution management',
            path: '/disbursements',
            icon: Coins,
            color: 'text-emerald-600',
            bg: 'bg-emerald-50',
            show: userRole === 'CASHIER' || userRole === 'ADMIN'
        },
        {
            label: 'Vouchers',
            description: 'Expense vouchers log',
            path: '/vouchers',
            icon: FileSpreadsheet,
            color: 'text-amber-600',
            bg: 'bg-amber-50',
            show: userRole === 'CASHIER' || userRole === 'ADMIN'
        }
    ].filter(item => item.show);

    return (
        <Layout noPadding={false}>
            <div className="max-w-md mx-auto space-y-6 pb-24 md:pb-0">
                {/* Profile Card */}
                <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm flex items-center space-x-4">
                    <div className="h-16 w-16 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center text-[#006AFF] shadow-inner">
                        <User size={32} />
                    </div>
                    <div className="flex-1 overflow-hidden">
                        <h2 className="text-lg font-black text-brand-navy truncate">
                            {userName || 'User Name'}
                        </h2>
                        <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-0.5">
                            {getPosition(userRole)}
                        </p>
                        <p className="text-xs text-gray-500 truncate mt-1">
                            {user?.email}
                        </p>
                    </div>
                </div>

                {/* Navigation Menu Links */}
                <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden divide-y divide-gray-50">
                    {menuItems.map((item, idx) => {
                        const Icon = item.icon;
                        return (
                            <button
                                key={idx}
                                onClick={() => navigate(item.path)}
                                className="w-full flex items-center justify-between p-5 text-left active:bg-gray-50 transition-colors group"
                            >
                                <div className="flex items-center space-x-4">
                                    <div className={`p-3 rounded-2xl ${item.bg} ${item.color} transition-colors`}>
                                        <Icon size={20} />
                                    </div>
                                    <div>
                                        <div className="font-bold text-brand-navy text-sm">{item.label}</div>
                                        <div className="text-xs text-gray-400 mt-0.5">{item.description}</div>
                                    </div>
                                </div>
                                <ChevronRight size={16} className="text-gray-300 group-hover:translate-x-0.5 transition-transform" />
                            </button>
                        );
                    })}
                </div>

                {/* Sign Out Button */}
                <button
                    onClick={handleSignOut}
                    className="w-full flex items-center justify-center px-6 py-4 bg-red-50 text-red-600 rounded-3xl font-bold text-sm active:bg-red-100 transition-all border border-red-100/50 shadow-sm"
                >
                    <LogOut size={16} className="mr-3" />
                    Sign Out
                </button>
            </div>
        </Layout>
    );
};
export default Menu;

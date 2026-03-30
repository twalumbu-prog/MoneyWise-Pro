import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { User, LogOut, ChevronDown } from 'lucide-react';

export const TopNavbar: React.FC = () => {
    const { userName, userRole, organizationName, signOut } = useAuth();
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    // Format role to be more user-friendly for "Position"
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

    return (
        <nav className="h-16 bg-white border-b border-gray-100 z-30 sticky top-0">
            <div className="max-w-[1440px] mx-auto px-12 h-full flex items-center justify-between">
                {/* Left side: Logo and Org */}
                <div className="flex items-center space-x-4">
                    <div className="flex items-center">
                        <span className="text-xl font-medium text-brand-navy tracking-tight">MoneyWise</span>
                        <span className="text-xl font-bold text-[#006AFF] ml-1 tracking-tight">Pro</span>
                    </div>
                    {organizationName && (
                        <>
                            <div className="h-6 w-[1px] bg-gray-200 mx-2" />
                            <span className="text-sm font-medium text-gray-400">{organizationName}</span>
                        </>
                    )}
                </div>

                {/* Right side: User Profile */}
                <div className="relative">
                    <button 
                        onClick={() => setIsMenuOpen(!isMenuOpen)}
                        className="flex items-center space-x-4 hover:bg-gray-50/80 p-1.5 rounded-2xl transition-all border border-transparent hover:border-gray-100 group"
                    >
                        <div className="text-right hidden sm:block">
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-none mb-1 group-hover:text-gray-500 transition-colors">
                                {getPosition(userRole)}
                            </p>
                            <p className="text-sm font-bold text-brand-navy leading-none">
                                {userName || 'User Name'}
                            </p>
                        </div>
                        <div className="flex items-center space-x-2">
                            <div className="h-10 w-10 rounded-full bg-gray-50 border border-gray-100 flex items-center justify-center text-gray-400 overflow-hidden shadow-sm group-hover:border-gray-200 transition-all">
                                <User size={20} />
                            </div>
                            <ChevronDown size={14} className={`text-gray-400 transition-transform ${isMenuOpen ? 'rotate-180' : ''}`} />
                        </div>
                    </button>

                    {/* PROFLE DROPDOWN */}
                    {isMenuOpen && (
                        <>
                            <div className="fixed inset-0 z-40" onClick={() => setIsMenuOpen(false)}></div>
                            <div className="absolute right-0 mt-3 w-56 bg-white rounded-2xl shadow-xl border border-gray-100 z-50 overflow-hidden py-2 transform origin-top-right animate-in fade-in slide-in-from-top-1">
                                <div className="px-4 py-3 border-b border-gray-50 mb-1">
                                    <p className="text-sm font-bold text-brand-navy truncate">{userName}</p>
                                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-0.5">{getPosition(userRole)}</p>
                                </div>
                                <button 
                                    onClick={() => {
                                        setIsMenuOpen(false);
                                        signOut();
                                    }}
                                    className="w-full flex items-center px-4 py-3 text-sm font-bold text-gray-500 hover:text-red-600 hover:bg-red-50/50 transition-all group"
                                >
                                    <LogOut size={16} className="mr-3 group-hover:text-red-500 transition-colors" />
                                    Sign Out
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </nav>
    );
};

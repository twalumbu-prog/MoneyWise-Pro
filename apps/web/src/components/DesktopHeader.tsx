import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useAchievements } from '../context/AchievementsContext';
import { AchievementsDropdown } from './achievements/AchievementsDropdown';
import { ChevronDown, LogOut, Trophy } from 'lucide-react';

interface DesktopHeaderProps {
    title: string;
}

/**
 * Slim breadcrumb-style header for the desktop shell: org switcher on the
 * left, page title, and the profile menu on the right. Replaces the old
 * full-width TopNavbar now that navigation itself lives in the Sidebar.
 */
export const DesktopHeader: React.FC<DesktopHeaderProps> = ({ title }) => {
    const { userName, userRole, signOut, userOrganizations, switchOrganization, organizationName, organizationId } = useAuth();
    const { isDesktopDropdownOpen, toggleDesktopDropdown, completedCount, totalCount } = useAchievements();
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isOrgMenuOpen, setIsOrgMenuOpen] = useState(false);

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

    const activeOrgs = userOrganizations.filter((uo: any) => uo.status === 'ACTIVE');
    const initial = (userName || 'U').trim().charAt(0).toUpperCase();

    return (
        <div className="hidden md:flex items-center justify-between h-14 px-6 flex-shrink-0 bg-[#F8FAFD]">
            {/* Left: org switcher + page title */}
            <div className="flex items-center gap-3 min-w-0">
                {organizationName && (
                    activeOrgs.length > 1 ? (
                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => setIsOrgMenuOpen(!isOrgMenuOpen)}
                                className="flex items-center gap-1 text-xs font-semibold text-[#1F1F1F] hover:text-[#0842A0] transition-colors"
                            >
                                <span className="truncate max-w-[220px]">{organizationName}</span>
                                <ChevronDown size={12} className={`transition-transform ${isOrgMenuOpen ? 'rotate-180' : ''}`} />
                            </button>

                            {isOrgMenuOpen && (
                                <>
                                    <div className="fixed inset-0 z-40" onClick={() => setIsOrgMenuOpen(false)}></div>
                                    <div className="absolute left-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-[rgba(116,119,117,0.22)] z-50 overflow-hidden py-2 transform origin-top-left animate-in fade-in slide-in-from-top-1">
                                        <div className="px-4 py-2 border-b border-[rgba(116,119,117,0.22)] text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">
                                            Switch Organization
                                        </div>
                                        {activeOrgs.map((uo: any) => {
                                            const isCurrent = uo.organization.id === organizationId;
                                            return (
                                                <button
                                                    key={uo.organization.id}
                                                    type="button"
                                                    disabled={isCurrent}
                                                    onClick={async () => {
                                                        setIsOrgMenuOpen(false);
                                                        try {
                                                            await switchOrganization(uo.organization.id);
                                                        } catch (err) {
                                                            console.error(err);
                                                        }
                                                    }}
                                                    className={`w-full text-left px-4 py-2.5 text-sm font-medium transition-colors flex items-center justify-between ${
                                                        isCurrent
                                                            ? 'text-brand-green bg-brand-green/5 cursor-default font-bold'
                                                            : 'text-gray-600 hover:bg-gray-50 hover:text-[#1F1F1F]'
                                                    }`}
                                                >
                                                    <span>{uo.organization.name}</span>
                                                    {isCurrent && <span className="w-1.5 h-1.5 rounded-full bg-brand-green"></span>}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </>
                            )}
                        </div>
                    ) : (
                        <span className="text-xs font-semibold text-[#1F1F1F] truncate max-w-[220px]">{organizationName}</span>
                    )
                )}
                <div className="w-[1px] h-4 bg-[#E9EEF6] flex-shrink-0" />
                <span className="text-xs text-gray-500 truncate">{title}</span>
            </div>

            {/* Right: Actions (Achievements + Profile) */}
            <div className="flex items-center gap-3">
                {/* Achievements Button */}
                <div className="relative flex-shrink-0">
                    <button
                        type="button"
                        onClick={toggleDesktopDropdown}
                        aria-label="Achievements & Missions"
                        className="flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-white border border-[rgba(116,119,117,0.22)] hover:border-blue-200 hover:bg-blue-50/50 transition-all text-[#1F1F1F] shadow-xs active:scale-95 group"
                    >
                        <div className="w-6 h-6 rounded-xl bg-[#0B57D0]/10 text-[#0B57D0] flex items-center justify-center group-hover:scale-105 transition-transform">
                            <Trophy size={14} />
                        </div>
                        <span className="text-xs font-bold text-gray-700 group-hover:text-[#0B57D0]">
                            Missions ({completedCount}/{totalCount})
                        </span>
                        {completedCount < totalCount && (
                            <span className="w-2 h-2 rounded-full bg-[#34A853] animate-pulse" />
                        )}
                    </button>

                    {isDesktopDropdownOpen && <AchievementsDropdown />}
                </div>

                {/* Profile */}
                <div className="relative flex-shrink-0">
                    <button
                        onClick={() => setIsMenuOpen(!isMenuOpen)}
                        className="flex items-center gap-3 hover:bg-gray-50 p-1.5 rounded-2xl transition-all group"
                    >
                        <div className="text-right hidden sm:block">
                            <p className="text-[10px] font-bold text-[#1F1F1F] leading-none">{userName || 'User Name'}</p>
                            <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest leading-none mt-1">
                                {getPosition(userRole)}
                            </p>
                        </div>
                        <div className="h-5 w-5 rounded-2xl bg-[#1F1F1F] flex items-center justify-center flex-shrink-0">
                            <span className="text-white text-[8px] font-medium">{initial}</span>
                        </div>
                    </button>

                    {isMenuOpen && (
                        <>
                            <div className="fixed inset-0 z-40" onClick={() => setIsMenuOpen(false)}></div>
                            <div className="absolute right-0 mt-3 w-56 bg-white rounded-2xl shadow-xl border border-[rgba(116,119,117,0.22)] z-50 overflow-hidden py-2 transform origin-top-right animate-in fade-in slide-in-from-top-1">
                                <div className="px-4 py-3 border-b border-[rgba(116,119,117,0.22)] mb-1">
                                    <p className="text-sm font-bold text-[#1F1F1F] truncate">{userName}</p>
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
        </div>
    );
};

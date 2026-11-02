import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useAchievements } from '../context/AchievementsContext';
import { AchievementsDropdown } from './achievements/AchievementsDropdown';
import { Check, ChevronDown, LogOut, Trophy } from 'lucide-react';

interface DesktopHeaderProps {
    title: string;
}

/** A business's logo, or its first letter on a soft blue tile when it has none (or the image fails to load). */
const OrgLogo: React.FC<{ name: string; logoUrl?: string | null; size: number }> = ({ name, logoUrl, size }) => {
    const [failed, setFailed] = useState(false);
    const box = { width: size, height: size };
    if (logoUrl && !failed) {
        return <img src={logoUrl} alt="" style={box} onError={() => setFailed(true)} className="rounded-lg object-cover bg-white border border-[#E8EEF8] flex-shrink-0" />;
    }
    return (
        <span style={{ ...box, fontSize: Math.round(size * 0.45) }} className="rounded-lg bg-[#E6F0FF] text-[#0059D8] font-bold flex items-center justify-center flex-shrink-0">
            {(name || '?').trim().charAt(0).toUpperCase()}
        </span>
    );
};

/**
 * Slim breadcrumb-style header for the desktop shell: org switcher on the
 * left, page title, and the profile menu on the right. Replaces the old
 * full-width TopNavbar now that navigation itself lives in the Sidebar.
 */
export const DesktopHeader: React.FC<DesktopHeaderProps> = ({ title }) => {
    const { userName, userRole, signOut, userOrganizations, switchOrganization, organizationName, organizationId, organizationLogoUrl } = useAuth();
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
                                className={`flex items-center gap-2 -ml-2 pl-2 pr-2.5 py-1 rounded-xl text-xs font-semibold text-[#111827] hover:bg-white hover:shadow-xs transition-all ${isOrgMenuOpen ? 'bg-white shadow-xs' : ''}`}
                            >
                                <OrgLogo name={organizationName} logoUrl={organizationLogoUrl} size={22} />
                                <span className="truncate max-w-[200px]">{organizationName}</span>
                                <ChevronDown size={12} className={`text-gray-400 transition-transform ${isOrgMenuOpen ? 'rotate-180' : ''}`} />
                            </button>

                            {isOrgMenuOpen && (
                                <>
                                    <div className="fixed inset-0 z-40" onClick={() => setIsOrgMenuOpen(false)}></div>
                                    <div className="absolute left-0 mt-2 w-72 bg-white rounded-2xl shadow-xl border border-[#E8EEF8] z-50 overflow-hidden p-1.5 transform origin-top-left animate-in fade-in slide-in-from-top-1">
                                        <div className="px-3 pt-2 pb-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                            Your businesses
                                        </div>
                                        <div className="max-h-80 overflow-y-auto space-y-0.5">
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
                                                        className={`w-full text-left px-2.5 py-2 rounded-xl transition-colors flex items-center gap-3 ${
                                                            isCurrent ? 'bg-[#CFE4FF] cursor-default' : 'hover:bg-[#F8FAFD]'
                                                        }`}
                                                    >
                                                        <OrgLogo name={uo.organization.name} logoUrl={uo.organization.logo_url} size={32} />
                                                        <span className="flex-1 min-w-0">
                                                            <span className={`block text-sm truncate ${isCurrent ? 'font-bold text-[#0059D8]' : 'font-semibold text-[#111827]'}`}>{uo.organization.name}</span>
                                                            {uo.role && <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">{getPosition(uo.role)}</span>}
                                                        </span>
                                                        {isCurrent && <Check size={16} strokeWidth={3} className="text-[#0059D8] flex-shrink-0" />}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 min-w-0">
                            <OrgLogo name={organizationName} logoUrl={organizationLogoUrl} size={22} />
                            <span className="text-xs font-semibold text-[#111827] truncate max-w-[220px]">{organizationName}</span>
                        </div>
                    )
                )}
                <div className="w-[1px] h-4 bg-[#E8EEF8] flex-shrink-0" />
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
                        className="flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-white border border-[#E8EEF8] hover:border-blue-200 hover:bg-blue-50/50 transition-all text-[#111827] shadow-xs active:scale-95 group"
                    >
                        <div className="w-6 h-6 rounded-xl bg-[#006AFF]/10 text-[#006AFF] flex items-center justify-center group-hover:scale-105 transition-transform">
                            <Trophy size={14} />
                        </div>
                        <span className="text-xs font-bold text-gray-700 group-hover:text-[#006AFF]">
                            Missions ({completedCount}/{totalCount})
                        </span>
                        {completedCount < totalCount && (
                            <span className="w-2 h-2 rounded-full bg-[#03D47C] animate-pulse" />
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
                            <p className="text-[10px] font-bold text-[#111827] leading-none">{userName || 'User Name'}</p>
                            <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest leading-none mt-1">
                                {getPosition(userRole)}
                            </p>
                        </div>
                        <div className="h-5 w-5 rounded-2xl bg-[#111827] flex items-center justify-center flex-shrink-0">
                            <span className="text-white text-[8px] font-medium">{initial}</span>
                        </div>
                    </button>

                    {isMenuOpen && (
                        <>
                            <div className="fixed inset-0 z-40" onClick={() => setIsMenuOpen(false)}></div>
                            <div className="absolute right-0 mt-3 w-56 bg-white rounded-2xl shadow-xl border border-[#E8EEF8] z-50 overflow-hidden py-2 transform origin-top-right animate-in fade-in slide-in-from-top-1">
                                <div className="px-4 py-3 border-b border-[#E8EEF8] mb-1">
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
        </div>
    );
};

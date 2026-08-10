import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { Layout } from '../components/Layout';
import { payrollService, PayrollRun, StaffMember } from '../services/payroll.service';
import { PayrollRunDetail } from '../components/payroll/PayrollRunDetail';
import { StaffMemberDetail } from '../components/payroll/StaffMemberDetail';
import { AddStaffWizard } from '../components/payroll/AddStaffWizard';
import { BatchImportStaff } from '../components/payroll/BatchImportStaff';
import { PayrollConfigModal } from '../components/payroll/PayrollConfigModal';
import { Search, SlidersHorizontal, ArrowDownUp, Plus, X, UserPlus, FileSpreadsheet, Settings } from 'lucide-react';

type MainTab = 'history' | 'staff';
type SortDir = 'desc' | 'asc';

const STATUS_CONFIG: Record<string, { label: string; dotColor: string; textColor: string; bgColor: string }> = {
    DRAFT: { label: 'Draft', dotColor: 'bg-gray-400', textColor: 'text-gray-700', bgColor: 'bg-gray-100' },
    PENDING_APPROVAL: { label: 'Pending', dotColor: 'bg-yellow-500', textColor: 'text-yellow-800', bgColor: 'bg-yellow-100' },
    APPROVED: { label: 'Approved', dotColor: 'bg-blue-500', textColor: 'text-blue-800', bgColor: 'bg-blue-100' },
    CLEARED: { label: 'Cleared', dotColor: 'bg-lime-600', textColor: 'text-green-900', bgColor: 'bg-lime-300/25' },
};

const STAFF_STATUS_CONFIG: Record<string, { label: string; dotColor: string; textColor: string; bgColor: string }> = {
    ACTIVE: { label: 'Active', dotColor: 'bg-lime-600', textColor: 'text-green-900', bgColor: 'bg-lime-300/25' },
    INACTIVE: { label: 'Inactive', dotColor: 'bg-yellow-500', textColor: 'text-yellow-800', bgColor: 'bg-yellow-100' },
    TERMINATED: { label: 'Terminated', dotColor: 'bg-red-500', textColor: 'text-red-800', bgColor: 'bg-red-100' },
};

const fmt = (n: number) => n.toLocaleString('en-ZM', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (s: string) => {
    const d = new Date(s);
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getFullYear()).slice(-2)}`;
};

export const Payroll: React.FC = () => {
    const { organizationId } = useAuth();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [mainTab, setMainTab] = useState<MainTab>('history');
    const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
    const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
    const [deptFilter, setDeptFilter] = useState('ALL');
    const [search, setSearch] = useState('');
    const [searchOpen, setSearchOpen] = useState(false);
    const [sortDir, setSortDir] = useState<SortDir>('desc');
    const [selectedRunIds, setSelectedRunIds] = useState<Set<string>>(new Set());
    const [isAddStaffOpen, setIsAddStaffOpen] = useState(false);
    const [isBatchImportOpen, setIsBatchImportOpen] = useState(false);
    const [isConfigureOpen, setIsConfigureOpen] = useState(false);
    const [isNewMemberMenuOpen, setIsNewMemberMenuOpen] = useState(false);
    const newMemberMenuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (newMemberMenuRef.current && !newMemberMenuRef.current.contains(e.target as Node)) {
                setIsNewMemberMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const { data: runs = [], isLoading: runsLoading } = useQuery<PayrollRun[]>({
        queryKey: ['payroll-runs', organizationId],
        queryFn: () => payrollService.listRuns(),
        enabled: !!organizationId,
    });

    const { data: staff = [], isLoading: staffLoading } = useQuery<StaffMember[]>({
        queryKey: ['payroll-staff', organizationId, deptFilter],
        queryFn: () => payrollService.listStaff(deptFilter !== 'ALL' ? deptFilter : undefined),
        enabled: !!organizationId,
    });

    const { data: departments = [] } = useQuery<string[]>({
        queryKey: ['payroll-departments', organizationId],
        queryFn: () => payrollService.getStaffDepartments(),
        enabled: !!organizationId,
    });

    const filteredStaff = staff.filter(s => {
        if (!search) return true;
        const full = `${s.first_name} ${s.last_name}`.toLowerCase();
        return full.includes(search.toLowerCase()) || (s.employee_number || '').toLowerCase().includes(search.toLowerCase());
    });

    const filteredRuns = runs
        .filter(r => {
            if (!search) return true;
            return r.period_label.toLowerCase().includes(search.toLowerCase());
        })
        .sort((a, b) => {
            const ta = new Date(a.run_at || a.created_at).getTime();
            const tb = new Date(b.run_at || b.created_at).getTime();
            return sortDir === 'desc' ? tb - ta : ta - tb;
        });

    const toggleSelectRun = (id: string) => {
        setSelectedRunIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const toggleSelectAll = () => {
        if (selectedRunIds.size === filteredRuns.length) {
            setSelectedRunIds(new Set());
        } else {
            setSelectedRunIds(new Set(filteredRuns.map(r => r.id)));
        }
    };

    // If viewing a specific run detail
    if (selectedRunId) {
        return (
            <Layout noPadding={true}>
            <div className="flex flex-col h-full min-h-0">
                <div className="flex-1 overflow-hidden">
                    <PayrollRunDetail
                        runId={selectedRunId}
                        onBack={() => setSelectedRunId(null)}
                        onApproved={() => {
                            queryClient.invalidateQueries({ queryKey: ['payroll-runs', organizationId] });
                            setSelectedRunId(null);
                        }}
                    />
                </div>
            </div>
            </Layout>
        );
    }

    // If viewing a specific staff member
    if (selectedStaffId) {
        return (
            <Layout noPadding={true}>
            <div className="flex flex-col h-full min-h-0">
                <div className="flex-1 overflow-hidden">
                    <StaffMemberDetail
                        staffId={selectedStaffId}
                        onBack={() => setSelectedStaffId(null)}
                        onUpdated={() => queryClient.invalidateQueries({ queryKey: ['payroll-staff', organizationId] })}
                    />
                </div>
            </div>
            </Layout>
        );
    }

    return (
        <Layout noPadding={true}>
        <div className="flex flex-col h-full min-h-0">

            <div className="flex-1 overflow-hidden flex flex-col px-5 pb-5 gap-2.5 pt-0">
                {/* Main card */}
                <div className="flex-1 bg-white rounded-[20px] flex flex-col overflow-hidden p-3.5 gap-3">

                    {/* Top toggle: Payroll History | Staff Members */}
                    <div className="flex items-center justify-between">
                        <div className="h-8 p-1 bg-slate-100 rounded-[10px] flex items-center gap-2.5">
                            <button
                                onClick={() => { setMainTab('history'); setSearch(''); setSearchOpen(false); }}
                                className={`px-3.5 h-full rounded-lg text-[10px] font-['DM_Sans'] transition-all ${
                                    mainTab === 'history'
                                        ? 'bg-white shadow-[0px_2px_4px_0px_rgba(0,0,0,0.10)] font-bold text-gray-900'
                                        : 'font-normal text-gray-900 hover:bg-white/50'
                                }`}
                            >
                                Payroll History
                            </button>
                            <button
                                onClick={() => { setMainTab('staff'); setSearch(''); setSearchOpen(false); }}
                                className={`px-3.5 h-full rounded-lg text-[10px] font-['DM_Sans'] transition-all ${
                                    mainTab === 'staff'
                                        ? 'bg-white shadow-[0px_2px_4px_0px_rgba(0,0,0,0.10)] font-bold text-gray-900'
                                        : 'font-normal text-gray-900 hover:bg-white/50'
                                }`}
                            >
                                Staff Members
                            </button>
                        </div>
                        
                        {/* Configure Button */}
                        <button
                            onClick={() => setIsConfigureOpen(true)}
                            className="h-8 px-3 py-1 bg-white border border-gray-200 text-gray-700 rounded-lg flex items-center gap-2 text-xs font-bold font-['DM_Sans'] hover:bg-gray-50 transition-colors shadow-sm"
                        >
                            <Settings size={13} className="text-gray-500" />
                            Configure
                        </button>
                    </div>

                    {/* Inner content */}
                    <div className="flex-1 flex flex-col gap-2 overflow-hidden">

                        {mainTab === 'history' && (
                            <>
                                {/* Toolbar row */}
                                <div className="flex items-center justify-between gap-3">
                                    {searchOpen ? (
                                        <div className="flex items-center gap-2 flex-1">
                                            <div className="flex-1 flex items-center gap-2 h-8 px-3 bg-gray-50 border border-gray-200 rounded-lg">
                                                <Search size={13} className="text-gray-400 flex-shrink-0" />
                                                <input
                                                    autoFocus
                                                    value={search}
                                                    onChange={e => setSearch(e.target.value)}
                                                    placeholder="Search payroll runs…"
                                                    className="flex-1 text-xs bg-transparent outline-none text-gray-900 placeholder:text-gray-400"
                                                />
                                                {search && (
                                                    <button onClick={() => setSearch('')} className="text-gray-400 hover:text-gray-600">
                                                        <X size={12} />
                                                    </button>
                                                )}
                                            </div>
                                            <button onClick={() => { setSearchOpen(false); setSearch(''); }} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                                        </div>
                                    ) : (
                                        <h2 className="text-xl font-semibold text-black font-['DM_Sans']">Payroll history</h2>
                                    )}

                                    {!searchOpen && (
                                        <div className="flex items-center gap-6">
                                            <div className="flex items-center gap-3">
                                                <button onClick={() => setSearchOpen(true)} className="w-4 h-4 text-gray-500 hover:text-gray-700 transition-colors">
                                                    <Search size={16} />
                                                </button>
                                                <button
                                                    onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')}
                                                    title={sortDir === 'desc' ? 'Newest first' : 'Oldest first'}
                                                    className={`w-4 h-4 transition-colors ${sortDir === 'asc' ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                                                >
                                                    <ArrowDownUp size={16} />
                                                </button>
                                                <button className="w-4 h-4 text-gray-500 hover:text-gray-700 transition-colors">
                                                    <SlidersHorizontal size={16} />
                                                </button>
                                            </div>
                                            <button
                                                onClick={() => navigate('/apps/payroll/run')}
                                                className="h-8 px-3 py-1 bg-blue-600 rounded-lg flex items-center gap-2.5 text-white text-xs font-bold font-['DM_Sans'] hover:bg-blue-700 transition-colors"
                                            >
                                                Run Payroll
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {/* Payroll runs table */}
                                <div className="flex-1 bg-white rounded-xl border border-violet-100 flex flex-col overflow-hidden">
                                    {/* Table header */}
                                    <div className="h-9 px-7 py-2 bg-white border-b border-violet-100 flex items-center gap-10 flex-shrink-0">
                                        <div className="flex-1 flex items-center gap-4">
                                            <input
                                                type="checkbox"
                                                checked={filteredRuns.length > 0 && selectedRunIds.size === filteredRuns.length}
                                                onChange={toggleSelectAll}
                                                className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 cursor-pointer flex-shrink-0"
                                            />
                                            <div className="flex items-center gap-8" style={{ minWidth: 300 }}>
                                                <span className="w-16 text-xs font-semibold text-black font-['DM_Sans'] leading-5">Date</span>
                                                <span className="text-xs font-semibold text-black font-['DM_Sans'] leading-5">Description</span>
                                            </div>
                                            <div className="flex-1" />
                                            <div className="flex items-center justify-between w-60">
                                                <span className="w-16 text-center text-xs font-semibold text-black font-['DM_Sans'] leading-5">Status</span>
                                                <span className="w-24 text-center text-xs font-semibold text-black font-['DM_Sans'] leading-5">Gross Total</span>
                                                <span className="w-24 text-center text-xs font-semibold text-black font-['DM_Sans'] leading-5">Net Total</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Table rows */}
                                    <div className="flex-1 overflow-y-auto">
                                        {runsLoading ? (
                                            <div className="flex items-center justify-center h-32 text-sm text-gray-400">Loading…</div>
                                        ) : filteredRuns.length === 0 ? (
                                            <div className="flex flex-col items-center justify-center h-32 gap-2">
                                                <p className="text-sm text-gray-400 font-medium">{search ? 'No results found' : 'No payroll runs yet'}</p>
                                                {!search && (
                                                    <button
                                                        onClick={() => navigate('/apps/payroll/run')}
                                                        className="text-xs text-blue-600 font-semibold hover:underline"
                                                    >
                                                        Run your first payroll
                                                    </button>
                                                )}
                                            </div>
                                        ) : filteredRuns.map(run => {
                                            const sc = STATUS_CONFIG[run.status] ?? STATUS_CONFIG.DRAFT;
                                            const dateStr = run.run_at ? fmtDate(run.run_at) : fmtDate(run.created_at);
                                            const isSelected = selectedRunIds.has(run.id);
                                            return (
                                                <div
                                                    key={run.id}
                                                    className={`w-full h-9 px-5 py-1 flex items-center gap-3 transition-colors border-b border-violet-50 last:border-0 ${isSelected ? 'bg-blue-50' : 'bg-white hover:bg-slate-50'}`}
                                                >
                                                    <div className="flex-1 flex items-center gap-6">
                                                        <input
                                                            type="checkbox"
                                                            checked={isSelected}
                                                            onChange={() => toggleSelectRun(run.id)}
                                                            onClick={e => e.stopPropagation()}
                                                            className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 cursor-pointer flex-shrink-0"
                                                        />
                                                        <button
                                                            onClick={() => setSelectedRunId(run.id)}
                                                            className="flex-1 flex items-center gap-8 text-left"
                                                            style={{ minWidth: 300 }}
                                                        >
                                                            <span className="w-16 text-center text-xs text-zinc-700 font-['DM_Sans'] leading-5">{dateStr}</span>
                                                            <span className="text-xs font-medium text-black font-['DM_Sans']">{run.period_label}</span>
                                                        </button>
                                                        <div className="flex-1" />
                                                        <button
                                                            onClick={() => setSelectedRunId(run.id)}
                                                            className="flex items-center justify-between w-60"
                                                        >
                                                            <div className="w-16 flex justify-center">
                                                                <span className={`pl-1.5 pr-2 py-0.5 ${sc.bgColor} rounded-[20px] inline-flex items-center gap-1.5`}>
                                                                    <span className={`w-1.5 h-1.5 ${sc.dotColor} rounded-full`} />
                                                                    <span className={`text-[10px] font-semibold font-['Inter'] ${sc.textColor}`}>{sc.label}</span>
                                                                </span>
                                                            </div>
                                                            <span className="w-24 text-center text-xs text-black font-['DM_Sans'] leading-5">K{fmt(run.gross_total)}</span>
                                                            <span className="w-24 text-center text-xs text-black font-['DM_Sans'] leading-5">K{fmt(run.net_total)}</span>
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </>
                        )}

                        {mainTab === 'staff' && (
                            <>
                                {/* Department filter + toolbar */}
                                <div className="flex items-center justify-between gap-3">
                                    {searchOpen ? (
                                        <div className="flex items-center gap-2 flex-1">
                                            <div className="flex-1 flex items-center gap-2 h-8 px-3 bg-gray-50 border border-gray-200 rounded-lg">
                                                <Search size={13} className="text-gray-400 flex-shrink-0" />
                                                <input
                                                    autoFocus
                                                    value={search}
                                                    onChange={e => setSearch(e.target.value)}
                                                    placeholder="Search staff members…"
                                                    className="flex-1 text-xs bg-transparent outline-none text-gray-900 placeholder:text-gray-400"
                                                />
                                                {search && (
                                                    <button onClick={() => setSearch('')} className="text-gray-400 hover:text-gray-600">
                                                        <X size={12} />
                                                    </button>
                                                )}
                                            </div>
                                            <button onClick={() => { setSearchOpen(false); setSearch(''); }} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                                        </div>
                                    ) : (
                                        <div className="h-8 p-1 bg-slate-100 rounded-[10px] flex items-center gap-2.5 overflow-x-auto max-w-[60%]">
                                            {['ALL', ...departments].map(dept => (
                                                <button
                                                    key={dept}
                                                    onClick={() => setDeptFilter(dept)}
                                                    className={`px-3.5 h-full rounded-lg text-[10px] font-['DM_Sans'] whitespace-nowrap transition-all flex-shrink-0 ${
                                                        deptFilter === dept
                                                            ? 'bg-white shadow-[0px_2px_4px_0px_rgba(0,0,0,0.10)] font-bold text-gray-900'
                                                            : 'font-normal text-gray-900 hover:bg-white/50'
                                                    }`}
                                                >
                                                    {dept === 'ALL' ? 'All Dept' : dept}
                                                </button>
                                            ))}
                                        </div>
                                    )}

                                    {!searchOpen && (
                                        <div className="flex items-center gap-6">
                                            <div className="flex items-center gap-3">
                                                <button onClick={() => setSearchOpen(true)} className="w-4 h-4 text-gray-500 hover:text-gray-700 transition-colors">
                                                    <Search size={16} />
                                                </button>
                                                <button
                                                    onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')}
                                                    className={`w-4 h-4 transition-colors ${sortDir === 'asc' ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                                                >
                                                    <ArrowDownUp size={16} />
                                                </button>
                                                <button className="w-4 h-4 text-gray-500 hover:text-gray-700 transition-colors">
                                                    <SlidersHorizontal size={16} />
                                                </button>
                                            </div>
                                            <div className="relative" ref={newMemberMenuRef}>
                                                <button
                                                    onClick={() => setIsNewMemberMenuOpen(prev => !prev)}
                                                    className="h-8 px-3 py-1 bg-blue-600 rounded-lg flex items-center gap-2 text-white text-xs font-bold font-['DM_Sans'] hover:bg-blue-700 transition-colors"
                                                >
                                                    New Member
                                                    <Plus size={13} />
                                                </button>
                                                {isNewMemberMenuOpen && (
                                                    <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-72 bg-white rounded-2xl shadow-[0px_8px_24px_0px_rgba(17,24,39,0.12)] outline outline-1 outline-offset-[-1px] outline-[#E8EEF8] overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                                                        <button
                                                            onClick={() => { setIsNewMemberMenuOpen(false); setIsAddStaffOpen(true); }}
                                                            className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[#F3F5FC] transition-colors"
                                                        >
                                                            <div className="w-9 h-9 flex items-center justify-center flex-shrink-0 text-blue-600">
                                                                <UserPlus size={18} />
                                                            </div>
                                                            <div className="min-w-0">
                                                                <div className="text-xs font-bold text-[#111827] truncate">Add Employee</div>
                                                                <div className="text-[11px] text-gray-400 truncate">Add a single staff member manually</div>
                                                            </div>
                                                        </button>
                                                        <button
                                                            onClick={() => { setIsNewMemberMenuOpen(false); setIsBatchImportOpen(true); }}
                                                            className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[#F3F5FC] transition-colors"
                                                        >
                                                            <div className="w-9 h-9 flex items-center justify-center flex-shrink-0 text-emerald-600">
                                                                <FileSpreadsheet size={18} />
                                                            </div>
                                                            <div className="min-w-0">
                                                                <div className="text-xs font-bold text-[#111827] truncate">Import from Excel / CSV</div>
                                                                <div className="text-[11px] text-gray-400 truncate">Batch add staff from a spreadsheet file</div>
                                                            </div>
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Staff list */}
                                <div className="flex-1 bg-white rounded-2xl border border-violet-100 flex flex-col overflow-hidden">
                                    <div className="flex-1 overflow-y-auto px-3 py-5 flex flex-col gap-4">
                                        {staffLoading ? (
                                            <div className="flex items-center justify-center h-32 text-sm text-gray-400">Loading…</div>
                                        ) : filteredStaff.length === 0 ? (
                                            <div className="flex flex-col items-center justify-center h-32 gap-2">
                                                <p className="text-sm text-gray-400 font-medium">{search ? 'No results found' : 'No staff members yet'}</p>
                                                {!search && (
                                                    <button
                                                        onClick={() => setIsAddStaffOpen(true)}
                                                        className="text-xs text-blue-600 font-semibold hover:underline"
                                                    >
                                                        Add your first staff member
                                                    </button>
                                                )}
                                            </div>
                                        ) : filteredStaff.map(member => {
                                            const sc = STAFF_STATUS_CONFIG[member.status] ?? STAFF_STATUS_CONFIG.ACTIVE;
                                            const fullName = [member.first_name, member.last_name].filter(Boolean).join(' ');
                                            return (
                                                <button
                                                    key={member.id}
                                                    onClick={() => setSelectedStaffId(member.id)}
                                                    className="w-full flex items-center justify-between p-3 bg-white hover:bg-slate-50 rounded-xl border border-gray-100 transition-colors text-left"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xs font-bold flex-shrink-0">
                                                            {(member.first_name?.[0] ?? '?').toUpperCase()}
                                                        </div>
                                                        <div>
                                                            <p className="text-xs font-semibold text-gray-900">{fullName}</p>
                                                            <p className="text-[10px] text-gray-400">{member.employee_number} · {member.department || member.position || '—'}</p>
                                                        </div>
                                                    </div>
                                                    <span className={`pl-1.5 pr-2 py-0.5 ${sc.bgColor} rounded-[20px] inline-flex items-center gap-1.5`}>
                                                        <span className={`w-1.5 h-1.5 ${sc.dotColor} rounded-full`} />
                                                        <span className={`text-[10px] font-semibold font-['Inter'] ${sc.textColor}`}>{sc.label}</span>
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {isAddStaffOpen && (
                <AddStaffWizard
                    onClose={() => setIsAddStaffOpen(false)}
                    onSuccess={() => {
                        setIsAddStaffOpen(false);
                        queryClient.invalidateQueries({ queryKey: ['payroll-staff', organizationId] });
                        queryClient.invalidateQueries({ queryKey: ['payroll-departments', organizationId] });
                    }}
                />
            )}
            {isBatchImportOpen && (
                <BatchImportStaff
                    onClose={() => setIsBatchImportOpen(false)}
                    onSuccess={() => {
                        setIsBatchImportOpen(false);
                        queryClient.invalidateQueries({ queryKey: ['payroll-staff', organizationId] });
                        queryClient.invalidateQueries({ queryKey: ['payroll-departments', organizationId] });
                    }}
                />
            )}
            {isConfigureOpen && (
                <PayrollConfigModal
                    isOpen={isConfigureOpen}
                    onClose={() => setIsConfigureOpen(false)}
                />
            )}
        </div>
        </Layout>
    );
};

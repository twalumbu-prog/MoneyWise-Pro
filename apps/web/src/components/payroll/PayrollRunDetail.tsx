import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { payrollService, PayrollRunDetail as RunDetailType } from '../../services/payroll.service';
import { ArrowLeft, Search, ArrowDownUp, SlidersHorizontal, FileText, ChevronRight } from 'lucide-react';

interface Props {
    runId: string;
    onBack: () => void;
    onApproved: () => void;
}

type DetailTab = 'register' | 'statutory' | 'imports' | 'other';

const fmt = (n: number) => n.toLocaleString('en-ZM', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const PayrollRunDetail: React.FC<Props> = ({ runId, onBack, onApproved }) => {
    const [activeTab, setActiveTab] = useState<DetailTab>('register');
    const [approving, setApproving] = useState(false);

    const { data, isLoading } = useQuery<RunDetailType>({
        queryKey: ['payroll-run', runId],
        queryFn: () => payrollService.getRun(runId),
    });

    const run = data?.run;
    const items = data?.items ?? [];
    const documents = data?.documents ?? [];

    const handleApprove = async () => {
        if (!run || approving) return;
        setApproving(true);
        try {
            await payrollService.approveRun(runId);
            onApproved();
        } catch (err) {
            console.error(err);
        } finally {
            setApproving(false);
        }
    };

    const tabs: { value: DetailTab; label: string }[] = [
        { value: 'register', label: 'Payroll Register' },
        { value: 'statutory', label: 'Statutory Docs' },
        { value: 'imports', label: 'Imported Documents' },
        { value: 'other', label: 'Other Relevant Docs' },
    ];

    const month = run?.period_month ?? 0;
    const monthNames = ['','January','February','March','April','May','June','July','August','September','October','November','December'];

    return (
        <div className="flex-1 px-5 pb-5 flex flex-col gap-4 h-full overflow-hidden">
            <div className="flex-1 bg-white rounded-[20px] border border-gray-200 flex flex-col overflow-hidden px-5 py-3.5 gap-4">

                {/* Header row */}
                <div className="flex items-center justify-between flex-shrink-0">
                    <div className="flex items-center gap-2.5">
                        <button
                            onClick={onBack}
                            className="p-2.5 rounded-[50px] hover:bg-gray-100 transition-colors"
                        >
                            <ArrowLeft size={14} />
                        </button>
                        <span className="text-base font-semibold text-black font-['IBM_Plex_Sans_Devanagari']">
                            {run?.period_label ?? 'Payroll Run'}
                        </span>
                    </div>
                    <div className="flex items-center gap-2.5">
                        {run && run.status !== 'CLEARED' && (
                            <button
                                onClick={handleApprove}
                                disabled={approving}
                                className="h-8 px-3 py-1 bg-blue-600 rounded-lg flex items-center gap-2.5 text-white text-[10px] font-bold font-['DM_Sans'] hover:bg-blue-700 transition-colors disabled:opacity-60"
                            >
                                {approving ? 'Approving…' : 'Approve'}
                            </button>
                        )}
                    </div>
                </div>

                {/* Summary strip */}
                <div className="h-20 px-6 rounded-xl border border-gray-200 flex items-center gap-20 flex-shrink-0">
                    <div className="flex-1 flex flex-col items-center gap-px">
                        <span className="text-[8px] font-semibold text-stone-300 font-['IBM_Plex_Sans_Devanagari'] leading-5">Total Number of Employees</span>
                        <span className="text-xs font-bold text-black font-['IBM_Plex_Sans_Devanagari'] leading-5">
                            {isLoading ? '—' : `${run?.employee_count ?? 0} Employees`}
                        </span>
                    </div>
                    <div className="flex-1 flex flex-col items-center gap-px">
                        <span className="text-[8px] font-semibold text-stone-300 font-['IBM_Plex_Sans_Devanagari'] leading-5">Total Gross Pay</span>
                        <span className="text-xs font-bold text-black font-['IBM_Plex_Sans_Devanagari'] leading-5">
                            {isLoading ? '—' : `K${fmt(run?.gross_total ?? 0)}`}
                        </span>
                    </div>
                    <div className="flex-1 flex flex-col items-center gap-px">
                        <span className="text-[8px] font-semibold text-stone-300 font-['IBM_Plex_Sans_Devanagari'] leading-5">Net Pay</span>
                        <span className="text-xs font-bold text-black font-['IBM_Plex_Sans_Devanagari'] leading-5">
                            {isLoading ? '—' : `K${fmt(run?.net_total ?? 0)}`}
                        </span>
                    </div>
                </div>

                {/* Tab strip */}
                <div className="p-1 bg-slate-100 rounded-[60px] shadow-[inset_0px_4px_4px_0px_rgba(0,0,0,0.05)] flex items-center gap-2 flex-shrink-0">
                    {tabs.map(tab => (
                        <button
                            key={tab.value}
                            onClick={() => setActiveTab(tab.value)}
                            className={`flex-1 px-4 py-1 rounded-[50px] flex items-center justify-center gap-2.5 text-[10px] font-['DM_Sans'] leading-6 transition-all ${
                                activeTab === tab.value
                                    ? 'bg-white shadow-[0px_2px_8px_0px_rgba(0,0,0,0.15)] font-medium text-black'
                                    : 'font-normal text-zinc-800 hover:bg-white/50'
                            }`}
                        >
                            {activeTab === tab.value && (
                                <span className="w-1.5 h-1.5 bg-blue-700 rounded-full" />
                            )}
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Tab content */}
                <div className="flex-1 py-3.5 bg-white rounded-xl flex flex-col gap-4 overflow-hidden">

                    {activeTab === 'register' && (
                        <>
                            <div className="flex items-center justify-between flex-shrink-0">
                                <span className="text-sm font-bold text-black font-['DM_Sans'] leading-5">Payroll History</span>
                                <div className="flex items-center gap-3">
                                    <Search size={16} className="text-gray-500" />
                                    <ArrowDownUp size={16} className="text-gray-500" />
                                    <SlidersHorizontal size={16} className="text-gray-500" />
                                </div>
                            </div>

                            {/* Register table */}
                            <div className="flex-1 bg-white rounded-xl border border-violet-100 flex flex-col overflow-hidden">
                                <div className="h-9 px-7 py-2 bg-white border-b border-violet-100 flex items-center gap-10 flex-shrink-0">
                                    <div className="flex-1 flex items-center gap-11">
                                        <div className="w-4 h-4 flex-shrink-0" />
                                        <div className="w-48 text-xs font-semibold text-black font-['DM_Sans'] leading-5">Name</div>
                                        <div className="flex items-center gap-6">
                                            {['Basic Pay','Overtime','Allowances','Gross Pay'].map(col => (
                                                <span key={col} className="w-16 text-center text-xs font-semibold text-black font-['DM_Sans'] leading-5">{col}</span>
                                            ))}
                                        </div>
                                        <div className="flex items-center gap-6">
                                            {['Statutory','Loans','Other','Net Pay'].map(col => (
                                                <span key={col} className="w-16 text-center text-xs font-semibold text-black font-['DM_Sans'] leading-5">{col}</span>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex-1 overflow-y-auto">
                                    {isLoading ? (
                                        <div className="flex items-center justify-center h-20 text-sm text-gray-400">Loading…</div>
                                    ) : items.length === 0 ? (
                                        <div className="flex items-center justify-center h-20 text-sm text-gray-400">No items in this run</div>
                                    ) : items.map(item => (
                                        <div key={item.id} className="h-9 px-5 py-1 bg-white flex items-center gap-3 border-b border-violet-50 last:border-0">
                                            <div className="flex-1 flex items-center gap-12">
                                                <div className="w-5 h-4 flex-shrink-0" />
                                                <div className="w-48 text-xs font-medium text-black font-['DM_Sans']">{item.staff_name}</div>
                                                <div className="flex items-center gap-6">
                                                    <span className="w-16 text-center text-xs font-bold text-black font-['DM_Sans'] leading-5">K{fmt(item.basic_pay)}</span>
                                                    <span className="w-16 text-center text-xs text-black font-['DM_Sans'] leading-5">K{fmt(item.overtime)}</span>
                                                    <span className="w-16 text-center text-xs text-black font-['DM_Sans'] leading-5">K{fmt(item.allowances || 0)}</span>
                                                    <span className="w-16 text-center text-xs font-bold text-black font-['DM_Sans'] leading-5">K{fmt(item.gross_pay)}</span>
                                                </div>
                                                <div className="flex items-center gap-6">
                                                    <span className="w-16 text-center text-xs text-black font-['DM_Sans'] leading-5">K{fmt(item.statutory_total)}</span>
                                                    <span className="w-16 text-center text-xs text-black font-['DM_Sans'] leading-5">K{fmt(item.loans)}</span>
                                                    <span className="w-16 text-center text-xs text-black font-['DM_Sans'] leading-5">K{fmt(item.other_deductions)}</span>
                                                    <span className="w-16 text-center text-xs font-bold text-black font-['DM_Sans'] leading-5">K{fmt(item.net_pay)}</span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}

                    {activeTab === 'statutory' && (
                        <>
                            <div className="flex items-center justify-between flex-shrink-0">
                                <span className="text-sm font-bold text-black font-['DM_Sans'] leading-5">Statutory Documents</span>
                                <div className="flex items-center gap-3">
                                    <Search size={16} className="text-gray-500" />
                                    <ArrowDownUp size={16} className="text-gray-500" />
                                    <SlidersHorizontal size={16} className="text-gray-500" />
                                </div>
                            </div>

                            <div className="flex flex-col gap-2.5 overflow-y-auto">
                                {[
                                    { key: 'napsa', label: `NAPSA Statutory Contribution - Month of ${monthNames[month]}` },
                                    { key: 'nhima', label: `NHIMA Statutory Contribution - Month of ${monthNames[month]}` },
                                    { key: 'paye', label: `ZRA Pay As You Earn Statutory Contribution - Month of ${monthNames[month]}` },
                                ].map(doc => (
                                    <div
                                        key={doc.key}
                                        className="w-full p-5 bg-white rounded-[10px] shadow-[0px_4px_4px_0px_rgba(0,0,0,0.05)] border border-gray-200 flex items-center justify-between"
                                    >
                                        <div className="flex items-center gap-3">
                                            <FileText size={12} className="text-gray-400 flex-shrink-0" />
                                            <span className="text-xs text-black font-['DM_Sans'] leading-5">{doc.label}</span>
                                        </div>
                                        <button className="w-6 h-4 flex items-center justify-center">
                                            <ChevronRight size={16} className="text-black" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}

                    {activeTab === 'imports' && (
                        <>
                            <div className="flex items-center justify-between flex-shrink-0">
                                <span className="text-sm font-bold text-black font-['DM_Sans'] leading-5">Imported Documents</span>
                            </div>
                            <div className="flex-1 overflow-y-auto">
                                {documents.filter(d => d.doc_type === 'IMPORT').length === 0 ? (
                                    <div className="flex items-center justify-center h-20 text-sm text-gray-400">No imported documents</div>
                                ) : documents.filter(d => d.doc_type === 'IMPORT').map(doc => (
                                    <div key={doc.id} className="p-5 bg-white rounded-[10px] shadow-[0px_4px_4px_0px_rgba(0,0,0,0.05)] border border-gray-200 flex items-center gap-3 mb-2.5">
                                        <FileText size={12} className="text-gray-400" />
                                        <span className="text-xs text-black font-['DM_Sans']">{doc.file_name}</span>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}

                    {activeTab === 'other' && (
                        <>
                            <div className="flex items-center justify-between flex-shrink-0">
                                <span className="text-sm font-bold text-black font-['DM_Sans'] leading-5">Other Relevant Documents</span>
                            </div>
                            <div className="flex-1 overflow-y-auto">
                                {documents.filter(d => d.doc_type === 'OTHER').length === 0 ? (
                                    <div className="flex items-center justify-center h-20 text-sm text-gray-400">No documents</div>
                                ) : documents.filter(d => d.doc_type === 'OTHER').map(doc => (
                                    <div key={doc.id} className="p-5 bg-white rounded-[10px] shadow-[0px_4px_4px_0px_rgba(0,0,0,0.05)] border border-gray-200 flex items-center gap-3 mb-2.5">
                                        <FileText size={12} className="text-gray-400" />
                                        <span className="text-xs text-black font-['DM_Sans']">{doc.file_name}</span>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}

                </div>
            </div>
        </div>
    );
};

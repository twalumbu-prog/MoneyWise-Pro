import React, { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { ShieldCheck, TrendingUp, AlertTriangle, FileText, Search, Filter, Calendar, ExternalLink } from 'lucide-react';
import { requisitionService } from '../services/requisition.service';
import { Link } from 'react-router-dom';

export const Audit: React.FC = () => {
    const [loading, setLoading] = useState(true);
    const [report, setReport] = useState<any>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('ALL');

    useEffect(() => {
        fetchReport();
    }, []);

    const fetchReport = async () => {
        try {
            setLoading(true);
            const data = await requisitionService.getAuditReport();
            setReport(data);
        } catch (err) {
            console.error('Failed to fetch audit report', err);
        } finally {
            setLoading(false);
        }
    };

    const filteredTransactions = report?.transactions?.filter((t: any) => {
        const matchesSearch = t.description?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                             t.reference_number?.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = statusFilter === 'ALL' || t.rating === statusFilter;
        return matchesSearch && matchesStatus;
    });

    const getRatingColor = (rating: string) => {
        switch (rating) {
            case 'Brilliant': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
            case 'Average': return 'bg-amber-100 text-amber-700 border-amber-200';
            case 'Bad': return 'bg-red-100 text-red-700 border-red-200';
            default: return 'bg-gray-100 text-gray-700 border-gray-200';
        }
    };

    return (
        <Layout>
            <div className="space-y-8">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-black text-brand-navy">Audit & Compliance</h1>
                        <p className="text-gray-500 font-medium">Monitoring transaction integrity and efficiency.</p>
                    </div>
                    <div className="flex items-center space-x-3 bg-white p-2 rounded-2xl shadow-sm border border-gray-100">
                        <div className="p-2 bg-brand-navy/5 rounded-xl">
                            <Calendar className="h-5 w-5 text-brand-navy" />
                        </div>
                        <div>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Reporting Period</p>
                            <p className="text-sm font-black text-brand-navy">All Time</p>
                        </div>
                    </div>
                </div>

                {/* Summary Widgets */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-brand-navy p-8 rounded-[2.5rem] text-white relative overflow-hidden shadow-2xl shadow-brand-navy/20">
                        <div className="relative z-10">
                            <p className="text-white/60 font-bold uppercase tracking-widest text-xs mb-2">Overall Accuracy</p>
                            <div className="flex items-baseline space-x-2">
                                <h2 className="text-6xl font-black">{report?.summary?.average_score || 0}%</h2>
                                <TrendingUp className="h-6 w-6 text-emerald-400" />
                            </div>
                            <p className="text-white/40 text-sm mt-4 font-medium">Average score across {report?.summary?.total_audited || 0} transactions.</p>
                        </div>
                        <ShieldCheck className="absolute -bottom-10 -right-10 h-48 w-48 text-white/5" />
                    </div>

                    <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm flex flex-col justify-between">
                        <div>
                            <div className="h-12 w-12 bg-emerald-50 rounded-2xl flex items-center justify-center mb-4">
                                <ShieldCheck className="h-6 w-6 text-emerald-600" />
                            </div>
                            <h3 className="text-lg font-black text-brand-navy">Compliance Health</h3>
                            <p className="text-gray-500 text-sm font-medium">Receipt documentation and OCR matching status.</p>
                        </div>
                        <div className="mt-6 flex items-center space-x-2">
                            <span className="text-2xl font-black text-brand-navy">Good</span>
                            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded-full">Optimal</span>
                        </div>
                    </div>

                    <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm flex flex-col justify-between">
                        <div>
                            <div className="h-12 w-12 bg-amber-50 rounded-2xl flex items-center justify-center mb-4">
                                <AlertTriangle className="h-6 w-6 text-amber-600" />
                            </div>
                            <h3 className="text-lg font-black text-brand-navy">Efficiency Tracking</h3>
                            <p className="text-gray-500 text-sm font-medium">Average time from Draft to final accounting.</p>
                        </div>
                        <div className="mt-6 flex items-center space-x-2">
                            <span className="text-2xl font-black text-brand-navy">~31h</span>
                            <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-bold rounded-full">Needs Work</span>
                        </div>
                    </div>
                </div>

                {/* Main Table Section */}
                <div className="bg-white rounded-[2.5rem] shadow-sm border border-gray-100 overflow-hidden">
                    <div className="p-8 border-b border-gray-50 flex flex-col md:flex-row md:items-center justify-between gap-6">
                        <h3 className="text-xl font-black text-brand-navy">Transaction Audit Log</h3>
                        
                        <div className="flex flex-col md:flex-row items-center gap-4">
                            <div className="relative">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                <input 
                                    type="text" 
                                    placeholder="Search reference..."
                                    className="pl-11 pr-6 py-3 bg-gray-50 border-none rounded-2xl text-sm focus:ring-2 focus:ring-brand-navy/10 w-full md:w-64"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                            <div className="flex items-center space-x-2 bg-gray-50 p-1.5 rounded-2xl">
                                {['ALL', 'Brilliant', 'Average', 'Bad'].map(f => (
                                    <button
                                        key={f}
                                        onClick={() => setStatusFilter(f)}
                                        className={`px-4 py-2 text-xs font-bold rounded-xl transition-all ${statusFilter === f ? 'bg-white text-brand-navy shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                                    >
                                        {f}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="bg-gray-50/50">
                                    <th className="px-8 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Transaction</th>
                                    <th className="px-8 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Requestor</th>
                                    <th className="px-8 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Performance</th>
                                    <th className="px-8 py-4 text-right text-[10px] font-black text-gray-400 uppercase tracking-widest">Score</th>
                                    <th className="px-8 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {loading ? (
                                    <tr>
                                        <td colSpan={5} className="px-8 py-12 text-center text-gray-400">
                                            <div className="animate-spin h-6 w-6 border-2 border-brand-navy border-t-transparent rounded-full mx-auto mb-4" />
                                            Loading audit data...
                                        </td>
                                    </tr>
                                ) : filteredTransactions?.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="px-8 py-12 text-center text-gray-400">
                                            No transactions found matching your filters.
                                        </td>
                                    </tr>
                                ) : filteredTransactions?.map((t: any) => (
                                    <tr key={t.id} className="hover:bg-gray-50/50 transition-colors group">
                                        <td className="px-8 py-6">
                                            <div className="flex flex-col">
                                                <span className="text-sm font-black text-brand-navy group-hover:text-brand-green transition-colors">{t.reference_number || `REQ-${t.id.slice(0, 8)}`}</span>
                                                <span className="text-xs text-gray-400 font-medium truncate max-w-[200px]">{t.description}</span>
                                            </div>
                                        </td>
                                        <td className="px-8 py-6">
                                            <div className="flex items-center space-x-3">
                                                <div className="h-8 w-8 bg-brand-navy/5 rounded-full flex items-center justify-center text-[10px] font-bold text-brand-navy uppercase">
                                                    {t.requestor_name?.split(' ').map((n: string) => n[0]).join('') || '?'}
                                                </div>
                                                <span className="text-xs font-bold text-gray-700">{t.requestor_name || 'System'}</span>
                                            </div>
                                        </td>
                                        <td className="px-8 py-6">
                                            <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${getRatingColor(t.rating)}`}>
                                                {t.rating}
                                            </span>
                                        </td>
                                        <td className="px-8 py-6 text-right">
                                            <span className="text-sm font-black text-brand-navy">{Math.round(t.audit_score)}%</span>
                                        </td>
                                        <td className="px-8 py-6">
                                            <div className="flex justify-center">
                                                <Link 
                                                    to={`/requisitions/${t.id}`}
                                                    className="p-2 hover:bg-white hover:shadow-sm rounded-xl transition-all text-gray-400 hover:text-brand-green"
                                                >
                                                    <ExternalLink className="h-4 w-4" />
                                                </Link>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </Layout>
    );
};

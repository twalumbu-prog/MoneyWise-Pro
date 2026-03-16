import React, { useState } from 'react';
import { X, FileText, User, Calendar, Tag, Building, CreditCard, Eye, EyeOff, Sparkles, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';
import { requisitionService } from '../services/requisition.service';

interface DisbursementDetailOverlayProps {
    disbursement: any;
    onClose: () => void;
    onUpdated: () => void;
}

const calculateTotal = (denominations: Record<string, number>) => {
    return Object.entries(denominations).reduce((total, [value, count]) => {
        return total + Number(value) * count;
    }, 0);
};

export const DisbursementDetailOverlay: React.FC<DisbursementDetailOverlayProps> = ({ disbursement, onClose, onUpdated }) => {
    const isPending = !disbursement.confirmed_at;
    const requisition = disbursement.requisitions;
    
    const [totalPrepared, setTotalPrepared] = useState<string>(disbursement.total_prepared.toString());
    const [denominations, setDenominations] = useState<Record<string, number>>(disbursement.denominations || {
        '500': 0, '200': 0, '100': 0, '50': 0, '20': 0, '10': 0, '5': 0, '2': 0, '1': 0, '0.50': 0
    });
    const [processing, setProcessing] = useState(false);
    const [showProof, setShowProof] = useState(false);
    const [aiResult, setAiResult] = useState<any>(null);
    const [analyzing, setAnalyzing] = useState(false);

    const handleDenominationChange = (value: string, count: number) => {
        if (!isPending) return;
        const nextDenominations = {
            ...denominations,
            [value]: Math.max(0, count)
        };
        setDenominations(nextDenominations);
        if (disbursement.payment_method === 'CASH') {
            setTotalPrepared(calculateTotal(nextDenominations).toString());
        }
    };

    const handleUpdate = async () => {
        try {
            setProcessing(true);
            await requisitionService.updateDisbursement(disbursement.id, {
                total_prepared: Number(totalPrepared),
                denominations: disbursement.payment_method === 'CASH' ? denominations : {}
            });
            onUpdated();
            onClose();
        } catch (err: any) {
            alert(err.message || 'Failed to update disbursement');
        } finally {
            setProcessing(false);
        }
    };

    const handleAnalyze = async () => {
        try {
            setAnalyzing(true);
            const result = await requisitionService.analyzeDisbursementProof(disbursement.id);
            setAiResult(result);
            setShowProof(true);
        } catch (err: any) {
            alert(err.message || 'AI analysis failed');
        } finally {
            setAnalyzing(false);
        }
    };

    const proofUrl = disbursement.transfer_proof_url ? requisitionService.getFileUrl(disbursement.transfer_proof_url) : null;
    const amountMismatch = aiResult && Math.abs(aiResult.ocrData.total_amount - aiResult.recordedAmount) > 0.01;

    return (
        <div className="fixed inset-0 bg-brand-navy/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-6xl overflow-hidden flex flex-col lg:flex-row max-h-[90vh]">
                
                {/* Left Panel: Disbursement Details & Proof */}
                <div className="flex-1 p-8 border-r border-gray-100 overflow-y-auto">
                    <div className="flex justify-between items-start mb-6">
                        <div>
                            <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${isPending ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                                {isPending ? 'Pending Acknowledgment' : 'Received & Confirmed'}
                            </span>
                            <h3 className="text-2xl font-black text-brand-navy mt-2 flex items-center gap-2">
                                Disbursement Details
                                <span className={`flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-lg uppercase ${
                                    disbursement.payment_method === 'CASH' ? 'bg-brand-green/10 text-brand-green' : 'bg-brand-pink/10 text-brand-pink'
                                }`}>
                                    <CreditCard className="h-3 w-3" /> {disbursement.payment_method || 'CASH'}
                                </span>
                            </h3>
                            <p className="text-gray-400 text-sm">#{disbursement.id.slice(0, 12)}</p>
                        </div>
                        <button onClick={onClose} className="lg:hidden text-gray-400 hover:text-gray-600">
                            <X className="h-6 w-6" />
                        </button>
                    </div>

                    <div className="space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-gray-50 rounded-2xl p-4">
                                <span className="text-[10px] text-gray-400 uppercase font-bold">Issued By</span>
                                <div className="flex items-center mt-1">
                                    <User className="h-4 w-4 text-brand-green mr-2" />
                                    <span className="text-sm font-medium text-brand-navy">{disbursement.cashier_name || 'N/A'}</span>
                                </div>
                            </div>
                            <div className="bg-gray-50 rounded-2xl p-4">
                                <span className="text-[10px] text-gray-400 uppercase font-bold">Issued At</span>
                                <div className="flex items-center mt-1">
                                    <Calendar className="h-4 w-4 text-brand-green mr-2" />
                                    <span className="text-sm font-medium text-brand-navy">{new Date(disbursement.issued_at).toLocaleString()}</span>
                                </div>
                            </div>
                        </div>

                        {/* Payment Method / Amount Section */}
                        <div>
                            <h4 className="text-xs font-bold text-gray-400 uppercase mb-3 flex items-center justify-between">
                                <span className="flex items-center gap-1"><Tag className="h-3 w-3" /> Financial Breakdown</span>
                                {proofUrl ? (
                                    <button 
                                        onClick={() => setShowProof(!showProof)}
                                        className="text-brand-pink flex items-center gap-1 hover:underline animate-pulse"
                                    >
                                        {showProof ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                                        {showProof ? 'Hide Proof' : 'View Transfer Proof'}
                                    </button>
                                ) : (
                                    <span className="text-[10px] text-gray-300 italic">No Upload Attached</span>
                                )}
                            </h4>

                            {showProof && proofUrl && (
                                <div className="mb-6 space-y-4">
                                    <div className="relative aspect-[16/9] w-full bg-black rounded-2xl overflow-hidden border border-gray-100 flex items-center justify-center">
                                        <img src={proofUrl} alt="Transfer Proof" className="max-w-full max-h-full object-contain" />
                                    </div>
                                    
                                    <div className="flex gap-2">
                                        <button
                                            onClick={handleAnalyze}
                                            disabled={analyzing}
                                            className="flex-1 py-3 rounded-xl bg-brand-navy text-white text-xs font-bold flex items-center justify-center gap-2 hover:bg-brand-navy/90 disabled:opacity-50"
                                        >
                                            {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                                            {aiResult ? 'Re-scan with AI' : 'Verify with AI'}
                                        </button>
                                    </div>

                                    {aiResult && (
                                        <div className={`p-4 rounded-2xl border-2 ${amountMismatch ? 'bg-red-50 border-red-100' : 'bg-green-50 border-green-100'}`}>
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">AI Scan Result</span>
                                                {amountMismatch ? (
                                                    <span className="flex items-center gap-1 text-[10px] font-bold text-red-600">
                                                        <AlertTriangle className="h-3 w-3" /> Mismatch Detected
                                                    </span>
                                                ) : (
                                                    <span className="flex items-center gap-1 text-[10px] font-bold text-green-600">
                                                        <CheckCircle className="h-3 w-3" /> Verified
                                                    </span>
                                                )}
                                            </div>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <p className="text-[10px] text-gray-400 uppercase">Scanned Amount</p>
                                                    <p className={`text-lg font-black ${amountMismatch ? 'text-red-700' : 'text-green-700'}`}>
                                                        K{Number(aiResult.ocrData.total_amount).toLocaleString()}
                                                    </p>
                                                </div>
                                                <div>
                                                    <p className="text-[10px] text-gray-400 uppercase">Recorded Total</p>
                                                    <p className="text-lg font-black text-brand-navy">
                                                        K{Number(aiResult.recordedAmount).toLocaleString()}
                                                    </p>
                                                </div>
                                            </div>
                                            {aiResult.ocrData.vendor && (
                                                <div className="mt-2 pt-2 border-t border-gray-100">
                                                    <p className="text-[10px] text-gray-400 uppercase font-bold">Entity Name: <span className="text-brand-navy uppercase">{aiResult.ocrData.vendor}</span></p>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}

                            {disbursement.payment_method === 'CASH' ? (
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                    {Object.entries(denominations).sort((a, b) => Number(b[0]) - Number(a[0])).map(([value, count]) => (
                                        <div key={value} className={`rounded-xl p-3 border transition-all ${isPending ? 'bg-white border-gray-200' : 'bg-gray-50 border-transparent'}`}>
                                            <label className="block text-[10px] font-bold text-gray-400 mb-1">K{value}</label>
                                            <input
                                                type="number"
                                                min="0"
                                                disabled={!isPending}
                                                value={count}
                                                onChange={(e) => handleDenominationChange(value, parseInt(e.target.value) || 0)}
                                                className={`block w-full text-center bg-transparent border-none p-0 focus:ring-0 text-sm font-bold ${isPending ? 'text-brand-navy' : 'text-gray-500'}`}
                                            />
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="bg-gray-50 rounded-2xl p-6 border-2 border-dashed border-gray-200 text-center">
                                    <span className="text-xs text-brand-navy font-bold">{disbursement.payment_method} Transfer</span>
                                    {isPending ? (
                                        <div className="mt-4">
                                            <input
                                                type="number"
                                                step="0.01"
                                                value={totalPrepared}
                                                onChange={(e) => setTotalPrepared(e.target.value)}
                                                className="block w-full text-center bg-white border-gray-200 rounded-xl shadow-sm focus:ring-brand-green focus:border-brand-green text-lg font-bold p-3"
                                            />
                                        </div>
                                    ) : (
                                        <div className="text-2xl font-black text-brand-navy mt-1">K{Number(totalPrepared).toLocaleString()}</div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="pt-6 border-t flex items-center justify-between">
                            <div>
                                <p className="text-xs text-gray-400 font-bold uppercase">Total Disbursed</p>
                                <p className="text-3xl font-black text-brand-pink">K{Number(totalPrepared).toLocaleString()}</p>
                            </div>
                            {isPending && (
                                <button
                                    onClick={handleUpdate}
                                    disabled={processing || Number(totalPrepared) <= 0}
                                    className="px-8 py-4 rounded-2xl bg-brand-green text-white font-black shadow-lg shadow-green-100 hover:scale-105 transition-transform disabled:opacity-50"
                                >
                                    {processing ? 'Applying...' : 'Save Changes'}
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right Panel: Requisition Context */}
                <div className="lg:w-96 bg-gray-50/50 p-8 overflow-y-auto border-l border-gray-100">
                    <div className="flex justify-between items-center mb-6">
                        <div className="flex items-center text-brand-navy font-black text-lg">
                            <FileText className="h-5 w-5 mr-2 text-brand-pink" />
                            Original Requisition
                        </div>
                        <button onClick={onClose} className="hidden lg:block text-gray-400 hover:text-gray-600">
                            <X className="h-6 w-6" />
                        </button>
                    </div>

                    {requisition ? (
                        <div className="space-y-6 text-sm">
                            <div>
                                <p className="text-[10px] text-gray-400 uppercase font-black tracking-widest mb-1">Description</p>
                                <p className="font-bold text-brand-navy">{requisition.description}</p>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <p className="text-[10px] text-gray-400 uppercase font-black tracking-widest mb-1">Department</p>
                                    <p className="font-bold text-brand-navy flex items-center">
                                        <Building className="h-3 w-3 mr-1" />
                                        {requisition.department || 'N/A'}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-[10px] text-gray-400 uppercase font-black tracking-widest mb-1">Type</p>
                                    <p className="font-bold text-brand-navy">{requisition.type}</p>
                                </div>
                            </div>

                            <div>
                                <p className="text-[10px] text-gray-400 uppercase font-black tracking-widest mb-3">Line Items</p>
                                <div className="space-y-2">
                                    {(requisition.line_items || requisition.requisition_line_items)?.map((item: any, idx: number) => (
                                        <div key={item.id || idx} className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm flex justify-between items-center">
                                            <span className="text-gray-600 truncate mr-2">{item.description}</span>
                                            <span className="font-bold text-brand-navy whitespace-nowrap">K{Number(item.total_cost || item.estimated_amount).toLocaleString()}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="bg-brand-pink/5 p-4 rounded-2xl border border-brand-pink/10">
                                <p className="text-[10px] text-brand-pink uppercase font-black tracking-widest mb-1">Requisition Total</p>
                                <p className="text-2xl font-black text-brand-pink">K{Number(requisition.estimated_total).toLocaleString()}</p>
                            </div>
                        </div>
                    ) : (
                        <div className="text-center py-12 text-gray-400">
                            Requisition details unavailable
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

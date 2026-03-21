import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { ArrowLeft, CheckCircle, FileText, AlertCircle, RefreshCw, X, Eye, Sparkles, Wallet } from 'lucide-react';
import { requisitionService, Requisition } from '../services/requisition.service';
import { voucherService } from '../services/voucher.service';
import { useAuth } from '../context/AuthContext';
import { DenominationInput } from '../components/DenominationInput';
import { ReceiptInsightsPanel } from '../components/ReceiptInsightsPanel';
import { lencoService } from '../services/lenco.service';


export const RequisitionDetail: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { user, userRole, refreshNotifications } = useAuth();

    const [requisition, setRequisition] = useState<Requisition | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [processing, setProcessing] = useState(false);
    // We need to fetch the user role separately if not in context, or assume context has it.
    // Based on previous files, backend checks role. Frontend usually decodes token or fetches profile.
    // Let's assume for now we might need to fetch the profile or check the context.
    // Looking at other files, AuthContext usually provides session.
    // Ideally we should know if the user is an accountant.
    // For this implementation, I will rely on the backend error if unauthorized, but try to show button if possible.
    // Let's add a local state for userRole if needed, or rely on AuthContext if it's rich.
    // Checking AuthContext file usage in other places (dashboard) might be wise, but I'll stick to a safe backend-first approach:
    // Show button if status is correct, let backend handle permission error?
    // Or better, checking the role from session metadata if available.
    // For now, I'll allow it for all users to see (but only Accountant can succeed) OR
    // checking `user?.app_metadata?.role` or similar if supabase.
    // Getting user role from detailed profile fetch is safer.
    // However, I'll just check if they are NOT the requestor? No, Accountant could be anyone.
    // I'll add the button for now and let the backend enforce.

    const [expenseItems, setExpenseItems] = useState<any[]>([]);
    const [uploading, setUploading] = useState<string | null>(null);
    const [analyzingItemId, setAnalyzingItemId] = useState<string | null>(null);

    const [returnedDenominations, setReturnedDenominations] = useState<any[]>([
        { value: 500, count: 0 }, { value: 200, count: 0 }, { value: 100, count: 0 }, { value: 50, count: 0 }, { value: 20, count: 0 }, { value: 10, count: 0 }, { value: 5, count: 0 }, { value: 2, count: 0 }, { value: 1, count: 0 }, { value: 0.50, count: 0 }
    ]);
    const [confirmedDenominations, setConfirmedDenominations] = useState<any[]>([
        { value: 500, count: 0 }, { value: 200, count: 0 }, { value: 100, count: 0 }, { value: 50, count: 0 }, { value: 20, count: 0 }, { value: 10, count: 0 }, { value: 5, count: 0 }, { value: 2, count: 0 }, { value: 1, count: 0 }, { value: 0.50, count: 0 }
    ]);
    const [submissionMethod, setSubmissionMethod] = useState<'CASH' | 'MONEYWISE_WALLET'>('CASH');
    const [lencoSubaccountId, setLencoSubaccountId] = useState<string | null>(null);
    const [lencoPublicKey, setLencoPublicKey] = useState<string | null>(null);
    const [organizationId, setOrganizationId] = useState<string | null>(null);
    const [isVerifyingWallet, setIsVerifyingWallet] = useState(false);
    const [walletVerificationStep, setWalletVerificationStep] = useState<'IDLE' | 'POLLING' | 'SUCCESS' | 'FAILED'>('IDLE');

    useEffect(() => {
        if (id) {
            loadRequisition(id);
        }
    }, [id]);

    // Update organization-related state when requisition loads
    useEffect(() => {
        if (requisition?.organization) {
            setLencoSubaccountId(requisition.organization.lenco_subaccount_id || null);
            setLencoPublicKey(requisition.organization.lenco_public_key || null);
            setOrganizationId(requisition.organization.id || null);
        }
    }, [requisition]);




    // Sync expenseItems when requisition loads
    useEffect(() => {
        if (requisition) {
            setExpenseItems(requisition.items || []);
        }
    }, [requisition]);

    const loadRequisition = async (reqId: string) => {
        try {
            setLoading(true);
            const data = await requisitionService.getById(reqId);
            setRequisition(data);

            // Mark as read inside the background if we're the requestor and there are unread updates
            if (data.has_unread_updates && user?.id === data.requestor_id) {
                requisitionService.markRead(reqId).then(() => {
                    refreshNotifications();
                }).catch(err => console.error(err));
            }
        } catch (err) {
            console.error('Failed to load requisition', err);
            setError('Failed to load requisition details');
        } finally {
            setLoading(false);
        }
    };

    const handleAcknowledge = async () => {
        if (!id) return;

        try {
            setProcessing(true);
            const signature = `DIGITAL_SIG_${user?.id}_${Date.now()}`;
            await requisitionService.acknowledge(id, signature);

            alert('Receipt acknowledged successfully!');
            loadRequisition(id);
        } catch (err: any) {
            console.error(err);
            alert('Failed to acknowledge receipt: ' + err.message);
        } finally {
            setProcessing(false);
        }
    };

    const handleGenerateVoucher = async () => {
        if (!requisition) return;
        if (!confirm('Are you sure you want to generate a voucher for this requisition?')) return;

        try {
            setProcessing(true);
            await voucherService.createFromRequisition(requisition.id);
            alert('Voucher generated successfully!');
            loadRequisition(id!);
        } catch (err: any) {
            console.error(err);
            alert('Failed to generate voucher: ' + err.message);
        } finally {
            setProcessing(false);
        }
    };

    const handleWalletDeposit = () => {
        if (!requisition) return;
        const totalDisbursed = (requisition as any).disbursements?.[0]?.total_prepared || 0;
        let actualTotal = 0;
        const isWallet = (requisition as any).disbursements?.[0]?.payment_method === 'MONEYWISE_WALLET';
        const withdrawalFee = isWallet ? 8.5 : 0;
        
        if (isLoanOrAdvance) {
            actualTotal = Number(requisition.estimated_total || 0);
        } else {
            // Filter out system-generated withdrawal fees from actual expenditure calculation
            actualTotal = expenseItems
                .filter(item => item.description !== 'Withdrawal Fee (MoneyWise Wallet)')
                .reduce((sum, item) => sum + (item.actual_amount || 0), 0);
        }
        
        // For Wallet: User receives Principal (Total - Fee), so change is (Principal - Actual Spent)
        // (TotalPrepared - Fee) - ActualTotal
        const amountToDeposit = Math.max(0, (totalDisbursed - withdrawalFee) - actualTotal);

        if (amountToDeposit <= 0) {
            alert('There is no change to deposit. You have spent the full amount or more.');
            return;
        }

        if (!lencoSubaccountId) {
            alert('This organization does not have a linked Lenco Wallet. Please configure it in Settings > General.');
            return;
        }

        const LencoPay: any = (window as any).LencoPay;
        if (!LencoPay) {
            alert('Lenco Payment SDK is not currently loaded. Please refresh or contact support.');
            return;
        }

        const ref = `CHG-${Date.now()}-${requisition?.id}`;

        LencoPay.getPaid({
            key: lencoPublicKey,
            amount: amountToDeposit.toFixed(2),
            currency: 'ZMW',
            reference: ref,
            accountId: lencoSubaccountId,
            email: user?.email || 'customer@example.com',
            name: user?.user_metadata?.full_name || 'MoneyWise User',
            channels: ['card', 'mobile-money'],
            onSuccess: async (response: any) => {
                const transactionId = response.id || response.transactionId;
                setIsVerifyingWallet(true);
                setWalletVerificationStep('POLLING');
                
                let attempts = 0;
                const maxAttempts = 15;
                
                const pollStatus = async () => {
                    attempts++;
                    try {
                        const result = await lencoService.verifyStatus(ref, transactionId, organizationId || undefined);
                        if (result.verified) {
                            setWalletVerificationStep('SUCCESS');
                            // Now we can submit the change
                            await submitChangeViaWallet(ref, amountToDeposit);
                            return true;
                        }
                    } catch (err: any) {
                        console.error('Wallet verification attempt failed:', err);
                    }
                    
                    if (attempts < maxAttempts) {
                        setTimeout(pollStatus, 3000);
                    } else {
                        setWalletVerificationStep('FAILED');
                        setIsVerifyingWallet(false);
                        alert('We confirmed the payment with Lenco, but it hasn\'t appeared in your ledger yet. We will continue to check in the background. You can try submitting again in a moment.');
                    }
                    return false;
                };
                
                pollStatus();
            },
            onClose: () => {
                console.log('Payment window closed');
            }
        });
    };

    const submitChangeViaWallet = async (ref: string, amount: number) => {
        if (!requisition) return;
        try {
            setProcessing(true);
            await requisitionService.submitChange(requisition.id, [], amount, 'MONEYWISE_WALLET', ref);
            alert('Change submitted successfully via MoneyWise Wallet');
            loadRequisition(requisition.id);
        } catch (err: any) {
            console.error(err);
            alert('Failed to submit change: ' + err.message);
        } finally {
            setProcessing(false);
            setIsVerifyingWallet(false);
        }
    };

    const handleSubmitChange = async () => {
        if (!requisition) return;

        if (submissionMethod === 'MONEYWISE_WALLET') {
            handleWalletDeposit();
            return;
        }

        const amount = returnedDenominations.reduce((sum, d) => sum + (d.value * d.count), 0);
        // ... (rest of the existing cash logic)

        // Calculated expected change: Total Disbursed - Actual Expenditure
        const isLoanOrAdvance = requisition.type === 'LOAN' || requisition.type === 'ADVANCE';
        const totalDisbursed = (requisition as any).disbursements?.[0]?.total_prepared || 0;

        let actualTotal = 0;
        if (isLoanOrAdvance) {
            actualTotal = Number(requisition.estimated_total || 0);
        } else {
            actualTotal = expenseItems
                .filter(item => item.description !== 'Withdrawal Fee (MoneyWise Wallet)')
                .reduce((sum, item) => sum + (item.actual_amount || 0), 0);
        }

        const expectedChange = totalDisbursed - actualTotal;

        if (Math.abs(amount - expectedChange) > 0.01) {
            if (!confirm(`Your returned cash (K${amount}) does not match the calculated change (Disbursed K${totalDisbursed} - Spent K${actualTotal} = K${expectedChange}). Proceed anyway?`)) {
                return;
            }
        }

        try {
            setProcessing(true);
            await requisitionService.submitChange(requisition.id, returnedDenominations, amount);
            alert('Change submitted for verification');
            loadRequisition(requisition.id);
        } catch (err: any) {
            console.error(err);
            alert('Failed to submit change: ' + err.message);
        } finally {
            setProcessing(false);
        }
    };

    const handleConfirmChange = async () => {
        if (!requisition) return;
        const amount = confirmedDenominations.reduce((sum, d) => sum + (d.value * d.count), 0);

        try {
            setProcessing(true);
            await requisitionService.confirmChange(requisition.id, confirmedDenominations, amount);
            alert('Change confirmed and transaction finalized');
            loadRequisition(requisition.id);
        } catch (err: any) {
            console.error(err);
            alert('Failed to confirm change: ' + err.message);
        } finally {
            setProcessing(false);
        }
    };

    const handleStatusUpdate = async (status: 'AUTHORISED' | 'REJECTED') => {
        if (!requisition) return;

        // Confirm rejection
        if (status === 'REJECTED' && !confirm('Are you sure you want to reject this requisition?')) {
            return;
        }

        try {
            setProcessing(true);
            await requisitionService.updateStatus(requisition.id, status);
            alert(`Requisition successfully ${status.toLowerCase()}`);

            // Refetch current req to update UI immediately
            await loadRequisition(requisition.id);
        } catch (err: any) {
            console.error('Failed to update status', err);
            alert('Failed to update status: ' + (err.message || 'Unknown error'));
        } finally {
            setProcessing(false);
        }
    };

    if (loading) return <Layout><div className="flex justify-center p-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-green"></div></div></Layout>;
    if (error || !requisition) return <Layout><div className="p-12 text-center text-red-600 bg-red-50 rounded-lg m-6 border border-red-200">Error: {error || 'Requisition not found'}</div></Layout>;

    const isLoanOrAdvance = requisition.type === 'LOAN' || requisition.type === 'ADVANCE';
    const isRequestor = user?.id === requisition.requestor_id;
    const canAcknowledge = isRequestor && requisition.status === 'DISBURSED';
    const canTrackExpenses = isRequestor && requisition.status === 'RECEIVED' && !isLoanOrAdvance;
    // Allow submitting change even for loans if they landed in RECEIVED (excess disbursement)
    const canSubmitChange = isRequestor && requisition.status === 'RECEIVED';
    const canConfirmChange = (userRole === 'ACCOUNTANT' || userRole === 'CASHIER' || userRole === 'ADMIN') && requisition.status === 'CHANGE_SUBMITTED';
    const canGenerateVoucher = (requisition.status === 'RECEIVED' || requisition.status === 'CHANGE_SUBMITTED' || requisition.status === 'COMPLETED');
    const canApprove = (userRole === 'ADMIN' || userRole === 'ACCOUNTANT' || userRole === 'MANAGER') && (requisition.status === 'SUBMITTED' || requisition.status === 'DRAFT');

    const handleActualChange = (itemId: string, val: string) => {
        setExpenseItems(prev => prev.map(item =>
            // @ts-ignore
            item.id === itemId ? { ...item, actual_amount: parseFloat(val) || 0 } : item
        ));
    };
    const handleFileUpload = async (itemId: string, file: File) => {
        try {
            setUploading(itemId);
            
            const { compressImage } = await import('../utils/file_utils');
            const compressedFile = await compressImage(file);
            
            const fileExt = compressedFile.name.split('.').pop();
            const fileName = `${requisition.id}/${itemId}-${Date.now()}.${fileExt}`;
            const { data: uploadData, error: uploadError } = await (await import('../lib/supabase')).supabase.storage
                .from('receipts')
                .upload(fileName, compressedFile);

            if (uploadError) throw uploadError;

            const path = uploadData.path;

            setExpenseItems(prev => prev.map(item =>
                // @ts-ignore
                item.id === itemId ? { ...item, receipt_url: path, receipt_name: file.name } : item
            ));

        } catch (err: any) {
            console.error('Upload failed', err);
            alert('Upload failed: ' + err.message);
        } finally {
            setUploading(null);
        }
    };

    const handleSaveExpenses = async () => {
        try {
            setProcessing(true);
            await requisitionService.updateExpenses(requisition.id, expenseItems.map((item: any) => ({
                id: item.id,
                actual_amount: item.actual_amount || item.estimated_amount,
                receipt_url: item.receipt_url
            })));
            alert('Expenses saved successfully');
            loadRequisition(requisition.id);
        } catch (err: any) {
            console.error(err);
            alert('Failed to save expenses: ' + err.message);
        } finally {
            setProcessing(false);
        }
    };

    const handleAnalyzeReceipt = async (itemId: string) => {
        try {
            if (!id) return;

            // Check if the item has a pending upload or unsaved receipt URL
            const item = expenseItems.find(i => i.id === itemId);
            const originalItem = requisition?.items?.find(i => i.id === itemId);

            if (item && item.receipt_url && (!originalItem || originalItem.receipt_url !== item.receipt_url)) {
                alert('Please click "Save Expenses" first to save your receipt before starting AI analysis.');
                return;
            }

            // Set local state to pending immediately for better UX
            setExpenseItems(prev => prev.map(i => 
                i.id === itemId ? { ...i, receipt_ocr_status: 'PENDING' } : i
            ));
            
            setAnalyzingItemId(itemId);
            
            // Sync backend call - awaits full analysis
            await requisitionService.analyzeReceipt(id, itemId);
            
            // Refresh the data immediately to show results
            await loadRequisition(id);
        } catch (err: any) {
            console.error('OCR failed', err);
            alert('Analysis failed: ' + err.message);
            // Refresh anyway to clear pending status if possible
            if (id) loadRequisition(id);
        } finally {
            setAnalyzingItemId(null);
        }
    };

    return (
        <Layout>
            <div className="space-y-6">
                <button
                    onClick={() => navigate(-1)}
                    className="flex items-center text-gray-500 hover:text-brand-navy transition-colors font-medium"
                >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back
                </button>

                <div className="bg-white shadow overflow-hidden sm:rounded-lg">
                    <div className="px-4 py-5 sm:px-6 flex justify-between items-center">
                        <div>
                            <h3 className="text-lg leading-6 font-medium text-gray-900">
                                Requisition #{requisition.id.slice(0, 8)}
                            </h3>
                            <p className="mt-1 max-w-2xl text-sm text-gray-500">
                                Details and status history.
                            </p>
                        </div>
                        <div className="flex items-center space-x-3">
                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                                ${requisition.status === 'AUTHORISED' ? 'bg-green-100 text-green-800' :
                                    requisition.status === 'DISBURSED' ? 'bg-blue-100 text-blue-800' :
                                        requisition.status === 'RECEIVED' ? 'bg-purple-100 text-purple-800' :
                                            'bg-gray-100 text-gray-800'}`}>
                                {requisition.status}
                            </span>

                            {canGenerateVoucher && (
                                <button
                                    onClick={handleGenerateVoucher}
                                    disabled={processing}
                                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-bold rounded-xl shadow-lg shadow-green-200 text-white bg-brand-green hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-green transition-all"
                                >
                                    <FileText className="h-4 w-4 mr-1.5" />
                                    Generate Voucher
                                </button>
                            )}

                            {canApprove && (
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => handleStatusUpdate('AUTHORISED')}
                                        disabled={processing}
                                        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-bold rounded-xl shadow-lg shadow-emerald-200 text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 transition-all disabled:opacity-50"
                                    >
                                        <CheckCircle className="h-4 w-4 mr-1.5" />
                                        Approve
                                    </button>
                                    <button
                                        onClick={() => handleStatusUpdate('REJECTED')}
                                        disabled={processing}
                                        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-bold rounded-xl shadow-lg shadow-red-200 text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-all disabled:opacity-50"
                                    >
                                        <X className="h-4 w-4 mr-1.5" />
                                        Reject
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="border-t border-gray-200 px-4 py-5 sm:p-0">
                        <dl className="sm:divide-y sm:divide-gray-200">
                            {/* ... Header fields ... */}
                            <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                                <dt className="text-sm font-medium text-gray-500">Description</dt>
                                <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">{requisition.description}</dd>
                            </div>
                            <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                                <dt className="text-sm font-medium text-gray-500">Department</dt>
                                <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">{requisition.department || '-'}</dd>
                            </div>
                            <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                                <dt className="text-sm font-medium text-gray-500">Total Estimated</dt>
                                <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">K{Number(requisition.estimated_total).toLocaleString()}</dd>
                            </div>

                            {/* Actual Total Display */}
                            {(requisition.status === 'RECEIVED' || requisition.status === 'COMPLETED') && (
                                <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6 bg-gray-50">
                                    <dt className="text-sm font-medium text-gray-900">Total Actual</dt>
                                    <dd className="mt-1 text-sm font-bold text-gray-900 sm:mt-0 sm:col-span-2">
                                        K{(requisition as any).actual_total ? Number((requisition as any).actual_total).toLocaleString() : '0.00'}
                                    </dd>
                                </div>
                            )}

                            {!isLoanOrAdvance && (
                                <div className="py-4 sm:py-5 sm:px-6">
                                    <dt className="text-sm font-medium text-gray-500 mb-2 flex items-center">
                                        <Sparkles className="h-4 w-4 mr-1.5 text-indigo-500" />
                                        Line Items & Expenses
                                    </dt>
                                    <dd className="mt-1 text-sm text-gray-900 sm:mt-0">
                                        <div className="border rounded-md overflow-hidden">
                                            <table className="min-w-full divide-y divide-gray-200">
                                                <thead className="bg-gray-50">
                                                    <tr>
                                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                                                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Est. Cost</th>
                                                        {canTrackExpenses ? (
                                                            <>
                                                                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Actual Cost (K)</th>
                                                                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Receipt</th>
                                                            </>
                                                        ) : (
                                                            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Actual Cost</th>
                                                        )}
                                                    </tr>
                                                </thead>
                                                <tbody className="bg-white divide-y divide-gray-200">
                                                    {expenseItems?.map((item: any, index: number) => (
                                                        <React.Fragment key={item.id || index}>
                                                            <tr className={item.receipt_ocr_status === 'DONE' ? 'bg-indigo-50/10' : ''}>
                                                            <td className="px-4 py-2 text-sm text-gray-900">
                                                                <div className="font-medium">{item.description}</div>
                                                                <div className="text-xs text-gray-500">
                                                                    {item.quantity} x K{item.unit_price}
                                                                    {item.accounts && (
                                                                        <span className="ml-2 px-1.5 py-0.5 rounded bg-brand-gray text-gray-500 border border-gray-100">
                                                                            {item.accounts.code}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </td>
                                                            <td className="px-4 py-2 text-sm text-gray-900 text-right font-medium">K{item.estimated_amount}</td>

                                                            {canTrackExpenses ? (
                                                                <>
                                                                    <td className="px-4 py-2 text-right">
                                                                        <input
                                                                            type="number"
                                                                            className="shadow-sm focus:ring-brand-green focus:border-brand-green block w-full sm:text-sm border-gray-300 rounded-md text-right"
                                                                            value={item.actual_amount || ''}
                                                                            placeholder={item.estimated_amount.toString()}
                                                                            onChange={(e) => handleActualChange(item.id, e.target.value)}
                                                                        />
                                                                    </td>
                                                                    <td className="px-4 py-2 text-right">
                                                                        <div className="flex flex-col items-end gap-1">
                                                                            {item.receipt_url ? (
                                                                                <div className="flex flex-col items-end gap-1">
                                                                                    <a
                                                                                        href={requisitionService.getFileUrl(item.receipt_url)!}
                                                                                        target="_blank"
                                                                                        rel="noopener noreferrer"
                                                                                        className="text-xs text-brand-green flex items-center font-bold hover:underline"
                                                                                    >
                                                                                        <Eye className="h-3 w-3 mr-1" /> View Receipt
                                                                                    </a>
                                                                                    {item.receipt_url.match(/\.(jpg|jpeg|png|gif|webp)$/i) && (
                                                                                        <img
                                                                                            src={requisitionService.getFileUrl(item.receipt_url)!}
                                                                                            alt="Receipt"
                                                                                            className="h-10 w-10 object-cover rounded border border-gray-100 mt-1 cursor-pointer hover:scale-110 transition-transform"
                                                                                            onClick={() => window.open(requisitionService.getFileUrl(item.receipt_url)!, '_blank')}
                                                                                        />
                                                                                    )}
                                                                                </div>
                                                                            ) : (
                                                                                <input
                                                                                    type="file"
                                                                                    className="text-xs text-gray-500 file:mr-2 file:py-1 file:px-2 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                                                                                    onChange={(e) => e.target.files?.[0] && handleFileUpload(item.id, e.target.files[0])}
                                                                                    disabled={uploading === item.id}
                                                                                />
                                                                            )}
                                                                            {uploading === item.id && <span className="text-xs text-gray-400">Uploading...</span>}
                                                                        </div>
                                                                    </td>
                                                                </>
                                                            ) : (
                                                                <td className="px-4 py-2 text-sm text-gray-900 text-right">
                                                                    K{item.actual_amount || '0.00'}
                                                                </td>
                                                            )}
                                                             </tr>
                                                            {/* AI Insights Panel */}
                                                            {item.receipt_url && (
                                                                <ReceiptInsightsPanel
                                                                    itemId={item.id}
                                                                    ocrData={item.receipt_ocr_data}
                                                                    ocrStatus={item.receipt_ocr_status || 'NONE'}
                                                                    expectedAmount={item.actual_amount || item.estimated_amount}
                                                                    onReanalyze={handleAnalyzeReceipt}
                                                                    isReanalyzing={analyzingItemId === item.id}
                                                                />
                                                            )}
                                                        </React.Fragment>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </dd>
                                </div>
                            )}

                            {isLoanOrAdvance && (
                                <div className="py-4 sm:py-5 sm:px-6">
                                    <dt className="text-sm font-medium text-gray-500 mb-4">{requisition.type === 'LOAN' ? 'Staff Loan Details' : 'Salary Advance Details'}</dt>
                                    <dd className="mt-1 text-sm text-gray-900 sm:mt-0">
                                        <div className="bg-indigo-50 rounded-xl p-6 border border-indigo-100">
                                            <div className="grid grid-cols-2 gap-6">
                                                <div>
                                                    <p className="text-xs text-indigo-600 font-bold uppercase tracking-wider mb-1">Staff Member</p>
                                                    <p className="font-semibold text-gray-900">{requisition.staff_name || '-'}</p>
                                                    <p className="text-xs text-gray-500 mt-1">ID: {requisition.employee_id || '-'}</p>
                                                </div>
                                                <div>
                                                    <p className="text-xs text-indigo-600 font-bold uppercase tracking-wider mb-1">Amount Requested</p>
                                                    <p className="font-black text-indigo-900 text-lg">K{Number(requisition.loan_amount || requisition.estimated_total).toLocaleString()}</p>
                                                </div>

                                                {requisition.type === 'LOAN' && (
                                                    <>
                                                        <div>
                                                            <p className="text-xs text-indigo-600 font-bold uppercase tracking-wider mb-1">Repayment Period</p>
                                                            <p className="font-medium text-gray-900">{requisition.repayment_period} Months</p>
                                                            <p className="text-xs text-gray-500 mt-1">Interest: {requisition.interest_rate}%</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-xs text-indigo-600 font-bold uppercase tracking-wider mb-1">Monthly Deduction</p>
                                                            <p className="font-bold text-gray-900">K{Number(requisition.monthly_deduction || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </dd>
                                </div>
                            )}

                            {/* Supporting Documents / Proof of Transfer */}
                            {((requisition as any).disbursements?.[0]?.transfer_proof_url) && (
                                <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6 bg-brand-navy/5">
                                    <dt className="text-sm font-medium text-brand-navy flex items-center">
                                        <FileText className="h-4 w-4 mr-2" />
                                        Proof of Transfer
                                    </dt>
                                    <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                                        <div className="flex flex-col space-y-2">
                                            <a
                                                href={requisitionService.getFileUrl((requisition as any).disbursements[0].transfer_proof_url)!}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-brand-green font-bold hover:underline flex items-center"
                                            >
                                                <Eye className="h-4 w-4 mr-1" /> View Full Document
                                            </a>
                                            {(requisition as any).disbursements[0].transfer_proof_url.match(/\.(jpg|jpeg|png|gif|webp)$/i) && (
                                                <div className="mt-2 border rounded-xl overflow-hidden max-w-sm shadow-sm">
                                                    <img
                                                        src={requisitionService.getFileUrl((requisition as any).disbursements[0].transfer_proof_url)!}
                                                        alt="Proof of Transfer"
                                                        className="w-full h-auto cursor-pointer hover:opacity-90 transition-opacity"
                                                        onClick={() => window.open(requisitionService.getFileUrl((requisition as any).disbursements[0].transfer_proof_url)!, '_blank')}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    </dd>
                                </div>
                            )}
                        </dl>
                    </div>

                    {canAcknowledge && (
                        <div className="bg-blue-50 px-4 py-4 sm:px-6 border-t border-blue-100 flex justify-between items-center">
                            <div>
                                <h4 className="text-sm font-bold text-blue-900">Action Required</h4>
                                <p className="text-sm text-blue-700">Please confirm you have received the cash for this requisition.</p>
                            </div>
                            <button
                                onClick={handleAcknowledge}
                                disabled={processing}
                                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-bold rounded-lg shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                            >
                                <CheckCircle className="h-4 w-4 mr-2" />
                                {processing ? 'Signing...' : 'Acknowledge Receipt'}
                            </button>
                        </div>
                    )}

                    {canTrackExpenses && (
                        <div className="bg-purple-50 px-4 py-4 sm:px-6 border-t border-purple-100 flex justify-between items-center">
                            <div>
                                <h4 className="text-sm font-bold text-purple-900">Expense Tracking</h4>
                                <p className="text-sm text-purple-700">Record actual spending and upload receipts.</p>
                            </div>
                            <button
                                onClick={handleSaveExpenses}
                                disabled={processing || !!uploading}
                                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
                            >
                                {processing ? 'Saving...' : 'Save Expenses'}
                            </button>
                        </div>
                    )}

                    {canSubmitChange && (
                        <div className="bg-green-50 px-4 py-6 sm:px-6 border-t border-green-100 space-y-4">
                            <div>
                                <h4 className="text-sm font-bold text-green-900">Submit Change</h4>
                                <p className="text-sm text-green-700 mb-4">Please return any unused cash and log the denominations below.</p>
                            </div>

                            <div className="bg-white p-4 rounded-lg border border-green-200">
                                <div className="flex bg-gray-50 p-1 mb-6 rounded-xl">
                                    <button
                                        type="button"
                                        onClick={() => setSubmissionMethod('CASH')}
                                        className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${submissionMethod === 'CASH' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                    >
                                        Return Cash
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setSubmissionMethod('MONEYWISE_WALLET')}
                                        className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${submissionMethod === 'MONEYWISE_WALLET' ? 'bg-white text-brand-pink shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                    >
                                        Deposit to Wallet
                                    </button>
                                </div>

                                <div className="space-y-3 mb-6">
                                    <div className="flex justify-between items-center text-gray-500">
                                        <span className="text-sm">Total Disbursed (incl. Fee):</span>
                                        <span className="text-sm font-medium">K{Number((requisition as any).disbursements?.[0]?.total_prepared || 0).toFixed(2)}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm font-medium text-gray-900">Actual Expenditure:</span>
                                        <span className="text-sm font-bold text-red-600">
                                            K{isLoanOrAdvance
                                                ? Number(requisition.estimated_total || 0).toFixed(2)
                                                : expenseItems
                                                    .filter(item => item.description !== 'Withdrawal Fee (MoneyWise Wallet)')
                                                    .reduce((sum, item) => sum + (item.actual_amount || 0), 0).toFixed(2)}
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center pt-3 border-t border-gray-100">
                                        <span className="text-sm font-bold text-gray-700">Calculated Change:</span>
                                        <span className="text-lg font-bold text-brand-green">
                                            K{Math.max(0, (Number((requisition as any).disbursements?.[0]?.total_prepared || 0) - ((requisition as any).disbursements?.[0]?.payment_method === 'MONEYWISE_WALLET' ? 8.5 : 0)) - (
                                                isLoanOrAdvance 
                                                    ? Number(requisition.estimated_total || 0) 
                                                    : expenseItems
                                                        .filter(item => item.description !== 'Withdrawal Fee (MoneyWise Wallet)')
                                                        .reduce((sum, item) => sum + (item.actual_amount || 0), 0)
                                            )).toFixed(2)}
                                        </span>
                                    </div>
                                </div>

                                {submissionMethod === 'CASH' ? (
                                    <>
                                        <DenominationInput
                                            denominations={returnedDenominations}
                                            onChange={setReturnedDenominations}
                                            label="Denominations Returned"
                                        />

                                        <div className="mt-6 flex justify-end">
                                            <button
                                                onClick={handleSubmitChange}
                                                disabled={processing}
                                                className="inline-flex items-center px-6 py-2 border border-transparent text-sm font-bold rounded-xl shadow-lg shadow-green-200 text-white bg-brand-green hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-green transition-all"
                                            >
                                                <RefreshCw className={`h-4 w-4 mr-2 ${processing ? 'animate-spin' : ''}`} />
                                                Submit Change & Complete
                                            </button>
                                        </div>
                                    </>
                                ) : (
                                    <div className="space-y-4">
                                        {isVerifyingWallet ? (
                                            <div className="py-8 flex flex-col items-center justify-center space-y-4 text-center">
                                                <div className="relative">
                                                    <div className="h-16 w-16 border-4 border-brand-pink/20 border-t-brand-pink rounded-full animate-spin" />
                                                    <Wallet className="h-6 w-6 text-brand-pink absolute inset-0 m-auto animate-pulse" />
                                                </div>
                                                <div>
                                                    <h3 className="text-sm font-bold text-gray-900">
                                                        {walletVerificationStep === 'POLLING' ? 'Verifying Deposit...' : 
                                                         walletVerificationStep === 'SUCCESS' ? 'Success! Recording...' : 
                                                         walletVerificationStep === 'FAILED' ? 'Verification Failed' : 'Processing...'}
                                                    </h3>
                                                    <p className="text-xs text-gray-500 mt-1">
                                                        {walletVerificationStep === 'POLLING' ? 'Checking with Lenco. This takes a few seconds.' : 
                                                         walletVerificationStep === 'SUCCESS' ? 'Your deposit was found and is being recorded.' : 
                                                         walletVerificationStep === 'FAILED' ? 'We couldn\'t find your deposit. Please try again.' : 'Please wait.'}
                                                    </p>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="bg-pink-50/50 p-6 rounded-2xl border border-pink-100 flex flex-col items-center text-center">
                                                <Wallet className="h-8 w-8 text-brand-pink mb-2" />
                                                <p className="text-sm text-gray-700 mb-4">
                                                    Deposit the exact change amount into the MoneyWise Wallet. Your requisition will be automatically updated once verified.
                                                </p>
                                                <button
                                                    onClick={handleWalletDeposit}
                                                    disabled={processing || (isLoanOrAdvance 
                                                        ? (Number((requisition as any).disbursements?.[0]?.total_prepared || 0) - Number(requisition.estimated_total || 0) - ((requisition as any).disbursements?.[0]?.payment_method === 'MONEYWISE_WALLET' ? 8.5 : 0)) <= 0
                                                        : (Number((requisition as any).disbursements?.[0]?.total_prepared || 0) - ((requisition as any).disbursements?.[0]?.payment_method === 'MONEYWISE_WALLET' ? 8.5 : 0) - expenseItems.filter(item => item.description !== 'Withdrawal Fee (MoneyWise Wallet)').reduce((sum, item) => sum + (item.actual_amount || 0), 0)) <= 0
                                                    )}
                                                    className="w-full flex justify-center items-center px-6 py-3 bg-brand-pink text-white rounded-xl font-bold shadow-lg shadow-pink-100 hover:bg-pink-600 transition-all active:scale-95 disabled:opacity-50"
                                                >
                                                    <Wallet className="h-4 w-4 mr-2" />
                                                    Deposit K{Math.max(0, (Number((requisition as any).disbursements?.[0]?.total_prepared || 0) - ((requisition as any).disbursements?.[0]?.payment_method === 'MONEYWISE_WALLET' ? 8.5 : 0)) - (
                                                        isLoanOrAdvance 
                                                            ? Number(requisition.estimated_total || 0) 
                                                            : expenseItems
                                                                .filter(item => item.description !== 'Withdrawal Fee (MoneyWise Wallet)')
                                                                .reduce((sum, item) => sum + (item.actual_amount || 0), 0)
                                                    )).toFixed(2)} to Wallet
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {canConfirmChange && (
                        <div className="bg-amber-50 px-4 py-6 sm:px-6 border-t border-amber-100 space-y-4">
                            <div className="flex items-center space-x-2">
                                <AlertCircle className="h-5 w-5 text-amber-600" />
                                <h4 className="text-sm font-bold text-amber-900">Verify Returned Cash</h4>
                            </div>
                            <p className="text-sm text-amber-700 mb-4">The requestor has submitted K{Number((requisition as any).disbursements?.[0]?.actual_change_amount || 0).toFixed(2)} as change. Please count the cash and confirm.</p>

                            <div className="bg-white p-4 rounded-lg border border-amber-200">
                                <div className="mb-4 text-sm font-medium text-gray-700">Requestor's Claimed Count:</div>
                                <div className="grid grid-cols-6 gap-2 mb-6">
                                    {((requisition as any).disbursements?.[0]?.returned_denominations || []).map((d: any) => (
                                        <div key={d.value} className="text-center p-1 bg-gray-50 rounded border border-gray-100">
                                            <div className="text-[10px] text-gray-400">K{d.value}</div>
                                            <div className="font-bold text-xs">{d.count}</div>
                                        </div>
                                    ))}
                                </div>

                                <DenominationInput
                                    denominations={confirmedDenominations}
                                    onChange={setConfirmedDenominations}
                                    label="Cashier Actual Count"
                                />

                                <div className="mt-6 flex justify-end items-center space-x-4">
                                    {Math.abs(confirmedDenominations.reduce((sum, d) => sum + (d.value * d.count), 0) - Number((requisition as any).disbursements?.[0]?.actual_change_amount || 0)) > 0.01 && (
                                        <span className="text-sm font-bold text-red-600 bg-red-50 px-3 py-1 rounded-full border border-red-200">
                                            Variance: K{(confirmedDenominations.reduce((sum, d) => sum + (d.value * d.count), 0) - Number((requisition as any).disbursements?.[0]?.actual_change_amount || 0)).toFixed(2)}
                                        </span>
                                    )}
                                    <button
                                        onClick={handleConfirmChange}
                                        disabled={processing}
                                        className="inline-flex items-center px-6 py-2 border border-transparent text-sm font-bold rounded-xl shadow-lg shadow-amber-200 text-white bg-amber-600 hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 transition-all"
                                    >
                                        <CheckCircle className="h-4 w-4 mr-2" />
                                        Confirm & Finalize Ledger
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {requisition.status === 'COMPLETED' && (
                        <div className="bg-gray-50 px-4 py-4 sm:px-6 border-t border-gray-200">
                            <div className="flex items-center text-gray-600 text-sm font-medium">
                                <CheckCircle className="h-4 w-4 mr-2 text-green-500" />
                                Transaction cycle complete. Cash ledger updated.
                            </div>
                            <div className="mt-2 grid grid-cols-2 gap-4 text-xs">
                                <div>
                                    <span className="text-gray-400 uppercase tracking-wider font-bold text-[10px]">Final Expenditure:</span>
                                    <div className="font-black text-brand-navy">K{Number((requisition as any).actual_total || 0).toFixed(2)}</div>
                                </div>
                                <div>
                                    <span className="text-gray-400 uppercase tracking-wider font-bold text-[10px]">Confirmed Change:</span>
                                    <div className="font-black text-brand-navy">K{Number((requisition as any).disbursements?.[0]?.confirmed_change_amount || 0).toFixed(2)}</div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </Layout>
    );
};

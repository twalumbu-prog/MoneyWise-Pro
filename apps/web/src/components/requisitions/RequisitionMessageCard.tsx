import React, { useState, useEffect } from 'react';
import { RequisitionMessage, requisitionService } from '../../services/requisition.service';
import { lencoService } from '../../services/lenco.service';
import { User, ChevronDown, Loader2, Check, X, FileText, Smartphone, Coins, Wallet, Building2, ArrowRight, RefreshCw, Search } from 'lucide-react';
import { accountService, Account } from '../../services/account.service';

interface RequisitionMessageCardProps {
    message: RequisitionMessage;
    isOwn: boolean;
    onAction?: (action: string, metadata?: any) => void;
    canAction?: boolean;
    requisitionData?: any;
    isInitial?: boolean;
}

const RequisitionMessageCard: React.FC<RequisitionMessageCardProps> = ({ 
    message, 
    isOwn, 
    onAction, 
    canAction,
    requisitionData,
    isInitial
}) => {
    // Status logic helpers
    const currentStatus = requisitionData?.status || 'DRAFT';
    const isPastApproval = !['DRAFT', 'PENDING_APPROVAL'].includes(currentStatus);
    const isPastDisbursal = !['DRAFT', 'PENDING_APPROVAL', 'AUTHORISED'].includes(currentStatus);
    const isRejected = currentStatus === 'REJECTED';

    const [isExpanded, setIsExpanded] = useState(isInitial || false);
    const [activeAction, setActiveAction] = useState<string | null>(null);
    const [expenseMode, setExpenseMode] = useState<'NONE' | 'MANUAL' | 'SCAN'>('NONE');
    const [expenseItems, setExpenseItems] = useState<any[]>([]);
    const [isSavingExpenses, setIsSavingExpenses] = useState(false);
    const [isExpenseExpanded, setIsExpenseExpanded] = useState(false);
    
    // AI Review State
    const [expandedLogicIndex, setExpandedLogicIndex] = useState<number | null>(null);
    const [isApprovingAI, setIsApprovingAI] = useState(false);
    const [isReloadingAI, setIsReloadingAI] = useState(false);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [editableItems, setEditableItems] = useState<any[]>([]);
    const [isAccountDropdownOpen, setIsAccountDropdownOpen] = useState<number | null>(null);
    const [accountSearch, setAccountSearch] = useState('');
    const [isAICategorizationExpanded, setIsAICategorizationExpanded] = useState(true);
    
    // QuickBooks State
    const [paymentAccountId, setPaymentAccountId] = useState('BANK-123'); // Example default
    const [isPostingQB, setIsPostingQB] = useState(false);
    
    // Disbursal State
    const [activeMethod, setActiveMethod] = useState<string | null>(null);
    const [paymentType, setPaymentType] = useState<'MOBILE_MONEY' | 'BANK'>('MOBILE_MONEY');
    const [recipientValue, setRecipientValue] = useState('');
    const [recipientProvider, setRecipientProvider] = useState<string | null>(null);
    const [lookupName, setLookupName] = useState<string | null>(null);
    const [isLookingUp, setIsLookingUp] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const [disburseError, setDisburseError] = useState<string | null>(null);
    const [disburseStatusMsg, setDisburseStatusMsg] = useState<string | null>(null);
    
    const isSystem = message.message_type?.toUpperCase() === 'SYSTEM';
    const isAIReview = isSystem && message.metadata?.stage === 'AI_REVIEW';

    useEffect(() => {
        if (isAIReview) {
            const fetchAccounts = async () => {
                try {
                    const data = await accountService.getAll();
                    setAccounts(data || []);
                } catch (err) {
                    console.error('Failed to fetch accounts:', err);
                }
            };
            fetchAccounts();

            // Initialize editable items from message metadata
            if (message.metadata?.items) {
                setEditableItems(message.metadata.items.map((item: any) => ({
                    ...item,
                    // If the item doesn't have a category_name but we have accounts, try to find it
                    category_name: item.category_name || accounts.find(a => a.code === item.category_code)?.name || 'Unknown Account'
                })));
            }
        }
    }, [isAIReview, message.metadata?.items]);

    // Re-sync names if accounts load after items
    useEffect(() => {
        if (accounts.length > 0 && editableItems.length > 0) {
            setEditableItems(prev => prev.map(item => {
                if (!item.category_name || item.category_name === 'Unknown Account' || item.category_name === item.category_code) {
                    const found = accounts.find(a => a.code === item.category_code);
                    if (found) return { ...item, category_name: found.name };
                }
                return item;
            }));
        }
    }, [accounts]);

    const PAYMENT_METHODS = [
        { id: 'MONEYWISE_WALLET', name: 'MoneyWise Wallet', icon: Wallet },
        { id: 'MOBILE_MONEY', name: 'Mobile Money', icon: Smartphone },
        { id: 'BANK_TRANSFER', name: 'Bank Transfer', icon: Building2 },
        { id: 'CASH_PICKUP', name: 'Cash / Other', icon: Coins },
    ];

    const handleActionClick = async (action: string) => {
        if (!onAction) return;
        setActiveAction(action);
        try {
            await onAction(action);
        } catch (err: any) {
            console.error(`Action ${action} failed:`, err);
            // Provide visual feedback for the user
            const errorMsg = err.message || 'An unexpected error occurred';
            if (errorMsg.toLowerCase().includes('unauthorized') || errorMsg.includes('403')) {
                window.alert('Unauthorized: You do not have permission to perform this action.');
            } else {
                window.alert(`Action failed: ${errorMsg}`);
            }
        } finally {
            setActiveAction(null);
        }
    };

    const LENCO_MIN_TRANSFER = 5; // Lenco minimum transfer amount in ZMW

    const handleDisburse = async () => {
        if (!requisitionData?.id || !activeMethod) return;

        // Pre-validate minimum amount for Lenco wallet/mobile transfers
        const isLencoTransfer = activeMethod === 'MONEYWISE_WALLET' || activeMethod === 'MOBILE_MONEY';
        if (isLencoTransfer && Number(requisitionData.estimated_total) < LENCO_MIN_TRANSFER) {
            setDisburseError(`The disbursement amount (K${requisitionData.estimated_total}) is below the minimum transfer amount of K${LENCO_MIN_TRANSFER}. Please use a different payment method or raise a new requisition for at least K${LENCO_MIN_TRANSFER}.`);
            return;
        }

        setIsProcessing(true);
        setDisburseError(null);
        setDisburseStatusMsg(null);

        // Normalize phone: strip leading 260 country code if present
        const cleanPhone = recipientValue.replace(/[^0-9]/g, '');
        const normalizedPhone = cleanPhone.startsWith('260') ? '0' + cleanPhone.substring(3) : cleanPhone;

        // Determine the bank/operator code the backend expects
        // For mobile money: lowercase operator name (airtel, mtn, zamtel)
        // For bank: keep as-is (bank ID string)
        const recipientBankCode = (() => {
            if (activeMethod === 'MONEYWISE_WALLET' || activeMethod === 'MOBILE_MONEY') {
                return (recipientProvider || '').toLowerCase(); // 'airtel' | 'mtn' | 'zamtel'
            }
            return recipientProvider || undefined; // bank code for bank transfers
        })();

        try {
            setDisburseStatusMsg('Initiating transfer...');

            const result = await requisitionService.disburse(requisitionData.id, {
                payment_method: activeMethod,
                total_prepared: requisitionData.estimated_total,
                recipient_account: normalizedPhone || recipientValue || undefined,
                recipient_bank_code: recipientBankCode,
                recipient_account_name: lookupName || undefined,
            });

            // For MONEYWISE_WALLET, Lenco may return 'pending' — poll until resolved
            if (activeMethod === 'MONEYWISE_WALLET' && result.lencoStatus === 'pending') {
                setDisburseStatusMsg('Transfer initiated — waiting for Lenco confirmation...');

                let resolved = false;
                for (let attempt = 0; attempt < 8; attempt++) {
                    await new Promise(r => setTimeout(r, 4000));
                    const poll = await requisitionService.verifyDisbursement(requisitionData.id);

                    if (poll.status === 'successful') {
                        resolved = true;
                        break;
                    }
                    if (poll.status === 'failed') {
                        throw new Error(poll.error || poll.details?.reasonForFailure || 'Transfer was rejected. The requisition has been reset to Authorised. Please try again.');
                    }
                    // still pending — keep polling
                }

                if (!resolved) {
                    // Still pending after polling — not a failure, just slow
                    setDisburseStatusMsg('Transfer is still processing. It will complete shortly.');
                }
            }

            // Success
            setIsProcessing(false);
            setIsSuccess(true);
            setDisburseStatusMsg(null);
            if (onAction) onAction('REFRESH');

        } catch (err: any) {
            console.error('[Disburse] Failed:', err);
            setIsProcessing(false);
            setDisburseError(err.message || 'An unexpected error occurred. Please try again.');
            setDisburseStatusMsg(null);
        }
    };

    // Maps raw backend/Lenco error strings into structured, user-friendly messages
    const parseDisburseError = (raw: string): { title: string; body: string; canRetry: boolean; canChangeMethod: boolean } => {
        const msg = raw.toLowerCase();

        if (msg.includes('less than k5') || msg.includes('minimum')) {
            return {
                title: 'Amount Too Low',
                body: `Lenco requires a minimum transfer of K5. This requisition is for K${requisitionData?.estimated_total}. Please use Cash Pickup or raise a new requisition for at least K5.`,
                canRetry: false,
                canChangeMethod: true,
            };
        }
        if (msg.includes('insufficient') || msg.includes('balance')) {
            return {
                title: 'Insufficient Wallet Balance',
                body: 'Your MoneyWise Wallet does not have enough funds to complete this transfer. Please top up your wallet and try again.',
                canRetry: true,
                canChangeMethod: true,
            };
        }
        if (msg.includes('invalid account') || msg.includes('account not found') || msg.includes('name not found')) {
            return {
                title: 'Invalid Recipient Account',
                body: 'The recipient account number or mobile number could not be verified. Please double-check the details and try again.',
                canRetry: false,
                canChangeMethod: false,
            };
        }
        if (msg.includes('network') || msg.includes('timeout') || msg.includes('connection')) {
            return {
                title: 'Network Error',
                body: 'A temporary connection issue occurred. The requisition has been kept in Authorised status. Please wait a moment and try again.',
                canRetry: true,
                canChangeMethod: false,
            };
        }
        if (msg.includes('already been disbursed') || msg.includes('duplicate')) {
            return {
                title: 'Already Processed',
                body: 'This requisition has already been disbursed. Refresh the page to see the latest status.',
                canRetry: false,
                canChangeMethod: false,
            };
        }
        if (msg.includes('not in authorised') || msg.includes('not in the authorised')) {
            return {
                title: 'Status Error',
                body: 'This requisition is not in an Authorised state and cannot be disbursed. Refresh the page to check its current status.',
                canRetry: false,
                canChangeMethod: false,
            };
        }
        if (msg.includes('organization is not properly configured') || msg.includes('not configured')) {
            return {
                title: 'Wallet Not Configured',
                body: "Your organisation's MoneyWise Wallet is not fully set up yet. Please contact your administrator or use an alternative payment method.",
                canRetry: false,
                canChangeMethod: true,
            };
        }
        if (msg.includes('rejected') || msg.includes('failed') || msg.includes('failure')) {
            // Strip common boilerplate from the raw message for cleaner display
            const cleanBody = raw
                .replace(/disbursal error:\s*/i, '')
                .replace(/the requisition has been reset to authorised\./i, '')
                .trim();
            return {
                title: 'Transfer Rejected',
                body: cleanBody || 'The transfer was rejected. The requisition has been reset to Authorised.',
                canRetry: true,
                canChangeMethod: true,
            };
        }
        return {
            title: 'Unexpected Error',
            body: raw || 'Something went wrong. The requisition has been kept in Authorised status. Please try again.',
            canRetry: true,
            canChangeMethod: false,
        };
    };



    if (isSystem) {
        const stage = message.metadata?.stage;
        const status = requisitionData?.status;
        const content = message.content?.trim();
        
        // Handle Legacy content-based routing if stage is missing
        const isCreation = stage === 'APPROVAL' || content === 'Requisition created' || content === 'Requisition submitted for approval';
        const isDisbursal = stage === 'DISBURSAL' || stage === 'DISBURSAL_SUCCESS' || content === 'Status updated to AUTHORISED' || content === 'How would you like to disburse these funds?';
        const isExpenseTracking = stage === 'EXPENSE_TRACKING' || (status === 'EXPENSED' && !stage);
        const isAIReview = stage === 'AI_REVIEW';
        const isQBPosting = stage === 'QUICKBOOKS_POSTING';

        // 1. APPROVAL / INITIAL SUBMISSION
        if (isCreation) {
            // Show buttons if status is DRAFT or PENDING_APPROVAL and user has permissions
            const showActions = canAction && (status === 'DRAFT' || status === 'PENDING_APPROVAL');

            return (
                <div className="flex flex-col mb-8 w-full max-w-2xl animate-in fade-in slide-in-from-left-4 duration-500">
                    {/* Unified Requisition Card - reduced roundedness and top-left square */}
                    <div className="bg-white border border-gray-100 rounded-[20px] rounded-tl-none shadow-[0_4px_20px_-4px_rgba(0,0,0,0.06)] overflow-hidden transition-all duration-300">
                        {/* Header Row (Inside Card) */}
                        <div className="px-8 pt-6 pb-2 flex items-center space-x-3">
                            <div className="w-8 h-8 rounded-full bg-[#FFE3E3] flex items-center justify-center text-[#E56B6B] border border-red-50 shadow-sm">
                                <User size={16} strokeWidth={2.5} />
                            </div>
                            <div className="flex items-center space-x-2">
                                <span className="text-[14px] font-medium text-gray-900 tracking-tight">
                                    {requisitionData?.requestor_name || 'System User'}
                                </span>
                                
                                {/* Status Badge */}
                                {isPastApproval && (
                                    <div className={`flex items-center space-x-1 px-2 py-0.5 rounded-full border ${
                                        isRejected 
                                            ? 'bg-transparent border-red-100 text-red-500' 
                                            : 'bg-transparent border-emerald-100 text-emerald-500'
                                    }`}>
                                        {isRejected ? (
                                            <>
                                                <X size={10} strokeWidth={3} />
                                                <span className="text-[10px] font-bold uppercase tracking-wider">Rejected</span>
                                            </>
                                        ) : (
                                            <>
                                                <Check size={10} strokeWidth={3} />
                                                <span className="text-[10px] font-bold uppercase tracking-wider">Approved</span>
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Summary Row */}
                        <div 
                            className="px-8 pb-6 flex items-center justify-between cursor-pointer group"
                            onClick={() => setIsExpanded(!isExpanded)}
                        >
                            <h3 className="text-[17px] font-bold text-gray-900 leading-tight flex-1 pr-4 transition-colors">
                                {requisitionData?.description || 'Purchase Requisition'}
                            </h3>
                            <div className="flex items-center space-x-4">
                                <span className="text-[18px] font-black text-gray-900 tracking-tight">
                                    K{requisitionData?.estimated_total?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                                <div className={`p-1 rounded-full transition-transform duration-300 ${isExpanded ? 'rotate-180 bg-gray-50' : 'bg-transparent group-hover:bg-gray-50'}`}>
                                    <ChevronDown size={22} className="text-gray-400 group-hover:text-gray-900" />
                                </div>
                            </div>
                        </div>

                        {isExpanded && (
                            <div className="px-8 pb-8 animate-in fade-in slide-in-from-top-2 duration-400">
                                {/* Details Table */}
                                <div className="rounded-2xl border border-gray-100 overflow-hidden mb-8">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="bg-gray-50/80">
                                                <th className="px-6 py-4 text-[11px] font-medium text-gray-400 uppercase tracking-widest border-b border-gray-100">Description</th>
                                                <th className="px-6 py-4 text-[11px] font-medium text-gray-400 uppercase tracking-widest text-center border-b border-gray-100">Qty</th>
                                                <th className="px-6 py-4 text-[11px] font-medium text-gray-400 uppercase tracking-widest text-right border-b border-gray-100">Total</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50">
                                            {requisitionData?.items?.map((item: any, idx: number) => (
                                                <tr key={idx} className="hover:bg-gray-50/30 transition-colors">
                                                    <td className="px-6 py-4 text-[14px] font-normal text-gray-700">{item.description}</td>
                                                    <td className="px-6 py-4 text-[14px] font-normal text-gray-500 text-center">{item.quantity}</td>
                                                    <td className="px-6 py-4 text-[14px] font-medium text-gray-900 text-right">K{item.unit_price?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                                </tr>
                                            ))}
                                            {(!requisitionData?.items || requisitionData.items.length === 0) && (
                                                <tr>
                                                    <td colSpan={3} className="px-6 py-10 text-center text-gray-400 text-sm italic font-medium">No items listed</td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Action Area */}
                                {isPastApproval ? (
                                    <div className={`mt-6 py-4 px-6 rounded-[24px] flex items-center justify-between transition-all duration-500 ${
                                        isRejected ? 'bg-red-50/20 border border-red-50' : 'bg-emerald-50/20 border border-emerald-50'
                                    }`}>
                                        <div className="flex items-center space-x-3">
                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                                                isRejected ? 'bg-red-50 text-red-500' : 'bg-emerald-50 text-emerald-500'
                                            }`}>
                                                {isRejected ? <X size={16} /> : <Check size={16} />}
                                            </div>
                                            <div>
                                                <p className="text-[13px] font-bold text-gray-900">
                                                    {isRejected ? 'Requisition Rejected' : 'Requisition Approved'}
                                                </p>
                                                <p className="text-[11px] text-gray-500 font-medium tracking-tight">
                                                    {isRejected ? 'This request was declined' : 'This request was authorized'}
                                                </p>
                                            </div>
                                        </div>
                                        <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${
                                            isRejected ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'
                                        }`}>
                                            {isRejected ? 'Rejected' : 'Authorized'}
                                        </div>
                                    </div>
                                ) : (
                                    showActions && (
                                        <div className="flex space-x-4 mt-6">
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); handleActionClick('REJECT'); }}
                                                disabled={!!activeAction}
                                                className="flex-1 flex items-center justify-center px-8 py-2.5 bg-[#F5F5F7] text-gray-700 text-sm font-medium rounded-full hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98] border border-gray-100 h-11"
                                            >
                                                {activeAction === 'REJECT' ? <Loader2 size={18} className="animate-spin text-gray-400" /> : 'Reject'}
                                            </button>
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); handleActionClick('APPROVE'); }}
                                                disabled={!!activeAction}
                                                className="flex-1 flex items-center justify-center px-8 py-2.5 bg-[#006AFF] text-white text-sm font-bold rounded-full hover:bg-[#0052cc] disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98] h-11"
                                            >
                                                {activeAction === 'APPROVE' ? <Loader2 size={18} className="animate-spin text-white" /> : 'Approve'}
                                            </button>
                                        </div>
                                    )
                                )}
                            </div>
                        )}
                    </div>

                    {/* Timestamp below card - black and medium weight */}
                    <div className="mt-2.5 ml-1">
                        <span className="text-[11px] font-medium text-gray-900 uppercase tracking-widest opacity-60">
                            {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                    </div>
                </div>
            );
        }

        // 2. DISBURSAL FLOW
        else if (isDisbursal) {
            return (
                <div className="flex flex-col mb-8 w-full max-w-2xl animate-in fade-in slide-in-from-left-4 duration-500">
                    <div className="bg-white border border-gray-100 rounded-[20px] rounded-tl-none shadow-[0_4px_20px_-4px_rgba(0,0,0,0.06)] overflow-hidden transition-all duration-300">
                        <div className="px-8 py-8">
                            <div className="flex items-center space-x-3 mb-4">
                                <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-[#006AFF] border border-blue-50">
                                    <Smartphone size={16} strokeWidth={2.5} />
                                </div>
                                <div className="flex-1 flex items-center justify-between">
                                    <span className="text-[14px] font-medium text-gray-900">Finance System</span>
                                    {(isPastDisbursal || isSuccess || isRejected) && (
                                        <div className="flex items-center space-x-1 px-2 py-0.5 rounded-full border border-gray-100 text-gray-500 bg-transparent">
                                            {isRejected ? <X size={10} strokeWidth={3} className="text-red-500" /> : <Check size={10} strokeWidth={3} className="text-emerald-500" />}
                                            <span className={`text-[10px] font-bold uppercase tracking-wider ${isRejected ? 'text-red-500' : ''}`}>
                                                {isRejected ? 'Rejected' : 'Disbursed'}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {(isPastDisbursal || isSuccess || isRejected) ? (
                                <>
                                    <div 
                                        className={`py-6 px-7 border rounded-[24px] flex flex-col items-center justify-center text-center animate-in zoom-in-95 duration-500 ${
                                            isRejected ? 'bg-red-50/20 border-red-50' : 'bg-emerald-50/20 border-emerald-50'
                                        }`}
                                    >
                                        <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-3 ${
                                            isRejected ? 'bg-red-50' : 'bg-emerald-50'
                                        }`}>
                                            {isRejected ? <X size={24} className="text-red-500" /> : <Check size={24} className="text-emerald-500" />}
                                        </div>
                                        <h4 className="text-[15px] font-bold text-gray-900 mb-1">
                                            {isRejected ? 'Disbursal Cancelled' : 'Transaction Successful'}
                                        </h4>
                                        <p className="text-[13px] text-gray-500 font-medium tracking-tight mb-4">
                                            {isRejected ? 'This requisition was declined and will not be disbursed.' : 'Funds have been disbursed successfully.'}
                                        </p>
                                        
                                        <button 
                                            onClick={() => setIsExpanded(!isExpanded)}
                                            className="flex items-center space-x-2 text-[11px] font-bold uppercase tracking-widest text-[#006AFF] hover:opacity-80 transition-opacity"
                                        >
                                            <span>{isExpanded ? 'Hide Details' : 'Show Details'}</span>
                                            <ChevronDown size={14} className={`transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
                                        </button>
                                    </div>

                                    {isExpanded && (
                                        <div className="mt-6 animate-in fade-in slide-in-from-top-2 duration-400">
                                            <div className="rounded-2xl border border-gray-100 overflow-hidden">
                                                <table className="w-full text-left border-collapse">
                                                    <thead>
                                                        <tr className="bg-gray-50/80">
                                                            <th className="px-6 py-4 text-[11px] font-medium text-gray-400 uppercase tracking-widest border-b border-gray-100">Description</th>
                                                            <th className="px-6 py-4 text-[11px] font-medium text-gray-400 uppercase tracking-widest text-right border-b border-gray-100">Total</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-gray-50">
                                                        {requisitionData?.items?.map((item: any, idx: number) => (
                                                            <tr key={idx} className="hover:bg-gray-50/30 transition-colors">
                                                                <td className="px-6 py-4 text-[13px] font-normal text-gray-700">{item.description}</td>
                                                                <td className="px-6 py-4 text-[13px] font-medium text-gray-900 text-right">K{item.unit_price?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <>
                                    <h3 className="text-[17px] font-bold text-gray-900 leading-tight mb-8">
                                        {activeMethod ? 'Confirm Disbursal Details' : 'How would you like to disburse these funds?'}
                                    </h3>

                                    {!activeMethod ? (
                                        <div className="grid grid-cols-2 gap-3">
                                            {['MOBILE_MONEY', 'MONEYWISE_WALLET', 'BANK_TRANSFER', 'CASH_PICKUP'].map((methodId) => {
                                                const method = PAYMENT_METHODS.find(m => m.id === methodId);
                                                if (!method) return null;
                                                const isWallet = methodId === 'MONEYWISE_WALLET';
                                                return (
                                                    <button 
                                                        key={methodId}
                                                        onClick={() => {
                                                            setActiveMethod(methodId);
                                                            setPaymentType(methodId === 'BANK_TRANSFER' ? 'BANK' : 'MOBILE_MONEY');
                                                        }}
                                                        className={`h-12 px-6 text-[13px] font-bold rounded-full transition-all flex items-center justify-center ${
                                                            isWallet 
                                                                ? 'bg-[#006AFF] text-white shadow-lg shadow-blue-100/50' 
                                                                : 'bg-[#F5F5F7] text-gray-600 hover:bg-gray-200 border border-gray-100'
                                                        }`}
                                                    >
                                                        {method.name}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                                            <div className="space-y-6">
                                                {/* Disbursal Form Inputs ... same as before */}
                                                <div className="grid grid-cols-2 gap-6">
                                                     <div className="flex flex-col space-y-2">
                                                         <label className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em] ml-1">Amount to disburse</label>
                                                         <div className="relative group">
                                                             <span className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-lg">K</span>
                                                             <input 
                                                                 type="text" 
                                                                 defaultValue={requisitionData?.estimated_total?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                                 readOnly
                                                                 className="w-full h-14 pl-12 pr-6 bg-white border border-gray-100 rounded-full text-[17px] font-black text-gray-900 focus:outline-none focus:border-[#006AFF]/20 transition-all shadow-sm group-hover:border-gray-200"
                                                             />
                                                         </div>
                                                         
                                                         {/* Subtext-style Fee Display - positioned lower in hierarchy */}
                                                         <div className="flex items-center space-x-1.5 ml-4 mt-2 px-3 py-1 bg-gray-50/50 rounded-full w-fit border border-gray-100/50">
                                                             <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Transaction Fee:</span>
                                                             <span className="text-[11px] font-bold text-gray-500">
                                                                 K{lencoService.calculatePayoutFee(Number(requisitionData?.estimated_total || 0), activeMethod || paymentType).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                             </span>
                                                         </div>
                                                     </div>

                                                     <div className="flex flex-col space-y-3">
                                                         <label className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em] ml-1">Receive via</label>
                                                         <div className="flex p-1 bg-gray-100 rounded-full w-fit">
                                                             <button onClick={() => setPaymentType('MOBILE_MONEY')} className={`px-6 py-2 rounded-full text-[11px] font-bold transition-all ${paymentType === 'MOBILE_MONEY' ? 'bg-white text-[#006AFF] shadow-sm' : 'text-gray-500'}`}>MOBILE MONEY</button>
                                                             <button onClick={() => setPaymentType('BANK')} className={`px-6 py-2 rounded-full text-[11px] font-bold transition-all ${paymentType === 'BANK' ? 'bg-white text-[#006AFF] shadow-sm' : 'text-gray-500'}`}>BANK</button>
                                                         </div>
                                                     </div>
                                                     <div className="flex flex-col space-y-2">
                                                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em] ml-1">
                                                            {paymentType === 'MOBILE_MONEY' ? 'Recipient Number' : 'Account Details'}
                                                        </label>
                                                        <div className="relative group">
                                                            <input 
                                                                type="text" 
                                                                placeholder={paymentType === 'MOBILE_MONEY' ? '097...' : 'Enter account number...'}
                                                                value={recipientValue}
                                                                onChange={async (e) => {
                                                                    const value = e.target.value;
                                                                    setRecipientValue(value);
                                                                    if (paymentType === 'MOBILE_MONEY') {
                                                                        const clean = value.replace(/[^0-9]/g, '');
                                                                        const normalized = clean.startsWith('260') ? '0' + clean.substring(3) : clean;
                                                                        let operator: string | null = null;
                                                                        if (normalized.startsWith('097') || normalized.startsWith('077')) operator = 'AIRTEL';
                                                                        else if (normalized.startsWith('096') || normalized.startsWith('076')) operator = 'MTN';
                                                                        else if (normalized.startsWith('095') || normalized.startsWith('075')) operator = 'ZAMTEL';
                                                                        setRecipientProvider(operator);
                                                                        if (normalized.length === 10 && operator) {
                                                                            setIsLookingUp(true);
                                                                            setLookupName(null);
                                                                            try {
                                                                                const res = await lencoService.resolveMobileMoney(normalized, operator, requisitionData?.organization_id);
                                                                                setLookupName(res.accountName || res.account_name || res.name);
                                                                            } catch (err) {
                                                                                setLookupName('Name not found');
                                                                            } finally {
                                                                                setIsLookingUp(false);
                                                                            }
                                                                        } else if (normalized.length < 10) {
                                                                            setLookupName(null);
                                                                        }
                                                                    } else {
                                                                        setLookupName(null);
                                                                    }
                                                                }}
                                                                className="w-full h-14 px-7 bg-white border border-gray-100 rounded-full text-[15px] font-medium text-gray-900 focus:outline-none focus:border-[#006AFF]/20 transition-all shadow-sm group-hover:border-gray-200"
                                                            />
                                                            <div className="absolute right-6 top-1/2 -translate-y-1/2 flex items-center space-x-2">
                                                                {isLookingUp ? (
                                                                    <Loader2 size={18} className="text-[#006AFF] animate-spin" />
                                                                ) : recipientProvider && (
                                                                    <span className={`text-[10px] font-black px-2 py-1 rounded bg-gray-100 text-gray-500 uppercase flex items-center ${recipientProvider === 'AIRTEL' ? 'text-red-500' : recipientProvider === 'MTN' ? 'text-yellow-600' : 'text-green-600'}`}>
                                                                        {recipientProvider}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        {lookupName && (
                                                            <div className="flex items-center space-x-2 ml-4 animate-in fade-in slide-in-from-left-2 duration-300">
                                                                <div className={`w-1.5 h-1.5 rounded-full ${lookupName === 'Name not found' ? 'bg-red-500' : 'bg-emerald-500'}`}></div>
                                                                <span className={`text-[12px] font-bold uppercase tracking-wider ${lookupName === 'Name not found' ? 'text-red-600' : 'text-emerald-600'}`}>{lookupName}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                                
                                                {!isProcessing && (
                                                    <div className="flex items-center space-x-3 mt-4">
                                                        <button 
                                                            onClick={() => {
                                                                setActiveMethod(null);
                                                                setLookupName(null);
                                                                setRecipientProvider(null);
                                                                setRecipientValue('');
                                                            }}
                                                            className="h-14 px-8 bg-white border border-gray-100 text-gray-500 text-[14px] font-bold rounded-full hover:bg-gray-50 transition-all flex items-center justify-center shadow-sm"
                                                        >
                                                            Back
                                                        </button>
                                                        <button 
                                                            onClick={handleDisburse}
                                                            className="flex-1 h-14 bg-[#006AFF] text-white text-[15px] font-bold rounded-full hover:bg-[#0052cc] transition-all shadow-xl shadow-blue-100/50 flex items-center justify-center space-x-3"
                                                        >
                                                            <span>Send Money</span>
                                                            <ArrowRight size={20} />
                                                        </button>
                                                    </div>
                                                )}
                                                
                                                {isProcessing && (
                                                    <div className="flex flex-col items-center justify-center py-6 space-y-3">
                                                        <Loader2 className="w-8 h-8 text-[#006AFF] animate-spin" />
                                                        {disburseStatusMsg && (
                                                            <p className="text-[12px] font-medium text-gray-500 text-center animate-in fade-in duration-300">
                                                                {disburseStatusMsg}
                                                            </p>
                                                        )}
                                                    </div>
                                                )}

                                                {disburseError && !isProcessing && (() => {
                                                    const parsed = parseDisburseError(disburseError);
                                                    return (
                                                        <div className="mt-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                                            <div className="p-5 bg-red-50 border border-red-100 rounded-[20px]">
                                                                {/* Header */}
                                                                <div className="flex items-start space-x-3 mb-3">
                                                                    <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                                                                        <X size={14} className="text-red-600" strokeWidth={3} />
                                                                    </div>
                                                                    <div>
                                                                        <p className="text-[13px] font-bold text-red-800 leading-tight">{parsed.title}</p>
                                                                        <p className="text-[12px] text-red-700 mt-1 leading-relaxed">{parsed.body}</p>
                                                                    </div>
                                                                </div>
                                                                {/* Actions */}
                                                                <div className="flex items-center space-x-2 mt-4">
                                                                    {parsed.canRetry && (
                                                                        <button
                                                                            onClick={() => {
                                                                                setDisburseError(null);
                                                                                setRecipientValue('');
                                                                                setLookupName(null);
                                                                            }}
                                                                            className="h-9 px-5 bg-red-100 hover:bg-red-200 text-red-800 text-[12px] font-bold rounded-full transition-all"
                                                                        >
                                                                            Try Again
                                                                        </button>
                                                                    )}
                                                                    {parsed.canChangeMethod && (
                                                                        <button
                                                                            onClick={() => {
                                                                                setDisburseError(null);
                                                                                setActiveMethod(null);
                                                                                setRecipientValue('');
                                                                                setLookupName(null);
                                                                                setRecipientProvider(null);
                                                                            }}
                                                                            className="h-9 px-5 bg-white border border-red-100 hover:bg-red-50 text-red-700 text-[12px] font-bold rounded-full transition-all"
                                                                        >
                                                                            Change Method
                                                                        </button>
                                                                    )}
                                                                    {!parsed.canRetry && !parsed.canChangeMethod && (
                                                                        <button
                                                                            onClick={() => { setDisburseError(null); if (onAction) onAction('REFRESH'); }}
                                                                            className="h-9 px-5 bg-red-100 hover:bg-red-200 text-red-800 text-[12px] font-bold rounded-full transition-all"
                                                                        >
                                                                            Refresh Page
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })()}

                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            );
        }

        // 3. EXPENSE TRACKING
        else if (stage === 'EXPENSE_TRACKING' || (!stage && isExpenseTracking)) {
            return (
                <div className="flex flex-col mb-8 w-full max-w-2xl animate-in fade-in slide-in-from-left-4 duration-500">
                    <div className="bg-white border border-gray-100 rounded-[20px] rounded-tl-none shadow-[0_4px_20px_-4px_rgba(0,0,0,0.06)] overflow-hidden">
                        <div className="px-8 py-8">
                             <div className="flex items-center space-x-3 mb-4">
                                 <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-[#006AFF] border border-blue-50">
                                     <FileText size={16} strokeWidth={2.5} />
                                 </div>
                                 <div className="flex-1 flex items-center justify-between">
                                     <span className="text-[14px] font-medium text-gray-900">Finance System</span>
                                     {(requisitionData?.status === 'EXPENSED' || (Number(requisitionData?.actual_total) > 0)) && (
                                         <div className="flex items-center space-x-1 px-2 py-0.5 rounded-full border border-gray-100 text-gray-500 bg-transparent">
                                             <Check size={10} strokeWidth={3} />
                                             <span className="text-[10px] font-bold uppercase tracking-wider">Expensed</span>
                                         </div>
                                     )}
                                 </div>
                             </div>
                             <div className="flex items-center space-x-3 mb-6">
                                 <div className="w-8 h-8 rounded-full bg-blue-50/50 flex items-center justify-center text-[#006AFF]">
                                     <FileText size={16} />
                                 </div>
                                 <p className="text-[14px] font-semibold text-gray-900">
                                     {requisitionData?.status === 'EXPENSED' || (Number(requisitionData?.actual_total) > 0) ? 'Transaction expenditure recorded.' : 'This transaction needs to be expensed.'}
                                 </p>
                             </div>
                            
                            {requisitionData?.status === 'EXPENSED' || (Number(requisitionData?.actual_total) > 0) ? (
                                <div className="space-y-4">
                                    <button 
                                        onClick={() => setIsExpenseExpanded(!isExpenseExpanded)}
                                        className="h-12 w-full px-6 bg-[#F5F5F7] text-gray-600 text-[13px] font-bold rounded-full hover:bg-gray-200 border border-gray-100 transition-all flex items-center justify-between"
                                    >
                                        <span>{isExpenseExpanded ? 'Hide Details' : 'View Expenditure Details'}</span>
                                        <ChevronDown size={16} className={`transition-transform duration-300 ${isExpenseExpanded ? 'rotate-180' : ''}`} />
                                    </button>

                                    {isExpenseExpanded && (
                                        <div className="animate-in slide-in-from-top-2 duration-300">
                                            <div className="rounded-2xl border border-gray-100 overflow-hidden mb-6">
                                                <table className="w-full text-left border-collapse">
                                                    <thead>
                                                        <tr className="bg-gray-50/80">
                                                            <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400 border-b border-gray-100">Item</th>
                                                            <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-right text-gray-400 border-b border-gray-100">Estimated</th>
                                                            <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-right text-gray-400 border-b border-gray-100">Actual</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-gray-50">
                                                        {requisitionData?.items?.map((item: any, idx: number) => (
                                                            <tr key={idx} className="hover:bg-gray-50/30 transition-colors">
                                                                <td className="px-6 py-4 text-[13px] font-medium text-gray-700">{item.description}</td>
                                                                <td className="px-6 py-4 text-[13px] font-medium text-gray-400 text-right">K{(item.unit_price * item.quantity)?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                                                <td className="px-6 py-4 text-[13px] font-black text-gray-900 text-right">K{item.actual_amount?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                            
                                            <div className="p-5 bg-gray-50/50 rounded-[20px] border border-gray-100 space-y-3">
                                                <div className="flex justify-between items-center text-[12px]">
                                                    <span className="font-bold text-gray-400 uppercase tracking-widest">Estimated Total</span>
                                                    <span className="font-bold text-gray-500">K{requisitionData?.estimated_total?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                                </div>
                                                <div className="flex justify-between items-center text-[12px]">
                                                    <span className="font-bold text-gray-400 uppercase tracking-widest">Actual Expenditure</span>
                                                    <span className="font-black text-gray-900">K{requisitionData?.actual_total?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                                </div>
                                                {requisitionData?.estimated_total > requisitionData?.actual_total && (
                                                    <div className="pt-3 mt-3 border-t border-gray-100 flex justify-between items-center">
                                                        <span className="text-[12px] font-black text-[#006AFF] uppercase tracking-widest">Change Balance</span>
                                                        <span className="text-[16px] font-black text-[#006AFF]">K{(requisitionData.estimated_total - requisitionData.actual_total).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : expenseMode === 'NONE' ? (
                                <div className="grid grid-cols-2 gap-3">
                                    <button 
                                        onClick={() => {
                                            setExpenseMode('MANUAL');
                                            setExpenseItems(requisitionData.items?.map((item: any) => ({
                                                ...item,
                                                actual_amount: item.actual_amount || item.unit_price * item.quantity
                                            })) || []);
                                        }}
                                        className="h-12 px-6 bg-[#F5F5F7] text-gray-600 text-[13px] font-bold rounded-full hover:bg-gray-200 border border-gray-100 transition-all flex items-center justify-center space-x-2"
                                    >
                                        <span>Manual Entry</span>
                                    </button>
                                    <button 
                                        onClick={() => alert('Scanning receipts is coming soon!')}
                                        className="h-12 px-6 bg-[#F5F5F7] text-gray-600 text-[13px] font-bold rounded-full hover:bg-gray-200 border border-gray-100 transition-all flex items-center justify-center space-x-2"
                                    >
                                        <Smartphone size={16} />
                                        <span>Scan Receipts</span>
                                    </button>
                                </div>
                            ) : (
                                <div className="animate-in zoom-in-95 duration-500">
                                    <div className="flex items-center justify-between mb-6">
                                        <h4 className="text-[13px] font-black uppercase tracking-[0.15em] text-gray-500">Record Expenditures</h4>
                                        <button 
                                            onClick={() => setExpenseMode('NONE')}
                                            className="text-[11px] font-bold text-[#006AFF] hover:underline"
                                        >
                                            Cancel
                                        </button>
                                    </div>

                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left">
                                            <thead>
                                                <tr className="border-b border-gray-100">
                                                    <th className="pb-3 text-[10px] font-black uppercase text-gray-400">Description</th>
                                                    <th className="pb-3 text-[10px] font-black uppercase text-gray-400 text-right">Qty</th>
                                                    <th className="pb-3 text-[10px] font-black uppercase text-gray-400 text-right w-24">Actual (K)</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-50">
                                                {expenseItems.map((item, idx) => (
                                                    <tr key={item.id || idx}>
                                                        <td className="py-4 text-[13px] font-medium text-gray-800">{item.description}</td>
                                                        <td className="py-4 text-[13px] text-gray-500 text-right">{item.quantity}</td>
                                                        <td className="py-4 text-right">
                                                            <input 
                                                                type="number" 
                                                                step="0.01"
                                                                value={item.actual_amount}
                                                                onChange={(e) => {
                                                                    const newItems = [...expenseItems];
                                                                    newItems[idx].actual_amount = parseFloat(e.target.value) || 0;
                                                                    setExpenseItems(newItems);
                                                                }}
                                                                className="w-20 px-2 py-1 bg-white border border-gray-100 rounded text-[13px] font-black text-gray-900 text-right focus:border-[#006AFF]/30 focus:outline-none"
                                                            />
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>

                                    <div className="mt-6 pt-6 border-t border-gray-100 space-y-3">
                                        <div className="flex justify-between items-center">
                                            <span className="text-[11px] font-bold text-gray-400 uppercase">Estimated Total</span>
                                            <span className="text-[13px] font-bold text-gray-400">K{requisitionData.estimated_total?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-[11px] font-bold text-gray-600 uppercase">Actual Total</span>
                                            <span className="text-[15px] font-black text-gray-900">K{expenseItems.reduce((sum: number, i: any) => sum + (parseFloat(i.actual_amount) || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                        </div>
                                        {requisitionData.estimated_total > expenseItems.reduce((sum: number, i: any) => sum + (parseFloat(i.actual_amount) || 0), 0) && (
                                            <div className="flex justify-between items-center p-3 bg-blue-50/50 rounded-2xl border border-blue-100">
                                                <span className="text-[11px] font-black text-[#006AFF] uppercase">Change to Submit</span>
                                                <span className="text-[15px] font-black text-[#006AFF]">K{(requisitionData.estimated_total - expenseItems.reduce((sum: number, i: any) => sum + (parseFloat(i.actual_amount) || 0), 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                            </div>
                                        )}
                                    </div>

                                    <button 
                                        onClick={async () => {
                                            try {
                                                setIsSavingExpenses(true);
                                                const actualTotal = expenseItems.reduce((sum: number, i: any) => sum + (parseFloat(i.actual_amount) || 0), 0);
                                                const change = (requisitionData.estimated_total || 0) - actualTotal;
                                                
                                                await requisitionService.updateExpenses(requisitionData.id, expenseItems.map((i: any) => ({
                                                    id: i.id,
                                                    actual_amount: i.actual_amount,
                                                    receipt_url: i.receipt_url
                                                })));

                                                await requisitionService.sendMessage(
                                                    requisitionData.id, 
                                                    `Expenses tracked: Total Actual K${actualTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}. ${change > 0 ? `Change to Submit: K${change.toLocaleString(undefined, { minimumFractionDigits: 2 })}.` : 'No change to submit.'}`,
                                                    'SYSTEM'
                                                );

                                                if (change > 0) {
                                                    await requisitionService.sendMessage(
                                                        requisitionData.id,
                                                        `Please submit the change of K${change.toLocaleString(undefined, { minimumFractionDigits: 2 })}.`,
                                                        'SYSTEM',
                                                        { changeAmount: change }
                                                    );
                                                }

                                                if (onAction) onAction('REFRESH');
                                                setExpenseMode('NONE');
                                            } catch (err) {
                                                console.error('Save expenses failed:', err);
                                                alert('Failed to save expenses.');
                                            } finally {
                                                setIsSavingExpenses(false);
                                            }
                                        }}
                                        disabled={isSavingExpenses}
                                        className="w-full mt-6 h-12 bg-[#006AFF] text-white text-[13px] font-bold rounded-full hover:bg-[#0052cc] transition-all disabled:opacity-50 shadow-lg shadow-blue-100"
                                    >
                                        {isSavingExpenses ? <Loader2 size={18} className="animate-spin mx-auto text-white" /> : 'Confirm Expenses'}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            );
        }

        // 4. AI CATEGORIZATION REVIEW
        else if (isAIReview) {
            const isCompleted = requisitionData?.status === 'CATEGORIZED' || requisitionData?.status === 'ACCOUNTED';
            const filteredAccounts = accounts.filter(a => 
                a.name.toLowerCase().includes(accountSearch.toLowerCase()) || 
                a.code.toLowerCase().includes(accountSearch.toLowerCase())
            );

            return (
                <div className="flex flex-col mb-8 w-full max-w-2xl animate-in fade-in slide-in-from-left-4 duration-500">
                    <div className="bg-white border border-gray-100 rounded-[20px] rounded-tl-none shadow-[0_4px_20px_-4px_rgba(0,0,0,0.06)] overflow-visible">
                        <div className="px-8 py-8">
                            <div className="flex items-center space-x-3 mb-6">
                                <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-[#006AFF]">
                                    <Building2 size={16} />
                                </div>
                                <div className="flex-1 flex items-center justify-between">
                                    <span className="text-[14px] font-medium text-gray-900 tracking-tight">AI Categorization Assistant</span>
                                    <div className="flex items-center space-x-2">
                                        {!isCompleted && (
                                            <button 
                                                onClick={async () => {
                                                    try {
                                                        setIsReloadingAI(true);
                                                        await requisitionService.retriggerAI(requisitionData?.id || message.requisition_id);
                                                        if (onAction) onAction('REFRESH');
                                                    } catch (err) {
                                                        console.error('Failed to reload AI:', err);
                                                    } finally {
                                                        setIsReloadingAI(false);
                                                    }
                                                }}
                                                disabled={isReloadingAI}
                                                className="p-1.5 hover:bg-gray-50 rounded-lg text-gray-400 hover:text-[#006AFF] transition-all group"
                                                title="Reload AI Analysis"
                                            >
                                                <RefreshCw size={14} className={`${isReloadingAI ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'}`} />
                                            </button>
                                        )}
                                        {isCompleted && (
                                            <div className="flex items-center space-x-3">
                                                <button
                                                    onClick={() => setIsAICategorizationExpanded(!isAICategorizationExpanded)}
                                                    className="flex items-center space-x-1.5 px-3 py-1.5 hover:bg-blue-50/50 rounded-full text-[11px] font-bold text-[#006AFF] transition-all border border-transparent hover:border-blue-100 group"
                                                >
                                                    <span className="uppercase tracking-wider">{isAICategorizationExpanded ? 'Hide Mapping' : 'Show Mapping'}</span>
                                                    <ChevronDown size={14} className={`transition-transform duration-300 ${isAICategorizationExpanded ? 'rotate-180' : ''}`} />
                                                </button>
                                                <div className="flex items-center space-x-1 px-2 py-0.5 rounded-full border border-gray-100 text-blue-500 bg-blue-50/10 h-[22px]">
                                                    <Check size={10} strokeWidth={3} />
                                                    <span className="text-[10px] font-bold uppercase tracking-wider">Categorized</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* AI Thinking State - Row below where it is now */}
                            {message.metadata?.isThinking && (
                                <div className="flex flex-col items-center justify-center py-10 animate-in fade-in zoom-in-95 duration-500">
                                    <div className="flex space-x-1.5 mb-3">
                                        <div className="typing-dot" />
                                        <div className="typing-dot" />
                                        <div className="typing-dot" />
                                    </div>
                                    <p className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.2em] animate-pulse">
                                        AI Categorization Assistant is thinking...
                                    </p>
                                </div>
                            )}

                            {isAICategorizationExpanded && !message.metadata?.isThinking && (
                                <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                                    <p className="text-[14px] font-semibold text-gray-900 mb-6">
                                        The AI has suggested the following chart of accounts mapping. You can manually edit any category if needed.
                                    </p>

                                    <div className="rounded-2xl border border-gray-100 overflow-visible mb-8">
                                        <table className="w-full text-left">
                                            <thead>
                                                <tr className="bg-gray-50/80">
                                                    <th className="px-6 py-4 text-[10px] font-black uppercase text-gray-400 w-1/3">Item</th>
                                                    <th className="px-6 py-4 text-[10px] font-black uppercase text-gray-400">Suggested Category</th>
                                                    <th className="px-6 py-4 text-[10px] font-black uppercase text-gray-400 text-right">Action</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-50">
                                                {(editableItems.length > 0 ? editableItems : (message.metadata?.items || [])).map((item: any, idx: number) => (
                                                    <React.Fragment key={idx}>
                                                        <tr className="hover:bg-gray-50/30 transition-colors group">
                                                            <td className="px-6 py-4 text-[13px] font-medium text-gray-700">{item.description}</td>
                                                            <td className="px-6 py-4 text-[13px] font-black text-gray-900">
                                                                <div className="relative">
                                                                    {!isCompleted ? (
                                                                        <div className="relative">
                                                                            <button
                                                                                onClick={() => {
                                                                                    if (isAccountDropdownOpen === idx) {
                                                                                        setIsAccountDropdownOpen(null);
                                                                                    } else {
                                                                                        setIsAccountDropdownOpen(idx);
                                                                                        setAccountSearch('');
                                                                                    }
                                                                                }}
                                                                                className="flex flex-col text-left hover:bg-gray-100/50 p-2 -m-2 rounded-xl transition-all w-full"
                                                                            >
                                                                                <span className="text-[13px] font-bold text-gray-900 flex items-center justify-between">
                                                                                    <span>{item.category_code} - {item.category_name}</span>
                                                                                    <ChevronDown size={14} className={`text-gray-400 transition-transform ${isAccountDropdownOpen === idx ? 'rotate-180' : ''}`} />
                                                                                </span>
                                                                                <span className="text-[10px] font-bold text-emerald-500">
                                                                                    {item.confidence ? `${Math.round(item.confidence * 100)}% Confidence` : (item.is_manual ? 'Manual Override' : 'System Suggestion')}
                                                                                </span>
                                                                            </button>

                                                                            {isAccountDropdownOpen === idx && (
                                                                                <div className="absolute top-full left-0 mt-2 w-[350px] bg-white border border-gray-100 shadow-2xl rounded-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                                                                                    <div className="p-4 border-b border-gray-50 bg-gray-50/30">
                                                                                        <div className="relative">
                                                                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                                                                                            <input
                                                                                                autoFocus
                                                                                                type="text"
                                                                                                placeholder="Search accounts..."
                                                                                                value={accountSearch}
                                                                                                onChange={(e) => setAccountSearch(e.target.value)}
                                                                                                className="w-full pl-9 pr-4 py-2 bg-white border border-gray-100 rounded-xl text-[12px] focus:outline-none focus:ring-2 focus:ring-[#006AFF]/20"
                                                                                            />
                                                                                        </div>
                                                                                    </div>
                                                                                    <div className="max-h-[300px] overflow-y-auto p-2 scrollbar-hide">
                                                                                        {filteredAccounts.length > 0 ? (
                                                                                            filteredAccounts.map((acc) => (
                                                                                                <button
                                                                                                    key={acc.id}
                                                                                                    onClick={() => {
                                                                                                        const updated = [...editableItems];
                                                                                                        updated[idx] = {
                                                                                                            ...updated[idx],
                                                                                                            account_id: acc.id,
                                                                                                            category_code: acc.code,
                                                                                                            category_name: acc.name,
                                                                                                            is_manual: true,
                                                                                                            confidence: 1 // Manual override is certain
                                                                                                        };
                                                                                                        setEditableItems(updated);
                                                                                                        setIsAccountDropdownOpen(null);
                                                                                                    }}
                                                                                                    className="w-full flex flex-col items-start p-3 hover:bg-blue-50 rounded-xl transition-all group/item mb-1 text-left"
                                                                                                >
                                                                                                    <span className="text-[12px] font-bold text-gray-900 group-hover/item:text-[#006AFF]">{acc.code} - {acc.name}</span>
                                                                                                    <span className="text-[10px] text-gray-400 uppercase font-black tracking-widest">{acc.type}</span>
                                                                                                </button>
                                                                                            ))
                                                                                        ) : (
                                                                                            <div className="py-8 text-center text-[12px] text-gray-400 italic">No accounts found</div>
                                                                                        )}
                                                                                    </div>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    ) : (
                                                                        <div className="flex flex-col">
                                                                            <span>{item.category_code} - {item.category_name}</span>
                                                                            <span className="text-[10px] font-bold text-emerald-500">Confirmed</span>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </td>
                                                            <td className="px-6 py-4 text-right">
                                                                <button 
                                                                    onClick={() => setExpandedLogicIndex(expandedLogicIndex === idx ? null : idx)}
                                                                    className="text-[11px] font-black text-[#006AFF] hover:underline uppercase tracking-wider"
                                                                >
                                                                    {expandedLogicIndex === idx ? 'Hide Logic' : 'View Logic'}
                                                                </button>
                                                            </td>
                                                        </tr>
                                                        {expandedLogicIndex === idx && (
                                                            <tr>
                                                                <td colSpan={3} className="px-6 py-4 bg-gray-50/50">
                                                                    <div className="text-[12px] text-gray-600 leading-relaxed animate-in slide-in-from-top-1 duration-300">
                                                                        <div className="flex items-center space-x-2 mb-2">
                                                                            <span className="font-black text-gray-400 uppercase tracking-widest">Method:</span>
                                                                            <span className="px-2 py-0.5 rounded bg-gray-100 text-[10px] font-black text-gray-500 border border-gray-200">
                                                                                {item.method || (item.is_manual ? 'MANUAL OVERRIDE' : 'AI')}
                                                                            </span>
                                                                        </div>
                                                                        <span className="font-black text-gray-400 uppercase tracking-widest block mb-1">AI Reasoning:</span>
                                                                        {item.reasoning || (item.is_manual ? 'User manually selected this account.' : 'No reasoning available.')}
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        )}
                                                    </React.Fragment>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>

                                    {!isCompleted && (
                                        <button 
                                            onClick={async () => {
                                                try {
                                                    setIsApprovingAI(true);
                                                    // Extract manual overrides (id and account_id)
                                                    // Note: In our current schema, item.id is the line_item ID
                                                    const overrides = editableItems
                                                        .filter(item => item.is_manual)
                                                        .map(item => ({
                                                            id: item.id,
                                                            account_id: item.account_id || accounts.find(a => a.code === item.category_code)?.id
                                                        }));

                                                    await requisitionService.approveCategorization(
                                                        requisitionData?.id || message.requisition_id,
                                                        overrides
                                                    );
                                                    if (onAction) onAction('REFRESH');
                                                } catch (err) {
                                                    console.error('Categorization approval failed:', err);
                                                } finally {
                                                    setIsApprovingAI(false);
                                                }
                                            }}
                                            disabled={isApprovingAI}
                                            className="w-full h-12 bg-[#006AFF] text-white text-[13px] font-bold rounded-full hover:bg-blue-600 shadow-lg shadow-blue-100 transition-all flex items-center justify-center"
                                        >
                                            {isApprovingAI ? <Loader2 size={18} className="animate-spin" /> : 'Approve Categorizations'}
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            );
        }

        // 5. QUICKBOOKS POSTING
        else if (isQBPosting) {
            const isCompleted = requisitionData?.status === 'ACCOUNTED';

            return (
                <div className="flex flex-col mb-8 w-full max-w-2xl animate-in fade-in slide-in-from-left-4 duration-500">
                    <div className="bg-white border border-gray-100 rounded-[20px] rounded-tl-none shadow-[0_4px_20px_-4px_rgba(0,0,0,0.06)] overflow-hidden">
                        <div className="px-8 py-8">
                            <div className="flex items-center space-x-3 mb-6">
                                <div className="w-8 h-8 rounded-full bg-orange-50 flex items-center justify-center text-orange-600">
                                    <ArrowRight size={16} />
                                </div>
                                <div className="flex-1 flex items-center justify-between">
                                    <span className="text-[14px] font-medium text-gray-900 tracking-tight">QuickBooks Integration</span>
                                    {isCompleted && (
                                        <div className="flex items-center space-x-1 px-2 py-0.5 rounded-full border border-emerald-100 text-emerald-500 bg-emerald-50/10">
                                            <Check size={10} strokeWidth={3} />
                                            <span className="text-[10px] font-bold uppercase tracking-wider">Posted</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <p className="text-[14px] font-semibold text-gray-900 mb-8">
                                {isCompleted ? 'This transaction has been successfully posted to QuickBooks.' : 'Select the payment account to post this transaction.'}
                            </p>

                            {!isCompleted && (
                                <div className="space-y-6">
                                    <div className="flex flex-col space-y-2">
                                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em] ml-1">Payment Account</label>
                                        <select 
                                            value={paymentAccountId}
                                            onChange={(e) => setPaymentAccountId(e.target.value)}
                                            className="w-full h-14 px-7 bg-white border border-gray-100 rounded-full text-[15px] font-medium text-gray-900 focus:outline-none focus:border-[#006AFF]/20 transition-all shadow-sm"
                                        >
                                            <option value="BANK-123">Standard Chartered (Business)</option>
                                            <option value="BANK-456">ABS Bank (Operations)</option>
                                            <option value="BANK-789">Petty Cash</option>
                                        </select>
                                    </div>

                                    <button 
                                        onClick={async () => {
                                            try {
                                                setIsPostingQB(true);
                                                await requisitionService.postToQuickBooks(requisitionData?.id || message.requisition_id, {
                                                    payment_account_id: paymentAccountId,
                                                    payment_account_name: 'Selected Account'
                                                });
                                                if (onAction) onAction('REFRESH');
                                                if (onAction) onAction('REFRESH');
                                            } catch (err) {
                                                console.error('QB Posting failed:', err);
                                            } finally {
                                                setIsPostingQB(false);
                                            }
                                        }}
                                        disabled={isPostingQB}
                                        className="w-full h-14 bg-[#006AFF] text-white text-[15px] font-bold rounded-full hover:bg-blue-600 shadow-xl shadow-blue-100/50 transition-all flex items-center justify-center space-x-3"
                                    >
                                        {isPostingQB ? <Loader2 size={18} className="animate-spin" /> : (
                                            <>
                                                <span>Post to QuickBooks</span>
                                                <ArrowRight size={20} />
                                            </>
                                        )}
                                    </button>
                                </div>
                            )}

                            {isCompleted && (
                                <div className="p-5 bg-emerald-50/30 rounded-[20px] border border-emerald-50 text-center">
                                    <p className="text-[13px] font-bold text-emerald-600">Successfully syncronized with the General Ledger.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            );
        }

        // 6. DISBURSAL SUMMARY (Success Message)
        else if (content === 'Money successfully sent' || content?.startsWith('Funds Disbursed:')) {
            const meta = message.metadata || {};
            return (
                <div className="flex justify-end mb-8 w-full animate-in fade-in slide-in-from-right-4 duration-500">
                    <div className="flex flex-col items-end max-w-sm">
                        <div className="bg-[#006AFF] rounded-[24px] rounded-tr-none px-6 py-5 shadow-lg shadow-blue-100/50">
                            <div className="flex items-center space-x-3 mb-1">
                                <div className="w-5 h-5 rounded-full bg-blue-400/30 flex items-center justify-center">
                                    <Check size={12} className="text-white" strokeWidth={4} />
                                </div>
                                <span className="text-[15px] font-extrabold text-white">Money successfully sent</span>
                            </div>
                            <button 
                                onClick={() => setIsExpanded(!isExpanded)}
                                className="flex items-center space-x-1.5 text-blue-100 hover:text-white transition-colors mt-2"
                            >
                                <span className="text-[11px] font-bold uppercase tracking-wider">{isExpanded ? 'Hide Details' : 'Show Details'}</span>
                                <ChevronDown size={14} className={`transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
                            </button>

                            {isExpanded && (
                                <div className="mt-4 pt-4 border-t border-blue-400/30 space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                                    <div className="flex justify-between items-center">
                                        <span className="text-[10px] font-bold text-blue-200 uppercase tracking-widest">Amount</span>
                                        <span className="text-[14px] font-black text-white">K{Number(meta.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                    </div>
                                    <div className="flex justify-between items-center space-x-4">
                                        <span className="text-[10px] font-bold text-blue-200 uppercase tracking-widest whitespace-nowrap">Method</span>
                                        <span className="text-[12px] font-bold text-white uppercase text-right">{meta.method?.replace('_', ' ')}</span>
                                    </div>
                                    <div className="flex justify-between items-center space-x-4">
                                        <span className="text-[10px] font-bold text-blue-200 uppercase tracking-widest whitespace-nowrap">Recipient</span>
                                        <div className="flex flex-col items-end overflow-hidden">
                                            <span className="text-[12px] font-bold text-white truncate w-full text-right">{meta.recipient}</span>
                                            {meta.accountName && (
                                                <span className="text-[10px] font-medium text-blue-100 opacity-80 text-right truncate w-full">{meta.accountName}</span>
                                            )}
                                        </div>
                                    </div>
                                    {meta.provider && (
                                        <div className="flex justify-between items-center space-x-4">
                                            <span className="text-[10px] font-bold text-blue-200 uppercase tracking-widest whitespace-nowrap">Provider</span>
                                            <span className="text-[11px] font-black text-white uppercase text-right">{meta.provider}</span>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                        <span className="text-[10px] font-medium mt-2.5 mr-2 text-gray-900 opacity-60 uppercase tracking-widest">
                            {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                    </div>
                </div>
            );
        }

        // Status Update Badges
        return (
            <div className="flex justify-center my-8 w-full animate-in fade-in zoom-in-95 duration-500">
                <span className="px-6 py-2 bg-blue-50/50 text-blue-400 text-[10px] font-black uppercase tracking-[0.2em] rounded-full border border-blue-100/50">
                    {message.content}
                </span>
            </div>
        );
    }

    // Chat Bubbles - reduced roundedness and top-left square for received messages
    return (
        <div className={`flex w-full ${isOwn ? 'justify-end' : 'justify-start'} mb-8 group animate-in fade-in slide-in-from-bottom-2 duration-400`}>
            <div className={`flex flex-col max-w-[75%] ${isOwn ? 'items-end' : 'items-start'}`}>
                <div className={`px-6 py-4 rounded-[18px] text-[15px] font-medium leading-relaxed shadow-sm ${
                    isOwn 
                        ? 'bg-[#006AFF] text-white rounded-tr-none shadow-blue-100' 
                        : 'bg-white text-gray-800 rounded-tl-none border border-gray-100'
                }`}>
                    {message.content}
                </div>
                <span className={`text-[10px] font-medium mt-2.5 mx-2 uppercase tracking-widest ${isOwn ? 'text-gray-900 opacity-60' : 'text-gray-900 opacity-60'}`}>
                    {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
            </div>
        </div>
    );
};

export default RequisitionMessageCard;

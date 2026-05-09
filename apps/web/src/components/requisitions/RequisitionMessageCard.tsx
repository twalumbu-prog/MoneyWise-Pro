import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { RequisitionMessage, requisitionService } from '../../services/requisition.service';
import { lencoService } from '../../services/lenco.service';
import { User, ChevronDown, Loader2, Check, CheckCircle, X, FileText, Smartphone, Coins, Wallet, Building2, ArrowRight, RefreshCw, Search, Beaker, AlertTriangle, Image as ImageIcon, Plus, Sparkles, RotateCcw } from 'lucide-react';
import { accountService, Account } from '../../services/account.service';
import { integrationService } from '../../services/integration.service';
import { useAuth } from '../../context/AuthContext';
import heic2any from 'heic2any';

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

    const { userRole, user: currentUser } = useAuth();
    const [isExpanded, setIsExpanded] = useState(isInitial || window.innerWidth < 768);
    useEffect(() => {
        if (isInitial && window.innerWidth < 768) {
            setIsExpanded(true);
        }
    }, [isInitial]);
    const [activeAction, setActiveAction] = useState<string | null>(null);
    const [expenseMode, setExpenseMode] = useState<'NONE' | 'MANUAL' | 'SCAN'>('NONE');
    const [expenseItems, setExpenseItems] = useState<any[]>([]);
    const [isSavingExpenses, setIsSavingExpenses] = useState(false);
    const [isExpenseExpanded, setIsExpenseExpanded] = useState(false);
    const [isScanning, setIsScanning] = useState(false);
    // Removed unused scannedImageUrls state
    const [expandedReceiptId, setExpandedReceiptId] = useState<string | null>(null);
    
    // AI Review State
    const [expandedLogicIndex, setExpandedLogicIndex] = useState<number | null>(null);
    const [isApprovingAI, setIsApprovingAI] = useState(false);
    const [isReloadingAI, setIsReloadingAI] = useState(false);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [editableItems, setEditableItems] = useState<any[]>([]);
    const [isEditingCategorization, setIsEditingCategorization] = useState(false);
    const [isSubmittingChange, setIsSubmittingChange] = useState(false);

    const [isAccountDropdownOpen, setIsAccountDropdownOpen] = useState<number | null>(null);
    const [accountSearch, setAccountSearch] = useState('');
    const [isAICategorizationExpanded, setIsAICategorizationExpanded] = useState(true);
    
    // QuickBooks State
    const [paymentAccountId, setPaymentAccountId] = useState('');
    const [isPostingQB, setIsPostingQB] = useState(false);
    const [qbAccounts, setQbAccounts] = useState<any[]>([]);
    const [qbFetchError, setQbFetchError] = useState<string | null>(null);
    const [isQBCreditDropdownOpen, setIsQBCreditDropdownOpen] = useState(false);
    const [qbCreditSearch, setQBCreditSearch] = useState('');
    
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

    useEffect(() => {
        if (isSystem && message.metadata?.stage === 'AI_REVIEW') {
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
                    category_name: item.category_name || accounts.find(a => a.code === item.category_code)?.name || 'Unknown Account'
                })));
            }
        }
    }, [message.metadata?.stage, message.metadata?.items]);
    
    const stage = message.metadata?.stage;
    const isQBPosting = stage === 'QUICKBOOKS_POSTING';

    useEffect(() => {
        if (isQBPosting && qbAccounts.length === 0 && !qbFetchError) {
            const fetchQBAccounts = async () => {
                try {
                    const [accounts, status] = await Promise.all([
                        integrationService.getAccounts(),
                        integrationService.getStatus()
                    ]);
                    setQbAccounts(accounts || []);
                    setQbFetchError(null);
                    const mappings = status.config?.mappings || {};
                    
                    const method = requisitionData?.payment_method || (requisitionData?.disbursements && requisitionData.disbursements[0]?.method) || 'UNKNOWN';
                    
                    if (mappings[method]) {
                        setPaymentAccountId(mappings[method].id);
                    } 
                    else if (method === 'WALLET' || method === 'MONEYWISE_WALLET') {
                        const walletAcc = accounts.find((a: any) => 
                            a.Name.toLowerCase().includes('wallet') || 
                            a.Name.toLowerCase().includes('moneywise')
                        );
                        if (walletAcc) {
                            setPaymentAccountId(walletAcc.Id);
                        }
                    } 
                    else if (accounts.length > 0) {
                        const bankAcc = accounts.find((a: any) => a.AccountType === 'Bank') || accounts[0];
                        if (bankAcc) setPaymentAccountId(bankAcc.Id);
                    }
                } catch (err: any) {
                    console.error('Failed to fetch QB accounts:', err);
                    setQbFetchError(err.message || 'Failed to connect to QuickBooks API');
                }
            };
            fetchQBAccounts();
        }
    }, [isQBPosting, requisitionData, qbAccounts.length, qbFetchError]);

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

    useEffect(() => {
        if (expenseMode !== 'NONE' && requisitionData?.items) {
            setExpenseItems(prev => {
                if (prev.length === 0) {
                    return requisitionData.items.map((item: any) => ({
                        ...item,
                        actual_amount: item.actual_amount || item.unit_price * item.quantity
                    }));
                }
                
                let hasChanges = false;
                const newItems = prev.map(p => {
                    const updatedItem = requisitionData.items?.find((i: any) => i.id === p.id);
                    if (updatedItem && (
                        updatedItem.ai_extracted_amount !== p.ai_extracted_amount ||
                        JSON.stringify(updatedItem.receipt_ocr_data) !== JSON.stringify(p.receipt_ocr_data)
                    )) {
                        hasChanges = true;
                        return {
                            ...p,
                            ai_extracted_amount: updatedItem.ai_extracted_amount,
                            receipt_ocr_data: updatedItem.receipt_ocr_data
                        };
                    }
                    return p;
                });
                
                return hasChanges ? newItems : prev;
            });
        }
    }, [requisitionData?.items, expenseMode]);

    useEffect(() => {
        if (paymentType === 'MOBILE_MONEY' && recipientValue) {
            const clean = recipientValue.replace(/[^0-9]/g, '');
            const normalized = clean.startsWith('260') ? '0' + clean.substring(3) : clean;
            let operator: string | null = null;
            if (normalized.startsWith('097') || normalized.startsWith('077')) operator = 'AIRTEL';
            else if (normalized.startsWith('096') || normalized.startsWith('076')) operator = 'MTN';
            else if (normalized.startsWith('095') || normalized.startsWith('075')) operator = 'ZAMTEL';
            
            if (operator && recipientProvider !== operator) {
                setRecipientProvider(operator);
            }
        }
    }, [recipientValue, paymentType, recipientProvider]);

    useEffect(() => {
        if (paymentType === 'MOBILE_MONEY' && recipientValue && recipientProvider && !lookupName && !isLookingUp) {
            const clean = recipientValue.replace(/[^0-9]/g, '');
            const normalized = clean.startsWith('260') ? '0' + clean.substring(3) : clean;
            
            if (normalized.length === 10) {
                const resolveName = async () => {
                    setIsLookingUp(true);
                    try {
                        const res = await lencoService.resolveMobileMoney(normalized, recipientProvider, requisitionData?.organization_id);
                        setLookupName(res.accountName || res.account_name || res.name);
                    } catch (err) {
                        setLookupName('Name not found');
                    } finally {
                        setIsLookingUp(false);
                    }
                };
                resolveName();
            }
        }
    }, [recipientValue, paymentType, recipientProvider, lookupName, isLookingUp, requisitionData?.organization_id]);

    useEffect(() => {
        const stage = message.metadata?.stage;
        const content = message.content?.trim();
        const isDisbursal = stage === 'DISBURSAL' || stage === 'DISBURSAL_SUCCESS' || 
                           content === 'Status updated to AUTHORISED' || 
                           content === 'How would you like to disburse these funds?';

        if (requisitionData && isDisbursal) {
            if (!recipientValue && requisitionData.recipient_account) {
                setRecipientValue(requisitionData.recipient_account);
            }
            
            if (!recipientProvider && requisitionData.recipient_bank_code) {
                const provider = requisitionData.recipient_bank_code.toUpperCase();
                setRecipientProvider(provider);
                
                if (['AIRTEL', 'MTN', 'ZAMTEL'].includes(provider)) {
                    setPaymentType('MOBILE_MONEY');
                } else {
                    setPaymentType('BANK');
                }
            }
            
            if (!activeMethod && requisitionData.payment_method) {
                const method = requisitionData.payment_method === 'WALLET' ? 'MONEYWISE_WALLET' : requisitionData.payment_method;
                setActiveMethod(method);
            } else if (!activeMethod && isDisbursal) {
                setActiveMethod('MONEYWISE_WALLET');
            }
            
            if (!lookupName && requisitionData.recipient_name) {
                setLookupName(requisitionData.recipient_name);
            }
        }
    }, [requisitionData, message.metadata, message.content, activeMethod, recipientValue, recipientProvider, lookupName]);

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

    const processImageFile = async (file: File): Promise<{ blob: Blob | File; fileName: string }> => {
        const fileExt = file.name.split('.').pop()?.toLowerCase();
        let fileToProcess: Blob | File = file;
        let finalFileName = file.name;
        
        if (fileExt === 'heic' || fileExt === 'heif') {
            try {
                const convertedBlob = await heic2any({
                    blob: file,
                    toType: 'image/jpeg',
                    quality: 0.8
                });
                
                fileToProcess = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
                finalFileName = file.name.replace(/\.(heic|heif)$/i, '.jpg');
            } catch (err) {
                console.error('HEIC conversion failed:', err);
                return { blob: file, fileName: file.name };
            }
        }
        
        if (file.type.startsWith('image/') || finalFileName.endsWith('.jpg')) {
            try {
                const resizedBlob = await new Promise<Blob>((resolve, reject) => {
                    const img = new window.Image();
                    const objectUrl = URL.createObjectURL(fileToProcess as Blob);
                    
                    img.onload = () => {
                        URL.revokeObjectURL(objectUrl);
                        const canvas = document.createElement('canvas');
                        let { width, height } = img;
                        const MAX_DIMENSION = 1600;

                        if (width > height && width > MAX_DIMENSION) {
                            height *= MAX_DIMENSION / width;
                            width = MAX_DIMENSION;
                        } else if (height > MAX_DIMENSION) {
                            width *= MAX_DIMENSION / height;
                            height = MAX_DIMENSION;
                        }

                        canvas.width = width;
                        canvas.height = height;
                        const ctx = canvas.getContext('2d');
                        if (!ctx) return reject(new Error('No canvas context'));
                        
                        ctx.drawImage(img, 0, 0, width, height);
                        canvas.toBlob(
                            (blob) => {
                                if (blob) resolve(blob);
                                else reject(new Error('Canvas toBlob failed'));
                            },
                            'image/jpeg',
                            0.8
                        );
                    };
                    img.onerror = () => {
                        URL.revokeObjectURL(objectUrl);
                        reject(new Error('Image load failed'));
                    };
                    img.src = objectUrl;
                });
                return { blob: resizedBlob, fileName: finalFileName.replace(/\.[^/.]+$/, '.jpg') };
            } catch (resizeErr) {
                console.error('Image resize failed:', resizeErr);
                return { blob: fileToProcess, fileName: finalFileName };
            }
        }

        return { blob: fileToProcess, fileName: finalFileName };
    };

    const handleScanUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        try {
            setIsScanning(true);
            const urls: string[] = [];

            for (let i = 0; i < files.length; i++) {
                const { blob, fileName: processedName } = await processImageFile(files[i]);
                const fileExt = processedName.split('.').pop();
                const fileName = `${requisitionData?.id}/scans/${Date.now()}_${i}.${fileExt}`;

                const { error } = await supabase.storage
                    .from('receipts')
                    .upload(fileName, blob);

                if (error) throw error;
                urls.push(fileName);
            }

            await requisitionService.scanReceipts(requisitionData.id, urls);
            
            if (onAction) onAction('REFRESH');
            setExpenseMode('SCAN');
        } catch (err: any) {
            console.error('OCR Scanning failed:', err);
            window.alert('AI Receipt Scanning failed: ' + (err.message || 'Please try manual entry or re-upload.'));
        } finally {
            setIsScanning(false);
        }
    };

    const [isManualScanning, setIsManualScanning] = useState(false);
    const handleDeleteReceipt = async (receiptId: string) => {
        if (!window.confirm('Are you sure you want to delete this receipt?')) return;

        try {
            await requisitionService.deleteReceipt(requisitionData.id, receiptId);
            if (onAction) onAction('REFRESH');
        } catch (err: any) {
            console.error('Delete receipt failed:', err);
            window.alert(err.message || 'Failed to delete receipt');
        }
    };

    const handleReprocess = async () => {
        if (!requisitionData?.receipts || requisitionData.receipts.length === 0) return;

        try {
            setIsManualScanning(true);
            const urls = requisitionData.receipts.map((r: any) => r.file_url);
            await requisitionService.scanReceipts(requisitionData.id, urls);
            if (onAction) onAction('REFRESH');
        } catch (err: any) {
            console.error('Reprocess failed:', err);
            window.alert(err.message || 'Failed to reprocess receipts');
        } finally {
            setIsManualScanning(false);
        }
    };

    const handleManualScanUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        try {
            setIsManualScanning(true);
            const urls: string[] = [];

            for (let i = 0; i < files.length; i++) {
                const { blob, fileName: processedName } = await processImageFile(files[i]);
                const fileExt = processedName.split('.').pop();
                const fileName = `${requisitionData?.id}/manual_scans/${Date.now()}_${i}.${fileExt}`;

                const { error } = await supabase.storage
                    .from('receipts')
                    .upload(fileName, blob);

                if (error) throw error;
                urls.push(fileName);
            }

            await requisitionService.scanReceipts(requisitionData.id, urls);
            
            if (onAction) onAction('REFRESH');
        } catch (err: any) {
            console.error('Manual OCR Scanning failed:', err);
            window.alert('Background AI analysis failed: ' + (err.message || 'your images were saved but analysis could not complete.'));
        } finally {
            setIsManualScanning(false);
        }
    };

    const getReceiptUrl = (fileUrl: string) => {
        if (!fileUrl) return '';
        const path = fileUrl.startsWith('receipts/') ? fileUrl.substring(9) : fileUrl;
        return supabase.storage.from('receipts').getPublicUrl(path).data.publicUrl;
    };

    const LENCO_MIN_TRANSFER = 5;

    const handleDisburse = async () => {
        if (!requisitionData?.id || !activeMethod) return;

        const isLencoTransfer = activeMethod === 'MONEYWISE_WALLET' || activeMethod === 'MOBILE_MONEY';
        if (isLencoTransfer && Number(requisitionData.estimated_total) < LENCO_MIN_TRANSFER) {
            setDisburseError(`The disbursement amount (K${requisitionData.estimated_total}) is below the minimum transfer amount of K${LENCO_MIN_TRANSFER}. Please use a different payment method or raise a new requisition for at least K${LENCO_MIN_TRANSFER}.`);
            return;
        }

        setIsProcessing(true);
        setDisburseError(null);
        setDisburseStatusMsg(null);

        const cleanPhone = recipientValue.replace(/[^0-9]/g, '');
        const normalizedPhone = cleanPhone.startsWith('260') ? '0' + cleanPhone.substring(3) : cleanPhone;

        const recipientBankCode = (() => {
            if (activeMethod === 'MONEYWISE_WALLET' || activeMethod === 'MOBILE_MONEY') {
                return (recipientProvider || '').toLowerCase();
            }
            return recipientProvider || undefined;
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
                }

                if (!resolved) {
                    setDisburseStatusMsg('Transfer is still processing. It will complete shortly.');
                }
            }

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
                title: 'Insufficient Funds in Lenco Account',
                body: 'Your actual Lenco bank account does not have enough funds to complete this transfer. Even if your MoneyWise ledger shows a positive balance, real funds must be present in Lenco. Please deposit funds into your Lenco account and try again.',
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
        
        const isCreation = stage === 'APPROVAL' || content === 'Requisition created' || content === 'Requisition submitted for approval';
        const isDisbursal = stage === 'DISBURSAL' || stage === 'DISBURSAL_SUCCESS' || content === 'Status updated to AUTHORISED' || content === 'How would you like to disburse these funds?';
        const isExpenseTracking = stage === 'EXPENSE_TRACKING' || (content?.includes('needs to be expensed') && !stage);
        const isAIReview = message.metadata?.stage === 'AI_REVIEW';
        const isQBPosting = message.metadata?.stage === 'QUICKBOOKS_POSTING';
        const isPrivileged = userRole === 'ADMIN' || userRole === 'ACCOUNTANT' || userRole === 'CASHIER' || userRole === 'MANAGER';
        const isExpenseSummary = stage === 'EXPENSE_SUMMARY';

        if (!isPrivileged && (isAIReview || isQBPosting)) {
            return null;
        }

        if (isCreation) {
            const showActions = canAction && (status === 'DRAFT' || status === 'PENDING_APPROVAL');

            return (
                <div className="flex flex-col mb-6 w-full max-w-2xl animate-in fade-in slide-in-from-left-4 duration-500">
                    <div className="bg-white border border-gray-100 rounded-[20px] md:rounded-[16px] md:rounded-tl-none shadow-[0_4px_16px_-4px_rgba(0,0,0,0.04)] overflow-hidden transition-all duration-300 w-full md:w-auto">
                        <div className="px-6 pt-4 pb-1.5 flex items-center space-x-2.5">
                            <div className="w-7 h-7 rounded-full bg-[#FFE3E3] flex items-center justify-center text-[#E56B6B] border border-red-50 shadow-sm">
                                <User size={14} strokeWidth={2.5} />
                            </div>
                            <div className="flex items-center space-x-2">
                                <span className="text-[12px] font-semibold text-gray-900 tracking-tight">
                                    {requisitionData?.requestor_name || 'System User'}
                                </span>
                                
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

                        <div 
                            className="px-6 pb-4 flex items-center justify-between cursor-pointer md:cursor-pointer group"
                            onClick={() => window.innerWidth >= 768 && setIsExpanded(!isExpanded)}
                        >
                            <h3 className="text-[14px] md:text-[15px] font-normal md:font-bold text-gray-900 leading-tight flex-1 pr-4 transition-colors">
                                {requisitionData?.description || 'Purchase Requisition'}
                            </h3>
                            <div className="flex items-center space-x-3">
                                {(isRejected || currentStatus === 'AUTHORISED') && isPrivileged && !requisitionData?.disbursements?.length && (
                                    <button 
                                        onClick={async (e) => {
                                            e.stopPropagation();
                                            if (confirm('Reverting to draft will allow editing. Proceed?')) {
                                                try {
                                                    await requisitionService.revertToDraft(requisitionData.id);
                                                    if (onAction) onAction('REFRESH');
                                                } catch (err: any) {
                                                    alert(err.message);
                                                }
                                            }
                                        }}
                                        className="p-1.5 text-gray-300 hover:text-[#006AFF] transition-colors"
                                        title="Revert to Draft"
                                    >
                                        <RotateCcw size={16} />
                                    </button>
                                )}
                                <span className="text-[15px] md:text-[16px] font-normal md:font-black text-gray-900 tracking-tight">
                                    K{requisitionData?.estimated_total?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                                <div className={`hidden md:flex p-0.5 rounded-full transition-transform duration-300 ${isExpanded ? 'rotate-180 bg-gray-50' : 'bg-transparent group-hover:bg-gray-50'}`}>
                                    <ChevronDown size={18} className="text-gray-400 group-hover:text-gray-900" />
                                </div>
                            </div>
                        </div>

                        {isExpanded && (
                            <div className="px-6 pb-6 animate-in fade-in slide-in-from-top-2 duration-400">
                                <div className="rounded-xl border border-gray-100 overflow-hidden mb-6">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="bg-gray-50/80">
                                                <th className="px-4 py-2.5 text-[9px] font-medium text-gray-400 uppercase tracking-widest border-b border-gray-100">Description</th>
                                                <th className="px-4 py-2.5 text-[9px] font-medium text-gray-400 uppercase tracking-widest text-center border-b border-gray-100">Qty</th>
                                                <th className="px-4 py-2.5 text-[9px] font-medium text-gray-400 uppercase tracking-widest text-right border-b border-gray-100">Total</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50">
                                            {requisitionData?.items?.map((item: any, idx: number) => (
                                                <tr key={idx} className="hover:bg-gray-50/30 transition-colors">
                                                    <td className="px-4 py-2.5 text-[12px] font-normal text-gray-700">{item.description}</td>
                                                    <td className="px-4 py-2.5 text-[12px] font-normal text-gray-500 text-center">{item.quantity}</td>
                                                    <td className="px-4 py-2.5 text-[12px] font-medium text-gray-900 text-right">K{item.unit_price?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                                </tr>
                                            ))}
                                            {(!requisitionData?.items || requisitionData.items.length === 0) && (
                                                <tr>
                                                    <td colSpan={3} className="px-4 py-6 text-center text-gray-400 text-xs italic font-medium">No items listed</td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>

                                {isPastApproval ? (
                                    <div className={`mt-4 py-3 px-5 rounded-[18px] flex items-center justify-between transition-all duration-500 ${
                                        isRejected ? 'bg-red-50/20 border border-red-50' : 'bg-emerald-50/20 border border-emerald-50'
                                    }`}>
                                        <div className="flex items-center space-x-2.5">
                                            <div className={`w-7 h-7 rounded-full flex items-center justify-center ${
                                                isRejected ? 'bg-red-50' : 'bg-emerald-50'
                                            }`}>
                                                {isRejected ? <X size={14} className="text-red-500" /> : <Check size={14} className="text-emerald-500" />}
                                            </div>
                                            <div>
                                                <p className="text-[12px] font-bold text-gray-900">
                                                    {isRejected ? 'Requisition Rejected' : 'Requisition Approved'}
                                                </p>
                                                <p className="text-[10px] text-gray-500 font-medium tracking-tight">
                                                    {isRejected ? 'This request was declined' : 'This request was authorized'}
                                                </p>
                                            </div>
                                        </div>
                                        <div className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest ${
                                            isRejected ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'
                                        }`}>
                                            {isRejected ? 'Rejected' : 'Authorized'}
                                        </div>
                                    </div>
                                ) : (
                                  showActions && (
                                        <div className="flex space-x-3 mt-4">
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); handleActionClick('REJECT'); }}
                                                disabled={!!activeAction}
                                                className="flex-1 flex items-center justify-center px-6 py-2 bg-[#F5F5F7] text-gray-700 text-[13px] font-bold rounded-full hover:bg-gray-200 disabled:opacity-50 h-11"
                                            >
                                                {activeAction === 'REJECT' ? <Loader2 size={16} className="animate-spin text-gray-400" /> : 'Decline'}
                                            </button>
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); handleActionClick('APPROVE'); }}
                                                disabled={!!activeAction}
                                                className="flex-1 flex items-center justify-center px-6 py-2 bg-[#006AFF] text-white text-[13px] font-bold rounded-full hover:bg-[#0052cc] disabled:opacity-50 h-11"
                                            >
                                                {activeAction === 'APPROVE' ? <Loader2 size={16} className="animate-spin text-white" /> : 'Accept'}
                                            </button>
                                        </div>
                                    )
                                )}

                                {(isRejected || currentStatus === 'AUTHORISED') && isPrivileged && !requisitionData?.disbursements?.length && (
                                    <div className="mt-4 flex items-center justify-end">
                                        <button 
                                            onClick={async (e) => {
                                                e.stopPropagation();
                                                if (confirm('Reverting to draft will allow editing. Proceed?')) {
                                                    try {
                                                        await requisitionService.revertToDraft(requisitionData.id);
                                                        if (onAction) onAction('REFRESH');
                                                    } catch (err: any) {
                                                        alert(err.message);
                                                    }
                                                }
                                            }}
                                            className="flex items-center space-x-1.5 px-3 py-1.5 bg-gray-50 text-gray-400 hover:text-[#006AFF] hover:bg-blue-50 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all"
                                        >
                                            <RotateCcw size={12} />
                                            <span>Revert to Draft</span>
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                    <div className="mt-2.5 ml-1 flex items-center space-x-3">
                        <span className="text-[11px] font-medium text-gray-900 uppercase tracking-widest opacity-60">
                            {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {message.metadata?.isRepaired && (
                            <div className="flex items-center space-x-2">
                                <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-400 text-[9px] font-bold uppercase tracking-wider">Automated Repair</span>
                                {new Date().getTime() - new Date(message.created_at).getTime() < 24 * 60 * 60 * 1000 && (
                                    <button 
                                        onClick={async () => {
                                            if (confirm('Are you sure you want to undo this automatic repair?')) {
                                                try {
                                                    await requisitionService.deleteMessage(message.requisition_id, message.id);
                                                    if (onAction) onAction('REFRESH');
                                                } catch (err: any) {
                                                    alert(err.message);
                                                }
                                            }
                                        }}
                                        className="text-gray-300 hover:text-red-500 transition-colors p-1"
                                        title="Undo Repair"
                                    >
                                        <RotateCcw size={12} />
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            );
        }

        else if (isDisbursal) {
            return (
                <div className="flex flex-col mb-8 w-full max-w-2xl animate-in fade-in slide-in-from-left-4 duration-500">
                    <div className="bg-white border border-gray-100 rounded-[20px] rounded-tl-none shadow-[0_4px_20px_-4px_rgba(0,0,0,0.06)] overflow-hidden transition-all duration-300">
                        <div className="px-8 py-8">
                            <div className="flex items-center space-x-3 mb-4">
                                <div className="w-7 h-7 rounded-full bg-blue-50 flex items-center justify-center text-[#006AFF] border border-blue-50 shadow-sm">
                                    <Smartphone size={14} strokeWidth={2.5} />
                                </div>
                                <div className="flex-1 flex items-center justify-between">
                                    <span className="text-[12px] font-semibold text-gray-900 tracking-tight">Finance System</span>
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
                                        
                                            <div className="flex items-center space-x-4">
                                                <button 
                                                    onClick={() => setIsExpanded(!isExpanded)}
                                                    className="flex items-center space-x-2 text-[11px] font-bold uppercase tracking-widest text-[#006AFF] hover:opacity-80 transition-opacity"
                                                >
                                                    <span>{isExpanded ? 'Hide Details' : 'Show Details'}</span>
                                                    <ChevronDown size={14} className={`transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
                                                </button>

                                                {isRejected && isPrivileged && (
                                                    <button 
                                                        onClick={async (e) => {
                                                            e.stopPropagation();
                                                            if (confirm('Reverting to draft will allow editing. Proceed?')) {
                                                                try {
                                                                    await requisitionService.revertToDraft(requisitionData.id);
                                                                    if (onAction) onAction('REFRESH');
                                                                } catch (err: any) {
                                                                    alert(err.message);
                                                                }
                                                            }
                                                        }}
                                                        className="flex items-center space-x-1.5 text-[11px] font-bold uppercase tracking-widest text-gray-400 hover:text-[#006AFF] transition-colors"
                                                    >
                                                        <RotateCcw size={14} />
                                                        <span>Revert to Draft</span>
                                                    </button>
                                                )}
                                            </div>
                                    </div>

                                    {isExpanded && (
                                        <div className="mt-6 animate-in fade-in slide-in-from-top-2 duration-400">
                                            {requisitionData?.disbursements?.[0] ? (
                                                <div className="rounded-2xl border border-gray-100 overflow-hidden bg-gray-50/30">
                                                    <table className="w-full text-left border-collapse">
                                                        <tbody className="divide-y divide-gray-50">
                                                            <tr className="hover:bg-white/50 transition-colors">
                                                                <td className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Funds Disbursed</td>
                                                                <td className="px-6 py-4 text-[13px] font-black text-gray-900 text-right">K{requisitionData.disbursements[0].total_prepared?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                                            </tr>
                                                            <tr className="hover:bg-white/50 transition-colors">
                                                                <td className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Method</td>
                                                                <td className="px-6 py-4 text-[13px] font-bold text-gray-700 text-right">{requisitionData.disbursements[0].payment_method || 'CASH'}</td>
                                                            </tr>
                                                            <tr className="hover:bg-white/50 transition-colors">
                                                                <td className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Reference</td>
                                                                <td className="px-6 py-4 text-[13px] font-mono font-bold text-[#006AFF] text-right">{requisitionData.disbursements[0].external_reference || 'N/A'}</td>
                                                            </tr>
                                                            {requisitionData.disbursements[0].recipient_account && (
                                                                <tr className="hover:bg-white/50 transition-colors">
                                                                    <td className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Recipient</td>
                                                                    <td className="px-6 py-4 text-[13px] font-bold text-gray-700 text-right">
                                                                        {requisitionData.disbursements[0].recipient_account_name ? `${requisitionData.disbursements[0].recipient_account_name} (${requisitionData.disbursements[0].recipient_account})` : requisitionData.disbursements[0].recipient_account}
                                                                    </td>
                                                                </tr>
                                                            )}
                                                            <tr className="hover:bg-white/50 transition-colors">
                                                                <td className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Status</td>
                                                                <td className="px-6 py-4 text-right">
                                                                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-emerald-100 text-emerald-600 border border-emerald-200">SUCCESS</span>
                                                                </td>
                                                            </tr>
                                                        </tbody>
                                                    </table>
                                                </div>
                                            ) : (
                                                <div className="py-12 px-6 border border-dashed border-gray-200 rounded-[24px] flex flex-col items-center justify-center text-center bg-gray-50/50">
                                                    <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center mb-3">
                                                        <Loader2 size={20} className="text-[#006AFF] animate-spin" />
                                                    </div>
                                                    <h5 className="text-[14px] font-bold text-gray-900 mb-1">Finalizing Transaction Details</h5>
                                                    <p className="text-[12px] text-gray-500 max-w-[240px]">
                                                        The transfer was successful. We are currently syncing the final transaction data with our ledger. This usually takes a few seconds.
                                                    </p>
                                                    <button 
                                                        onClick={() => onAction?.('REFRESH')}
                                                        className="mt-4 px-4 py-2 bg-white border border-gray-200 rounded-xl text-[11px] font-bold text-[#006AFF] hover:bg-gray-50 transition-colors shadow-sm"
                                                    >
                                                        Refresh Data
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </>
                            ) : (
                                <>
                                    <div className="flex items-center justify-between mb-8">
                                        <h3 className="text-[14px] font-normal text-gray-900 leading-tight">
                                            {activeMethod ? 'Confirm Disbursal Details' : 'How would you like to disburse these funds?'}
                                        </h3>
                                        
                                        {isPrivileged && (
                                            <button 
                                                onClick={async (e) => {
                                                    e.stopPropagation();
                                                    if (confirm('Reverting to draft will allow editing. Proceed?')) {
                                                        try {
                                                            await requisitionService.revertToDraft(requisitionData.id);
                                                            if (onAction) onAction('REFRESH');
                                                        } catch (err: any) {
                                                            alert(err.message);
                                                        }
                                                    }
                                                }}
                                                className="flex items-center space-x-1.5 px-3 py-1.5 bg-gray-50 text-gray-400 hover:text-[#006AFF] hover:bg-blue-50 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all"
                                            >
                                                <RotateCcw size={12} />
                                                <span>Revert</span>
                                            </button>
                                        )}
                                    </div>

                                    {requisitionData?.organization?.payment_test_mode && (
                                        <div className="mb-6 p-4 rounded-2xl bg-amber-50 border border-amber-100 flex items-start space-x-3 animate-pulse">
                                            <Beaker className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                                            <div>
                                                <p className="text-[12px] font-bold text-amber-900 leading-tight">Payment Simulation Active</p>
                                                <p className="text-[11px] text-amber-700 mt-1 font-medium leading-relaxed">
                                                    System is in debug mode. Disbursements will be simulated and no real funds will be moved.
                                                </p>
                                            </div>
                                        </div>
                                    )}

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
                                                {!isProcessing ? (
                                                    <div className="flex flex-col space-y-6">
                                                        <div className="flex p-1.5 bg-gray-100/80 rounded-full w-full">
                                                            <button 
                                                                onClick={() => setPaymentType('MOBILE_MONEY')} 
                                                                className={`flex-1 h-11 rounded-full text-[12px] font-black tracking-wider transition-all duration-300 ${paymentType === 'MOBILE_MONEY' ? 'bg-white text-[#006AFF] shadow-sm' : 'text-gray-500'}`}
                                                            >
                                                                MOBILE MONEY
                                                            </button>
                                                            <button 
                                                                onClick={() => setPaymentType('BANK')} 
                                                                className={`flex-1 h-11 rounded-full text-[12px] font-black tracking-wider transition-all duration-300 ${paymentType === 'BANK' ? 'bg-white text-[#006AFF] shadow-sm' : 'text-gray-500'}`}
                                                            >
                                                                BANK TRANSFER
                                                            </button>
                                                        </div>

                                                        <div className="flex flex-col space-y-2">
                                                            <label className="text-[9px] font-semibold text-gray-400 uppercase tracking-widest ml-4">Amount to disburse</label>
                                                            <div className="relative group">
                                                                <span className="absolute left-7 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-lg">K</span>
                                                                <input 
                                                                    type="text" 
                                                                    value={requisitionData?.estimated_total?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                                    readOnly
                                                                    className="w-full h-14 pl-14 pr-7 bg-white border border-gray-100 rounded-full text-[15px] font-bold text-gray-900 focus:outline-none focus:border-[#006AFF]/20 transition-all shadow-sm group-hover:border-gray-200"
                                                                />
                                                                <div className="absolute right-6 top-1/2 -translate-y-1/2 flex items-center space-x-1.5 px-3 py-1 bg-gray-50 rounded-full border border-gray-100">
                                                                    <span className="text-[9px] font-black text-gray-400 uppercase">Fee:</span>
                                                                    <span className="text-[11px] font-black text-gray-500">
                                                                        K{lencoService.calculatePayoutFee(Number(requisitionData?.estimated_total || 0), activeMethod || paymentType).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div className="flex flex-col space-y-2">
                                                            <label className="text-[9px] font-semibold text-gray-400 uppercase tracking-widest ml-4">
                                                                {paymentType === 'MOBILE_MONEY' ? 'Recipient Number' : 'Account Details'}
                                                            </label>
                                                            <div className="relative group">
                                                                <input 
                                                                    type="text" 
                                                                    placeholder={paymentType === 'MOBILE_MONEY' ? '097...' : 'Enter account number...'}
                                                                    value={recipientValue}
                                                                    onChange={(e) => {
                                                                        const value = e.target.value;
                                                                        setRecipientValue(value);
                                                                        setLookupName(null);
                                                                    }}
                                                                    className="w-full h-14 px-8 bg-white border border-gray-100 rounded-full text-[15px] font-bold text-gray-900 focus:outline-none focus:border-[#006AFF]/20 transition-all shadow-sm group-hover:border-gray-200"
                                                                />
                                                                <div className="absolute right-7 top-1/2 -translate-y-1/2 flex items-center space-x-2">
                                                                    {isLookingUp ? (
                                                                        <Loader2 size={18} className="text-[#006AFF] animate-spin" />
                                                                    ) : recipientProvider && (
                                                                        <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                                                            recipientProvider === 'AIRTEL' ? 'bg-red-50 text-red-500 border border-red-100' : 
                                                                            recipientProvider === 'MTN' ? 'bg-yellow-50 text-yellow-700 border border-yellow-100' : 
                                                                            'bg-emerald-50 text-emerald-600 border border-emerald-100'
                                                                        }`}>
                                                                            {recipientProvider}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            {lookupName && (
                                                                <div className="flex items-center space-x-2 ml-5 animate-in fade-in slide-in-from-left-2 duration-300">
                                                                    <div className={`w-1.5 h-1.5 rounded-full ${lookupName === 'Name not found' ? 'bg-red-500' : 'bg-emerald-500'}`}></div>
                                                                    <span className={`text-[12px] font-black uppercase tracking-widest ${lookupName === 'Name not found' ? 'text-red-600' : 'text-emerald-600'}`}>{lookupName}</span>
                                                                </div>
                                                            )}
                                                        </div>

                                                        <div className="flex items-center space-x-3 pt-4">
                                                            <button 
                                                                onClick={() => {
                                                                    setActiveMethod(null);
                                                                    setLookupName(null);
                                                                    setRecipientProvider(null);
                                                                    setRecipientValue('');
                                                                }}
                                                                className="flex-1 h-11 px-6 bg-[#F5F5F7] text-gray-700 text-[13px] font-bold rounded-full hover:bg-gray-200 transition-all flex items-center justify-center border border-gray-100"
                                                            >
                                                                Back
                                                            </button>
                                                            <button 
                                                                onClick={handleDisburse}
                                                                disabled={!recipientValue || (paymentType === 'MOBILE_MONEY' && !recipientProvider)}
                                                                className="flex-[2] h-11 bg-[#006AFF] text-white text-[13px] font-bold rounded-full hover:bg-[#0052cc] disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-100/50 flex items-center justify-center space-x-2"
                                                            >
                                                                <span>Send Money</span>
                                                                <ArrowRight size={18} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="flex flex-col items-center justify-center py-12 space-y-4 animate-in fade-in zoom-in-95 duration-500">
                                                        <div className="relative">
                                                            <div className="w-16 h-16 rounded-full border-4 border-blue-50 animate-pulse"></div>
                                                            <Loader2 className="w-16 h-16 text-[#006AFF] animate-spin absolute inset-0" strokeWidth={1.5} />
                                                        </div>
                                                        <div className="text-center space-y-1">
                                                            <p className="text-[16px] font-black text-gray-900 tracking-tight">Processing Disbursal</p>
                                                            {disburseStatusMsg && (
                                                                <p className="text-[13px] font-medium text-gray-500 animate-in fade-in duration-300">
                                                                    {disburseStatusMsg}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}

                                                {disburseError && !isProcessing && (() => {
                                                    const parsed = parseDisburseError(disburseError);
                                                    return (
                                                        <div className="mt-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                                            <div className="p-5 bg-red-50 border border-red-100 rounded-[20px]">
                                                                <div className="flex items-start space-x-3 mb-3">
                                                                    <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                                                                        <X size={14} className="text-red-600" strokeWidth={3} />
                                                                    </div>
                                                                    <div>
                                                                        <p className="text-[13px] font-bold text-red-800 leading-tight">{parsed.title}</p>
                                                                        <p className="text-[12px] text-red-700 mt-1 leading-relaxed">{parsed.body}</p>
                                                                    </div>
                                                                </div>
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

        else if (stage === 'EXPENSE_TRACKING' || (!stage && isExpenseTracking)) {
            return (
                <div className="flex flex-col mb-8 w-full max-w-2xl animate-in fade-in slide-in-from-left-4 duration-500">
                    <div className="bg-white border border-gray-100 rounded-[20px] rounded-tl-none shadow-[0_4px_20px_-4px_rgba(0,0,0,0.06)] overflow-hidden">
                        <div className="px-8 py-8">
                             <div className="flex items-center space-x-3 mb-4">
                                 <div className="w-7 h-7 rounded-full bg-blue-50 flex items-center justify-center text-[#006AFF] border border-blue-50 shadow-sm">
                                     <FileText size={14} strokeWidth={2.5} />
                                 </div>
                                 <div className="flex-1 flex items-center justify-between">
                                     <span className="text-[12px] font-semibold text-gray-900 tracking-tight">Finance System</span>
                                     {(['EXPENSED', 'CHANGE_SUBMITTED', 'CATEGORIZED', 'COMPLETED', 'ACCOUNTED'].includes(requisitionData?.status) || (Number(requisitionData?.actual_total) > 0)) && (
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
                                 <p className="text-[14px] font-normal text-gray-900 leading-tight">
                                     {(['EXPENSED', 'CHANGE_SUBMITTED', 'CATEGORIZED', 'COMPLETED', 'ACCOUNTED'].includes(requisitionData?.status) || (Number(requisitionData?.actual_total) > 0)) ? 'Transaction expenditure recorded.' : 'This transaction needs to be expensed.'}
                                 </p>
                             </div>
                            
                             {(['EXPENSED', 'CHANGE_SUBMITTED', 'CATEGORIZED', 'COMPLETED', 'ACCOUNTED'].includes(requisitionData?.status) || (Number(requisitionData?.actual_total) > 0)) ? (
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
                                                    <span className="font-normal md:font-bold text-gray-400 uppercase tracking-widest">Estimated Total</span>
                                                    <span className="font-normal md:font-bold text-gray-500">K{requisitionData?.estimated_total?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                                </div>
                                                <div className="flex justify-between items-center text-[12px]">
                                                    <span className="font-normal md:font-bold text-gray-400 uppercase tracking-widest">Actual Expenditure</span>
                                                    <span className="font-normal md:font-black text-gray-900">K{requisitionData?.actual_total?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                                </div>
                                                {requisitionData?.estimated_total > requisitionData?.actual_total && (
                                                    <div className="pt-3 mt-3 border-t border-gray-100 flex justify-between items-center">
                                                        <span className="text-[12px] font-normal md:font-black text-[#006AFF] uppercase tracking-widest">Change Balance</span>
                                                        <span className="text-[16px] font-normal md:font-black text-[#006AFF]">K{(requisitionData.estimated_total - requisitionData.actual_total).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                                    </div>
                                                )}

                                                {requisitionData?.status === 'EXPENSED' && requisitionData?.estimated_total > requisitionData?.actual_total && (
                                                    <div className="mt-6 pt-6 border-t border-gray-100 space-y-4 animate-in fade-in slide-in-from-top-4 duration-500">
                                                        <div className="bg-blue-50/50 rounded-2xl p-4 border border-blue-100">
                                                            <div className="flex items-center space-x-3 mb-2">
                                                                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-[#006AFF]">
                                                                    <Wallet size={16} />
                                                                </div>
                                                                <span className="text-[13px] font-bold text-gray-900">Return Change to Wallet</span>
                                                            </div>
                                                            <p className="text-[11px] text-gray-500 leading-relaxed">
                                                                Your expenses are less than the disbursed amount. Please return the remaining balance of 
                                                                <strong className="text-[#006AFF] ml-1">K{(requisitionData.estimated_total - requisitionData.actual_total).toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong> to your digital wallet to complete this requisition.
                                                            </p>
                                                        </div>

                                                        <button
                                                            onClick={async () => {
                                                                try {
                                                                    setIsSubmittingChange(true);
                                                                    const changeAmount = requisitionData.estimated_total - requisitionData.actual_total;
                                                                    await requisitionService.submitChange(
                                                                        requisitionData.id,
                                                                        {}, 
                                                                        changeAmount,
                                                                        'MONEYWISE_WALLET'
                                                                    );
                                                                    if (onAction) onAction('REFRESH');
                                                                } catch (err: any) {
                                                                    console.error('Failed to submit change:', err);
                                                                    window.alert(`Error: ${err.message}`);
                                                                } finally {
                                                                    setIsSubmittingChange(false);
                                                                }
                                                            }}
                                                            disabled={isSubmittingChange}
                                                            className="w-full h-14 bg-[#006AFF] text-white text-[14px] font-bold rounded-full hover:bg-blue-600 shadow-xl shadow-blue-100/50 transition-all flex items-center justify-center space-x-2 group"
                                                        >
                                                            {isSubmittingChange ? <Loader2 size={20} className="animate-spin" /> : (
                                                                <>
                                                                    <span>Submit K{(requisitionData.estimated_total - requisitionData.actual_total).toLocaleString()} to Wallet</span>
                                                                    <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                                                                </>
                                                            )}
                                                        </button>
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
                                        onClick={() => {
                                            const input = document.getElementById(`scan-upload-${requisitionData?.id}`);
                                            if (input) input.click();
                                        }}
                                        disabled={isScanning}
                                        className="h-12 px-6 bg-[#F5F5F7] text-gray-600 text-[13px] font-bold rounded-full hover:bg-gray-200 border border-gray-100 transition-all flex items-center justify-center space-x-2 disabled:opacity-50"
                                    >
                                        {isScanning ? <Loader2 size={16} className="animate-spin" /> : <Smartphone size={16} />}
                                        <span>{isScanning ? 'Scanning...' : 'Scan Receipts'}</span>
                                    </button>
                                    <input 
                                        id={`scan-upload-${requisitionData?.id}`}
                                        type="file" 
                                        multiple 
                                        accept="image/*" 
                                        className="hidden" 
                                        onChange={handleScanUpload}
                                    />
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
                                                    <th className="pb-3 text-[10px] font-black uppercase text-[#006AFF]/60 text-right w-24">AI Found (K)</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-50">
                                                {expenseItems.map((item, idx) => {
                                                    const hasDiscrepancy = item.ai_extracted_amount != null && 
                                                        Math.abs((parseFloat(item.actual_amount) || 0) - item.ai_extracted_amount) > 0.01;
                                                    
                                                    return (
                                                        <tr key={item.id || idx}>
                                                            <td className="py-4 text-[13px] font-medium text-gray-800">{item.description}</td>
                                                            <td className="py-4 text-[13px] text-gray-500 text-right">{item.quantity}</td>
                                                            <td className="py-4 text-right">
                                                                <div className="flex flex-col items-end">
                                                                    <input 
                                                                        type="number" 
                                                                        step="0.01"
                                                                        value={item.actual_amount}
                                                                        onChange={(e) => {
                                                                            const newItems = [...expenseItems];
                                                                            newItems[idx].actual_amount = parseFloat(e.target.value) || 0;
                                                                            setExpenseItems(newItems);
                                                                        }}
                                                                        className={`w-20 px-2 py-1 bg-white border ${hasDiscrepancy ? 'border-red-200 bg-red-50/30' : 'border-gray-100'} rounded text-[13px] font-black text-gray-900 text-right focus:border-[#006AFF]/30 focus:outline-none transition-colors`}
                                                                    />
                                                                    {hasDiscrepancy && (
                                                                        <span className="text-[9px] font-bold text-red-500 uppercase mt-1">Manual Audit Req</span>
                                                                    )}
                                                                </div>
                                                            </td>
                                                            <td className="py-4 text-right">
                                                                <div className={`px-2 py-1 rounded text-[13px] font-bold text-right ${item.ai_extracted_amount ? 'text-[#006AFF] bg-blue-50/50' : 'text-gray-300 italic'}`}>
                                                                    {item.ai_extracted_amount != null ? `K${item.ai_extracted_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : 'Not Found'}
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>

                                    <div className="mt-6 pt-6 border-t border-gray-100 space-y-3">
                                        <div className="flex justify-between items-center">
                                            <span className="text-[11px] font-normal md:font-bold text-gray-400 uppercase">Estimated Total</span>
                                            <span className="text-[13px] font-normal md:font-bold text-gray-400">K{requisitionData.estimated_total?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-[11px] font-normal md:font-bold text-gray-600 uppercase">Actual Total</span>
                                            <span className="text-[15px] font-normal md:font-black text-gray-900">K{expenseItems.reduce((sum: number, i: any) => sum + (parseFloat(i.actual_amount) || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                        </div>
                                        {requisitionData.estimated_total > expenseItems.reduce((sum: number, i: any) => sum + (parseFloat(i.actual_amount) || 0), 0) && (
                                            <div className="flex justify-between items-center p-3 bg-blue-50/50 rounded-2xl border border-blue-100">
                                                <span className="text-[11px] font-normal md:font-black text-[#006AFF] uppercase">Change to Submit</span>
                                                <span className="text-[15px] font-normal md:font-black text-[#006AFF]">K{(requisitionData.estimated_total - expenseItems.reduce((sum: number, i: any) => sum + (parseFloat(i.actual_amount) || 0), 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                            </div>
                                        )}
                                    </div>

                                    <button 
                                        onClick={async () => {
                                            try {
                                                setIsSavingExpenses(true);
                                                
                                                await requisitionService.updateExpenses(requisitionData.id, expenseItems.map((i: any) => ({
                                                    id: i.id,
                                                    actual_amount: i.actual_amount,
                                                    receipt_url: i.receipt_url
                                                })));
                                            
                                                const totalActual = expenseItems.reduce((sum: number, item: any) => sum + (parseFloat(item.actual_amount) || 0), 0);
                                                if (totalActual >= (requisitionData?.estimated_total || 0)) {
                                                    await requisitionService.updateStatus(requisitionData.id, 'CHANGE_SUBMITTED');
                                                }

                                                if (onAction) onAction('REFRESH');
                                                setExpenseMode('NONE');
                                            } catch (err: any) {
                                                console.error('Save expenses failed:', err);
                                                window.alert(err.message || 'Failed to save expenses.');
                                            } finally {
                                                setIsSavingExpenses(false);
                                            }
                                        }}
                                        disabled={isSavingExpenses || isManualScanning}
                                        className="w-full mt-6 h-12 bg-[#006AFF] text-white text-[13px] font-bold rounded-full hover:bg-[#0052cc] transition-all disabled:opacity-50 shadow-lg shadow-blue-100"
                                    >
                                        {isSavingExpenses ? <Loader2 size={18} className="animate-spin mx-auto text-white" /> : 'Confirm Expenses'}
                                    </button>

                                    {/* Muti-document upload section */}
                                    <div className="mt-4 pt-4 border-t border-gray-50">
                                        <div className="flex items-center justify-between mb-4">
                                            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Attached Receipts</span>
                                            {isManualScanning && (
                                                <div className="flex items-center space-x-2">
                                                    <Loader2 size={12} className="animate-spin text-[#006AFF]" />
                                                    <span className="text-[10px] font-bold text-[#006AFF] uppercase animate-pulse">AI Checking...</span>
                                                </div>
                                            )}
                                        </div>

                                        {requisitionData?.receipts?.length > 0 && (
                                            <div className="flex flex-col gap-3 mb-4">
                                                {requisitionData.receipts.map((receipt: any) => {
                                                    const isExpanded = expandedReceiptId === receipt.id;
                                                    const ocr = receipt.ocr_data;
                                                    
                                                    // Find matches for this specific receipt using the source_receipt_id stored by the AI match
                                                    const matchedItems = expenseItems.filter(item => 
                                                        item.receipt_ocr_data?.source_receipt_id === receipt.id
                                                    );

                                                    return (
                                                    <div key={receipt.id} className="border border-gray-100 rounded-2xl bg-white overflow-hidden shadow-sm transition-all">
                                                        <div className="flex items-center p-3 gap-4">
                                                            {/* Image on far left */}
                                                            <div 
                                                                className="w-16 h-16 rounded-xl overflow-hidden bg-gray-50 flex-shrink-0 relative group cursor-pointer border border-gray-100" 
                                                                onClick={() => window.open(getReceiptUrl(receipt.file_url), '_blank')}
                                                                title="Click to view full image"
                                                            >
                                                                <img 
                                                                    src={getReceiptUrl(receipt.file_url)} 
                                                                    alt="Receipt" 
                                                                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                                                                />
                                                                <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                                                    <FileText size={12} className="text-white" />
                                                                </div>
                                                            </div>

                                                            {/* Summary info */}
                                                            <div className="flex-1 min-w-0">
                                                                <h4 className="text-[13px] font-bold text-gray-900 truncate">{ocr?.vendor || 'Receipt Uploaded'}</h4>
                                                                <div className="flex items-center gap-2 mt-1">
                                                                    {ocr?.total_amount ? (
                                                                        <span className="text-[11px] font-black text-[#006AFF] bg-blue-50 px-2 py-0.5 rounded-full">K{ocr.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                                                    ) : (
                                                                        <span className="text-[11px] text-gray-400 italic">No total found</span>
                                                                    )}
                                                                    {ocr?.date && <span className="text-[10px] text-gray-400">{ocr.date}</span>}
                                                                </div>
                                                            </div>

                                                            {/* Actions */}
                                                            <div className="flex items-center gap-1">
                                                                <button 
                                                                    onClick={() => setExpandedReceiptId(isExpanded ? null : receipt.id)}
                                                                    className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-1 ${isExpanded ? 'bg-blue-100 text-[#006AFF]' : 'bg-gray-50 text-gray-500 hover:bg-blue-50 hover:text-[#006AFF]'}`}
                                                                >
                                                                    {isExpanded ? 'Hide Data' : 'View Data'}
                                                                    <ChevronDown size={14} className={`transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
                                                                </button>
                                                                <button 
                                                                    onClick={() => handleDeleteReceipt(receipt.id)}
                                                                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                                    title="Delete Receipt"
                                                                >
                                                                    <X size={14} />
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {/* Expanded Data Area */}
                                                        {isExpanded && (
                                                            <div className="p-4 bg-gray-50 border-t border-gray-100 animate-in slide-in-from-top-2 duration-300">
                                                                {ocr?.error ? (
                                                                    <div className="text-[11px] text-red-600 bg-red-50 p-3 rounded-xl border border-red-100 flex items-start gap-2">
                                                                        <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
                                                                        <span>{ocr.error}</span>
                                                                    </div>
                                                                ) : ocr ? (
                                                                    <div className="space-y-4">
                                                                        {/* Extraction Results */}
                                                                        <div>
                                                                            <h5 className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2 flex items-center gap-1">
                                                                                <Sparkles size={10} className="text-[#006AFF]" /> AI Extraction
                                                                            </h5>
                                                                            <div className="grid grid-cols-2 gap-2 text-xs">
                                                                                <div className="bg-white p-2.5 rounded-xl border border-gray-100 shadow-sm">
                                                                                    <span className="text-gray-400 block text-[9px] uppercase font-bold mb-0.5">Vendor</span>
                                                                                    <span className="font-bold text-gray-900">{ocr?.vendor || '-'}</span>
                                                                                </div>
                                                                                <div className="bg-white p-2.5 rounded-xl border border-gray-100 shadow-sm">
                                                                                    <span className="text-gray-400 block text-[9px] uppercase font-bold mb-0.5">Total Amount</span>
                                                                                    <span className="font-black text-[#006AFF]">K{ocr?.total_amount != null ? ocr.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '-'}</span>
                                                                                </div>
                                                                            </div>
                                                                            
                                                                            {ocr?.line_items?.length > 0 && (
                                                                                <div className="mt-3">
                                                                                    <span className="text-gray-400 block text-[9px] uppercase font-bold mb-1.5">Receipt Line Items</span>
                                                                                    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm">
                                                                                        {ocr.line_items.map((item: any, i: number) => (
                                                                                            <div key={i} className="flex justify-between items-center text-[11px] p-2.5 border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                                                                                                <span className="truncate flex-1 pr-3 text-gray-700">{item.description}</span>
                                                                                                <span className="font-bold text-gray-900 whitespace-nowrap">K{item.total != null ? item.total.toLocaleString(undefined, { minimumFractionDigits: 2 }) : (item.unit_price || 0)}</span>
                                                                                            </div>
                                                                                        ))}
                                                                                    </div>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                        
                                                                        {/* Matching Feedback */}
                                                                        <div>
                                                                             <h5 className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2 flex items-center gap-1">
                                                                                 <Check size={10} className="text-green-500" /> Matching Feedback
                                                                             </h5>
                                                                             {matchedItems.length > 0 ? (
                                                                                 <div className="bg-green-50/50 border border-green-100 p-3 rounded-xl">
                                                                                     <p className="text-[10px] text-green-700 font-medium mb-2">The AI matched data from this receipt to the following requisition items:</p>
                                                                                     <div className="space-y-2">
                                                                                         {matchedItems.map((mi: any, idx: number) => (
                                                                                             <div key={idx} className="flex flex-col text-[11px] bg-white p-2.5 rounded-xl border border-green-100 shadow-sm">
                                                                                                 <div className="flex justify-between items-start">
                                                                                                     <div className="flex-1">
                                                                                                         <span className="font-bold text-gray-900 block text-[12px]">{mi.description}</span>
                                                                                                     </div>
                                                                                                     <div className="text-right ml-2">
                                                                                                         <span className="font-black text-[#006AFF] bg-blue-50 px-1.5 py-0.5 rounded block text-[12px]">K{mi.ai_extracted_amount?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                                                                                         <span className="text-[8px] text-gray-400 uppercase font-bold tracking-widest mt-1 block">Matched</span>
                                                                                                     </div>
                                                                                                 </div>
                                                                                                 {mi.receipt_ocr_data?.reasoning && (
                                                                                                     <div className="mt-2 pt-2 border-t border-green-50">
                                                                                                         <span className="text-[9px] font-black uppercase text-green-600 tracking-widest mb-1 block">AI Reasoning</span>
                                                                                                         <span className="text-[10px] text-gray-600 italic block leading-snug">{mi.receipt_ocr_data.reasoning}</span>
                                                                                                     </div>
                                                                                                 )}
                                                                                             </div>
                                                                                         ))}
                                                                                     </div>
                                                                                 </div>
                                                                             ) : (
                                                                                 <div className="bg-amber-50/50 border border-amber-100 p-3 rounded-xl text-[11px] text-amber-700 flex items-start gap-2">
                                                                                     <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                                                                                     <span>The AI could not confidently match the items on this receipt to any specific requisition items. It may have been a generic description or the amounts did not align.</span>
                                                                                 </div>
                                                                             )}
                                                                        </div>
                                                                    </div>
                                                                ) : (
                                                                    <div className="text-[11px] text-gray-400 italic text-center py-4">No AI data available for this receipt yet. Please try re-scanning.</div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                )})}
                                            </div>
                                        )}

                                        <div className="flex space-x-2">
                                            <button 
                                                onClick={() => {
                                                    const input = document.getElementById(`manual-scan-upload-${requisitionData?.id}`);
                                                    if (input) input.click();
                                                }}
                                                disabled={isManualScanning}
                                                className="flex-1 h-10 border-2 border-dashed border-gray-100 rounded-2xl flex items-center justify-center space-x-2 text-gray-400 hover:text-[#006AFF] hover:border-[#006AFF]/20 hover:bg-blue-50/30 transition-all group"
                                            >
                                                <ImageIcon size={14} className="group-hover:scale-110 transition-transform" />
                                                <span className="text-[11px] font-black uppercase tracking-widest">Upload Receipts</span>
                                                <Plus size={14} />
                                            </button>

                                            {requisitionData?.receipts?.length > 0 && (
                                                <button 
                                                    onClick={handleReprocess}
                                                    disabled={isManualScanning}
                                                    type="button"
                                                    title="Reprocess all receipts with AI"
                                                    className="w-10 h-10 border border-gray-100 rounded-2xl flex items-center justify-center text-gray-400 hover:text-[#006AFF] hover:bg-blue-50/30 transition-all"
                                                >
                                                    {isManualScanning ? (
                                                        <Loader2 size={14} className="animate-spin" />
                                                    ) : (
                                                        <RefreshCw size={14} />
                                                    )}
                                                </button>
                                            )}
                                        </div>
                                        <input 
                                            id={`manual-scan-upload-${requisitionData?.id}`}
                                            type="file" 
                                            multiple 
                                            accept="image/*" 
                                            className="hidden" 
                                            onChange={handleManualScanUpload}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            );
        }

        // 4. AI CATEGORIZATION REVIEW
        else if (isAIReview) {
            const isCompleted = (requisitionData?.status === 'CATEGORIZED' || requisitionData?.status === 'ACCOUNTED') && !isEditingCategorization;
            const isFullyCompleted = requisitionData?.status === 'ACCOUNTED';
            const filteredAccounts = accounts.filter(a => 
                a.name.toLowerCase().includes(accountSearch.toLowerCase()) || 
                a.code.toLowerCase().includes(accountSearch.toLowerCase())
            );

            return (
                <div className="flex flex-col mb-8 w-full max-w-2xl animate-in fade-in slide-in-from-left-4 duration-500">
                    <div className="bg-white border border-gray-100 rounded-[20px] rounded-tl-none shadow-[0_4px_20px_-4px_rgba(0,0,0,0.06)] overflow-visible">
                        <div className="px-8 py-8">
                            <div className="flex items-center space-x-3 mb-6">
                                <div className="w-7 h-7 rounded-full bg-blue-50 flex items-center justify-center text-[#006AFF] border border-blue-50 shadow-sm">
                                    <Building2 size={14} />
                                </div>
                                <div className="flex-1 flex items-center justify-between">
                                    <span className="text-[12px] font-semibold text-gray-900 tracking-tight">AI Categorization Assistant</span>
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
                                        {isCompleted && !isFullyCompleted && (
                                            <button
                                                onClick={() => setIsEditingCategorization(true)}
                                                className="flex items-center space-x-1.5 px-3 py-1.5 hover:bg-gray-100 rounded-full text-[11px] font-bold text-gray-500 transition-all border border-gray-200 group"
                                            >
                                                <Sparkles size={14} className="text-blue-500" />
                                                <span className="uppercase tracking-wider">Edit Mapping</span>
                                            </button>
                                        )}
                                        {(isCompleted || isFullyCompleted) && (
                                            <div className="flex items-center space-x-3">
                                                <button
                                                    onClick={() => setIsAICategorizationExpanded(!isAICategorizationExpanded)}
                                                    className="flex items-center space-x-1.5 px-3 py-1.5 hover:bg-blue-50/50 rounded-full text-[11px] font-bold text-[#006AFF] transition-all border border-transparent hover:border-blue-100 group"
                                                >
                                                    <span className="uppercase tracking-wider">{isAICategorizationExpanded ? 'Hide Mapping' : 'Show Mapping'}</span>
                                                    <ChevronDown size={14} className={`transition-transform duration-300 ${isAICategorizationExpanded ? 'rotate-180' : ''}`} />
                                                </button>
                                                <div className="flex items-center space-x-1 px-2 py-0.5 rounded-full border border-gray-100 text-blue-500 bg-blue-50/10 h-[20px]">
                                                    <Check size={9} strokeWidth={3} />
                                                    <span className="text-[9px] font-bold uppercase tracking-wider">{isFullyCompleted ? 'Posted' : 'Categorized'}</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* AI Thinking State */}
                            {message.metadata?.isThinking && (
                                <div className="flex flex-col items-center justify-center py-6 animate-in fade-in zoom-in-95 duration-500">
                                    <div className="flex space-x-1 mb-2.5">
                                        <div className="typing-dot" />
                                        <div className="typing-dot" />
                                        <div className="typing-dot" />
                                    </div>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] animate-pulse">
                                        AI Categorization Assistant is thinking...
                                    </p>
                                </div>
                            )}

                            {/* AI Error State */}
                            {!message.metadata?.isThinking && message.metadata?.hasError && (
                                <div className="flex flex-col items-center justify-center py-8 animate-in fade-in zoom-in-95 duration-500">
                                    <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center text-red-400 mb-3">
                                        <AlertTriangle size={18} />
                                    </div>
                                    <p className="text-[12px] font-bold text-gray-500 text-center mb-1">
                                        AI categorization encountered an error.
                                    </p>
                                    <p className="text-[11px] text-gray-400 text-center">
                                        Click the reload button above to try again.
                                    </p>
                                </div>
                            )}


                            {isAICategorizationExpanded && !message.metadata?.isThinking && (
                                <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                                    <p className="text-[12px] font-semibold text-gray-900 mb-4">
                                        The AI has suggested the following chart of accounts mapping. You can manually edit any category if needed.
                                    </p>

                                    <div className="rounded-xl border border-gray-100 overflow-visible mb-6">
                                        <table className="w-full text-left">
                                            <thead>
                                                <tr className="bg-gray-50/80">
                                                    <th className="px-4 py-2.5 text-[9px] font-black uppercase text-gray-400 w-1/3">Item</th>
                                                    <th className="px-4 py-2.5 text-[9px] font-black uppercase text-gray-400">Suggested Category</th>
                                                    <th className="px-4 py-2.5 text-[9px] font-black uppercase text-gray-400 text-right">Action</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-50">
                                                {(editableItems.length > 0 ? editableItems : (message.metadata?.items || [])).map((item: any, idx: number) => (
                                                    <React.Fragment key={idx}>
                                                        <tr className="hover:bg-gray-50/30 transition-colors group">
                                                            <td className="px-4 py-3 text-[11px] font-medium text-gray-700">{item.description}</td>
                                                            <td className="px-4 py-3 text-[11px] font-black text-gray-900">
                                                                <div className="relative">
                                                                    {!isCompleted ? (
                                                                        <div className="relative">
                                                                            <div
                                                                                role="button"
                                                                                tabIndex={0}
                                                                                onClick={() => {
                                                                                    if (isAccountDropdownOpen === idx) {
                                                                                        setIsAccountDropdownOpen(null);
                                                                                    } else {
                                                                                        setIsAccountDropdownOpen(idx);
                                                                                        setAccountSearch('');
                                                                                    }
                                                                                }}
                                                                                onKeyDown={(e) => {
                                                                                    if (e.key === 'Enter' || e.key === ' ') {
                                                                                        if (isAccountDropdownOpen === idx) {
                                                                                            setIsAccountDropdownOpen(null);
                                                                                        } else {
                                                                                            setIsAccountDropdownOpen(idx);
                                                                                            setAccountSearch('');
                                                                                        }
                                                                                    }
                                                                                }}
                                                                                className="flex flex-col text-left hover:bg-gray-100/50 p-1.5 -m-1.5 rounded-lg transition-all w-full cursor-pointer"
                                                                            >
                                                                                <span className="text-[11px] font-bold text-gray-900 flex items-center justify-between">
                                                                                    <span>{item.category_code} - {item.category_name}</span>
                                                                                    <ChevronDown size={12} className={`text-gray-400 transition-transform ${isAccountDropdownOpen === idx ? 'rotate-180' : ''}`} />
                                                                                </span>
                                                                                <span className="text-[9px] font-bold text-emerald-500">
                                                                                    {item.confidence ? `${Math.round(item.confidence * 100)}% Confidence` : (item.is_manual ? 'Manual Override' : 'System Suggestion')}
                                                                                </span>
                                                                            </div>

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
                                                    setIsEditingCategorization(false);
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
            const selectedAccount = qbAccounts.find(a => a.Id === paymentAccountId);
            const qbExpenseId = requisitionData?.qb_expense_id || message.metadata?.qbExpenseId;
            const qbExpenseRef = requisitionData?.reference_number || message.metadata?.reference;
            const lineItems = requisitionData?.items || [];
            
            // Auto-detect payment method name from ID or method string
            const method = requisitionData?.payment_method || (requisitionData?.disbursements && requisitionData.disbursements[0]?.method);
            const isWallet = method === 'WALLET' || method === 'MONEYWISE_WALLET';
            const creditAccountName = selectedAccount?.Name || (isWallet ? 'MoneyWise Wallet' : 'Selected Account');

            return (
                <div className="flex flex-col mb-8 w-full max-w-2xl animate-in fade-in slide-in-from-left-4 duration-500">
                    <div className="bg-white border border-gray-100 rounded-[20px] rounded-tl-none shadow-[0_4px_20px_-4px_rgba(0,0,0,0.06)] overflow-hidden">
                        <div className="px-8 py-8">
                            <div className="flex items-center space-x-3 mb-6">
                                 <div className="w-7 h-7 rounded-full bg-blue-50/50 flex items-center justify-center text-[#006AFF] border border-blue-50 shadow-sm">
                                     <Building2 size={14} />
                                 </div>
                                 <div className="flex-1 flex items-center justify-between">
                                     <div className="flex flex-col">
                                         <span className="text-[12px] font-semibold text-gray-900 tracking-tight">QuickBooks Sync</span>
                                         <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">General Ledger Posting</span>
                                     </div>
                                    {isCompleted && (
                                        <div className="flex items-center space-x-1 px-2 py-0.5 rounded-full border border-emerald-100 text-emerald-500 bg-emerald-50/10">
                                            <Check size={10} strokeWidth={3} />
                                            <span className="text-[10px] font-bold uppercase tracking-wider">Posted</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Allocation Summary (Double Entry View) */}
                            <div className="mb-8 p-6 bg-gray-50/50 rounded-[24px] border border-gray-100 space-y-5">
                                <div className="flex items-center justify-between px-1">
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Debit Summary</span>
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Amount</span>
                                </div>
                                
                                <div className="space-y-3">
                                    {lineItems.map((item: any, idx: number) => (
                                        <div key={idx} className="flex items-center justify-between group">
                                            <div className="flex flex-col">
                                                <span className="text-[13px] font-bold text-gray-800">{item.qb_account_name || 'Uncategorized Expense'}</span>
                                                <span className="text-[10px] font-medium text-gray-400 line-clamp-1">{item.description}</span>
                                            </div>
                                            <span className="text-[13px] font-black text-gray-900">
                                                {new Intl.NumberFormat('en-ZM', { style: 'currency', currency: 'ZMW' }).format(item.actual_amount ?? item.estimated_amount ?? 0)}
                                            </span>
                                        </div>
                                    ))}
                                </div>

                                <div className="pt-4 mt-2 border-t border-gray-100/50 flex items-center justify-between">
                                    <div className="flex items-center space-x-2">
                                        <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
                                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Credit (Source)</span>
                                    </div>
                                    <span className="text-[12px] font-bold text-blue-600">{creditAccountName}</span>
                                </div>
                            </div>

                            {!isCompleted && (
                                <div className="space-y-6">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">
                                            {selectedAccount ? 'Credit (Source) Account' : 'Select Credit (Source) Account'}
                                        </label>
                                        <div className="relative">
                                            <div
                                                role="button"
                                                tabIndex={0}
                                                onClick={() => {
                                                    if (isWallet) return;
                                                    setIsQBCreditDropdownOpen(!isQBCreditDropdownOpen);
                                                    setQBCreditSearch('');
                                                }}
                                                className={`w-full h-14 px-6 bg-white border ${isQBCreditDropdownOpen ? 'border-blue-200 ring-2 ring-blue-50' : 'border-gray-100'} rounded-2xl flex items-center justify-between ${isWallet ? 'cursor-default bg-gray-50/50' : 'cursor-pointer'} transition-all shadow-sm group hover:border-gray-200`}
                                            >
                                                <div className="flex items-center space-x-3">
                                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${selectedAccount ? 'bg-blue-50 text-blue-600' : 'bg-gray-50 text-gray-400'}`}>
                                                        {isWallet ? <CheckCircle size={16} className="text-emerald-500" /> : <Wallet size={16} />}
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className={`text-[13px] font-bold ${selectedAccount ? 'text-gray-900' : 'text-gray-400'}`}>
                                                            {selectedAccount ? selectedAccount.Name : (isWallet ? 'Searching for Wallet account...' : 'Search for a bank or wallet account...')}
                                                        </span>
                                                        <div className="flex items-center space-x-2">
                                                            {selectedAccount && (
                                                                <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">{selectedAccount.AccountType}</span>
                                                            )}
                                                            {isWallet && (
                                                                <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest bg-emerald-50 px-1.5 py-0.5 rounded">Locked to Wallet</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                                {!isWallet && <ChevronDown size={16} className={`text-gray-400 transition-transform duration-300 ${isQBCreditDropdownOpen ? 'rotate-180' : ''}`} />}
                                            </div>

                                            {isQBCreditDropdownOpen && (
                                                <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-100 shadow-2xl rounded-2xl z-[100] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                                                    <div className="p-4 border-b border-gray-50 bg-gray-50/30">
                                                        <div className="relative">
                                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                                                            <input
                                                                autoFocus
                                                                type="text"
                                                                placeholder="Search accounts..."
                                                                value={qbCreditSearch}
                                                                onChange={(e) => setQBCreditSearch(e.target.value)}
                                                                onKeyDown={(e) => {
                                                                    if (e.key === 'Escape') setIsQBCreditDropdownOpen(false);
                                                                }}
                                                                className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-100 rounded-xl text-[12px] font-medium focus:outline-none focus:ring-2 focus:ring-[#006AFF]/20"
                                                            />
                                                        </div>
                                                    </div>
                                                    <div className="max-h-[250px] overflow-y-auto p-2 scrollbar-hide">
                                                        {qbAccounts.length > 0 ? (
                                                            qbAccounts
                                                                .filter(a => 
                                                                    (a.AccountType === 'Bank' || a.AccountType === 'Credit Card' || a.AccountType === 'Other Current Asset') &&
                                                                    (a.Name.toLowerCase().includes(qbCreditSearch.toLowerCase()) || 
                                                                     a.AccountType.toLowerCase().includes(qbCreditSearch.toLowerCase()))
                                                                )
                                                                .map((acc) => (
                                                                    <button
                                                                        key={acc.Id}
                                                                        onClick={() => {
                                                                            setPaymentAccountId(acc.Id);
                                                                            setIsQBCreditDropdownOpen(false);
                                                                        }}
                                                                        className={`w-full flex items-center justify-between p-3 hover:bg-blue-50 rounded-xl transition-all group/item mb-1 text-left ${paymentAccountId === acc.Id ? 'bg-blue-50/50' : ''}`}
                                                                    >
                                                                        <div className="flex flex-col">
                                                                            <span className={`text-[12px] font-bold ${paymentAccountId === acc.Id ? 'text-[#006AFF]' : 'text-gray-900'} group-hover/item:text-[#006AFF]`}>{acc.Name}</span>
                                                                            <span className="text-[10px] text-gray-400 uppercase font-black tracking-widest">{acc.AccountType}</span>
                                                                        </div>
                                                                        {paymentAccountId === acc.Id && <Check size={14} className="text-[#006AFF]" />}
                                                                    </button>
                                                                ))
                                                        ) : (
                                                            <div className="py-8 text-center text-[12px] text-gray-400 italic">
                                                                {qbFetchError ? 'QuickBooks account fetch failed.' : 'No suitable accounts found.'}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {qbFetchError && !selectedAccount && (
                                        <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 flex items-start space-x-3">
                                            <AlertTriangle size={16} className="text-amber-600 mt-0.5" />
                                            <p className="text-[11px] font-medium text-amber-700 leading-relaxed">
                                                Unable to verify the "{creditAccountName}" in QuickBooks. 
                                                Please select a valid account from the list above.
                                            </p>
                                        </div>
                                    )}

                                    <button 
                                        onClick={async () => {
                                            try {
                                                setIsPostingQB(true);
                                                await requisitionService.postToQuickBooks(requisitionData?.id || message.requisition_id, {
                                                    payment_account_id: paymentAccountId || '',
                                                    payment_account_name: creditAccountName
                                                });
                                                if (onAction) onAction('REFRESH');
                                            } catch (err: any) {
                                                console.error('QB Posting failed:', err);
                                                window.alert(`Posting Failed: ${err.message}`);
                                            } finally {
                                                setIsPostingQB(false);
                                            }
                                        }}
                                        disabled={isPostingQB || (!paymentAccountId && !isWallet)}
                                        className="w-full h-11 bg-[#006AFF] text-white text-[13px] font-bold rounded-full hover:bg-blue-600 shadow-lg shadow-blue-100/50 transition-all flex items-center justify-center space-x-2 group"
                                    >
                                        {isPostingQB ? <Loader2 size={18} className="animate-spin" /> : (
                                            <>
                                                <span>Post to QuickBooks</span>
                                                <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                                            </>
                                        )}
                                    </button>
                                </div>
                            )}

                            {isCompleted && (
                                <div className="space-y-4">
                                    <div className="p-6 bg-emerald-50/30 rounded-[24px] border border-emerald-50 flex items-center justify-between">
                                        <div className="flex items-center space-x-4">
                                            <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
                                                <Check size={20} strokeWidth={3} />
                                            </div>
                                            <div>
                                                <p className="text-[13px] font-bold text-emerald-700">Successfully Synchronized</p>
                                                <p className="text-[11px] font-medium text-emerald-600/70 uppercase tracking-wider">Posted to General Ledger</p>
                                            </div>
                                        </div>
                                    </div>

                                    {qbExpenseId && (
                                        <div className="px-6 py-4 bg-gray-50/50 rounded-[20px] border border-gray-100 flex items-center justify-between group cursor-default hover:bg-gray-50 transition-colors">
                                            <div className="flex flex-col">
                                                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">QuickBooks Ref ID</span>
                                                <span className="text-[13px] font-mono font-bold text-gray-900">#{qbExpenseId}</span>
                                            </div>
                                            <div className="flex items-center space-x-1 px-3 py-1.5 bg-white border border-gray-100 rounded-full shadow-sm text-gray-400">
                                                <CheckCircle size={12} className="text-emerald-500" />
                                                <span className="text-[10px] font-black uppercase tracking-wider">Verified</span>
                                            </div>
                                        </div>
                                    )}

                                    {qbExpenseRef && (
                                        <div className="px-6 py-4 bg-gray-50/50 rounded-2xl border border-gray-100 flex items-center justify-between">
                                            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Transaction ID</span>
                                            <span className="text-[11px] font-black text-gray-600">{qbExpenseRef}</span>
                                        </div>
                                    )}
                                    
                                    <div className="text-center pt-2">
                                        <p className="text-[10px] font-bold text-gray-300 uppercase tracking-[0.2em]">
                                            Last Synced: {new Date(requisitionData?.qb_sync_at || new Date()).toLocaleString()}
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            );
        }

        // 6. DISBURSAL SUMMARY (Success Message)
        else if (content?.startsWith('Funds Disbursed:')) {
            const meta = message.metadata || {};
            // Parse details from content
            const lines = content.split('\n');
            const amountLine = lines.find(l => l.includes('Disbursed:')) || lines.find(l => l.includes('Amount:'));
            const methodLine = lines.find(l => l.includes('Method:'));
            const refLine = lines.find(l => l.includes('Ref:'));
            const statusLine = lines.find(l => l.includes('Status:'));

            const amount = amountLine?.split(':')[1]?.trim() || `K${Number(meta.amount || 0).toLocaleString()}`;
            const method = methodLine?.split(':')[1]?.trim() || meta.payment_method || 'N/A';
            const ref = refLine?.split(':')[1]?.trim() || meta.external_reference || 'N/A';
            const status = statusLine?.split(':')[1]?.trim() || 'SUCCESS';

            return (
                <div className="flex flex-col mb-8 w-full max-w-2xl animate-in fade-in slide-in-from-left-4 duration-500">
                    <div className="bg-white border border-gray-100 rounded-[20px] rounded-tl-none shadow-[0_4px_20px_-4px_rgba(0,0,0,0.06)] overflow-hidden">
                        <div className="px-8 py-6">
                             <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center space-x-3">
                                    <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600">
                                        <CheckCircle size={18} strokeWidth={2.5} />
                                    </div>
                                    <span className="text-[14px] font-black text-gray-900 uppercase tracking-tight">Funds Disbursed</span>
                                </div>
                                <div className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-600 text-[10px] font-black uppercase tracking-wider border border-emerald-100">
                                    {status}
                                </div>
                             </div>
                             
                             <div className="bg-gray-50/50 rounded-2xl p-6 border border-gray-100/50">
                                <div className="flex items-center justify-between">
                                    <div className="space-y-0.5">
                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Disbursed Amount</p>
                                        <p className="text-[20px] font-black text-gray-900 tracking-tight">{amount}</p>
                                    </div>
                                    <button 
                                        onClick={() => setIsExpanded(!isExpanded)}
                                        className="h-10 px-4 bg-white border border-gray-100 rounded-full text-[11px] font-bold text-gray-600 hover:bg-gray-50 transition-all flex items-center space-x-2 shadow-sm"
                                    >
                                        <span>{isExpanded ? 'Hide Details' : 'Show Details'}</span>
                                        <ChevronDown size={14} className={`transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
                                    </button>
                                </div>

                                {isExpanded && (
                                    <div className="mt-6 pt-6 border-t border-gray-200/50 space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                                        <div className="flex justify-between items-center">
                                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Payment Method</span>
                                            <span className="text-[12px] font-bold text-gray-900 uppercase">{method}</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Reference</span>
                                            <span className="text-[12px] font-mono font-bold text-gray-600">{ref}</span>
                                        </div>
                                        {meta.recipient && (
                                            <div className="flex justify-between items-center">
                                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Recipient</span>
                                                <span className="text-[12px] font-bold text-gray-900">{meta.recipient}</span>
                                            </div>
                                        )}
                                    </div>
                                )}
                             </div>
                        </div>
                    </div>

                    <div className="mt-2.5 ml-1 flex items-center space-x-3">
                        <span className="text-[11px] font-medium text-gray-900 uppercase tracking-widest opacity-60">
                            {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {message.metadata?.isRepaired && (
                            <div className="flex items-center space-x-2">
                                <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-400 text-[9px] font-bold uppercase tracking-wider">Automated Repair</span>
                                {new Date().getTime() - new Date(message.created_at).getTime() < 24 * 60 * 60 * 1000 && (
                                    <button 
                                        onClick={async () => {
                                            if (confirm('Are you sure you want to undo this automatic repair?')) {
                                                try {
                                                    await requisitionService.deleteMessage(message.requisition_id, message.id);
                                                    if (onAction) onAction('REFRESH');
                                                } catch (err: any) {
                                                    alert(err.message);
                                                }
                                            }
                                        }}
                                        className="text-gray-300 hover:text-red-500 transition-colors p-1"
                                        title="Undo Repair"
                                    >
                                        <RotateCcw size={12} />
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            );
        }

        // 7. EXPENSE SUMMARY
        else if (isExpenseSummary) {
             const totalActual = requisitionData?.items?.reduce((sum: number, i: any) => sum + (parseFloat(i.actual_amount) || 0), 0) || 0;
             const totalDisbursed = requisitionData?.disbursements?.[0]?.total_prepared || 0;
             const isWallet = requisitionData?.disbursements?.[0]?.payment_method === 'MONEYWISE_WALLET';
             const withdrawalFee = isWallet ? lencoService.calculatePayoutFee(totalDisbursed, 'MONEYWISE_WALLET') : 0;
             const principalReceived = totalDisbursed - withdrawalFee;
             const changeAmount = Math.max(0, principalReceived - totalActual);
             const hasChange = changeAmount > 0.01; // Small threshold for floating point
             const isRequestor = currentUser?.id === requisitionData?.requestor_id;
             const showChangeActions = hasChange && isRequestor && requisitionData?.status === 'EXPENSED';

             return (
                 <div className="flex flex-col mb-4 w-full max-w-2xl animate-in fade-in slide-in-from-left-4 duration-500">
                    <div className="bg-white border border-gray-100 rounded-[20px] rounded-tl-none shadow-[0_4px_20px_-4px_rgba(0,0,0,0.06)] overflow-hidden">
                        <div className="px-6 py-4">
                             <div className="flex items-center space-x-3 mb-4">
                                 <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600">
                                     <Check size={16} strokeWidth={2.5} />
                                 </div>
                                 <span className="text-[14px] font-medium text-gray-900">Finance System</span>
                             </div>
                             <p className="text-[12px] font-semibold text-gray-900 leading-relaxed mb-4">
                                 {message.content}
                             </p>

                             {showChangeActions && (
                                 <div className="mt-4 pt-4 border-t border-gray-50 space-y-3">
                                     <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Submit Change (K{changeAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })})</p>
                                     <div className="grid grid-cols-2 gap-3">
                                         <button 
                                             onClick={async () => {
                                                 if (window.confirm(`Submit K${changeAmount.toFixed(2)} cash return?`)) {
                                                     try {
                                                         setIsSubmittingChange(true);
                                                         await requisitionService.submitChange(requisitionData.id, [], changeAmount);
                                                         if (onAction) onAction('REFRESH');
                                                     } catch (err: any) {
                                                         alert(err.message);
                                                     } finally {
                                                         setIsSubmittingChange(false);
                                                     }
                                                 }
                                             }}
                                             disabled={isSubmittingChange}
                                             className="h-10 bg-gray-50 text-gray-900 text-[11px] font-bold rounded-xl hover:bg-gray-100 transition-all flex items-center justify-center gap-2 border border-gray-100 disabled:opacity-50"
                                         >
                                             {isSubmittingChange ? (
                                                 <Loader2 size={14} className="animate-spin" />
                                             ) : (
                                                 <>
                                                     <Coins size={14} className="text-amber-500" />
                                                     Return Cash
                                                 </>
                                             )}
                                         </button>
                                         <button 
                                             onClick={() => {
                                                 // Porting logic from RequisitionDetail
                                                 const LencoPay: any = (window as any).LencoPay;
                                                 if (!LencoPay) {
                                                     alert('Lenco Payment SDK is not currently loaded.');
                                                     return;
                                                 }
                                                 
                                                 const ref = `CHG-${Date.now()}-${requisitionData?.id}`;
                                                 LencoPay.getPaid({
                                                     key: requisitionData.organization?.lenco_public_key,
                                                     amount: changeAmount.toFixed(2),
                                                     currency: 'ZMW',
                                                     reference: ref,
                                                     accountId: requisitionData.organization?.lenco_subaccount_id,
                                                     email: currentUser?.email || 'customer@example.com',
                                                     name: currentUser?.user_metadata?.full_name || 'User',
                                                     channels: ['card', 'mobile-money'],
                                                     onSuccess: async (response: any) => {
                                                         try {
                                                             setIsSubmittingChange(true);
                                                             const transactionId = response.id || response.transactionId;
                                                             // Verify and submit
                                                             await lencoService.verifyStatus(ref, transactionId, requisitionData.organization_id);
                                                             await requisitionService.submitChange(requisitionData.id, [], changeAmount, 'MONEYWISE_WALLET', ref);
                                                             if (onAction) onAction('REFRESH');
                                                             alert('Change deposited successfully!');
                                                         } catch (err: any) {
                                                             alert('Deposit recorded but verification failed: ' + err.message);
                                                         } finally {
                                                             setIsSubmittingChange(false);
                                                         }
                                                     },
                                                     onClose: () => {
                                                        // Just in case
                                                        setIsSubmittingChange(false);
                                                     }
                                                 });
                                             }}
                                             disabled={isSubmittingChange}
                                             className="h-10 bg-brand-pink/5 text-brand-pink text-[11px] font-bold rounded-xl hover:bg-brand-pink/10 transition-all flex items-center justify-center gap-2 border border-brand-pink/10 disabled:opacity-50"
                                         >
                                             {isSubmittingChange ? (
                                                 <Loader2 size={14} className="animate-spin" />
                                             ) : (
                                                 <>
                                                     <Wallet size={14} />
                                                     Deposit to Wallet
                                                 </>
                                             )}
                                         </button>
                                     </div>
                                 </div>
                             )}

                             {!hasChange && isRequestor && requisitionData?.status === 'EXPENSED' && (
                                 <div className="mt-4 pt-4 border-t border-gray-50">
                                     <button 
                                         onClick={async () => {
                                             try {
                                                 await requisitionService.updateStatus(requisitionData.id, 'CHANGE_SUBMITTED');
                                                 if (onAction) onAction('REFRESH');
                                             } catch (err: any) {
                                                 alert(err.message);
                                             }
                                         }}
                                         className="w-full h-10 bg-emerald-600 text-white text-[11px] font-bold rounded-xl hover:bg-emerald-700 transition-all flex items-center justify-center gap-2"
                                     >
                                         <CheckCircle size={14} />
                                         Finalize & Mark as Returned
                                     </button>
                                 </div>
                             )}
                        </div>
                    </div>
                </div>
             );
        }

        // Status Update Badges
        const advancedStatuses = ['CATEGORIZED', 'COMPLETED', 'ACCOUNTED'];
        if (!isPrivileged && advancedStatuses.some(s => message.content?.includes(s))) {
            return null;
        }

        return (
            <div className="flex justify-center my-4 w-full animate-in fade-in zoom-in-95 duration-500">
                <span className="px-4 py-1.5 bg-blue-50/50 text-blue-400 text-[9px] font-black uppercase tracking-[0.2em] rounded-full border border-blue-100/50">
                    {message.content}
                </span>
            </div>
        );
    }

    // Chat Bubbles
    return (
        <div className={`flex w-full ${isOwn ? 'justify-end' : 'justify-start'} mb-4 group animate-in fade-in slide-in-from-bottom-2 duration-400`}>
            <div className={`flex flex-col max-w-[75%] ${isOwn ? 'items-end' : 'items-start'}`}>
                <div className={`px-4 py-2.5 rounded-[16px] text-[13px] font-medium leading-relaxed shadow-sm ${
                    isOwn 
                        ? 'bg-[#006AFF] text-white rounded-tr-none shadow-blue-100' 
                        : 'bg-white text-gray-800 rounded-tl-none border border-gray-100'
                }`}>
                    {message.content}
                </div>
                <span className={`text-[9px] font-medium mt-1.5 mx-2 uppercase tracking-widest ${isOwn ? 'text-gray-900 opacity-60' : 'text-gray-900 opacity-60'}`}>
                    {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
            </div>
        </div>
    );
};

export default RequisitionMessageCard;

import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { cashbookService, CashbookEntry } from '../services/cashbook.service';
import { departmentService } from '../services/department.service';
import { Layout } from '../components/Layout';
import { lencoService } from '../services/lenco.service';
import {
    Receipt,
    Calendar,
    Lock,
    PlusCircle,
    Sparkles,
    X,
    Search,
    Filter,
    ArrowDownUp,
    Smartphone,
    Coins,
    Wallet,
    Building2,
    ChevronRight,
    ChevronDown,
    Loader2,
    AlertCircle,
    Info,
    CheckCircle2,
    Clock,
    RotateCcw,
    Check,
    RefreshCw,
    AlertTriangle,
    Download,
    Flag,
    Link2,
    ArrowDownToLine,
    ArrowLeftRight,
    ListFilter
} from 'lucide-react';
import '../styles/cashbook.css';
import CloseBalanceModal from '../components/CloseBalanceModal';
import CashInflowModal from '../components/CashInflowModal';
import CreateWalletModal from '../components/CreateWalletModal';
import TransferModal from '../components/TransferModal';
import TransferToWalletModal from '../components/TransferToWalletModal';
import ShareWalletLinkModal from '../components/ShareWalletLinkModal';
import { useAuth } from '../context/AuthContext';
import { getStatusConfig, requisitionService } from '../services/requisition.service';
import { accountService, Account } from '../services/account.service';
import RequisitionModal from '../components/requisitions/RequisitionModal';
import { Requisition } from '../services/requisition.service';
import ExportLedgerModal from '../components/ExportLedgerModal';
import budgetBg from '../assets/Frame 24.png';
import { exportToCSV, exportToExcel, exportToPDF } from '../utils/export.utils';
import { SegmentedControl, AnimatedTabContent } from '../components/AnimatedTabs';
import { useNewnessTracker, isNewSinceStored } from '../hooks/useNewnessTracker';


const SearchableAccountSelect: React.FC<{
    value: string;
    options: any[];
    onChange: (value: string) => void;
    placeholder?: string;
}> = ({ value, options, onChange, placeholder = "Select account..." }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState("");
    const dropdownRef = useRef<HTMLDivElement>(null);

    const selectedOption = options.find(opt => opt.id === value);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const filteredOptions = options.filter(opt => 
        (opt.name || "").toLowerCase().includes(search.toLowerCase()) || 
        (opt.code || "").toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="relative w-full max-w-[280px]" ref={dropdownRef}>
            <div 
                onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}
                className={`flex items-center justify-between px-3 py-2 bg-gray-50/50 border rounded-xl cursor-pointer transition-all text-xs font-medium
                    ${isOpen ? 'border-blue-400 ring-4 ring-blue-50 bg-white' : 'border-gray-100 hover:border-blue-200'}`}
            >
                <span className={`truncate mr-2 ${selectedOption ? 'text-gray-900 font-bold' : 'text-gray-400'}`}>
                    {selectedOption ? `${selectedOption.code} · ${selectedOption.name}` : placeholder}
                </span>
                <ChevronDown size={14} className={`text-gray-400 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </div>

            {isOpen && (
                <div 
                    className="absolute z-[100] w-full mt-2 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden animate-in fade-in zoom-in-95 duration-100"
                    onClick={(e) => e.stopPropagation()}
                    style={{ minWidth: '300px' }}
                >
                    <div className="p-2 border-b border-gray-50">
                        <div className="relative">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                autoFocus
                                type="text"
                                placeholder="Search accounts..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full pl-9 pr-3 py-2 bg-gray-50 border-none rounded-xl text-xs focus:ring-0 placeholder:text-gray-400 font-medium"
                            />
                        </div>
                    </div>
                    <div className="max-h-[240px] overflow-y-auto p-1 custom-scrollbar">
                        {filteredOptions.length > 0 ? (
                            filteredOptions.map((opt) => (
                                <button
                                    key={opt.id}
                                    onClick={() => {
                                        onChange(opt.id);
                                        setIsOpen(false);
                                        setSearch("");
                                    }}
                                    className={`w-full text-left px-3 py-2.5 rounded-xl text-xs transition-colors flex flex-col gap-0.5
                                        ${value === opt.id ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50 text-gray-700'}`}
                                >
                                    <span className="font-bold">{opt.name}</span>
                                    <span className="text-[10px] opacity-60 tracking-wider uppercase font-black">{opt.code}</span>
                                </button>
                            ))
                        ) : (
                            <div className="p-4 text-center text-gray-400 text-xs">No accounts found</div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};


// Moneywise "M" wave mark used on the dark wallet cards.
const MoneywiseMark: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 34 18" fill="none" className={className} aria-hidden>
        <path
            d="M2 15 C5 3, 8 3, 11.5 9 C15 15, 18 15, 21.5 9 C25 3, 28 3, 31.5 12"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            fill="none"
        />
    </svg>
);

const renderMobileStatusIcon = (status: string) => {
    const config = getStatusConfig(status);
    const colorClass = config.color === 'blue' ? 'text-[#006AFF]' : 
                       config.color === 'emerald' ? 'text-emerald-500' :
                       config.color === 'amber' ? 'text-amber-500' :
                       config.color === 'red' ? 'text-red-500' :
                       config.color === 'purple' ? 'text-purple-500' : 'text-gray-400';

    switch (config.iconType) {
        case 'clock': return <Clock size={12} className={colorClass} />;
        case 'check-circle': return <CheckCircle2 size={12} className={colorClass} />;
        case 'check': return <Check size={12} className={colorClass} />;
        case 'alert': return <AlertCircle size={12} className={colorClass} />;
        case 'rotate': return <RotateCcw size={12} className={colorClass} />;
        default: return <Clock size={12} className={colorClass} />;
    }
};


const CashLedger: React.FC = () => {
    const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
    const [postingReview, setPostingReview] = useState<{
        type: 'INFLOW' | 'REQUISITION';
        data: any;
        entry?: CashbookEntry;
    } | null>(null);
    const [isPosting, setIsPosting] = useState(false);
    const [postSuccess, setPostSuccess] = useState<{
        qbId: string;
        type: string;
    } | null>(null);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [selectedAccountType, setSelectedAccountType] = useState<'CASH' | 'AIRTEL_MONEY' | 'BANK' | 'MONEYWISE_WALLET'>('MONEYWISE_WALLET');
    const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);
    const [isInflowModalOpen, setIsInflowModalOpen] = useState(false);
    const [isClassifying, setIsClassifying] = useState(false);
    const [classificationResults, setClassificationResults] = useState<any[]>([]);
    const [isResultsModalOpen, setIsResultsModalOpen] = useState(false);
    const [selectedRequisition, setSelectedRequisition] = useState<Requisition | null>(null);
    const [isRequisitionModalOpen, setIsRequisitionModalOpen] = useState(false);
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);

    const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);
    const [isSearchExpanded, setIsSearchExpanded] = useState(false);
    const [editingNarration, setEditingNarration] = useState<{ [entryId: string]: string }>({});

    // Org department config

    // Search, Sort, and Filter State
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState<'DATE_DESC' | 'DATE_ASC' | 'AMOUNT_HIGH' | 'AMOUNT_LOW'>('DATE_DESC');
    const [filterDepartment, setFilterDepartment] = useState<string>('ALL');
    const [filterAccount, setFilterAccount] = useState<string>('ALL');
    const [filterStatus, setFilterStatus] = useState<string>('ALL');

    // Wallets & Subwallets State
    const [selectedWalletId, setSelectedWalletId] = useState<string | undefined>(undefined);
    const [categoryGroup, setCategoryGroup] = useState<'MONEYWISE' | 'EXTERNAL'>('MONEYWISE');
    const [isCreateWalletModalOpen, setIsCreateWalletModalOpen] = useState(false);
    const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
    const [isCashTransferModalOpen, setIsCashTransferModalOpen] = useState(false);
    const [isShareModalOpen, setIsShareModalOpen] = useState(false);
    const [shareWalletId, setShareWalletId] = useState<string | null>(null);
    const [verifyingEntryId, setVerifyingEntryId] = useState<string | null>(null);
    const [generatingReceiptId, setGeneratingReceiptId] = useState<string | null>(null);
    const [showPendingIntents, setShowPendingIntents] = useState(false);

    const { userRole, organizationName, organizationId } = useAuth();
    const isRequestor = userRole === 'REQUESTOR';

    // Mobile wallet-card carousel (snap-scroll) state
    const walletScrollRef = useRef<HTMLDivElement>(null);
    const walletScrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [activeSlide, setActiveSlide] = useState(0);

    // "New since last visit" glow for the Main Wallets / External Accounts
    // toggle + transaction rows. Newness is tracked with a cutoff PER WALLET
    // (and per external account type), because money can land in several
    // wallets at once: each wallet's highlight must survive until that
    // specific wallet's ledger has actually been displayed. A small org-wide
    // recent-entries sample per category powers the toggle dots, independent
    // of the paginated `entries` list for the selected wallet.
    const newnessKey = (suffix: string) => `wallet_seen_${organizationId}_${suffix}`;
    // Tracker for whichever wallet/account is currently displayed — the fade
    // countdown only ever runs against the visible list's own key.
    const walletSeen = useNewnessTracker(
        organizationId
            ? (categoryGroup === 'MONEYWISE'
                ? (selectedWalletId ? newnessKey(`w_${selectedWalletId}`) : null)
                : newnessKey(`a_${selectedAccountType}`))
            : null
    );
    // ── Cached queries ───────────────────────────────────────────────────────
    // This page previously fired ~11 uncached requests per visit behind a
    // full-screen "Synchronizing Ledger" spinner. Queries share the persisted
    // cache: revisits paint instantly and revalidate in the background.
    const queryClient = useQueryClient();
    const effectiveWalletId = selectedAccountType === 'MONEYWISE_WALLET' ? selectedWalletId : undefined;

    const {
        data: entries = [],
        isFetching: entriesFetching,
    } = useQuery<CashbookEntry[]>({
        queryKey: ['cashbook-entries', organizationId, { startDate, endDate, accountType: selectedAccountType, walletId: effectiveWalletId }],
        queryFn: () => cashbookService.getEntries({ startDate, endDate, accountType: selectedAccountType, walletId: effectiveWalletId }),
        enabled: !!organizationId,
        // Switching wallets/filters keeps the previous list on screen instead
        // of flashing the full-page spinner (mirrors the old keep-stale render).
        placeholderData: keepPreviousData,
    });

    const { data: balance = 0, isFetching: balanceFetching } = useQuery<number>({
        queryKey: ['cashbook-balance', organizationId, selectedAccountType, effectiveWalletId ?? null],
        queryFn: () => cashbookService.getBalance(selectedAccountType, undefined, effectiveWalletId),
        enabled: !!organizationId,
        placeholderData: keepPreviousData,
    });

    // Matches the old single loadData() flag: spinner/glow logic waits for the
    // ledger AND its balance, never for the background sample fetches.
    const loading = entriesFetching || balanceFetching || !organizationId;

    const { data: externalBalances = { CASH: 0, AIRTEL_MONEY: 0, BANK: 0 } } = useQuery({
        queryKey: ['external-balances', organizationId],
        queryFn: async () => {
            const [CASH, AIRTEL_MONEY, BANK] = await Promise.all([
                cashbookService.getBalance('CASH'),
                cashbookService.getBalance('AIRTEL_MONEY'),
                cashbookService.getBalance('BANK'),
            ]);
            return { CASH, AIRTEL_MONEY, BANK } as Record<string, number>;
        },
        enabled: !!organizationId,
    });

    const { data: wallets = [] } = useQuery<any[]>({
        queryKey: ['wallets', organizationId],
        queryFn: async () => (await cashbookService.getWallets()) || [],
        enabled: !!organizationId,
    });

    const { data: accounts = [] } = useQuery<Account[]>({
        queryKey: ['accounts', organizationId],
        queryFn: () => accountService.getAll(),
        enabled: !!organizationId,
    });

    // Same key as the Inbox page — navigating between the two reuses one fetch.
    const { data: departmentConfig } = useQuery({
        queryKey: ['departments', organizationId],
        queryFn: () => departmentService.list(),
        enabled: !!organizationId,
    });
    const useDepartments = departmentConfig?.use_departments ?? false;
    const orgDepartments = React.useMemo(
        () => (departmentConfig?.use_departments ? departmentConfig.departments.map(d => d.name) : []),
        [departmentConfig]
    );

    // Lightweight org-wide sample per category, purely to power the "new
    // transaction" toggle dots — independent of whichever wallet/account is
    // currently selected in the main `entries` list. staleTime 0 preserves the
    // old always-refresh-on-focus behavior, so a payment completed in a Lenco
    // popup/redirect is reflected the moment the user returns to the app.
    const { data: recentSamples } = useQuery({
        queryKey: ['cashbook-recent', organizationId],
        queryFn: async () => {
            const [moneywise, cash, airtel, bank] = await Promise.all([
                cashbookService.getEntries({ accountType: 'MONEYWISE_WALLET', limit: 20 }),
                cashbookService.getEntries({ accountType: 'CASH', limit: 10 }),
                cashbookService.getEntries({ accountType: 'AIRTEL_MONEY', limit: 10 }),
                cashbookService.getEntries({ accountType: 'BANK', limit: 10 }),
            ]);
            return {
                moneywise: (moneywise || []) as CashbookEntry[],
                external: [...(cash || []), ...(airtel || []), ...(bank || [])] as CashbookEntry[],
            };
        },
        enabled: !!organizationId,
        staleTime: 0,
    });
    const recentMoneywiseEntries = recentSamples?.moneywise ?? [];
    const recentExternalEntries = recentSamples?.external ?? [];
    // Compare on the full created_at timestamp; the `date` column is day-granular
    // (parses to midnight) and would never read as newer than the visit cutoff.
    const entryStamp = (e: any) => (e.created_at as string) || e.date;
    // Toggle dots: check each sampled entry against its OWN wallet's stored
    // cutoff (pure localStorage reads — no timers), skipping hidden PENDING
    // intents. A dot therefore persists until the user opens the specific
    // wallet holding the new payment and its list actually renders.
    const hasNewMoneywise = !!organizationId && recentMoneywiseEntries.some(e =>
        e.status !== 'PENDING' && isNewSinceStored(newnessKey(`w_${(e as any).wallet_id}`), entryStamp(e))
    );
    const hasNewExternal = !!organizationId && recentExternalEntries.some(e =>
        e.status !== 'PENDING' && isNewSinceStored(newnessKey(`a_${e.account_type}`), entryStamp(e))
    );

    // Default wallet selection once wallets arrive, or when the selected one
    // disappears (e.g. archived). Replaces the old loadWallets(shouldSetDefault):
    // callers that want to force a reset to Main just setSelectedWalletId(undefined).
    useEffect(() => {
        if (wallets.length === 0) return;
        const exists = wallets.some((w: any) => w.id === selectedWalletId);
        if (!selectedWalletId || !exists) {
            const mainWallet = wallets.find((w: any) => w.is_main) || wallets[0];
            setSelectedWalletId(mainWallet.id);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [wallets, selectedWalletId]);

    // Snap the mobile wallet carousel back to the first card when switching
    // between MoneyWise wallets and external accounts.
    useEffect(() => {
        setActiveSlide(0);
        walletScrollRef.current?.scrollTo({ left: 0 });
    }, [categoryGroup]);

    // Wallets arrive asynchronously after the initial render (which shows just
    // the "Add Subwallet" card while the fetch is in flight). Once real wallet
    // cards get inserted before it, force the carousel back to slide 0 — even
    // with scroll-anchoring disabled this keeps the very first load reliably
    // landing on the first wallet instead of wherever it happened to settle.
    const hadWalletsRef = useRef(false);
    useEffect(() => {
        if (wallets.length > 0 && !hadWalletsRef.current) {
            hadWalletsRef.current = true;
            setActiveSlide(0);
            walletScrollRef.current?.scrollTo({ left: 0 });
        }
    }, [wallets]);

    // Refresh ledger data AND the currently-open requisition so status-driven UI
    // (e.g. approve/reject buttons after a revert to draft) updates instantly
    // without needing to close and reopen the modal.
    const handleStatusChange = async () => {
        await loadData();
        if (selectedRequisition) {
            try {
                const updated = await requisitionService.getById(selectedRequisition.id);
                setSelectedRequisition(updated as any);
            } catch (err) {
                console.error('Failed to refresh requisition after status change:', err);
            }
        }
    };

    // Refresh everything after a mutation (close balance, inflow, transfer,
    // classification…). Resolves once the active queries have refetched, so
    // callers that await it can rely on fresh data being on screen.
    const loadData = async () => {
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['cashbook-entries', organizationId] }),
            queryClient.invalidateQueries({ queryKey: ['cashbook-balance', organizationId] }),
            queryClient.invalidateQueries({ queryKey: ['external-balances', organizationId] }),
            queryClient.invalidateQueries({ queryKey: ['cashbook-recent', organizationId] }),
            queryClient.invalidateQueries({ queryKey: ['wallets', organizationId] }),
        ]);
    };

    const handleExport = async (format: 'csv' | 'xlsx' | 'pdf', exportStartDate: string, exportEndDate: string) => {
        try {
            const exportEntries = await cashbookService.getEntries({ 
                startDate: exportStartDate, 
                endDate: exportEndDate, 
                accountType: selectedAccountType,
                walletId: selectedAccountType === 'MONEYWISE_WALLET' ? selectedWalletId : undefined
            });
            
            const period = { start: exportStartDate, end: exportEndDate };
            const filename = `Cash_Ledger_${selectedAccountType}_${exportStartDate}_to_${exportEndDate}`;

            if (format === 'csv') {
                exportToCSV(exportEntries, filename);
            } else if (format === 'xlsx') {
                exportToExcel(exportEntries, filename, period);
            } else if (format === 'pdf') {
                exportToPDF(exportEntries, filename, period);
            }
        } catch (error) {
            console.error('Failed to export ledger:', error);
            alert('Failed to generate export. Please try again.');
        }
    };

    const toggleRow = (id: string) => {
        setExpandedRows(prev => ({
            ...prev,
            [id]: !prev[id]
        }));
    };


    const handleBulkClassify = async () => {
        if (unclassifiedCount === 0) {
            alert('Great job! All completed transactions are already classified.');
            return;
        }

        if (!confirm(`This will use AI to classify ${unclassifiedCount} unclassified transactions. Continue?`)) return;

        setIsClassifying(true);
        try {
            const result = await cashbookService.classifyBulk();
            if (result.count > 0 && result.results) {
                setClassificationResults(result.results);
                setIsResultsModalOpen(true);
                loadData(); // Reload to show new classifications
            } else {
                alert(result.message);
            }
        } catch (error: any) {
            console.error('Classification failed', error);
            alert('Failed to classify transactions: ' + error.message);
        } finally {
            setIsClassifying(false);
        }
    };


    const countUnclassified = () => {
        let count = 0;
        if (Array.isArray(entries)) {
            entries.forEach(entry => {
                if (entry.requisitions?.status === 'COMPLETED' && entry.requisitions.line_items) {
                    const unclassifiedItems = entry.requisitions.line_items.filter((item: any) => !item.accounts);
                    if (unclassifiedItems.length > 0) count++;
                }
            });
        }
        return count;
    };

    const unclassifiedCount = countUnclassified();

    // Derived State for Filters
    const uniqueDepartments = React.useMemo(() => {
        if (orgDepartments.length > 0) return orgDepartments;
        const depts = new Set<string>();
        if (Array.isArray(entries)) {
            entries.forEach(entry => {
                if (entry.requisitions?.department) depts.add(entry.requisitions.department);
            });
        }
        return Array.from(depts).sort();
    }, [entries, orgDepartments]);

    const uniqueAccounts = React.useMemo(() => {
        const accs = new Set<string>();
        if (Array.isArray(entries)) {
            entries.forEach(entry => {
                entry.requisitions?.line_items?.forEach((item: any) => {
                    if (item.accounts?.name) {
                        accs.add(item.accounts.name);
                    }
                });
            });
        }
        return Array.from(accs).sort();
    }, [entries]);

    const uniqueStatuses = React.useMemo(() => {
        const stats = new Set<string>();
        if (Array.isArray(entries)) {
            entries.forEach(entry => {
                let status = '';
                if (entry.entry_type === 'INFLOW' || entry.entry_type === 'ADJUSTMENT' || entry.entry_type === 'EXPENSE') {
                    status = entry.qb_sync_status === 'SUCCESS' || entry.status === 'ACCOUNTED' ? 'ACCOUNTED' : entry.status || 'PENDING';
                } else if (entry.entry_type === 'DISBURSEMENT' && entry.requisitions) {
                    status = entry.requisitions.qb_sync_status === 'SUCCESS' || entry.requisitions.status === 'ACCOUNTED' ? 'ACCOUNTED' : entry.requisitions.status;
                }
                if (status) stats.add(status);
            });
        }
        return Array.from(stats).sort();
    }, [entries]);

    // Processed Data (Search, Filter, Sort)
    const processedEntries = React.useMemo(() => {
        let result = Array.isArray(entries) ? [...entries] : [];

        // Filter out pending checkouts/intents by default unless toggled
        if (!showPendingIntents) {
            result = result.filter(entry => {
                const isPendingIntent = entry.status === 'PENDING' &&
                    entry.entry_type === 'INFLOW' &&
                    (entry.description?.startsWith('PENDING_INTENT:') || entry.description?.includes('PENDING_INTENT:'));
                return !isPendingIntent;
            });
        }

        // Always hide net-zero reconciliation entries (kept in DB for sync dedup, not user-facing)
        result = result.filter(entry => {
            const isNetZeroReconciliation = Number(entry.debit) === 0 &&
                Number(entry.credit) === 0 &&
                entry.description?.includes('[Reconciled:');
            return !isNetZeroReconciliation;
        });

        // 1. Dropdown Filters
        if (filterDepartment !== 'ALL') {
            result = result.filter(entry => entry.requisitions?.department === filterDepartment);
        }

        if (filterAccount !== 'ALL') {
            result = result.filter(entry => {
                // Return true if any line item in this entry matches the account filter
                return entry.requisitions?.line_items?.some((item: any) => item.accounts?.name === filterAccount);
            });
        }

        if (filterStatus !== 'ALL') {
            result = result.filter(entry => {
                let status = '';
                if (entry.entry_type === 'INFLOW' || entry.entry_type === 'ADJUSTMENT' || entry.entry_type === 'EXPENSE') {
                    status = entry.qb_sync_status === 'SUCCESS' || entry.status === 'ACCOUNTED' ? 'ACCOUNTED' : entry.status || 'PENDING';
                } else if (entry.entry_type === 'DISBURSEMENT' && entry.requisitions) {
                    status = entry.requisitions.qb_sync_status === 'SUCCESS' || entry.requisitions.status === 'ACCOUNTED' ? 'ACCOUNTED' : entry.requisitions.status;
                }
                return status === filterStatus;
            });
        }

        // 2. Text Search
        if (searchQuery.trim() !== '') {
            const query = searchQuery.toLowerCase();
            result = result.filter(entry => {
                const desc = (entry.description?.split(' | Ref:')[0] || '').toLowerCase();
                const reqDesc = (entry.requisitions?.description?.split(' | Ref:')[0] || '').toLowerCase();
                const refNum = entry.requisitions?.reference_number?.toLowerCase() || '';
                const requestor = entry.requisitions?.requestor?.name?.toLowerCase() || '';
                return desc.includes(query) || reqDesc.includes(query) || refNum.includes(query) || requestor.includes(query);
            });
        }

        // 3. Sort
        result.sort((a, b) => {
            if (sortBy === 'DATE_DESC') return new Date(b.date).getTime() - new Date(a.date).getTime();
            if (sortBy === 'DATE_ASC') return new Date(a.date).getTime() - new Date(b.date).getTime();

            // Amount sorting (treating Debit vs Credit)
            // For ledger sorting, we usually sort by absolute transaction value or net impact. 
            // We'll use the larger of the two (since it's usually one or the other).
            const amtA = Math.max(Number(a.debit || 0), Number(a.credit || 0));
            const amtB = Math.max(Number(b.debit || 0), Number(b.credit || 0));

            if (sortBy === 'AMOUNT_HIGH') return amtB - amtA;
            if (sortBy === 'AMOUNT_LOW') return amtA - amtB;

            return 0;
        });

        return result;

    }, [entries, searchQuery, filterDepartment, filterAccount, filterStatus, sortBy, showPendingIntents]);

    const groupedEntries = React.useMemo(() => {
        const groups: { month: string, entries: CashbookEntry[] }[] = [];
        processedEntries.forEach(entry => {
            const date = new Date(entry.date);
            const monthYear = date.toLocaleString('default', { month: 'long', year: 'numeric' }).replace(' ', ' · ');
            let group = groups.find(g => g.month === monthYear);
            if (!group) {
                group = { month: monthYear, entries: [] };
                groups.push(group);
            }
            group.entries.push(entry);
        });
        return groups;
    }, [processedEntries]);

    // Arm the fade countdown ONLY once the sync has finished and the visible,
    // filtered list for the currently selected wallet/account actually contains
    // a new row on screen. A slow "Synchronizing Ledger" spinner therefore
    // never eats into the highlight window, and a payment sitting in a
    // different wallet keeps its glow until that wallet's UI has rendered it.
    const displayedHasNew = !loading && processedEntries.some(e => walletSeen.isNew(entryStamp(e)));
    useEffect(() => {
        if (displayedHasNew) walletSeen.observe();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [displayedHasNew]);

    const formatCurrency = (amount: number) => {
        return `K${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    const formatDateSlash = (dateString: string) => {
        try {
            const date = new Date(dateString);
            const day = date.getDate().toString().padStart(2, '0');
            const month = (date.getMonth() + 1).toString().padStart(2, '0');
            const year = date.getFullYear();
            return `${day}/${month}/${year}`;
        } catch (e) {
            return '';
        }
    };

    const getMobileFlagColor = (entry: CashbookEntry) => {
        const isUnclassified = !entry.account_id && entry.entry_type === 'DISBURSEMENT';
        const isLowAudit = entry.requisitions?.audit_score !== undefined && entry.requisitions.audit_score < 70;
        const isRejected = entry.requisitions?.status === 'REJECTED';
        
        if (isUnclassified || isLowAudit || isRejected) {
            return 'text-red-500 fill-red-500/10';
        }
        return 'text-[#006AFF] fill-[#006AFF]/10';
    };

    const renderMobileBreakdown = (entry: CashbookEntry) => {
        if (entry.requisition_id) {
            const req: any = entry.requisitions || {};
            const items = req.line_items || [];
            const disbursement = req.disbursements?.[0];

            const actualExpenditure = items.length > 0
                ? items.reduce((acc: number, item: any) => acc + Number(item.actual_amount ?? item.estimated_amount ?? 0), 0)
                : Number(req.actual_total ?? 0);

            const confirmedChange = Number(disbursement?.confirmed_change_amount || 0);
            const totalPrepared = Number(disbursement?.total_prepared || entry.credit || 0);
            const discrepancy = totalPrepared - actualExpenditure - confirmedChange;

            return (
                <div className="flex flex-col gap-5 text-left">
                    {/* Action Buttons */}
                    <div className="flex flex-wrap gap-2.5">
                        <button 
                            onClick={async (e) => {
                                e.stopPropagation();
                                const requisitionId = entry.requisition_id || req.id;
                                // Fetch the full requisition so the modal matches the inbox view.
                                setIsRequisitionModalOpen(true);
                                try {
                                    const fullReq = await requisitionService.getById(requisitionId);
                                    setSelectedRequisition(fullReq as any);
                                } catch (err) {
                                    console.error('Failed to fetch requisition details:', err);
                                    setSelectedRequisition({
                                        id: req.id,
                                        reference_number: req.reference_number || 'N/A',
                                        description: req.description || entry.description,
                                        status: req.status || 'COMPLETED',
                                        total_amount: req.actual_total || entry.debit || entry.credit || 0
                                    } as any);
                                }
                            }}
                            className="flex-1 min-w-[120px] flex items-center justify-center py-2.5 bg-slate-900 active:bg-slate-800 text-white rounded-xl text-[11px] font-bold uppercase tracking-wider transition-all"
                        >
                            <Info size={12} className="mr-1.5" />
                            Details
                        </button>
                        
                        {(req.status === 'EXPENSED' || req.status === 'DISBURSED' || req.status === 'RECEIVED') && (
                            <button 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    const allItemsHaveAccount = items.every((item: any) => !!item.account_id);
                                    if (!allItemsHaveAccount) {
                                        alert('Please categorize all line items before approving');
                                        return;
                                    }
                                    handleApproveCategorization(req.id);
                                }}
                                className="flex-1 min-w-[120px] flex items-center justify-center py-2.5 bg-emerald-600 active:bg-emerald-700 text-white rounded-xl text-[11px] font-bold uppercase tracking-wider transition-all"
                            >
                                <CheckCircle2 size={12} className="mr-1.5" />
                                Approve
                            </button>
                        )}
                        
                        {(req.status === 'ACCOUNTED' || req.status === 'COMPLETED' || req.status === 'CATEGORIZED') && req.qb_sync_status !== 'SUCCESS' && (
                            <button 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handlePostToQB(req, entry);
                                }}
                                className="flex-1 min-w-[120px] flex items-center justify-center py-2.5 bg-[#006AFF] active:bg-[#0052CC] text-white rounded-xl text-[11px] font-bold uppercase tracking-wider transition-all"
                            >
                                <RefreshCw size={12} className="mr-1.5" />
                                QuickBooks
                            </button>
                        )}

                        {req.qb_sync_status === 'SUCCESS' && (
                            <div className="flex-1 min-w-[120px] flex items-center justify-center py-2.5 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-xl text-[11px] font-bold uppercase tracking-wider">
                                <CheckCircle2 size={12} className="mr-1.5" />
                                Synced
                            </div>
                        )}
                    </div>

                    {/* Summary Metrics */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="bg-white border border-gray-100 rounded-xl p-3 shadow-2xs">
                            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Disbursed</span>
                            <span className="text-sm font-extrabold text-slate-800 block mt-0.5">{formatCurrency(totalPrepared)}</span>
                        </div>
                        <div className="bg-white border border-gray-100 rounded-xl p-3 shadow-2xs">
                            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Expenditure</span>
                            <span className="text-sm font-extrabold text-slate-800 block mt-0.5">{formatCurrency(actualExpenditure)}</span>
                        </div>
                        {confirmedChange > 0 && (
                            <div className="bg-white border border-gray-100 rounded-xl p-3 shadow-2xs">
                                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Change Returned</span>
                                <span className="text-sm font-extrabold text-emerald-600 block mt-0.5">{formatCurrency(confirmedChange)}</span>
                            </div>
                        )}
                        <div className={`border rounded-xl p-3 shadow-2xs ${Math.abs(discrepancy) > 0.01 ? 'bg-rose-50/50 border-rose-100 text-rose-600' : 'bg-white border-gray-100 text-slate-800'}`}>
                            <span className="text-[9px] font-bold uppercase tracking-wider opacity-60">Discrepancy</span>
                            <span className="text-sm font-extrabold block mt-0.5">{formatCurrency(discrepancy)}</span>
                        </div>
                    </div>

                    {/* Categorization Section */}
                    {items.length > 0 && (
                        <div className="flex flex-col gap-3">
                            <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Categorization</span>
                            <div className="flex flex-col gap-2 bg-white border border-gray-100 rounded-2xl p-3.5">
                                {items.map((item: any, idx: number) => (
                                    <div key={item.id || idx} className="flex flex-col gap-2 pb-3 border-b border-gray-50 last:border-b-0">
                                        <div className="flex justify-between items-start">
                                            <span className="text-xs font-semibold text-slate-700">{item.description}</span>
                                            <span className="text-xs font-bold text-slate-800">{formatCurrency(item.actual_amount ?? item.estimated_amount)}</span>
                                        </div>
                                        <div className="w-full">
                                            <SearchableAccountSelect 
                                                value={item.account_id || ''} 
                                                options={accounts} 
                                                onChange={(val) => handleAccountChange(item.id, val)}
                                                placeholder="Select category..."
                                              />
                                          </div>
                                      </div>
                                  ))}
                              </div>
                          </div>
                      )}
                  </div>
              );
          }

          if (entry.entry_type === 'INFLOW' || entry.entry_type === 'ADJUSTMENT' || ((entry.entry_type === 'DISBURSEMENT' || entry.entry_type === 'EXPENSE') && !entry.requisition_id)) {
              return (
                  <div className="flex flex-col gap-4 text-left">
                      <div className="flex flex-col gap-1.5">
                          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Accounting Account</span>
                          <div className="w-full bg-white rounded-xl">
                              <SearchableAccountSelect 
                                  value={entry.account_id || ''} 
                                  options={accounts} 
                                  onChange={(val) => handleLedgerAccountChange(entry.id, val)}
                                  placeholder="Select category..."
                              />
                          </div>
                      </div>
                      {entry.qb_sync_status !== 'SUCCESS' ? (
                          <button 
                              onClick={(e) => {
                                  e.stopPropagation();
                                  if (!entry.account_id) {
                                      alert('Please select an accounting account first');
                                      return;
                                  }
                                  handlePostLedgerToQB(entry);
                              }}
                              disabled={!entry.account_id}
                              className={`w-full py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center ${
                                  entry.account_id 
                                      ? 'bg-[#006AFF] text-white active:bg-blue-700' 
                                      : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                              }`}
                          >
                              <RefreshCw size={12} className="mr-1.5" />
                              Post to QuickBooks
                          </button>
                      ) : (
                          <div className="w-full py-3 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center">
                              <CheckCircle2 size={12} className="mr-1.5" />
                              Posted to QuickBooks
                          </div>
                      )}
                  </div>
              );
          }

          return null;
      };

    const getResolvedStatus = (entry: CashbookEntry): string => {
        if (entry.entry_type === 'CLOSING_BALANCE') return 'CLOSED';
        if (entry.entry_type === 'OPENING_BALANCE') return 'OPENING';
        if (entry.entry_type === 'INFLOW' || entry.entry_type === 'ADJUSTMENT' || entry.entry_type === 'EXPENSE') {
            return entry.qb_sync_status === 'SUCCESS' || entry.status === 'ACCOUNTED' ? 'ACCOUNTED' : entry.status || 'PENDING';
        } else if (entry.requisitions) {
            return entry.requisitions.qb_sync_status === 'SUCCESS' || entry.requisitions.status === 'ACCOUNTED' ? 'ACCOUNTED' : entry.requisitions.status;
        }
        return entry.status || 'PENDING';
    };

    const getEntryStatus = (entry: CashbookEntry) => {
        if (entry.entry_type === 'CLOSING_BALANCE') return <span className="inline-flex items-center text-[10px] font-normal uppercase tracking-wider text-slate-700"><Lock size={10} className="mr-1" /> Closed</span>;
        if (entry.entry_type === 'OPENING_BALANCE') return <span className="inline-flex items-center text-[10px] font-normal uppercase tracking-wider text-indigo-700">Opening</span>;
        
        const status = getResolvedStatus(entry);
        if (status === 'CLOSED' || status === 'OPENING') return null;
        
        const config = getStatusConfig(status);

        const getStatusIcon = (iconType: string, color: string) => {
            const colorClass = color === 'blue' ? 'text-[#006AFF]' : 
                               color === 'emerald' ? 'text-emerald-500' :
                               color === 'amber' ? 'text-amber-500' :
                               color === 'red' ? 'text-red-500' :
                               color === 'purple' ? 'text-purple-500' : 'text-gray-400';

            switch (iconType) {
                case 'clock': return <Clock size={12} className={colorClass} />;
                case 'check-circle': return <CheckCircle2 size={12} className={colorClass} />;
                case 'check': return <Check size={12} className={colorClass} />;
                case 'alert': return <AlertCircle size={12} className={colorClass} />;
                case 'rotate': return <RotateCcw size={12} className={colorClass} />;
                default: return <Clock size={12} className={colorClass} />;
            }
        };

        return (
            <div className="flex items-center w-fit">
                {getStatusIcon(config.iconType, config.color)}
                <span className="text-[10px] font-normal uppercase tracking-[0.15em] ml-1.5 text-gray-900">
                    {config.label}
                </span>
            </div>
        );
    };

    const handlePostToQB = async (req: any, entry: CashbookEntry) => {
        setPostingReview({
            type: 'REQUISITION',
            data: req,
            entry
        });
    };

    const handleAccountChange = async (lineItemId: string, accountId: string) => {
        try {
            await requisitionService.updateLineItemAccount(lineItemId, accountId);
            loadData();
        } catch (error: any) {
            alert('Failed to update account: ' + error.message);
        }
    };

    const handleLedgerAccountChange = async (entryId: string, accountId: string) => {
        try {
            await cashbookService.updateAccount(entryId, accountId);
            loadData();
        } catch (error: any) {
            alert('Failed to update account: ' + error.message);
        }
    };

    const handleAccountAndNarrate = async (entryId: string, description: string, accountId?: string) => {
        try {
            await cashbookService.narrateEntry(entryId, description, accountId);
            const newEditing = { ...editingNarration };
            delete newEditing[entryId];
            setEditingNarration(newEditing);
            loadData();
        } catch (error: any) {
            alert('Failed to save transaction details: ' + error.message);
        }
    };

    const confirmPostRequisition = async (req: any) => {
        try {
            setIsPosting(true);
            const result = await requisitionService.postToQuickBooks(req.id, {
                payment_account_id: 'CASH_ACCOUNT_ID', 
                payment_account_name: 'Cash on hand'
            });
            setPostSuccess({ qbId: result.qb_expense_id, type: 'Expense' });
            setPostingReview(null);
            loadData();
        } catch (error: any) {
            alert('Failed to post to QuickBooks: ' + error.message);
        } finally {
            setIsPosting(false);
        }
    };


    const handleApproveCategorization = async (requisitionId: string) => {
        try {
            await requisitionService.approveCategorization(requisitionId);
            alert('Categorization approved successfully!');
            loadData();
        } catch (error: any) {
            alert('Failed to approve categorization: ' + error.message);
        }
    };


    const handlePostLedgerToQB = async (entry: CashbookEntry) => {
        setPostingReview({
            type: 'INFLOW',
            data: entry,
            entry
        });
    };

    const confirmPostLedger = async (entry: CashbookEntry) => {
        try {
            setIsPosting(true);
            const result = await cashbookService.postToQuickBooks(entry.id, entry.account_id!);
            if (result.success) {
                setPostSuccess({ qbId: result.qbId, type: entry.entry_type === 'INFLOW' ? 'Deposit' : 'Journal Entry' });
                setPostingReview(null);
                loadData();
            } else {
                alert('Failed to post: ' + (result.error?.Message || result.error || 'Unknown error'));
            }
        } catch (error: any) {
            alert('Failed to post to QuickBooks: ' + error.message);
        } finally {
            setIsPosting(false);
        }
    };

    const handleVerifyPendingInflow = async (entry: CashbookEntry) => {
        const reference = entry.external_reference || entry.description.match(/Ref:\s*([^\s|]+)/)?.[1];
        if (!reference) {
            alert('No transaction reference found for this entry.');
            return;
        }

        try {
            setVerifyingEntryId(entry.id);
            const res = await lencoService.verifyStatus(reference, undefined, entry.organization_id);
            if (res.verified) {
                alert('Transaction verified successfully! The ledger has been updated.');
                loadData();
            } else if (res.status === 'DELETED') {
                alert('This payment intent was never successfully generated on Lenco (it was abandoned/cancelled). We have cleaned up and removed this pending intent from the ledger.');
                loadData();
            } else {
                alert(`Transaction status check returned: ${res.status || 'pending'}. The payment gateway hasn't reported this transaction as successful yet.`);
            }
        } catch (error: any) {
            console.error('Failed to verify transaction status:', error);
            alert('Failed to verify transaction status: ' + error.message);
        } finally {
            setVerifyingEntryId(null);
        }
    };

    const handleDownloadReceipt = async (entryId: string) => {
        try {
            setGeneratingReceiptId(entryId);
            const details = await lencoService.getSaleReceiptDetails(entryId);

            const { jsPDF } = await import('jspdf');
            const doc = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4'
            });

            // Color Palette
            const primaryColor = '#0f172a'; // slate-900
            const accentColor = '#2563eb'; // blue-600

            // 1. Draw branding header
            doc.setFont('Helvetica', 'bold');
            doc.setFontSize(20);
            doc.setTextColor(primaryColor);
            doc.text(details.org.name.toUpperCase(), 20, 25);

            doc.setFontSize(9);
            doc.setFont('Helvetica', 'normal');
            doc.setTextColor('#64748b'); // slate-500
            doc.text('Official Payment Receipt', 20, 31);

            // Right-aligned title
            doc.setFont('Helvetica', 'bold');
            doc.setFontSize(11);
            doc.setTextColor(accentColor);
            doc.text('RECEIPT', 190, 25, { align: 'right' });

            // Divider
            doc.setDrawColor('#e2e8f0'); // slate-200
            doc.setLineWidth(0.5);
            doc.line(20, 36, 190, 36);

            // 2. Receipt metadata
            doc.setFont('Helvetica', 'normal');
            doc.setFontSize(9);
            doc.setTextColor('#334155'); // slate-700
            doc.text(`Receipt No: #${details.receiptNumber}`, 20, 46);
            doc.text(`Date: ${new Date(details.date).toLocaleString()}`, 20, 52);
            doc.text(`Payment Method: Lenco (Card/Mobile Money)`, 20, 58);

            doc.text(`Bill To:`, 120, 46);
            doc.setFont('Helvetica', 'bold');
            doc.text(details.customerName, 120, 52);
            doc.setFont('Helvetica', 'normal');
            doc.text(`Phone: ${details.customerPhone}`, 120, 58);

            // Divider
            doc.line(20, 65, 190, 65);

            // 3. Products Table Header
            doc.setFillColor('#f8fafc'); // slate-50
            doc.rect(20, 72, 170, 8, 'F');
            doc.setFont('Helvetica', 'bold');
            doc.setFontSize(9);
            doc.setTextColor('#475569'); // slate-600
            doc.text('Item Description', 24, 77);
            doc.text('Qty', 110, 77, { align: 'center' });
            doc.text('Unit Price (K)', 145, 77, { align: 'right' });
            doc.text('Total (K)', 186, 77, { align: 'right' });

            let y = 86;
            doc.setFont('Helvetica', 'normal');
            doc.setTextColor('#334155');

            details.items.forEach((item: any) => {
                doc.text(item.name, 24, y);
                doc.text(item.quantity.toString(), 110, y, { align: 'center' });
                doc.text(Number(item.price).toFixed(2), 145, y, { align: 'right' });
                doc.text(Number(item.total).toFixed(2), 186, y, { align: 'right' });

                // Underline for items
                doc.setDrawColor('#f1f5f9');
                doc.line(20, y + 3, 190, y + 3);
                y += 10;
            });

            // 4. Financial Calculations
            const calculationsStartY = y + 5;
            y += 5;
            doc.setFont('Helvetica', 'normal');
            doc.text('Subtotal:', 140, y, { align: 'right' });
            doc.text(`K ${Number(details.subtotal).toFixed(2)}`, 186, y, { align: 'right' });

            y += 6;
            doc.text('Processing Fee (2.5%):', 140, y, { align: 'right' });
            doc.text(`K ${Number(details.processingFee).toFixed(2)}`, 186, y, { align: 'right' });

            y += 8;
            doc.setFont('Helvetica', 'bold');
            doc.setFontSize(10);
            doc.setTextColor(primaryColor);
            doc.text('Total Paid:', 140, y, { align: 'right' });
            doc.text(`K ${Number(details.totalPaid).toFixed(2)}`, 186, y, { align: 'right' });

            // Generate and draw QR code on the left side of calculations
            try {
                const qrText = `Receipt Verification
Merchant: ${details.org.name}
Receipt No: #${details.receiptNumber}
Client: ${details.customerName}
Phone: ${details.customerPhone}
Amount: ZMW ${Number(details.subtotal).toFixed(2)}
Total Paid: ZMW ${Number(details.totalPaid).toFixed(2)}
Date: ${new Date(details.date).toLocaleString()}
Status: VERIFIED`;

                // inline helper function for QR code URL fetching
                const qrCodeDataUrl = await new Promise<string>((resolve, reject) => {
                    const img = new Image();
                    img.crossOrigin = 'anonymous';
                    img.src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(qrText)}`;
                    img.onload = () => {
                        const canvas = document.createElement('canvas');
                        canvas.width = img.width;
                        canvas.height = img.height;
                        const ctx = canvas.getContext('2d');
                        if (ctx) {
                            ctx.drawImage(img, 0, 0);
                            resolve(canvas.toDataURL('image/png'));
                        } else {
                            reject(new Error('Failed to get 2D context'));
                        }
                    };
                    img.onerror = (e) => reject(e);
                });

                doc.addImage(qrCodeDataUrl, 'PNG', 20, calculationsStartY - 2, 28, 28);

                // Add small helper label
                doc.setFont('Helvetica', 'normal');
                doc.setFontSize(6.5);
                doc.setTextColor('#94a3b8'); // slate-400
                doc.text('SCAN TO VERIFY RECEIPT', 34, calculationsStartY + 29, { align: 'center' });
            } catch (qrErr) {
                console.error('Failed to add QR code to PDF:', qrErr);
            }

            // Divider
            y += 10;
            doc.setDrawColor('#e2e8f0');
            doc.line(20, y, 190, y);

            // 5. Footer
            y += 12;
            doc.setFont('Helvetica', 'italic');
            doc.setFontSize(9);
            doc.setTextColor('#94a3b8'); // slate-400
            doc.text('Thank you for your payment!', 105, y, { align: 'center' });

            y += 5;
            doc.setFont('Helvetica', 'normal');
            doc.setFontSize(8);
            doc.text('Secured by MoneyWise Ledger Gateway', 105, y, { align: 'center' });

            // Save PDF
            doc.save(`receipt-${details.receiptNumber}.pdf`);
        } catch (err: any) {
            console.error('Failed to generate receipt PDF:', err);
            alert(err.message || 'Failed to download receipt');
        } finally {
            setGeneratingReceiptId(null);
        }
    };

    const renderBreakdown = (entry: CashbookEntry) => {
        // Case 1: Requisition Breakdown (Expenses)
        // Gate on requisition_id only so the breakdown (and the "View Full Details"
        // button) still render even if the requisitions join wasn't populated for
        // this entry. `req` is defaulted so downstream optional access can't crash.
        if (entry.requisition_id) {
            const req: any = entry.requisitions || {};
            const items = req.line_items || [];
            const disbursement = req.disbursements?.[0];

            const actualExpenditure = items.length > 0
                ? items.reduce((acc: number, item: any) => acc + Number(item.actual_amount ?? item.estimated_amount ?? 0), 0)
                : Number(req.actual_total ?? 0);

            const confirmedChange = Number(disbursement?.confirmed_change_amount || 0);
            const totalPrepared = Number(disbursement?.total_prepared || entry.credit || 0);

            const discrepancy = totalPrepared - actualExpenditure - confirmedChange;
            const expectedChange = totalPrepared - actualExpenditure;

            const handleViewDetails = async (entry: any) => {
                const requisitionId = entry.requisition_id || entry.requisitions?.id;

                if (!requisitionId) {
                    console.warn('No requisition ID found for this entry');
                    return;
                }

                // Fetch the full requisition (same source the inbox uses) so the modal
                // shows complete, consistent data instead of a thin partial object.
                setIsRequisitionModalOpen(true);
                try {
                    const fullReq = await requisitionService.getById(requisitionId);
                    setSelectedRequisition(fullReq as any);
                } catch (err) {
                    console.error('Failed to fetch requisition details:', err);
                    setSelectedRequisition({
                        id: requisitionId,
                        reference_number: entry.requisitions?.reference_number || 'N/A',
                        description: entry.requisitions?.description || entry.description,
                        status: entry.requisitions?.status || 'COMPLETED',
                        total_amount: entry.requisitions?.actual_total || entry.debit || entry.credit || 0
                    } as any);
                }
            };

            return (
                <div className="details-content redesign animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="flex flex-wrap items-center justify-between gap-4 mb-8 pb-6 border-b border-gray-100">
                        <div className="flex flex-wrap items-center gap-4">
                            <button 
                                onClick={async (e) => {
                                    e.stopPropagation();
                                    handleViewDetails(entry);
                                }}
                                className="flex items-center px-5 py-2.5 bg-brand-navy hover:bg-slate-800 text-white rounded-xl text-[11px] font-bold transition-all shadow-sm active:scale-95 uppercase tracking-widest"
                            >
                                <Info size={14} className="mr-2" />
                                View Full Details
                            </button>
                            
                            {(req.status === 'EXPENSED' || req.status === 'DISBURSED' || req.status === 'RECEIVED') && (
                                <button 
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        const allItemsHaveAccount = items.every((item: any) => !!item.account_id);
                                        if (!allItemsHaveAccount) {
                                            alert('Please categorize all line items before approving');
                                            return;
                                        }
                                        handleApproveCategorization(req.id);
                                    }}
                                    className="flex items-center px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[11px] font-bold transition-all shadow-sm active:scale-95 uppercase tracking-widest"
                                >
                                    <CheckCircle2 size={14} className="mr-2" />
                                    Approve Categorization
                                </button>
                            )}
                            
                            {(req.status === 'ACCOUNTED' || req.status === 'COMPLETED' || req.status === 'CATEGORIZED') && req.qb_sync_status !== 'SUCCESS' && (
                                <button 
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handlePostToQB(req, entry);
                                    }}
                                    className="flex items-center px-5 py-2.5 bg-[#006AFF] hover:bg-[#0052CC] text-white rounded-xl text-[11px] font-bold transition-all shadow-sm active:scale-95 uppercase tracking-widest"
                                >
                                    <RefreshCw size={14} className="mr-2" />
                                    Post to QuickBooks
                                </button>
                            )}

                            {req.qb_sync_status === 'SUCCESS' && (
                                <div className="flex items-center px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl text-[11px] font-bold uppercase tracking-widest border border-emerald-100/50">
                                    <CheckCircle2 size={14} className="mr-2" />
                                    Posted to QuickBooks
                                </div>
                            )}
                        </div>

                        <div className="flex items-center gap-6">
                            <div className="flex flex-col items-end">
                                <span className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">Reference</span>
                                <span className="text-[13px] font-bold text-brand-navy">{req.reference_number || 'N/A'}</span>
                            </div>
                            <div className="flex flex-col items-end">
                                <span className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">Status</span>
                                <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${
                                    req.status === 'ACCOUNTED'
                                        ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' 
                                        : req.status === 'COMPLETED' || req.status === 'CATEGORIZED'
                                        ? 'bg-blue-50 text-blue-600 border border-blue-100'
                                        : 'bg-amber-50 text-amber-600 border border-amber-100'
                                }`}>
                                    {req.status === 'CATEGORIZED' ? 'COMPLETED' : req.status}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Main Breakdown Table */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.04)]">
                        <table className="breakdown-table-modern table-fixed">
                            <thead>
                                <tr>
                                    <th className="text-left w-[30%]">Description</th>
                                    <th className="text-left w-[30%]">Accounting Treatment</th>
                                    <th className="text-center w-[10%]">Qty</th>
                                    <th className="text-right w-[15%]">Expected Total</th>
                                    <th className="text-right w-[15%]">Actual Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {/* Disbursement Row */}
                                <tr className="summary-row cash-distributed bg-slate-50/50">
                                    <td className="font-bold flex items-center">
                                        <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center mr-3">
                                            <Coins size={12} className="text-slate-600" />
                                        </div>
                                        Actual Cash Disbursed
                                    </td>
                                    <td className="text-center">-</td>
                                    <td className="text-right">-</td>
                                    <td className="text-right font-black text-brand-navy text-[14px]">{formatCurrency(totalPrepared)}</td>
                                </tr>
                                
                                {/* Itemized Expenses */}
                                {items.map((item: any, idx: number) => (
                                    <tr key={item.id || idx} className="hover:bg-gray-50/50 transition-colors">
                                        <td className="pl-6 py-4">
                                            <div className="flex flex-col">
                                                <span className="text-[13px] font-semibold text-gray-800">{item.description}</span>
                                                <span className="text-[10px] text-gray-400">Line Item #{idx + 1}</span>
                                            </div>
                                        </td>
                                        <td className="py-4">
                                            <SearchableAccountSelect 
                                                value={item.account_id || ''} 
                                                options={accounts} 
                                                onChange={(val) => handleAccountChange(item.id, val)}
                                                placeholder="Categorize expense..."
                                            />
                                        </td>
                                        <td className="text-center text-gray-600 font-medium">{item.quantity || 1}</td>
                                        <td className="text-right text-gray-400 text-[13px]">{formatCurrency(item.estimated_amount)}</td>
                                        <td className="text-right font-black text-gray-900 text-[14px]">{formatCurrency(item.actual_amount ?? item.estimated_amount)}</td>
                                    </tr>
                                ))}

                                {/* Excess Change Row (if any) */}
                                {confirmedChange > 0 && (
                                    <tr className="summary-row change-returned">
                                        <td className="font-bold flex items-center">
                                            <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center mr-3">
                                                <RotateCcw size={12} className="text-emerald-600" />
                                            </div>
                                            Excess Cash Returned
                                        </td>
                                        <td className="text-center">-</td>
                                        <td className="text-right">{formatCurrency(expectedChange)}</td>
                                        <td className="text-right font-black text-emerald-600 text-[14px]">{formatCurrency(confirmedChange)}</td>
                                    </tr>
                                )}
                                
                                <tr className="summary-row expenditure-row border-t border-gray-100 bg-slate-50/30">
                                    <td className="font-bold flex items-center pl-4 py-4">
                                        <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center mr-3">
                                            <Receipt size={12} className="text-slate-500" />
                                        </div>
                                        Total Actual Expenditure
                                    </td>
                                    <td className="text-center">-</td>
                                    <td className="text-right">-</td>
                                    <td className="text-right font-black text-gray-900 text-[14px]">{formatCurrency(actualExpenditure)}</td>
                                </tr>

                                {/* Change Rows */}
                                <tr className="summary-row border-t border-gray-50">
                                    <td className="text-gray-500 font-medium pl-6">Expected Change</td>
                                    <td className="text-center">-</td>
                                    <td className="text-right">-</td>
                                    <td className="text-right font-bold text-gray-500">{formatCurrency(expectedChange)}</td>
                                </tr>

                                <tr className="summary-row">
                                    <td className="text-gray-800 font-bold flex items-center pl-6">
                                        <Check size={14} className="text-emerald-500 mr-2" />
                                        Actual Change Returned
                                    </td>
                                    <td className="text-center">-</td>
                                    <td className="text-right">-</td>
                                    <td className="text-right font-black text-emerald-600 text-[14px]">{formatCurrency(confirmedChange)}</td>
                                </tr>

                                {/* Variance Row */}
                                <tr className={`summary-row border-t-2 ${Math.abs(discrepancy) > 0.01 ? 'bg-rose-50/50' : 'bg-gray-50/30'}`}>
                                    <td className="font-black flex items-center pl-4 py-4">
                                        <div className={`w-6 h-6 rounded-full flex items-center justify-center mr-3 ${Math.abs(discrepancy) > 0.01 ? 'bg-rose-100' : 'bg-gray-100'}`}>
                                            <AlertTriangle size={12} className={Math.abs(discrepancy) > 0.01 ? 'text-rose-600' : 'text-gray-400'} />
                                        </div>
                                        Cash Discrepancy
                                    </td>
                                    <td className="text-center">-</td>
                                    <td className="text-right">-</td>
                                    <td className={`text-right font-black text-[15px] ${Math.abs(discrepancy) > 0.01 ? 'text-rose-600' : 'text-gray-400'}`}>
                                        {formatCurrency(discrepancy)}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            );
        }

        // Case 2: Inflow, Adjustment, or Non-Requisition Disbursement
        if (entry.entry_type === 'INFLOW' || entry.entry_type === 'ADJUSTMENT' || ((entry.entry_type === 'DISBURSEMENT' || entry.entry_type === 'EXPENSE') && !entry.requisition_id)) {

            return (
                <div className="details-content redesign animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="flex flex-wrap items-center justify-between gap-4 mb-8 pb-6 border-b border-gray-100">
                        <div className="flex flex-wrap items-center gap-4">
                            {entry.status === 'PENDING' ? (
                                <button 
                                    onClick={async (e) => {
                                        e.stopPropagation();
                                        handleVerifyPendingInflow(entry);
                                    }}
                                    disabled={verifyingEntryId === entry.id}
                                    className="flex items-center px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[11px] font-bold transition-all shadow-sm active:scale-95 uppercase tracking-widest disabled:opacity-50"
                                >
                                    {verifyingEntryId === entry.id ? (
                                        <>
                                            <Loader2 size={14} className="mr-2 animate-spin" />
                                            Checking Gateway...
                                        </>
                                    ) : (
                                        <>
                                            <RefreshCw size={14} className="mr-2" />
                                            Verify Transaction
                                        </>
                                    )}
                                </button>
                            ) : entry.qb_sync_status !== 'SUCCESS' ? (
                                <button 
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (!entry.account_id) {
                                            alert('Please select an accounting account first');
                                            return;
                                        }
                                        handlePostLedgerToQB(entry);
                                    }}
                                    disabled={!entry.account_id}
                                    className={`flex items-center px-5 py-2.5 rounded-xl text-[11px] font-bold transition-all shadow-sm active:scale-95 uppercase tracking-widest ${
                                        entry.account_id 
                                            ? 'bg-[#006AFF] hover:bg-[#0052CC] text-white' 
                                            : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                    }`}
                                >
                                    <RefreshCw size={14} className="mr-2" />
                                    Post to QuickBooks
                                </button>
                            ) : (
                                <div className="flex items-center px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl text-[11px] font-bold uppercase tracking-widest border border-emerald-100/50">
                                    <CheckCircle2 size={14} className="mr-2" />
                                    Posted to QuickBooks
                                </div>
                            )}

                            {(entry.status === 'COMPLETED' || entry.status === 'ACCOUNTED') && 
                             entry.entry_type === 'INFLOW' && 
                             (entry.description?.startsWith('Sale:') || entry.description?.includes('Sale: Products') || entry.description?.includes('Revenue: Products')) && (
                                <button 
                                    onClick={async (e) => {
                                        e.stopPropagation();
                                        handleDownloadReceipt(entry.id);
                                    }}
                                    disabled={generatingReceiptId === entry.id}
                                    className="flex items-center px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-[11px] font-bold transition-all shadow-sm active:scale-95 uppercase tracking-widest disabled:opacity-50"
                                >
                                    {generatingReceiptId === entry.id ? (
                                        <>
                                            <Loader2 size={14} className="mr-2 animate-spin" />
                                            Generating PDF...
                                        </>
                                    ) : (
                                        <>
                                            <Download size={14} className="mr-2" />
                                            Download Receipt
                                        </>
                                    )}
                                </button>
                            )}
                        </div>

                        <div className="flex items-center gap-6">
                            <div className="flex flex-col items-end">
                                <span className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">Type</span>
                                <span className="text-[13px] font-bold text-brand-navy">{entry.entry_type}</span>
                            </div>
                            <div className="flex flex-col items-end">
                                <span className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">Status</span>
                                <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${
                                    entry.status === 'ACCOUNTED' || entry.qb_sync_status === 'SUCCESS'
                                        ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' 
                                        : entry.status === 'COMPLETED'
                                            ? 'bg-blue-50 text-[#006AFF] border border-blue-100'
                                            : 'bg-amber-50 text-amber-600 border border-amber-100'
                                }`}>
                                    {entry.status === 'ACCOUNTED' || entry.qb_sync_status === 'SUCCESS' ? 'ACCOUNTED' : entry.status || 'PENDING'}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.04)]">
                        <table className="breakdown-table-modern table-fixed">
                            <thead>
                                <tr>
                                    <th className="text-left w-[40%]">Description</th>
                                    <th className="text-left w-[40%]">Accounting Account</th>
                                    <th className="text-right w-[20%]">Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr className="hover:bg-gray-50/50 transition-colors">
                                    <td className="pl-6 py-4">
                                        <div className="flex flex-col">
                                            {entry.status === 'UNACCOUNTED' ? (
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="text"
                                                        value={editingNarration[entry.id] !== undefined ? editingNarration[entry.id] : entry.description.split(' | Ref:')[0]}
                                                        onChange={(e) => setEditingNarration({ ...editingNarration, [entry.id]: e.target.value })}
                                                        placeholder="Enter transaction narration / purpose..."
                                                        className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:border-[#006AFF] outline-none text-[13px] font-semibold text-gray-800"
                                                    />
                                                    <button
                                                        onClick={async (e) => {
                                                            e.stopPropagation();
                                                            const desc = editingNarration[entry.id] !== undefined ? editingNarration[entry.id] : entry.description.split(' | Ref:')[0];
                                                            if (!desc.trim()) {
                                                                alert('Narration cannot be empty.');
                                                                return;
                                                            }
                                                            let finalDesc = desc;
                                                            if (entry.description.includes(' | Ref:')) {
                                                                finalDesc = `${desc} | Ref:${entry.description.split(' | Ref:')[1]}`;
                                                            }
                                                            await handleAccountAndNarrate(entry.id, finalDesc, entry.account_id);
                                                        }}
                                                        className="px-4 py-2 bg-brand-navy hover:bg-slate-800 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest active:scale-95 transition-all shadow-sm flex-shrink-0"
                                                    >
                                                        Save
                                                    </button>
                                                </div>
                                            ) : (
                                                <span className="text-[13px] font-semibold text-gray-800">{entry.description}</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="py-4">
                                        <SearchableAccountSelect 
                                            value={entry.account_id || ''} 
                                            options={accounts} 
                                            onChange={(val) => {
                                                if (entry.status === 'UNACCOUNTED') {
                                                    const desc = editingNarration[entry.id] !== undefined ? editingNarration[entry.id] : entry.description.split(' | Ref:')[0];
                                                    let finalDesc = desc;
                                                    if (entry.description.includes(' | Ref:')) {
                                                        finalDesc = `${desc} | Ref:${entry.description.split(' | Ref:')[1]}`;
                                                    }
                                                    handleAccountAndNarrate(entry.id, finalDesc, val);
                                                } else {
                                                    handleLedgerAccountChange(entry.id, val);
                                                }
                                            }}
                                            placeholder={entry.entry_type === 'INFLOW' ? "Select Credit Account..." : "Select Debit Account..."}
                                        />
                                    </td>
                                    <td className="text-right font-black text-gray-900 text-[14px] pr-6">
                                        {formatCurrency(entry.debit || entry.credit)}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            );
        }

        return null;
    };

    if (loading && entries.length === 0) {
        return (
            <Layout noPadding={true} backgroundColor="bg-gray-50 md:bg-white">
                <div className="flex flex-col items-center justify-center min-h-[60vh]">
                    <div className="relative">
                        <div className="w-16 h-16 border-4 border-[#006AFF]/10 border-t-[#006AFF] rounded-full animate-spin" />
                        <Loader2 className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[#006AFF] animate-pulse" size={24} strokeWidth={2.5} />
                    </div>
                    <p className="mt-6 text-sm font-black uppercase tracking-[0.2em] text-gray-400 animate-pulse">
                        Synchronizing Ledger
                    </p>
                </div>
            </Layout>
        );
    }

    // MoneyWise <-> External toggle, styled & animated like the Reports tabs.
    const handleCategoryChange = (group: 'MONEYWISE' | 'EXTERNAL') => {
        setCategoryGroup(group);
        if (group === 'MONEYWISE') {
            setSelectedAccountType('MONEYWISE_WALLET');
            if (wallets.length > 0) {
                const mainWallet = wallets.find(w => w.is_main) || wallets[0];
                setSelectedWalletId(mainWallet.id);
            }
        } else {
            setSelectedAccountType('CASH');
            setSelectedWalletId(undefined);
        }
    };
    const categoryIndex = categoryGroup === 'MONEYWISE' ? 0 : 1;
    const categoryOptions = [
        { value: 'MONEYWISE', label: 'MoneyWise Wallets' },
        { value: 'EXTERNAL', label: 'External Accounts' },
    ];

    // ----- Mobile wallet-card carousel helpers -----
    const externalAccounts = [
        { id: 'CASH', name: 'Cash Account' },
        { id: 'AIRTEL_MONEY', name: 'Airtel Money' },
        { id: 'BANK', name: 'Bank Account' },
    ] as const;
    const slideCount = categoryGroup === 'MONEYWISE'
        ? Math.max(wallets.length, 1) + (!isRequestor && wallets.length > 0 ? 1 : 0)
        : externalAccounts.length;

    const walletStride = () => {
        const el = walletScrollRef.current;
        const first = el?.firstElementChild as HTMLElement | null;
        return first ? first.offsetWidth + 16 : 0; // 16px = gap-4
    };

    // Track the snapped slide while scrolling; once the scroll settles, promote
    // the snapped card to the selected wallet / external account.
    const handleWalletCarouselScroll = () => {
        const stride = walletStride();
        const el = walletScrollRef.current;
        if (!el || !stride) return;
        const idx = Math.max(0, Math.min(slideCount - 1, Math.round(el.scrollLeft / stride)));
        setActiveSlide(idx);
        if (walletScrollTimer.current) clearTimeout(walletScrollTimer.current);
        walletScrollTimer.current = setTimeout(() => {
            if (categoryGroup === 'MONEYWISE') {
                const w = wallets[idx];
                if (w && w.id !== selectedWalletId) setSelectedWalletId(w.id);
            } else {
                const acc = externalAccounts[idx];
                if (acc && acc.id !== selectedAccountType) setSelectedAccountType(acc.id as any);
            }
        }, 160);
    };

    const scrollToSlide = (idx: number) => {
        const el = walletScrollRef.current;
        const stride = walletStride();
        if (!el || !stride) return;
        el.scrollTo({ left: idx * stride, behavior: 'smooth' });
    };

    const mobileCanTransfer = categoryGroup === 'MONEYWISE'
        ? wallets.length > 1
        : selectedAccountType === 'CASH' && wallets.length > 0;
    const mobileCanPayLink = categoryGroup === 'MONEYWISE' && !!selectedWalletId;

    return (
        <Layout noPadding={true} backgroundColor="bg-gray-50 md:bg-white">
            {/* ============ MOBILE LAYOUT ============ */}
            <div className="md:hidden flex flex-col min-h-screen bg-gray-50 pb-24 pt-2 overflow-x-hidden">

                {/* Mobile Category Toggle */}
                <div className="px-4 mb-5">
                    <SegmentedControl
                        variant="capsule"
                        value={categoryGroup}
                        onChange={(v) => handleCategoryChange(v as 'MONEYWISE' | 'EXTERNAL')}
                        options={[
                            {
                                value: 'MONEYWISE',
                                label: (
                                    <span className="inline-flex items-center gap-1.5">
                                        {hasNewMoneywise && <span className="w-1.5 h-1.5 rounded-full bg-blue-600 flex-shrink-0" />}
                                        Main Wallets
                                    </span>
                                ),
                            },
                            {
                                value: 'EXTERNAL',
                                label: (
                                    <span className="inline-flex items-center gap-1.5">
                                        {hasNewExternal && <span className="w-1.5 h-1.5 rounded-full bg-blue-600 flex-shrink-0" />}
                                        External Accounts
                                    </span>
                                ),
                            },
                        ]}
                    />
                </div>

                {/* Mobile Wallet Cards - Horizontal Swipeable Carousel */}
                <AnimatedTabContent tabKey={categoryGroup} index={categoryIndex}>
                {(() => {
                    // One shared renderer so MoneyWise wallets, external accounts and
                    // the empty state all get the identical premium dark card.
                    const renderWalletCard = (key: string, name: string, balance: number) => (
                        <div
                            key={key}
                            className="snap-center shrink-0 w-[calc(100vw-2.5rem)] h-44 px-4 py-5 bg-gradient-to-l from-blue-950 to-slate-900 rounded-2xl shadow-[0px_2px_4px_2px_rgba(0,0,0,0.15)] flex flex-col justify-between overflow-hidden text-white"
                        >
                            <div className="flex items-center gap-2">
                                <span className="flex-1 font-figtree text-xs font-normal uppercase tracking-wide leading-4 text-white truncate">
                                    {name}
                                </span>
                                <MoneywiseMark className="w-8 h-5 text-white flex-shrink-0" />
                            </div>
                            <div className="text-[34px] font-bold leading-8 tracking-tight whitespace-nowrap">
                                K {formatCurrency(balance).replace('K', '')}
                            </div>
                            <div className="flex items-end gap-2">
                                <span className="flex-1 font-figtree text-xs font-extrabold uppercase tracking-wide text-slate-400 truncate">
                                    {organizationName || 'MoneyWise'}
                                </span>
                                <span className="font-advercase text-sm font-bold text-slate-400">Moneywise</span>
                            </div>
                            {slideCount > 1 && (
                                <div className="flex justify-center items-center gap-2.5 pt-1">
                                    {Array.from({ length: slideCount }).map((_, i) => (
                                        <button
                                            key={i}
                                            onClick={(e) => { e.stopPropagation(); scrollToSlide(i); }}
                                            aria-label={`Go to card ${i + 1}`}
                                            className={`w-2 h-2 rounded-full transition-all duration-300 ease-out ${
                                                i === activeSlide ? 'bg-white scale-110' : 'bg-zinc-300/25'
                                            }`}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    );

                    return (
                        <div
                            ref={walletScrollRef}
                            onScroll={handleWalletCarouselScroll}
                            className="flex overflow-x-auto no-scrollbar gap-4 pb-5 px-5 snap-x snap-mandatory scroll-smooth"
                            style={{ overflowAnchor: 'none' }}
                        >
                            {categoryGroup === 'MONEYWISE' ? (
                                <>
                                    {wallets.map((w) =>
                                        renderWalletCard(w.id, w.name, w.balance || 0)
                                    )}
                                    {wallets.length === 0 && isRequestor && renderWalletCard('empty', 'Main Wallet', 0)}
                                    {!isRequestor && (
                                        <div
                                            onClick={() => setIsCreateWalletModalOpen(true)}
                                            className="snap-center shrink-0 w-[calc(100vw-2.5rem)] h-44 flex flex-col justify-center items-center rounded-2xl text-center border-2 border-dashed border-gray-200 bg-white hover:border-gray-300 text-gray-400 hover:text-gray-600 transition-all duration-300 cursor-pointer p-5"
                                        >
                                            <PlusCircle size={28} strokeWidth={2.5} />
                                            <span className="text-xs font-bold uppercase tracking-widest block mt-2">
                                                {wallets.length === 0 ? 'Add Wallet' : 'Add Subwallet'}
                                            </span>
                                        </div>
                                    )}
                                </>
                            ) : (
                                externalAccounts.map((acc) => renderWalletCard(acc.id, acc.name, externalBalances[acc.id] || 0))
                            )}
                        </div>
                    );
                })()}

                {/* Deposit / Transfer / Pay Link action bar */}
                {!isRequestor && (
                    <div className="mx-5 mb-2 bg-white rounded-xl shadow-[0px_4px_4px_0px_rgba(0,0,0,0.10)] outline outline-1 outline-offset-[-1px] outline-zinc-200 px-3 py-4 flex items-center overflow-hidden">
                        <button
                            onClick={() => setIsInflowModalOpen(true)}
                            className="flex-1 flex items-center justify-center gap-2 active:scale-95 transition-transform"
                        >
                            <ArrowDownToLine size={16} className="text-black" strokeWidth={1.5} />
                            <span className="text-sm font-medium text-black leading-5">Deposit</span>
                        </button>
                        <div className="w-px h-5 bg-neutral-300 flex-shrink-0" />
                        <button
                            onClick={() => {
                                if (!mobileCanTransfer) return;
                                if (categoryGroup === 'MONEYWISE') setIsTransferModalOpen(true);
                                else setIsCashTransferModalOpen(true);
                            }}
                            className={`flex-1 flex items-center justify-center gap-1.5 active:scale-95 transition-transform ${mobileCanTransfer ? '' : 'opacity-35'}`}
                        >
                            <ArrowLeftRight size={16} className="text-black" strokeWidth={1.5} />
                            <span className="text-sm font-medium text-black leading-5">Transfer</span>
                        </button>
                        <div className="w-px h-5 bg-neutral-300 flex-shrink-0" />
                        <button
                            onClick={() => {
                                if (!mobileCanPayLink) return;
                                setShareWalletId(selectedWalletId ?? null);
                                setIsShareModalOpen(true);
                            }}
                            className={`flex-1 flex items-center justify-center gap-1.5 active:scale-95 transition-transform ${mobileCanPayLink ? '' : 'opacity-35'}`}
                        >
                            <Link2 size={16} className="text-black" strokeWidth={1.5} />
                            <span className="text-sm font-medium text-black leading-5">Pay Link</span>
                        </button>
                    </div>
                )}
                </AnimatedTabContent>

                {/* Mobile Transactions Header & Control Pill */}
                <div className="px-6 py-4 flex items-center justify-between">
                    {isSearchExpanded ? (
                        <div className="flex items-center gap-3 w-full animate-in fade-in slide-in-from-left-2 duration-200">
                            <button
                                onClick={() => {
                                    setIsSearchExpanded(false);
                                    setSearchQuery('');
                                }}
                                className="p-2 -ml-2 text-gray-500 hover:text-gray-900 transition-colors"
                            >
                                <ChevronRight className="rotate-180" size={20} strokeWidth={2.5} />
                            </button>
                            <div className="relative flex-1">
                                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" strokeWidth={2.5} />
                                <input
                                    autoFocus
                                    type="text"
                                    placeholder="Search transactions..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2 bg-gray-100/70 border-none rounded-2xl text-[14px] font-medium text-slate-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#006AFF]/10 focus:bg-white transition-all"
                                />
                            </div>
                        </div>
                    ) : (
                        <>
                            <h2 className="font-figtree text-xl font-semibold text-neutral-900 leading-5">Transactions</h2>
                            <div className="flex items-center">
                                <button
                                    onClick={() => setIsSearchExpanded(true)}
                                    className="w-10 h-10 flex items-center justify-center text-neutral-700 hover:text-slate-900 active:scale-90 transition-all rounded-full"
                                    aria-label="Search"
                                >
                                    <Search size={19} strokeWidth={2} />
                                </button>
                                <button
                                    onClick={() => setSortBy(sortBy === 'DATE_DESC' ? 'DATE_ASC' : 'DATE_DESC')}
                                    className={`w-10 h-10 flex items-center justify-center hover:text-slate-900 active:scale-90 transition-all rounded-full ${
                                        sortBy === 'DATE_ASC' ? 'rotate-180 text-[#006AFF]' : 'text-neutral-700'
                                    }`}
                                    aria-label="Sort"
                                >
                                    <ArrowDownUp size={17} strokeWidth={2} />
                                </button>
                                <button
                                    onClick={() => setIsFilterMenuOpen(!isFilterMenuOpen)}
                                    className={`w-10 h-10 flex items-center justify-center hover:text-slate-900 active:scale-90 transition-all rounded-full ${
                                        isFilterMenuOpen || (useDepartments && filterDepartment !== 'ALL') || filterStatus !== 'ALL'
                                            ? 'text-[#006AFF]'
                                            : 'text-neutral-700'
                                    }`}
                                    aria-label="Filter"
                                >
                                    <ListFilter size={18} strokeWidth={2} />
                                </button>
                            </div>
                        </>
                    )}
                </div>

                {/* Mobile Filter Menu */}
                {isFilterMenuOpen && (
                    <div className="mx-6 mb-5 p-4 bg-white rounded-3xl border border-gray-100 shadow-md flex flex-col gap-3.5 animate-in slide-in-from-top-2 duration-200">
                        {useDepartments && uniqueDepartments.length > 0 && (
                        <div className="flex flex-col">
                            <span className="text-[9px] font-black uppercase text-gray-400 tracking-widest mb-1.5 ml-0.5">Department</span>
                            <select
                                value={filterDepartment}
                                onChange={(e) => setFilterDepartment(e.target.value)}
                                className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5 text-xs font-bold text-gray-700 focus:outline-none"
                            >
                                <option value="ALL">All Departments</option>
                                {uniqueDepartments.map(dept => <option key={dept} value={dept}>{dept}</option>)}
                            </select>
                        </div>
                        )}
                        <div className="flex flex-col">
                            <span className="text-[9px] font-black uppercase text-gray-400 tracking-widest mb-1.5 ml-0.5">Status</span>
                            <select
                                value={filterStatus}
                                onChange={(e) => setFilterStatus(e.target.value)}
                                className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5 text-xs font-bold text-gray-700 focus:outline-none"
                            >
                                <option value="ALL">All Statuses</option>
                                {uniqueStatuses.map(stat => <option key={stat} value={stat}>{stat}</option>)}
                            </select>
                        </div>
                        <div className="flex items-center gap-2 py-1 ml-0.5">
                            <label className="flex items-center gap-2 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={showPendingIntents}
                                    onChange={(e) => setShowPendingIntents(e.target.checked)}
                                    className="rounded border-gray-300 text-[#006AFF] focus:ring-[#006AFF] w-4 h-4 cursor-pointer"
                                />
                                <span className="text-xs font-bold text-gray-600">Show Pending Checkout Intents</span>
                            </label>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="flex flex-col">
                                <span className="text-[9px] font-black uppercase text-gray-400 tracking-widest mb-1.5 ml-0.5">Start Date</span>
                                <input
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5 text-xs font-bold text-gray-700 focus:outline-none"
                                />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[9px] font-black uppercase text-gray-400 tracking-widest mb-1.5 ml-0.5">End Date</span>
                                <input
                                    type="date"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5 text-xs font-bold text-gray-700 focus:outline-none"
                                />
                            </div>
                        </div>
                        <button
                            onClick={() => { setFilterDepartment('ALL'); setFilterAccount('ALL'); setFilterStatus('ALL'); setSearchQuery(''); }}
                            className="text-[10px] font-black uppercase tracking-widest text-[#006AFF] text-left mt-1 ml-0.5"
                        >
                            Reset Filters
                        </button>
                    </div>
                )}

                {/* Mobile Transaction List (Grouped by Month) */}
                <div className="flex-1 bg-transparent">
                    {loading && (
                        <div className="flex flex-col items-center justify-center py-24">
                            <div className="w-10 h-10 border-4 border-[#006AFF]/10 border-t-[#006AFF] rounded-full animate-spin" />
                            <p className="mt-4 text-[11px] font-black uppercase tracking-[0.2em] text-gray-400 animate-pulse">Syncing Ledger</p>
                        </div>
                    )}

                    {!loading && groupedEntries.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-24">
                            <div className="p-5 bg-white rounded-full mb-4 shadow-sm border border-gray-100">
                                <Receipt className="h-10 w-10 text-gray-300" strokeWidth={1.5} />
                            </div>
                            <p className="text-gray-900 font-bold">No transactions found</p>
                            <p className="text-sm text-gray-400 mt-1">Try adjusting your date range or filters.</p>
                        </div>
                    )}

                    {!loading && groupedEntries.map((group) => (
                        <div key={group.month} className="mb-4">
                            {/* Month Group Header */}
                            <div className="pl-10 py-2">
                                <span className="text-base font-semibold text-black leading-5">
                                    {group.month.split(' · ')[1] === String(new Date().getFullYear())
                                        ? group.month.split(' · ')[0]
                                        : group.month}
                                </span>
                            </div>

                            {/* Transaction Rows in Card */}
                            <div className="mx-5 bg-white rounded-[20px] shadow-[0px_4px_4px_0px_rgba(0,0,0,0.10)] outline outline-1 outline-offset-[-1px] outline-gray-200 overflow-hidden">
                                {group.entries.map((entry) => {
                                    const isOutflow = entry.credit > 0;
                                    const amount = isOutflow ? entry.credit : entry.debit;
                                    const refNum = entry.reference_number || entry.requisitions?.reference_number || entry.requisition_id?.slice(0, 8);
                                    const rawDescription = entry.requisitions?.description || entry.description;
                                    const description = rawDescription ? rawDescription.split(' | Ref:')[0] : '';
                                    const isNew = walletSeen.isNew(entryStamp(entry));

                                    return (
                                        <React.Fragment key={entry.id}>
                                            <div
                                                className={`px-5 py-[22px] flex items-start justify-between active:bg-gray-50 transition-colors ${
                                                    expandedRows[entry.id] ? 'bg-slate-50/50' : ''
                                                }`}
                                                onClick={() => (entry.requisition_id || entry.entry_type === 'DISBURSEMENT' || entry.entry_type === 'EXPENSE' || entry.entry_type === 'INFLOW' || entry.entry_type === 'ADJUSTMENT') && toggleRow(entry.id)}
                                            >
                                                {/* Left Side: Description + Flag + Ref */}
                                                <div className="flex-1 mr-4">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className={`text-base leading-tight transition-all duration-500 ${isNew ? 'font-bold text-black' : 'font-medium text-black'}`}>
                                                            {description}
                                                        </span>
                                                        {isNew && (
                                                            <span className="px-1.5 py-0.5 bg-blue-600 rounded-full text-[9px] font-bold text-white leading-none tracking-wide">
                                                                NEW
                                                            </span>
                                                        )}
                                                        {(entry.requisition_id || entry.entry_type === 'DISBURSEMENT') && (
                                                            <Flag
                                                                size={14}
                                                                className={`flex-shrink-0 ${getMobileFlagColor(entry)}`}
                                                                strokeWidth={1.5}
                                                            />
                                                        )}
                                                    </div>
                                                    {(() => {
                                                        const status = getResolvedStatus(entry);
                                                        const showStatus = status && status !== 'CLOSED' && status !== 'OPENING';
                                                        if (!showStatus && !refNum) return null;
                                                        return (
                                                            <div className="flex items-center gap-1.5 mt-2">
                                                                {showStatus && (() => {
                                                                    const config = getStatusConfig(status);
                                                                    return (
                                                                        <div className="flex items-center w-fit">
                                                                            {renderMobileStatusIcon(status)}
                                                                            <span className="font-grotesk text-xs font-normal text-neutral-700 ml-1 leading-none">
                                                                                {config.label}
                                                                            </span>
                                                                        </div>
                                                                    );
                                                                })()}
                                                                {showStatus && refNum && (
                                                                    <span className="text-[10px] text-gray-300 font-bold">•</span>
                                                                )}
                                                                {refNum && (
                                                                    <span className="font-grotesk text-xs font-normal text-neutral-700">
                                                                        {refNum}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        );
                                                    })()}
                                                </div>

                                                {/* Right Side: Amount + Date */}
                                                <div className="flex flex-col items-end">
                                                    <span className="text-base font-medium leading-tight text-black">
                                                        {isOutflow ? '-' : '+'}K{formatCurrency(amount).replace('K', '')}
                                                    </span>
                                                    <span className="font-grotesk text-xs font-normal text-neutral-700 mt-2">
                                                        {formatDateSlash(entry.date)}
                                                    </span>
                                                </div>
                                            </div>
                                            
                                            {/* Mobile Breakdown Drawer */}
                                            {expandedRows[entry.id] && (entry.requisition_id || entry.entry_type === 'DISBURSEMENT' || entry.entry_type === 'EXPENSE' || entry.entry_type === 'INFLOW' || entry.entry_type === 'ADJUSTMENT') && (
                                                <div className="bg-slate-50/45 border-t border-slate-50 px-5 py-5 animate-in fade-in slide-in-from-top-2 duration-200">
                                                    {renderMobileBreakdown(entry)}
                                                </div>
                                            )}
                                        </React.Fragment>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* ============ DESKTOP LAYOUT ============ */}
            <div className="hidden md:block max-w-[1440px] mx-auto px-4 md:px-12 py-4 md:py-8 overflow-x-hidden">
            <div className="space-y-8 pb-4">
                {/* Category Selector Tabs */}
                <div className="max-w-sm mb-6">
                    <SegmentedControl
                        variant="pill"
                        value={categoryGroup}
                        onChange={(v) => handleCategoryChange(v as 'MONEYWISE' | 'EXTERNAL')}
                        options={categoryOptions}
                    />
                </div>

                {/* Account Selection Cards */}
                <AnimatedTabContent tabKey={categoryGroup} index={categoryIndex}>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {categoryGroup === 'MONEYWISE' ? (
                        <>
                            {wallets.map((w) => {
                                const isActive = selectedWalletId === w.id;
                                return (
                                    <button
                                        key={w.id}
                                        onClick={() => setSelectedWalletId(w.id)}
                                        style={isActive ? {
                                            backgroundImage: `url(${budgetBg})`,
                                            backgroundSize: 'cover',
                                            backgroundPosition: 'center',
                                        } : {}}
                                        className={`relative p-6 rounded-[24px] border-2 text-left transition-all duration-300 group ${
                                            isActive 
                                                ? 'border-transparent shadow-lg text-white' 
                                                : 'bg-white border-transparent hover:border-gray-100 hover:shadow-xs'
                                        }`}
                                    >
                                        <div className="flex items-start justify-between mb-4">
                                            <div className={`p-3 rounded-2xl ${isActive ? 'bg-white/10 text-white' : 'bg-blue-50 text-blue-600'} transition-colors duration-300`}>
                                                <Wallet size={20} strokeWidth={2.5} />
                                            </div>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setShareWalletId(w.id);
                                                    setIsShareModalOpen(true);
                                                }}
                                                className={`p-2 rounded-xl transition-colors ${
                                                    isActive 
                                                        ? 'text-white/60 hover:text-white hover:bg-white/10' 
                                                        : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                                                }`}
                                                title="Share payment link"
                                            >
                                                <Link2 size={16} strokeWidth={2.5} />
                                            </button>
                                        </div>
                                        <div>
                                            <span className={`text-[11px] font-bold uppercase tracking-widest block mb-1 ${isActive ? 'text-white/80' : 'text-gray-400'}`}>
                                                {w.name} {w.is_main && '(Main)'}
                                            </span>
                                            <div className="flex items-baseline gap-1">
                                                <span className={`text-2xl font-black tracking-tight ${isActive ? 'text-white' : 'text-gray-900'}`}>
                                                    {formatCurrency(w.balance || 0).split('.')[0]}
                                                </span>
                                                <span className={`text-sm font-bold opacity-60 ${isActive ? 'text-white' : 'text-gray-400'}`}>
                                                    .{formatCurrency(w.balance || 0).split('.')[1] || '00'}
                                                </span>
                                            </div>
                                            {w.qb_account_name && (
                                                <div className={`text-[9px] mt-2 font-bold uppercase tracking-wider ${isActive ? 'text-white/70' : 'text-gray-400'}`}>
                                                    QBO: {w.qb_account_name}
                                                </div>
                                            )}
                                        </div>
                                        {!isActive && (
                                            <div className="absolute inset-0 bg-gray-50/40 opacity-0 group-hover:opacity-100 rounded-[24px] transition-opacity pointer-events-none" />
                                        )}
                                    </button>
                                );
                            })}
                            {!isRequestor && (
                                <button
                                    onClick={() => setIsCreateWalletModalOpen(true)}
                                    className="p-6 rounded-[24px] border-2 border-dashed border-gray-200 bg-white hover:border-gray-300 flex flex-col justify-center items-center text-center transition-all duration-300 text-gray-400 hover:text-gray-600 gap-2 cursor-pointer h-full min-h-[140px]"
                                >
                                    <PlusCircle size={24} strokeWidth={2.5} />
                                    <span className="text-[11px] font-bold uppercase tracking-widest block">Add Subwallet</span>
                                </button>
                            )}
                        </>
                    ) : (
                        [
                            { id: 'CASH', name: 'Cash Account', icon: Coins, color: 'text-slate-600', bg: 'bg-slate-50', border: 'border-slate-200' },
                            { id: 'AIRTEL_MONEY', name: 'Airtel Money', icon: Smartphone, color: 'text-red-500', bg: 'bg-red-50', border: 'border-red-100' },
                            { id: 'BANK', name: 'Bank Account', icon: Building2, color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-100' }
                        ].map((acc) => {
                            const isActive = selectedAccountType === acc.id;
                            return (
                                <button
                                    key={acc.id}
                                    onClick={() => setSelectedAccountType(acc.id as any)}
                                    style={isActive ? {
                                        backgroundImage: `url(${budgetBg})`,
                                        backgroundSize: 'cover',
                                        backgroundPosition: 'center',
                                    } : {}}
                                    className={`relative p-6 rounded-[24px] border-2 text-left transition-all duration-300 group ${
                                        isActive 
                                            ? 'border-transparent shadow-lg text-white' 
                                            : 'bg-white border-transparent hover:border-gray-100 hover:shadow-xs'
                                    }`}
                                >
                                    <div className="flex items-start justify-between mb-4">
                                        <div className={`p-3 rounded-2xl ${isActive ? 'bg-white/10 text-white' : `${acc.bg} ${acc.color}`} transition-colors duration-300`}>
                                            <acc.icon size={20} strokeWidth={2.5} />
                                        </div>
                                    </div>
                                    <div>
                                        <span className={`text-[11px] font-bold uppercase tracking-widest block mb-1 ${isActive ? 'text-white/80' : 'text-gray-400'}`}>
                                            {acc.name}
                                        </span>
                                        <div className="flex items-baseline gap-1">
                                            <span className={`text-2xl font-black tracking-tight ${isActive ? 'text-white' : 'text-gray-900'}`}>
                                                {formatCurrency(externalBalances[acc.id] || 0).split('.')[0]}
                                            </span>
                                            <span className={`text-sm font-bold opacity-60 ${isActive ? 'text-white' : 'text-gray-400'}`}>
                                                .{formatCurrency(externalBalances[acc.id] || 0).split('.')[1] || '00'}
                                            </span>
                                        </div>
                                    </div>
                                    {!isActive && (
                                        <div className="absolute inset-0 bg-gray-50/40 opacity-0 group-hover:opacity-100 rounded-[24px] transition-opacity pointer-events-none" />
                                    )}
                                </button>
                            );
                        })
                    )}
                </div>
                </AnimatedTabContent>

                {/* Minimalist Toolbar */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-gray-50">
                    <div className="flex items-center space-x-2">
                        {!isRequestor && (
                            <button
                                onClick={() => setIsInflowModalOpen(true)}
                                className="bg-[#000000] hover:bg-gray-800 text-white px-6 py-2.5 rounded-[16px] font-bold text-xs uppercase tracking-widest shadow-sm transition-all flex items-center"
                            >
                                <PlusCircle size={14} className="mr-2" strokeWidth={3} />
                                Deposit Funds
                            </button>
                        )}

                        {!isRequestor && selectedAccountType === 'MONEYWISE_WALLET' && wallets.length > 1 && (
                            <button
                                onClick={() => setIsTransferModalOpen(true)}
                                className="bg-white hover:bg-gray-50 text-gray-950 border border-gray-200 px-6 py-2.5 rounded-[16px] font-bold text-xs uppercase tracking-widest shadow-sm transition-all flex items-center"
                            >
                                <ArrowDownUp size={14} className="mr-2 text-gray-500" strokeWidth={3} />
                                Transfer Funds
                            </button>
                        )}
                        
                        {!isRequestor && selectedAccountType === 'CASH' && wallets.length > 0 && (
                            <button
                                onClick={() => setIsCashTransferModalOpen(true)}
                                className="bg-white hover:bg-gray-50 text-gray-950 border border-gray-200 px-6 py-2.5 rounded-[16px] font-bold text-xs uppercase tracking-widest shadow-sm transition-all flex items-center"
                            >
                                <ArrowDownUp size={14} className="mr-2 text-gray-500" strokeWidth={3} />
                                Transfer to MoneyWise
                            </button>
                        )}

                        {selectedAccountType !== 'MONEYWISE_WALLET' && (
                            <button
                                onClick={() => setIsCloseModalOpen(true)}
                                className="bg-white hover:bg-gray-50 text-gray-900 border border-gray-100 px-6 py-2.5 rounded-[16px] font-bold text-xs uppercase tracking-widest shadow-sm transition-all flex items-center"
                            >
                                <Lock size={14} className="mr-2 text-gray-400" />
                                Close Balance
                            </button>
                        )}

                        <button
                            onClick={() => setIsExportModalOpen(true)}
                            className="bg-white hover:bg-gray-50 text-gray-900 border border-gray-100 px-6 py-2.5 rounded-[16px] font-bold text-xs uppercase tracking-widest shadow-sm transition-all flex items-center"
                        >
                            <Download size={14} className="mr-2 text-gray-400" />
                            Export Ledger
                        </button>

                        {unclassifiedCount > 0 && (
                            <button
                                onClick={handleBulkClassify}
                                disabled={isClassifying}
                                className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white px-6 py-2.5 rounded-[16px] font-bold text-xs uppercase tracking-widest shadow-sm transition-all flex items-center disabled:opacity-50"
                            >
                                <Sparkles size={14} className={`mr-2 ${isClassifying ? 'animate-spin' : ''}`} />
                                {isClassifying ? 'Classifying...' : `Classify AI (${unclassifiedCount})`}
                            </button>
                        )}
                    </div>

                    <div className="flex items-center bg-white p-1 rounded-2xl border border-gray-100 shadow-sm">
                        <div className="flex items-center px-2">
                            <div className="relative group">
                                <Search size={18} strokeWidth={2.5} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Search..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="bg-transparent pl-9 pr-4 py-2 text-xs font-bold text-gray-600 focus:outline-none w-[120px] transition-all focus:w-[200px]"
                                />
                            </div>
                            <div className="w-[1px] h-4 bg-gray-200 mx-1" />
                            <button 
                                onClick={() => setIsFilterMenuOpen(!isFilterMenuOpen)}
                                className={`p-2 transition-colors rounded-xl hover:bg-white hover:shadow-sm ${isFilterMenuOpen || (useDepartments && filterDepartment !== 'ALL') || filterAccount !== 'ALL' || filterStatus !== 'ALL' ? 'text-[#006AFF]' : 'text-gray-400'}`}
                            >
                                <Filter size={18} strokeWidth={2.5} />
                            </button>
                            <button 
                                className="p-2 text-gray-400 hover:text-gray-900 transition-colors rounded-xl hover:bg-white hover:shadow-sm"
                                onClick={() => setSortBy(sortBy === 'DATE_DESC' ? 'DATE_ASC' : 'DATE_DESC')}
                            >
                                <ArrowDownUp size={18} strokeWidth={2.5} />
                            </button>
                            <div className="w-[1px] h-4 bg-gray-200 mx-1" />
                            <div className="flex items-center pl-1 pr-2">
                                <Calendar size={18} className="text-gray-400 mr-2" strokeWidth={2.5} />
                                <input
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    className="bg-transparent text-[11px] font-bold text-gray-600 focus:outline-none w-[90px] cursor-pointer"
                                />
                                <span className="mx-1 text-gray-300 font-bold">-</span>
                                <input
                                    type="date"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    className="bg-transparent text-[11px] font-bold text-gray-600 focus:outline-none w-[90px] cursor-pointer"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

                {/* Filter Menu (Sub-toolbar) */}
                {isFilterMenuOpen && (
                    <div className="flex flex-wrap items-center gap-4 p-4 bg-white rounded-2xl border border-gray-100 shadow-sm animate-in slide-in-from-top-2 duration-200">
                        {useDepartments && uniqueDepartments.length > 0 && (
                        <div className="flex flex-col">
                            <span className="text-[9px] font-black uppercase text-gray-400 tracking-widest mb-1.5 ml-1">Department</span>
                            <select
                                value={filterDepartment}
                                onChange={(e) => setFilterDepartment(e.target.value)}
                                className="bg-white border border-gray-100 rounded-xl px-3 py-2 text-xs font-bold text-gray-700 focus:outline-none shadow-sm min-w-[150px]"
                            >
                                <option value="ALL">All Departments</option>
                                {uniqueDepartments.map(dept => <option key={dept} value={dept}>{dept}</option>)}
                            </select>
                        </div>
                        )}
                        <div className="flex flex-col">
                            <span className="text-[9px] font-black uppercase text-gray-400 tracking-widest mb-1.5 ml-1">Category Account</span>
                            <select
                                value={filterAccount}
                                onChange={(e) => setFilterAccount(e.target.value)}
                                className="bg-white border border-gray-100 rounded-xl px-3 py-2 text-xs font-bold text-gray-700 focus:outline-none shadow-sm min-w-[150px]"
                            >
                                <option value="ALL">All Accounts</option>
                                {uniqueAccounts.map(acc => <option key={acc} value={acc}>{acc}</option>)}
                            </select>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[9px] font-black uppercase text-gray-400 tracking-widest mb-1.5 ml-1">Status</span>
                            <select
                                value={filterStatus}
                                onChange={(e) => setFilterStatus(e.target.value)}
                                className="bg-white border border-gray-100 rounded-xl px-3 py-2 text-xs font-bold text-gray-700 focus:outline-none shadow-sm min-w-[150px]"
                            >
                                <option value="ALL">All Statuses</option>
                                {uniqueStatuses.map(stat => <option key={stat} value={stat}>{stat}</option>)}
                            </select>
                        </div>
                        <div className="flex items-center mt-4 h-full pl-2">
                            <label className="flex items-center gap-2 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={showPendingIntents}
                                    onChange={(e) => setShowPendingIntents(e.target.checked)}
                                    className="rounded border-gray-300 text-[#006AFF] focus:ring-[#006AFF] w-4 h-4 cursor-pointer"
                                />
                                <span className="text-xs font-bold text-gray-600">Show Pending Checkout Intents</span>
                            </label>
                        </div>
                        <button 
                            onClick={() => { setFilterDepartment('ALL'); setFilterAccount('ALL'); setFilterStatus('ALL'); setSearchQuery(''); }}
                            className="mt-auto px-4 py-2 text-[10px] font-black uppercase tracking-widest text-[#006AFF] hover:bg-[#006AFF]/5 rounded-xl transition-colors"
                        >
                            Reset
                        </button>
                    </div>
                )}


                <div className="shadow-sm border border-gray-100 rounded-[32px] overflow-x-auto bg-white mt-8">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-white">
                                <th className="p-6 text-[11px] uppercase text-gray-400 font-bold tracking-widest">Date</th>
                                <th className="p-6 text-[11px] uppercase text-gray-400 font-bold tracking-widest max-w-[400px]">Txn Details</th>
                                <th className="p-6 text-[11px] uppercase text-gray-400 font-bold tracking-widest text-right">Inflow</th>
                                <th className="p-6 text-[11px] uppercase text-gray-400 font-bold tracking-widest text-right">Outflow</th>
                                <th className="p-6 text-[11px] uppercase text-gray-400 font-bold tracking-widest text-right">Balance</th>
                                <th className="p-6 w-10"></th>
                            </tr>
                        </thead>
                        <tbody className="">
                            {groupedEntries.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="py-24 text-center">
                                        <div className="flex flex-col items-center justify-center">
                                            <div className="p-5 bg-gray-50 rounded-full mb-4">
                                                <Receipt className="h-10 w-10 text-gray-300" strokeWidth={1.5} />
                                            </div>
                                            <p className="text-gray-900 font-bold">No transactions found</p>
                                            <p className="text-sm text-gray-400 mt-1">Try adjusting your filters or search query.</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                groupedEntries.map((group) => (
                                    <React.Fragment key={group.month}>
                                        <tr className="bg-gray-50/50">
                                            <td colSpan={6} className="px-6 py-3">
                                                <span className="text-[11px] font-black uppercase tracking-[0.2em] text-gray-400">
                                                    {group.month}
                                                </span>
                                            </td>
                                        </tr>
                                        {group.entries.map((entry) => (
                                            <React.Fragment key={entry.id}>
                                                <tr
                                                    className={`transition-all group cursor-pointer 
                                                        ${expandedRows[entry.id] ? 'bg-gray-50' : 'hover:bg-gray-50/50'}`}
                                                    onClick={() => toggleRow(entry.id)}
                                                >
                                                    <td className="p-6">
                                                        <div className="text-sm font-normal text-gray-900">
                                                            {new Date(entry.date).getDate()}
                                                        </div>
                                                        <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mt-0.5">
                                                            {new Date(entry.date).toLocaleString('default', { weekday: 'short' })}
                                                        </div>
                                                    </td>
                                                    <td className="p-6 max-w-[400px]">
                                                        <div className="flex flex-col">
                                                            <div className="text-[14px] font-medium text-gray-900 line-clamp-1 leading-tight">
                                                                {entry.requisitions?.description || entry.description}
                                                            </div>
                                                            <div className="flex items-center gap-3 mt-1">
                                                                {getEntryStatus(entry)}
                                                                {(entry.reference_number || entry.requisitions?.reference_number || entry.requisition_id) && (
                                                                    <div className="text-[11px] font-normal text-gray-400 uppercase tracking-tight">
                                                                        #{entry.reference_number || entry.requisitions?.reference_number || entry.requisition_id?.slice(0, 8)}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="p-6 text-right">
                                                        {entry.debit > 0 ? (
                                                            <span className="text-[14px] font-normal text-gray-900">
                                                                {formatCurrency(entry.debit).replace('K', '')}
                                                            </span>
                                                        ) : <span className="text-gray-200">-</span>}
                                                    </td>
                                                    <td className="p-6 text-right">
                                                        {entry.credit > 0 ? (
                                                            <span className="text-[14px] font-normal text-gray-900">
                                                                - {formatCurrency(entry.credit).replace('K', '')}
                                                            </span>
                                                        ) : <span className="text-gray-200">-</span>}
                                                    </td>
                                                    <td className="p-6 text-right">
                                                        <span className="text-[14px] font-normal text-gray-400">
                                                            {formatCurrency(entry.balance_after).replace('K', '')}
                                                        </span>
                                                    </td>
                                                    <td className="p-6 w-12 text-center">
                                                        {(entry.requisition_id || entry.entry_type === 'DISBURSEMENT' || entry.entry_type === 'EXPENSE' || entry.entry_type === 'INFLOW' || entry.entry_type === 'ADJUSTMENT') && (
                                                            <ChevronRight size={16} className={`text-gray-300 group-hover:text-gray-400 transition-transform ${expandedRows[entry.id] ? 'rotate-90' : ''}`} strokeWidth={2.5} />
                                                        )}
                                                    </td>
                                                </tr>
                                                 {expandedRows[entry.id] && (entry.requisition_id || entry.entry_type === 'DISBURSEMENT' || entry.entry_type === 'EXPENSE' || entry.entry_type === 'INFLOW' || entry.entry_type === 'ADJUSTMENT') && (
                                                    <tr className="bg-gray-50/80">
                                                        <td colSpan={6} className="p-0">
                                                            <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                                                                {renderBreakdown(entry)}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        ))}
                                    </React.Fragment>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
                </div>

            {/* Classification Results Modal */}
            {isResultsModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden border border-gray-100">
                        <div className="p-8 border-b border-gray-50 flex justify-between items-center bg-white">
                            <div>
                                <h3 className="text-xl font-black text-gray-900 flex items-center tracking-tight">
                                    <div className="p-2 bg-amber-50 rounded-xl mr-3" />
                                    Classification Results
                                </h3>
                            </div>
                            <button
                                onClick={() => setIsResultsModalOpen(false)}
                                className="p-3 hover:bg-gray-50 rounded-2xl text-gray-400 hover:text-gray-900 transition-all border border-transparent hover:border-gray-100"
                            >
                                <X size={20} strokeWidth={2.5} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-8 space-y-6 bg-gray-50/30">
                            {classificationResults.map((result: any, index: number) => (
                                <div key={index} className="bg-white rounded-[24px] p-6 border border-gray-100 shadow-sm transition-all hover:shadow-md hover:border-gray-200">
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="font-bold text-gray-900 text-[15px]">{result.description}</div>
                                        <div className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                            result.method === 'RULE' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'
                                        }`}>
                                            {result.method === 'RULE' ? 'Rule Match' : 'AI Analysis'}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="p-8 border-t border-gray-50 bg-white flex justify-end">
                            <button
                                onClick={() => setIsResultsModalOpen(false)}
                                className="bg-gray-900 hover:bg-gray-800 text-white px-8 py-3 rounded-2xl font-black text-xs uppercase tracking-[0.2em] transition-all shadow-lg shadow-gray-200"
                            >
                                Done
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Review Posting Modal */}
            {postingReview && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200">
                    <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-2xl overflow-hidden border border-white/20 animate-in zoom-in-95 duration-300">
                        <div className="p-10 border-b border-gray-50">
                            <div className="flex justify-between items-start">
                                <div>
                                    <h3 className="text-2xl font-black text-slate-900 tracking-tight mb-2">Review QuickBooks Posting</h3>
                                    <p className="text-slate-500 text-sm font-medium">Verify the double-entry accounting treatment before syncing.</p>
                                </div>
                                <button
                                    onClick={() => setPostingReview(null)}
                                    className="p-3 hover:bg-slate-50 rounded-2xl text-slate-400 hover:text-slate-900 transition-all"
                                >
                                    <X size={24} strokeWidth={2.5} />
                                </button>
                            </div>
                        </div>

                        <div className="p-10 bg-slate-50/30 overflow-y-auto max-h-[50vh]">
                            <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden">
                                <table className="w-full border-collapse">
                                    <thead className="sticky top-0 z-10 bg-slate-50">
                                        <tr className="bg-slate-50/50">
                                            <th className="text-left py-5 px-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Account & Description</th>
                                            <th className="text-right py-5 px-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] w-32">Debit</th>
                                            <th className="text-right py-5 px-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] w-32">Credit</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {postingReview.type === 'REQUISITION' ? (
                                            <>
                                                {/* Expense Side */}
                                                {(postingReview.data.line_items || []).map((item: any, i: number) => (
                                                    <tr key={i}>
                                                        <td className="py-5 px-6">
                                                            <div className="font-bold text-slate-900 text-sm">{accounts.find(a => a.id === item.account_id)?.name || 'Uncategorized'}</div>
                                                            <div className="text-[11px] text-slate-400 font-medium">{item.description}</div>
                                                        </td>
                                                        <td className="py-5 px-6 text-right font-bold text-slate-900">{formatCurrency(item.actual_amount ?? item.estimated_amount ?? 0).replace('K', '')}</td>
                                                        <td className="py-5 px-6 text-right text-slate-200">-</td>
                                                    </tr>
                                                ))}
                                                {/* Payment Side */}
                                                <tr>
                                                    <td className="py-5 px-6 pl-10">
                                                        <div className="font-bold text-slate-900 text-sm">MoneyWise Wallet / Cash</div>
                                                        <div className="text-[11px] text-slate-400 font-medium">Payment for {postingReview.data.reference_number}</div>
                                                    </td>
                                                    <td className="py-5 px-6 text-right text-slate-200">-</td>
                                                    <td className="py-5 px-6 text-right font-bold text-rose-600">{formatCurrency(postingReview.entry?.credit || 0).replace('K', '')}</td>
                                                </tr>
                                            </>
                                        ) : (
                                            <>
                                                {/* Directional Logic: If it has a debit, it's an Inflow (Debit Wallet). 
                                                    If it has a credit, it's a Charge/Expense (Credit Wallet). */}
                                                {Number(postingReview.entry?.debit || 0) > 0 ? (
                                                    <>
                                                        {/* Regular Inflow: Debit Wallet, Credit Income Account */}
                                                        <tr>
                                                            <td className="py-5 px-6">
                                                                <div className="font-bold text-slate-900 text-sm">MoneyWise Wallet</div>
                                                                <div className="text-[11px] text-slate-400 font-medium">Inflow receipt</div>
                                                            </td>
                                                            <td className="py-5 px-6 text-right font-bold text-emerald-600">{formatCurrency(postingReview.entry?.debit || 0).replace('K', '')}</td>
                                                            <td className="py-5 px-6 text-right text-slate-200">-</td>
                                                        </tr>
                                                        <tr>
                                                            <td className="py-5 px-6 pl-10">
                                                                <div className="font-bold text-slate-900 text-sm">{accounts.find(a => a.id === postingReview.entry?.account_id)?.name || 'Uncategorized'}</div>
                                                                <div className="text-[11px] text-slate-400 font-medium">{postingReview.entry?.description}</div>
                                                            </td>
                                                            <td className="py-5 px-6 text-right text-slate-200">-</td>
                                                            <td className="py-5 px-6 text-right font-bold text-slate-900">{formatCurrency(postingReview.entry?.debit || 0).replace('K', '')}</td>
                                                        </tr>
                                                    </>
                                                ) : (
                                                    <>
                                                        {/* Transaction Charge: Debit Expense Account, Credit Wallet */}
                                                        <tr>
                                                            <td className="py-5 px-6">
                                                                <div className="font-bold text-slate-900 text-sm">{accounts.find(a => a.id === postingReview.entry?.account_id)?.name || 'Uncategorized'}</div>
                                                                <div className="text-[11px] text-slate-400 font-medium">{postingReview.entry?.description}</div>
                                                            </td>
                                                            <td className="py-5 px-6 text-right font-bold text-slate-900">{formatCurrency(postingReview.entry?.credit || 0).replace('K', '')}</td>
                                                            <td className="py-5 px-6 text-right text-slate-200">-</td>
                                                        </tr>
                                                        <tr>
                                                            <td className="py-5 px-6 pl-10">
                                                                <div className="font-bold text-slate-900 text-sm">MoneyWise Wallet</div>
                                                                <div className="text-[11px] text-slate-400 font-medium">Service / Transaction Fee</div>
                                                            </td>
                                                            <td className="py-5 px-6 text-right text-slate-200">-</td>
                                                            <td className="py-5 px-6 text-right font-bold text-rose-600">{formatCurrency(postingReview.entry?.credit || 0).replace('K', '')}</td>
                                                        </tr>
                                                    </>
                                                )}
                                            </>
                                        )}
                                    </tbody>
                                    <tfoot className="sticky bottom-0 z-10">
                                        <tr className="bg-slate-900 text-white">
                                            <td className="py-6 px-6 font-black text-xs uppercase tracking-widest">Total Balance</td>
                                            <td className="py-6 px-6 text-right font-black text-sm">
                                                {formatCurrency(postingReview.type === 'REQUISITION' 
                                                    ? (postingReview.data.line_items || []).reduce((acc: number, item: any) => acc + Number(item.actual_amount ?? item.estimated_amount ?? 0), 0)
                                                    : (Number(postingReview.entry?.debit || 0) > 0 ? (postingReview.entry?.debit || 0) : (postingReview.entry?.credit || 0))).replace('K', '')}
                                            </td>
                                            <td className="py-6 px-6 text-right font-black text-sm">
                                                {formatCurrency(postingReview.type === 'REQUISITION' 
                                                    ? (postingReview.entry?.credit || 0)
                                                    : (Number(postingReview.entry?.debit || 0) > 0 ? (postingReview.entry?.debit || 0) : (postingReview.entry?.credit || 0))).replace('K', '')}
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </div>

                        <div className="p-10 flex justify-end gap-4 bg-white">
                            <button
                                onClick={() => setPostingReview(null)}
                                className="px-8 py-4 rounded-2xl font-bold text-slate-500 hover:bg-slate-50 transition-all text-xs uppercase tracking-widest"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => postingReview.type === 'REQUISITION' ? confirmPostRequisition(postingReview.data) : confirmPostLedger(postingReview.entry!)}
                                disabled={isPosting}
                                className="bg-[#006AFF] hover:bg-[#0052CC] text-white px-10 py-4 rounded-2xl font-black text-xs uppercase tracking-[0.2em] transition-all shadow-xl shadow-blue-200 flex items-center disabled:opacity-50 disabled:shadow-none"
                            >
                                {isPosting ? (
                                    <>
                                        <Loader2 className="animate-spin mr-3" size={18} />
                                        Posting...
                                    </>
                                ) : (
                                    <>
                                        <Check className="mr-3" size={18} strokeWidth={3} />
                                        Confirm & Post
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Post Success Overlay */}
            {postSuccess && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-emerald-950/40 backdrop-blur-sm animate-in fade-in duration-500">
                    <div className="bg-white rounded-[48px] shadow-2xl p-12 text-center max-w-md border border-emerald-100 animate-in zoom-in-95 duration-500">
                        <div className="w-24 h-24 bg-emerald-500 rounded-[32px] flex items-center justify-center mx-auto mb-8 shadow-lg shadow-emerald-200">
                            <Check size={48} className="text-white" strokeWidth={3} />
                        </div>
                        <h3 className="text-3xl font-black text-slate-900 mb-4 tracking-tight">Successfully Posted!</h3>
                        <p className="text-slate-500 font-medium mb-10">
                            The {postSuccess.type} has been successfully synchronized with QuickBooks Online.
                        </p>
                        <div className="bg-slate-50 rounded-3xl p-6 mb-10 flex items-center justify-between border border-slate-100">
                            <div className="text-left">
                                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">QuickBooks ID</div>
                                <div className="text-sm font-bold text-slate-900">{postSuccess.qbId}</div>
                            </div>
                            <div className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-lg text-[10px] font-black uppercase tracking-widest">
                                Validated
                            </div>
                        </div>
                        <button
                            onClick={() => setPostSuccess(null)}
                            className="w-full bg-slate-900 hover:bg-slate-800 text-white py-5 rounded-[24px] font-black text-xs uppercase tracking-[0.2em] transition-all shadow-xl shadow-slate-200"
                        >
                            Back to Ledger
                        </button>
                    </div>
                </div>
            )}

            {/* Shared Modals (both layouts) */}
            <CloseBalanceModal
                isOpen={isCloseModalOpen}
                onClose={() => setIsCloseModalOpen(false)}
                onSuccess={() => {
                    const nextDay = new Date(endDate);
                    nextDay.setDate(nextDay.getDate() + 1);
                    setEndDate(nextDay.toISOString().split('T')[0]);
                    loadData();
                }}
                currentSystemBalance={balance}
                accountType={selectedAccountType}
                walletId={selectedAccountType === 'MONEYWISE_WALLET' ? selectedWalletId : undefined}
            />
            <CashInflowModal
                isOpen={isInflowModalOpen}
                onClose={() => setIsInflowModalOpen(false)}
                onSuccess={loadData}
                initialInflowType={selectedAccountType === 'MONEYWISE_WALLET' ? 'WALLET' : 'CASH'}
                isReadOnlyType={selectedAccountType === 'MONEYWISE_WALLET'}
                walletId={selectedAccountType === 'MONEYWISE_WALLET' ? selectedWalletId : undefined}
            />

            <RequisitionModal 
                isOpen={isRequisitionModalOpen}
                requisition={selectedRequisition}
                onClose={() => {
                    setIsRequisitionModalOpen(false);
                    setSelectedRequisition(null);
                }}
                onStatusChange={handleStatusChange}
            />

            <ExportLedgerModal
                isOpen={isExportModalOpen}
                onClose={() => setIsExportModalOpen(false)}
                onExport={handleExport}
                defaultStartDate={startDate}
                defaultEndDate={endDate}
            />

            <CreateWalletModal
                isOpen={isCreateWalletModalOpen}
                onClose={() => setIsCreateWalletModalOpen(false)}
                onSuccess={async () => {
                    // Force reselection of the Main wallet once the fresh list lands.
                    setSelectedWalletId(undefined);
                    await loadData();
                }}
            />

            <TransferModal
                isOpen={isTransferModalOpen}
                onClose={() => setIsTransferModalOpen(false)}
                onSuccess={loadData}
                wallets={wallets}
                initialSourceWalletId={selectedWalletId}
            />

            <TransferToWalletModal
                isOpen={isCashTransferModalOpen}
                onClose={() => setIsCashTransferModalOpen(false)}
                onSuccess={loadData}
                wallets={wallets}
                sourceBalance={externalBalances.CASH || 0}
                sourceAccountType="CASH"
            />

            <ShareWalletLinkModal
                isOpen={isShareModalOpen}
                onClose={() => {
                    setIsShareModalOpen(false);
                    setShareWalletId(null);
                }}
                walletName={wallets.find(w => w.id === shareWalletId)?.name || ''}
                shareUrl={shareWalletId ? `${window.location.origin}/pay/${shareWalletId}` : ''}
            />
        </Layout>
    );
};

export default CashLedger;

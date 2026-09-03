import React, { useState, useRef, useEffect } from 'react';
import { Search, RefreshCw, Plus, ArrowUpDown, ListFilter, LucideIcon } from 'lucide-react';
import { TabPillGroup } from './AnimatedTabs';

interface TabDef {
    label: string;
    value: string;
}

export interface NewMenuItem {
    label: string;
    description: string;
    icon: LucideIcon;
    iconColor: string;
    onSelect: () => void;
}

interface InboxCardProps {
    mode: 'outflows' | 'inflows';
    onModeChange: (mode: 'outflows' | 'inflows') => void;
    outflowCount: number;
    inflowCount: number;

    showNew: boolean;
    newLabel: string;
    onNew: () => void;
    // When provided (non-empty), the New button opens a dropdown of these
    // options instead of calling onNew directly.
    newMenuItems?: NewMenuItem[];

    showTabs: boolean;
    tabs: TabDef[];
    activeTab: string[];
    getTabCount: (value: string) => number;
    onTabChange: (value: string) => void;

    searchQuery: string;
    onSearchChange: (value: string) => void;
    sortOrder: 'desc' | 'asc';
    onToggleSort: () => void;
    onOpenFilters: () => void;
    onRefresh: () => void;
    hasActiveFilters?: boolean;

    /**
     * When provided, renders in the left slot of Row 2 (where the status tab
     * pills live for outflows) — use this to pass inflow sub-mode tabs so they
     * appear in the same position and at the same visual level as outflow tabs.
     */
    leftContent?: React.ReactNode;

    children: React.ReactNode;
}

/**
 * Desktop Inbox shell — the outer card that hosts the Inflows/Outflows toggle,
 * status tabs and list actions (search/sort/filter/refresh/new), matching the
 * new sidebar-nav era Inbox reference design. Row content is mode-specific and
 * passed in as children (requisitions get the reference-style rows; inflows
 * keep their existing table for now).
 */
export const InboxCard: React.FC<InboxCardProps> = ({
    mode,
    onModeChange,
    outflowCount,
    inflowCount,
    showNew,
    newLabel,
    onNew,
    newMenuItems,
    showTabs,
    tabs,
    activeTab,
    getTabCount,
    onTabChange,
    searchQuery,
    onSearchChange,
    sortOrder,
    onToggleSort,
    onOpenFilters,
    onRefresh,
    hasActiveFilters,
    leftContent,
    children,
}) => {
    const [isNewMenuOpen, setIsNewMenuOpen] = useState(false);
    const newMenuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (newMenuRef.current && !newMenuRef.current.contains(event.target as Node)) {
                setIsNewMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div className="bg-white rounded-[20px] p-3.5 flex flex-col gap-3">
            {/* Row 1: Inflows/Outflows toggle (with counts) + New */}
            <div className="flex items-center justify-between">
                <TabPillGroup
                    value={mode}
                    onChange={(v) => onModeChange(v as 'outflows' | 'inflows')}
                    trackClassName="h-8 px-1 bg-white rounded-lg outline outline-[0.5px] outline-offset-[-0.5px] outline-[#E8EEF8] flex items-center"
                    indicatorClassName="bg-[#F3F5FC] rounded-md"
                    separator={<div className="w-[1px] h-4 bg-[#E8EEF8] shrink-0" />}
                    tabs={[
                        {
                            value: 'outflows',
                            buttonClassName: 'flex items-center gap-2 px-3 h-8',
                            label: (
                                <>
                                    {mode === 'outflows' && <span className="w-1 h-1 rounded-full bg-[#0058DB]" />}
                                    <span className={`text-sm ${mode === 'outflows' ? 'font-bold text-[#111827]' : 'font-normal text-gray-400'}`}>Outflows</span>
                                    <span className="min-w-[18px] px-1 bg-[#F3F5FC] rounded text-center text-[10px] text-neutral-500">{outflowCount}</span>
                                </>
                            ),
                        },
                        {
                            value: 'inflows',
                            buttonClassName: 'flex items-center gap-2 px-3 h-8',
                            label: (
                                <>
                                    {mode === 'inflows' && <span className="w-1 h-1 rounded-full bg-[#0058DB]" />}
                                    <span className={`text-sm ${mode === 'inflows' ? 'font-bold text-[#111827]' : 'font-normal text-gray-400'}`}>Inflows</span>
                                    <span className="min-w-[18px] px-1 bg-[#F3F5FC] rounded text-center text-[10px] text-neutral-500">{inflowCount}</span>
                                </>
                            ),
                        },
                    ]}
                />

                {showNew && (
                    newMenuItems && newMenuItems.length > 0 ? (
                        <div className="relative" ref={newMenuRef}>
                            <button
                                onClick={() => setIsNewMenuOpen(prev => !prev)}
                                className="h-8 pl-4 pr-3 bg-[#0058DB] rounded-lg flex items-center gap-2 hover:opacity-90 transition-opacity"
                            >
                                <span className="text-white text-xs font-bold">{newLabel}</span>
                                <Plus size={14} className="text-white" />
                            </button>

                            {isNewMenuOpen && (
                                <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-72 bg-white rounded-2xl shadow-[0px_8px_24px_0px_rgba(17,24,39,0.12)] outline outline-1 outline-offset-[-1px] outline-[#E8EEF8] overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                                    {newMenuItems.map((item) => {
                                        const Icon = item.icon;
                                        return (
                                            <button
                                                key={item.label}
                                                onClick={() => { setIsNewMenuOpen(false); item.onSelect(); }}
                                                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[#F3F5FC] transition-colors"
                                            >
                                                <div
                                                    className="w-9 h-9 flex items-center justify-center flex-shrink-0"
                                                    style={{ color: item.iconColor }}
                                                >
                                                    <Icon size={18} />
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="text-xs font-bold text-[#111827] truncate">{item.label}</div>
                                                    <div className="text-[11px] text-gray-400 truncate">{item.description}</div>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    ) : (
                        <button
                            onClick={onNew}
                            className="h-8 pl-4 pr-3 bg-[#0058DB] rounded-lg flex items-center gap-2 hover:opacity-90 transition-opacity"
                        >
                            <span className="text-white text-xs font-bold">{newLabel}</span>
                            <Plus size={14} className="text-white" />
                        </button>
                    )
                )}
            </div>

            {/* Row 2: status tab pills + search / sort / filter / refresh */}
            <div className="flex items-center justify-between gap-4">
                {showTabs ? (
                    <div className="flex items-center gap-1 p-1 bg-[#F3F5FC] rounded-[10px] overflow-x-auto no-scrollbar">
                        {tabs.map(tab => {
                            const isActive = activeTab.length === 1 && activeTab[0] === tab.value;
                            const count = getTabCount(tab.value);
                            return (
                                <button
                                    key={tab.value}
                                    onClick={() => onTabChange(tab.value)}
                                    className={`px-3.5 py-1.5 rounded-lg text-[11px] whitespace-nowrap transition-all flex items-center gap-1.5 ${
                                        isActive ? 'font-bold bg-white text-[#111827] shadow-sm' : 'font-normal text-gray-500 hover:text-gray-700'
                                    }`}
                                >
                                    {tab.label}
                                    {count > 0 && (
                                        <span className={`px-1 rounded text-[9px] ${isActive ? 'bg-[#E8EEF8] text-[#0058DB]' : 'bg-gray-200 text-gray-500'}`}>
                                            {count}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                ) : leftContent ?? <div />}

                <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" size={14} />
                        <input
                            type="text"
                            placeholder="Search..."
                            value={searchQuery}
                            onChange={(e) => onSearchChange(e.target.value)}
                            className="w-48 pl-8 pr-3 py-2 bg-[#F3F5FC] border border-[#E8EEF8] rounded-lg text-xs font-medium text-brand-navy placeholder:text-gray-300 focus:ring-2 focus:ring-[#0058DB]/10 focus:bg-white transition-all"
                        />
                    </div>
                    <button
                        onClick={onToggleSort}
                        className={`p-2 rounded-lg border border-[#E8EEF8] transition-all ${sortOrder !== 'desc' ? 'text-[#0058DB] bg-[#E8EEF8] border-[#0058DB]/20' : 'text-gray-400 hover:text-gray-600 hover:bg-[#F3F5FC]'}`}
                        title="Sort by date"
                    >
                        <ArrowUpDown size={14} />
                    </button>
                    {showTabs && (
                        <button
                            onClick={onOpenFilters}
                            className={`p-2 rounded-lg border border-[#E8EEF8] transition-all ${hasActiveFilters ? 'text-[#0058DB] bg-[#E8EEF8] border-[#0058DB]/20' : 'text-gray-400 hover:text-gray-600 hover:bg-[#F3F5FC]'}`}
                            title="Filters"
                        >
                            <ListFilter size={14} />
                        </button>
                    )}
                    <button
                        onClick={onRefresh}
                        className="p-2 rounded-lg border border-[#E8EEF8] text-gray-400 hover:text-[#0058DB] hover:bg-[#F3F5FC] transition-all"
                        title="Refresh"
                    >
                        <RefreshCw size={14} />
                    </button>
                </div>
            </div>

            {children}
        </div>
    );
};

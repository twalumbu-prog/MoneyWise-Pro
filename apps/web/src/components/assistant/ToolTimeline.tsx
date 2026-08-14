/**
 * ToolTimeline.tsx — What the assistant is doing, while it does it.
 *
 * The old assistant showed three dots for thirty seconds. This shows the actual
 * steps: which data it's reading, what came back. Collapses to a one-line
 * summary once the answer arrives so finished messages stay clean.
 */

import React, { useState } from 'react';
import { AlertCircle, Check, ChevronDown, Loader2 } from 'lucide-react';

export interface Step {
    id: string;
    name: string;
    status: 'running' | 'ok' | 'failed';
    summary?: string;
}

/** Tool names are internal; the timeline speaks English. */
const STEP_LABELS: Record<string, string> = {
    get_org_overview: 'Checking your organisation setup',
    search_requisitions: 'Searching requisitions',
    get_requisition_details: 'Reading requisition details',
    search_transactions: 'Searching the cashbook',
    aggregate_spending: 'Totalling the numbers',
    get_financial_position: 'Reading your financial position',
    list_scheduled_items: 'Reading the expense schedule',
    list_accounts: 'Reading the chart of accounts',
    get_sales_summary: 'Reading sales',
    search_app_guide: 'Looking up how this works',
    render_chart: 'Drawing a chart',
    render_table: 'Building a table',
    render_kpis: 'Preparing headline figures',
    create_requisition: 'Preparing a requisition',
    update_requisition: 'Preparing requisition changes',
    create_scheduled_item: 'Preparing a scheduled expense',
    update_scheduled_item: 'Preparing schedule changes',
    update_org_settings: 'Preparing settings changes',
};

const label = (name: string) => STEP_LABELS[name] ?? name.replace(/_/g, ' ');

export const ToolTimeline: React.FC<{ steps: Step[]; live: boolean }> = ({ steps, live }) => {
    const [expanded, setExpanded] = useState(false);
    if (!steps.length) return null;

    const failed = steps.filter(s => s.status === 'failed').length;

    // While running, the step list *is* the feedback — showing a summary header
    // above it just repeats the current step's label twice.
    return (
        <div className="mb-3">
            {!live && (
                <button
                    onClick={() => setExpanded(v => !v)}
                    className="flex items-center gap-1.5 text-[11px] font-bold text-gray-400 transition-colors hover:text-gray-600"
                >
                    <span>
                        {`${steps.length} step${steps.length === 1 ? '' : 's'}${failed ? ` · ${failed} failed` : ''}`}
                    </span>
                    <ChevronDown size={12} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
                </button>
            )}

            {(live || expanded) && (
                <ol className={`space-y-1.5 border-l-2 border-gray-100 pl-3 ${live ? '' : 'mt-2'}`}>
                    {steps.map(step => (
                        <li key={step.id} className="flex items-start gap-2 text-[11px] leading-snug">
                            <span className="mt-[3px] flex-shrink-0">
                                {step.status === 'running' ? (
                                    <Loader2 size={10} className="animate-spin text-[#006AFF]" />
                                ) : step.status === 'failed' ? (
                                    <AlertCircle size={10} className="text-rose-400" />
                                ) : (
                                    <Check size={10} className="text-emerald-500" />
                                )}
                            </span>
                            <span className="font-semibold text-gray-500">{label(step.name)}</span>
                            {step.summary && step.status !== 'running' && (
                                <span className={step.status === 'failed' ? 'text-rose-400' : 'text-gray-300'}>
                                    · {step.summary}
                                </span>
                            )}
                        </li>
                    ))}
                </ol>
            )}
        </div>
    );
};

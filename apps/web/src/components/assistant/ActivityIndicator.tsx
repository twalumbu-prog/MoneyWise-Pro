/**
 * ActivityIndicator.tsx — What the assistant shows while it works.
 *
 * The phrasing rotates, but it is never decorative fiction: each phrase set is
 * keyed to the tool actually running, so "Adding up the numbers" only appears
 * while aggregation is genuinely in flight. Only the pre-tool phase, where the
 * model is deciding what to do, uses generic copy — because that is genuinely
 * all that is happening.
 */

import React, { useEffect, useRef, useState } from 'react';

const PHRASES: Record<string, string[]> = {
    // Before any tool call — the model is choosing an approach.
    thinking: [
        'Thinking it through',
        'Working out where to look',
        'Planning the approach',
    ],
    working: [
        'Putting it together',
        'Joining up the pieces',
        'Working through it',
    ],
    get_org_overview: ['Getting my bearings', 'Checking how you are set up'],
    search_requisitions: ['Flipping through your requisitions', 'Searching the requisition records'],
    search_expense_items: ['Digging into the line items', 'Checking what was actually bought'],
    get_requisition_details: ['Reading the line items', 'Opening up the details'],
    search_transactions: ['Running through your cashbook', 'Combing the ledger'],
    aggregate_spending: ['Adding up the numbers', 'Crunching the totals'],
    flag_risky_transactions: ['Screening for anything unusual', 'Checking for red flags'],
    get_financial_position: ['Reading your financial position', 'Checking the balances'],
    list_scheduled_items: ['Checking what is due', 'Reading the expense schedule'],
    list_accounts: ['Looking through the chart of accounts'],
    get_sales_summary: ['Tallying up sales', 'Reading the sales records'],
    search_app_guide: ['Looking that up', 'Checking how this works'],
    reconcile_bank_statement: ['Reading the statement', 'Matching it against your ledger'],
    export_pdf_report: ['Laying out the report', 'Putting the PDF together'],
    export_excel: ['Building the spreadsheet', 'Writing out the workbook'],
    export_transactions_excel: ['Pulling the full ledger', 'Writing out every transaction'],
    render_chart: ['Drawing the chart', 'Plotting it out'],
    render_table: ['Laying out the table'],
    render_kpis: ['Pulling the headline figures'],
    create_requisition: ['Drafting the requisition'],
    update_requisition: ['Preparing the changes'],
    create_scheduled_item: ['Setting up the schedule entry'],
    update_scheduled_item: ['Preparing the schedule changes'],
    categorize_transaction: ['Matching it to an account', 'Preparing the classification'],
    categorize_requisition_expense: ['Matching the line item to an account', 'Preparing the classification'],
    update_org_settings: ['Preparing the settings change'],
};

const ROTATE_MS = 2600;

/**
 * `activity` is the running tool name, or the status phase, or null. Changing it
 * restarts the rotation so the copy tracks reality immediately.
 */
export const ActivityIndicator: React.FC<{ activity: string | null }> = ({ activity }) => {
    const [index, setIndex] = useState(0);
    const key = activity ?? 'thinking';
    const phrases = PHRASES[key] ?? PHRASES.working;
    const previousKey = useRef(key);

    useEffect(() => {
        if (previousKey.current !== key) {
            previousKey.current = key;
            setIndex(0);
        }
    }, [key]);

    useEffect(() => {
        if (phrases.length < 2) return;
        const timer = setInterval(() => setIndex(i => (i + 1) % phrases.length), ROTATE_MS);
        return () => clearInterval(timer);
    }, [phrases.length, key]);

    const phrase = phrases[index % phrases.length];

    return (
        <div className="flex items-center gap-2.5" aria-live="polite">
            <div className="typing-bubble !px-3 !py-2">
                <div className="typing-dot" />
                <div className="typing-dot" />
                <div className="typing-dot" />
            </div>
            {/* `key` remounts the span so the crossfade replays on each phrase. */}
            <span key={`${key}-${index}`} className="status-live text-[12.5px] font-bold">
                {phrase}…
            </span>
        </div>
    );
};

import { useSyncExternalStore } from 'react';
import { cashbookService, scheduleService } from 'core';
import { cacheStoreSync } from '../../platform/storage';
import { queryClient } from '../queryClient';
import { isNetworkError, markOffline } from './connectivity';

/**
 * The outbox: things the person did while the phone could not reach MoneyWise, kept on the phone until it can.
 *
 * Only records that are safe to send later go in here: a manual transaction, a new bill, and a change of category. Payments and transfers never do, because sending
 * money later, on stale information, is not something to do silently. Each item has an id the phone made up; the server books an item
 * with a given id once, so a retry after a dropped connection can never double it.
 *
 * Items belong to the person and workspace they were made in, and only go out when that same person and workspace are active.
 */

const KEY = 'mw-outbox-v1';

export interface ManualEntryPayload {
    direction: 'IN' | 'OUT'; amount: number; description: string; date: string; externalWalletId: string; walletName?: string;
}
export interface BillPayload { id: string; title: string; amount: number; category: string; cadence: string; next_due_date: string; description?: string }
export interface CategoryPayload { entryId: string; accountId: string; name?: string }

interface Base {
    id: string;
    userId: string;
    orgId: string | null;
    createdAt: string;
    tries: number;
    /** Set when the server refused it (not a connection problem): it will not go out by itself and needs the person to look. */
    failed?: string;
}
export type OutboxItem =
    | (Base & { kind: 'manual-entry'; payload: ManualEntryPayload })
    | (Base & { kind: 'bill'; payload: BillPayload })
    | (Base & { kind: 'category'; payload: CategoryPayload });

/** What an item is, in words, for the indicator. */
export const describeItem = (i: OutboxItem) =>
    i.kind === 'manual-entry' ? `entry "${i.payload.description}"` : i.kind === 'bill' ? `bill "${i.payload.title}"` : `category change${i.payload.name ? ` to ${i.payload.name}` : ''}`;

const listeners = new Set<() => void>();
let snapshot: OutboxItem[] = read();

function read(): OutboxItem[] {
    try { return JSON.parse(cacheStoreSync.getItem(KEY) ?? '[]') as OutboxItem[]; } catch { return []; }
}
function write(items: OutboxItem[]) {
    snapshot = items;
    try { cacheStoreSync.setItem(KEY, JSON.stringify(items)); } catch { /* storage full: keep in memory */ }
    listeners.forEach((l) => l());
}

export const outboxItems = () => snapshot;
export const pendingCount = () => snapshot.filter((i) => !i.failed).length;

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`.slice(0, 32);
/** A random UUID (v4 shape), for things the server stores under the id the phone chose. */
export const newUuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = Math.floor(Math.random() * 16); return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16); });

type Ctx = { userId: string; orgId: string | null };
function add<T extends OutboxItem>(ctx: Ctx, kind: T['kind'], payload: T['payload'], id = newId()): T {
    const item = { id, kind, userId: ctx.userId, orgId: ctx.orgId, payload, createdAt: new Date().toISOString(), tries: 0 } as unknown as T;
    write([...snapshot, item]);
    return item;
}
export const enqueueManualEntry = (ctx: Ctx, payload: ManualEntryPayload) => add<Extract<OutboxItem, { kind: 'manual-entry' }>>(ctx, 'manual-entry', payload);
export const enqueueBill = (ctx: Ctx, payload: BillPayload) => add<Extract<OutboxItem, { kind: 'bill' }>>(ctx, 'bill', payload);
export const enqueueCategoryChange = (ctx: Ctx, payload: CategoryPayload) => add<Extract<OutboxItem, { kind: 'category' }>>(ctx, 'category', payload);

export function discardOutboxItem(id: string) { write(snapshot.filter((i) => i.id !== id)); }
export function retryFailedItem(id: string) { write(snapshot.map((i) => (i.id === id ? { ...i, failed: undefined, tries: 0 } : i))); }

let flushing: Promise<{ sent: number }> | null = null;

/** Sends what can be sent for this person and workspace, oldest first. Stops at the first connection failure. */
export function flushOutbox(ctx: { userId: string; orgId: string | null }): Promise<{ sent: number }> {
    if (flushing) return flushing;
    flushing = (async () => {
        let sent = 0;
        for (const item of [...snapshot]) {
            if (item.failed || item.userId !== ctx.userId || (item.orgId && item.orgId !== ctx.orgId)) continue;
            try {
                if (item.kind === 'manual-entry') await cashbookService.recordManualEntry({ ...item.payload, clientId: item.id });
                else if (item.kind === 'bill') await scheduleService.create(item.payload as any);
                else if (item.kind === 'category') await cashbookService.setEntryAccount(item.payload.entryId, item.payload.accountId);
                discardOutboxItem(item.id);
                sent++;
            } catch (e: any) {
                if (isNetworkError(e)) { markOffline(); break; }
                // The server answered and refused (e.g. the account was deleted): keep it, mark it, and move on to the next.
                write(snapshot.map((i) => (i.id === item.id ? { ...i, tries: i.tries + 1, failed: String(e?.message || 'Could not be saved') } : i)));
            }
        }
        if (sent > 0) void queryClient.invalidateQueries();
        return { sent };
    })().finally(() => { flushing = null; });
    return flushing;
}

export function useOutbox(): OutboxItem[] {
    return useSyncExternalStore(
        (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
        () => snapshot,
        () => snapshot,
    );
}

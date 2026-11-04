import React, { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiJson } from 'core';
import { Dialog, ErrorNote, PrimaryButton } from '../ui/Dialog';
import { LISTINGS_KEY } from './parts';
import { AuctionFields, auctionBody, auctionProblem, defaultAuction } from './AuctionFields';
import type { AuctionForm } from './AuctionFields';

/** The seller turns one of their items into a timed auction: starting price, optional reserve and Buy it now, and how long it runs. */
export const StartAuctionDialog: React.FC<{ listing: { id: string; name: string; price: number }; open: boolean; onClose: () => void; onStarted?: () => void }> = ({ listing, open, onClose, onStarted }) => {
    const qc = useQueryClient();
    const [form, setForm] = useState<AuctionForm>(() => defaultAuction(listing.price));
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    useEffect(() => { if (open) { setForm(defaultAuction(listing.price)); setError(null); } }, [open, listing.id, listing.price]);

    const submit = async () => {
        const problem = auctionProblem(form);
        if (problem) { setError(problem); return; }
        setBusy(true); setError(null);
        try {
            await apiJson('/marketplace/auctions', { method: 'POST', body: JSON.stringify(auctionBody(listing.id, form)) });
            await qc.invalidateQueries({ queryKey: LISTINGS_KEY });
            onStarted?.();
            onClose();
        } catch (e: any) { setError(e?.message || 'Couldn’t start the auction.'); }
        finally { setBusy(false); }
    };

    return (
        <Dialog open={open} title="Start an auction" onClose={onClose}>
            <ErrorNote text={error} />
            <p className="mb-4 text-sm text-[#5F6368]">Put “{listing.name}” up for bids. It will also appear on the Marketplace while the auction runs.</p>
            <div className="mb-5"><AuctionFields value={form} onChange={(a) => { setForm(a); setError(null); }} name={listing.name} /></div>
            <PrimaryButton onClick={submit} busy={busy} className="w-full">Start auction</PrimaryButton>
        </Dialog>
    );
};

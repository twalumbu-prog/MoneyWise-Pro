import React, { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiJson } from 'core';
import { Dialog, ErrorNote, PrimaryButton, fieldClass, labelClass } from '../ui/Dialog';
import { LISTINGS_KEY } from './parts';

interface Loc { city: string; province: string; country: string }

/** Where the store is, shown on every listing so buyers can tell if it is near them. Stored with the business profile. */
export const StoreLocationDialog: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
    const qc = useQueryClient();
    const { data } = useQuery({ queryKey: ['marketplace', 'my-location'], queryFn: () => apiJson<Loc>('/marketplace/my-location'), enabled: open });
    const [loc, setLoc] = useState<Loc>({ city: '', province: '', country: 'Zambia' });
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => { if (open && data) setLoc({ city: data.city, province: data.province, country: data.country || 'Zambia' }); }, [open, data]);

    const save = async () => {
        if (!loc.city.trim()) { setError('Enter the town or city.'); return; }
        setBusy(true); setError(null);
        try {
            await apiJson('/marketplace/my-location', { method: 'PUT', body: JSON.stringify(loc) });
            await Promise.all([qc.invalidateQueries({ queryKey: LISTINGS_KEY }), qc.invalidateQueries({ queryKey: ['marketplace', 'my-location'] })]);
            onClose();
        } catch (e: any) {
            setError(e?.message || 'Couldn’t save the location.');
        } finally {
            setBusy(false);
        }
    };

    const field = (key: keyof Loc, label: string, placeholder: string) => (
        <div className="mb-4">
            <label className={labelClass} htmlFor={`loc-${key}`}>{label}</label>
            <input id={`loc-${key}`} className={fieldClass} value={loc[key]} onChange={(e) => { setLoc({ ...loc, [key]: e.target.value }); setError(null); }} placeholder={placeholder} />
        </div>
    );

    return (
        <Dialog open={open} title="Your store’s location" onClose={onClose}>
            <ErrorNote text={error} />
            <p className="mb-4 text-sm text-[#5F6368]">Buyers see this on your listings. A business with a public store address, a contact number and a location also earns the Verified badge.</p>
            {field('city', 'Area and city', 'e.g. Kabulonga, Lusaka')}
            {field('province', 'Province (optional)', 'e.g. Lusaka Province')}
            {field('country', 'Country', 'Zambia')}
            <PrimaryButton onClick={save} busy={busy} className="mt-1 w-full">Save location</PrimaryButton>
        </Dialog>
    );
};

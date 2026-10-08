import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { lencoService } from '../services/lenco.service';

export interface LencoBank { id: string; name: string }

/**
 * Bank + account number → the account holder's name, fetched from Lenco as the user types.
 * Banks come from Lenco itself, so a picked bank always maps to a bank id. A bank name that
 * was saved earlier (and isn't spelled exactly like Lenco's) is matched loosely.
 */
export function useBankAccountLookup(bankName: string, accountNumber: string, organizationId?: string | null) {
    const { data: raw } = useQuery({ queryKey: ['lenco-banks'], queryFn: () => lencoService.getBanks(), staleTime: 60 * 60_000 });
    const banks: LencoBank[] = useMemo(() => {
        const list: any[] = Array.isArray(raw) ? raw : (raw?.data || []);
        return list.map(b => ({ id: String(b.id ?? b.code), name: String(b.name) }));
    }, [raw]);

    const bankId = useMemo(() => {
        const want = bankName.trim().toLowerCase();
        if (!want) return '';
        const hit = banks.find(b => b.name.toLowerCase() === want)
            || banks.find(b => b.name.toLowerCase().includes(want) || want.includes(b.name.toLowerCase()));
        return hit?.id ?? '';
    }, [banks, bankName]);

    const [name, setName] = useState('');
    const [status, setStatus] = useState<'idle' | 'checking' | 'found' | 'failed'>('idle');
    const requestRef = useRef(0);

    useEffect(() => {
        const number = accountNumber.trim();
        const id = ++requestRef.current;
        setName('');
        if (!bankId || number.length < 5) { setStatus('idle'); return; }
        setStatus('checking');
        const timer = setTimeout(async () => {
            try {
                const res = await lencoService.resolveBankAccount(number, bankId, organizationId ?? undefined);
                if (id !== requestRef.current) return;
                const found = res?.accountName || res?.account_name || res?.name || '';
                setName(found);
                setStatus(found ? 'found' : 'failed');
            } catch {
                if (id !== requestRef.current) return;
                setStatus('failed');
            }
        }, 450);
        return () => clearTimeout(timer);
    }, [bankId, accountNumber, organizationId]);

    return { banks, bankId, name, status };
}

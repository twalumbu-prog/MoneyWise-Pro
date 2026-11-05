import React, { useEffect, useState } from 'react';
import { ScanLine } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { captureApi } from './captureApi';
import { CaptureReviewCard } from './CaptureReviewCard';

/** Ledger detail row: shows where an entry came from when a capture booked it or matched it. Renders nothing otherwise. */
export const CaptureEvidenceLink: React.FC<{ entryId: string }> = ({ entryId }) => {
    const { userRole } = useAuth();
    const [captureId, setCaptureId] = useState<string | null>(null);
    const [open, setOpen] = useState(false);

    useEffect(() => {
        let live = true;
        setCaptureId(null);
        captureApi.byEntry(entryId).then(r => { if (live) setCaptureId(r.capture?.id ?? null); }).catch(() => undefined);
        return () => { live = false; };
    }, [entryId]);

    if (!captureId) return null;
    return (
        <>
            <div className="flex items-center justify-between px-3.5 py-2.5">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-gray-500"><ScanLine className="h-3.5 w-3.5" /> Captured</span>
                <button onClick={() => setOpen(true)} className="text-[11px] font-bold text-[#006AFF]">View evidence</button>
            </div>
            {open && (
                <CaptureReviewCard
                    id={captureId}
                    canReview={['OWNER', 'ADMIN', 'ACCOUNTANT'].includes(userRole || '')}
                    onClose={() => setOpen(false)}
                    onChanged={() => undefined}
                />
            )}
        </>
    );
};

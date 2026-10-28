import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { claimPendingReferral } from '../lib/referral';

/** Renders nothing. Once someone who arrived through a friend's invite link is signed in, records the invite. */
export const ReferralClaimer: React.FC = () => {
    const { session } = useAuth();
    useEffect(() => { if (session) void claimPendingReferral(); }, [session]);
    return null;
};

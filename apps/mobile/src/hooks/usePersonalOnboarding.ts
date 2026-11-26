import { useQuery } from '@tanstack/react-query';
import { personalOnboardingService, personalChecklist, hidePersonalSteps } from 'core';
import { useAuth } from '../context/AuthContext';
import { usePersonalAccount } from './usePersonalAccount';
import { androidCaptureAvailable, smsReadingInBuild } from '../lib/momoCapture';

// Android phones that can read SMS skip "Where do you keep your money?": the capture step's first import sets each
// mobile money account and its balance from the person's own messages. (The wizard imports this file too.)
if (androidCaptureAvailable && smsReadingInBuild) hidePersonalSteps(['accounts']);

export const PERSONAL_ONBOARDING_QUERY_KEY = ['personal-onboarding-state'];

/**
 * Personal onboarding state for the active workspace, for the Home "Finish setting up" card. Only personal
 * workspaces owned by this person (ADMIN) ask; anything else, or an account on the legacy wizard, gets no checklist.
 */
export function usePersonalOnboarding() {
    const { organizationId, userRole } = useAuth();
    const { isPersonal } = usePersonalAccount();
    const enabled = !!organizationId && isPersonal && userRole === 'ADMIN';
    const query = useQuery({
        queryKey: [...PERSONAL_ONBOARDING_QUERY_KEY, organizationId],
        enabled,
        staleTime: 60_000,
        queryFn: () => personalOnboardingService.getState(),
    });
    const state = query.data?.flow === 'PERSONAL_V2' ? query.data : null;
    const checklist = state ? personalChecklist(state.steps) : [];
    return { state, checklist, isLoading: query.isLoading };
}

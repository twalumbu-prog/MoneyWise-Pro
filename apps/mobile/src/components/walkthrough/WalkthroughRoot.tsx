import { useAuth } from '../../context/AuthContext';
import { TourOverlay } from './TourOverlay';
import { WalkthroughModals } from './WalkthroughSheets';
import { WalkthroughToast } from './WalkthroughToast';

/** Everything the walkthrough needs on top of the app, mounted once at the root and only while someone is signed in. */
export const WalkthroughRoot: React.FC = () => {
    const { session } = useAuth();
    if (!session) return null;
    return (
        <>
            <TourOverlay />
            <WalkthroughToast />
            <WalkthroughModals />
        </>
    );
};

import { useLocalSearchParams } from 'expo-router';
import { PayLinkOverlay } from '../../src/components/payments/PayLinkOverlay';

/** A business's quick-pay page opened in the app (https://…/pay/<username>): choose an amount, then "slide to pay". */
export default function QuickPayScreen() {
    const { username } = useLocalSearchParams<{ username: string }>();
    return <PayLinkOverlay username={String(username)} />;
}

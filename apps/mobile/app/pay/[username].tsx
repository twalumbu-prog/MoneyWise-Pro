import { useLocalSearchParams } from 'expo-router';
import { PayLinkOverlay } from '../../src/components/payments/PayLinkOverlay';

/** A business's quick-pay page opened in the app (https://…/pay/<username>): choose an amount, then "slide to pay". */
export default function QuickPayScreen() {
    const { username, src, ret } = useLocalSearchParams<{ username: string; src?: string; ret?: string }>();
    return <PayLinkOverlay username={String(username)} fromSafari={src === 'safari'} returnTo={ret ? String(ret) : undefined} />;
}

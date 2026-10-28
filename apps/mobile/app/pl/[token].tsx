import { useLocalSearchParams } from 'expo-router';
import { PayLinkOverlay } from '../../src/components/payments/PayLinkOverlay';

/** A payment link opened in the app (https://…/pl/<token>, via universal link): the "slide to pay" overlay. */
export default function PaymentLinkScreen() {
    const { token } = useLocalSearchParams<{ token: string }>();
    return <PayLinkOverlay token={String(token)} />;
}

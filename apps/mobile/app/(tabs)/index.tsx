import { InboxScreen } from '../../src/screens/InboxScreen';
import { HomeScreen } from '../../src/screens/HomeScreen';
import { usePersonalAccount } from '../../src/hooks/usePersonalAccount';

/**
 * The first tab. A MoneyWise personal account lands on Home (accounts, spending, quick actions, the Assistant); the Inbox — the
 * requests list — is one tap away from there. Business accounts keep the Inbox as their first tab, exactly as before.
 */
export default function FirstTab() {
    const { isPersonal } = usePersonalAccount();
    return isPersonal ? <HomeScreen /> : <InboxScreen />;
}

import { useRouter } from 'expo-router';
import { InboxScreen } from '../../src/screens/InboxScreen';

/** The Inbox for a personal account — the same screen as before, reached from the bell on Home. Hidden from the tab bar. */
export default function PersonalInbox() {
    const router = useRouter();
    return <InboxScreen onBack={() => router.navigate('/')} />;
}

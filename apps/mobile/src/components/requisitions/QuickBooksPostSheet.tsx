import { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { ChevronDown, Wallet, AlertTriangle } from 'lucide-react-native';
import { integrationService, requisitionService } from 'core';
import { colors, fonts, radius } from '../../theme/tokens';
import { AccountPickerModal } from './AccountPickerModal';

/**
 * Native port of web's Credit (Source) Account picker + Post button
 * (apps/web/src/components/requisitions/RequisitionMessageCard.tsx QUICKBOOKS_POSTING
 * stage) — mobile previously only displayed the ledger summary read-only and told
 * the user to finish on web.
 */
export const QuickBooksPostSheet: React.FC<{
    requisitionId: string;
    paymentMethod?: string;
    onPosted: () => void;
}> = ({ requisitionId, paymentMethod, onPosted }) => {
    const [accounts, setAccounts] = useState<any[]>([]);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [loadingAccounts, setLoadingAccounts] = useState(true);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [isPosting, setIsPosting] = useState(false);

    const isWallet = paymentMethod === 'WALLET' || paymentMethod === 'MONEYWISE_WALLET';
    const selectedAccount = accounts.find((a) => a.Id === selectedId);
    const creditAccountName = selectedAccount?.Name || (isWallet ? 'MoneyWise Wallet' : 'Selected Account');

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const [accs, status] = await Promise.all([
                    integrationService.getAccounts(),
                    integrationService.getStatus(),
                ]);
                if (cancelled) return;
                setAccounts(accs || []);
                setFetchError(null);

                const mappings = status.config?.mappings || {};
                if (mappings[paymentMethod || '']) {
                    setSelectedId(mappings[paymentMethod || ''].id);
                } else if (isWallet) {
                    const walletAcc = (accs || []).find((a: any) =>
                        a.Name?.toLowerCase().includes('wallet') || a.Name?.toLowerCase().includes('moneywise'));
                    if (walletAcc) setSelectedId(walletAcc.Id);
                } else if ((accs || []).length > 0) {
                    const bankAcc = accs.find((a: any) => a.AccountType === 'Bank') || accs[0];
                    if (bankAcc) setSelectedId(bankAcc.Id);
                }
            } catch (e: any) {
                if (!cancelled) setFetchError(e?.message || 'Failed to connect to QuickBooks API');
            } finally {
                if (!cancelled) setLoadingAccounts(false);
            }
        })();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const post = async () => {
        setIsPosting(true);
        try {
            await requisitionService.postToQuickBooks(requisitionId, {
                payment_account_id: selectedId || '',
                payment_account_name: creditAccountName,
            });
            onPosted();
        } catch (e: any) {
            Alert.alert('Posting failed', e?.message ?? 'Please try again.');
        } finally {
            setIsPosting(false);
        }
    };

    return (
        <View style={styles.root}>
            <Text style={styles.label}>{selectedAccount ? 'Credit (Source) Account' : 'Select Credit (Source) Account'}</Text>

            <Pressable
                style={styles.trigger}
                onPress={() => { if (!isWallet) setPickerOpen(true); }}
                disabled={isWallet || loadingAccounts}
            >
                <View style={styles.triggerLeft}>
                    <View style={styles.triggerIcon}>
                        {loadingAccounts ? <ActivityIndicator size="small" color={colors.textFaint} /> : <Wallet size={15} color={selectedAccount ? colors.blue : colors.textFaint} />}
                    </View>
                    <Text style={[styles.triggerText, !selectedAccount && styles.triggerTextMuted]} numberOfLines={1}>
                        {loadingAccounts
                            ? 'Loading accounts…'
                            : selectedAccount ? selectedAccount.Name : (isWallet ? 'Searching for wallet account…' : 'Search for a bank or wallet account…')}
                    </Text>
                </View>
                {!isWallet && <ChevronDown size={16} color={colors.textFaint} />}
            </Pressable>

            {fetchError && !selectedAccount && (
                <View style={styles.errorBox}>
                    <AlertTriangle size={14} color="#B45309" />
                    <Text style={styles.errorText}>Unable to verify "{creditAccountName}" in QuickBooks. Please select a valid account.</Text>
                </View>
            )}

            <Pressable
                style={[styles.postBtn, (isPosting || !selectedId) && styles.disabled]}
                onPress={post}
                disabled={isPosting || !selectedId}
            >
                {isPosting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.postBtnText}>Post to QuickBooks</Text>}
            </Pressable>

            <AccountPickerModal
                visible={pickerOpen}
                title="Select account"
                accounts={accounts.map((a) => ({ id: a.Id, name: a.Name, subtitle: a.AccountType }))}
                selectedId={selectedId}
                emptyText={fetchError ? 'QuickBooks account fetch failed.' : 'No suitable accounts found.'}
                onSelect={(a) => { setSelectedId(a.id); setPickerOpen(false); }}
                onClose={() => setPickerOpen(false)}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    root: { gap: 10, marginTop: 6, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
    label: { fontFamily: fonts.bodyBold, fontSize: 9, color: colors.textFaint, letterSpacing: 0.5 },
    trigger: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md,
        paddingHorizontal: 12, paddingVertical: 12,
    },
    triggerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
    triggerIcon: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.tabActiveBg, alignItems: 'center', justifyContent: 'center' },
    triggerText: { flex: 1, fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text },
    triggerTextMuted: { color: colors.textFaint, fontFamily: fonts.bodyMedium },
    errorBox: { flexDirection: 'row', gap: 8, backgroundColor: '#FFFBEB', borderRadius: radius.md, padding: 10, alignItems: 'flex-start' },
    errorText: { flex: 1, fontFamily: fonts.body, fontSize: 11, color: '#B45309', lineHeight: 15 },
    postBtn: { backgroundColor: colors.blue, borderRadius: radius.pill, paddingVertical: 13, alignItems: 'center', justifyContent: 'center' },
    postBtnText: { fontFamily: fonts.bodyBold, fontSize: 13, color: '#FFFFFF' },
    disabled: { opacity: 0.4 },
});

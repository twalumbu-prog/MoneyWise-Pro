import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { PersonalStepError, type PersonalAccount, type MoneyProviderType } from 'core';
import { Sheet, MoneyField, ProviderLogo, formatTyped, parseTyped } from './moneyUi';
import { Field } from './steps';
import type { PersonalService } from './stepContext';
import { colors, fonts } from '../../../theme/tokens';

/**
 * Add or edit one account and its balance today. Saving books the opening balance at once, so closing the app
 * after this never loses it.
 */
export interface AccountTarget {
    providerType: MoneyProviderType;
    providerCode: string | null;
    providerName: string;
    existing?: PersonalAccount;
}

export function AccountSheet({ target, service, onClose, onSaved }: {
    target: AccountTarget | null;
    service: PersonalService;
    onClose: () => void;
    onSaved: () => void;
}) {
    const [customName, setCustomName] = useState('');
    const [balance, setBalance] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

    useEffect(() => {
        if (!target) return;
        const ex = target.existing;
        setCustomName(target.providerType === 'CUSTOM' ? ex?.name ?? (target.providerName === 'Other' ? '' : target.providerName) : '');
        setBalance(ex ? formatTyped(String(ex.openingBalance)) : '');
        setError(null); setFieldErrors({});
    }, [target]);

    if (!target) return null;
    const isCustom = target.providerType === 'CUSTOM';

    const save = async () => {
        setBusy(true); setError(null); setFieldErrors({});
        try {
            await service.saveAccount({
                walletId: target.existing?.walletId,
                providerType: target.providerType,
                providerCode: target.providerCode,
                nickname: isCustom ? undefined : (target.existing && target.existing.name !== target.providerName ? target.existing.name : undefined),
                customName: isCustom ? customName : undefined,
                balance: parseTyped(balance),
            });
            onSaved();
        } catch (e: any) {
            if (e instanceof PersonalStepError && e.field) setFieldErrors({ [e.field === 'nickname' && isCustom ? 'customName' : e.field]: e.message });
            else setError(e?.message || 'Couldn’t save. Try again.');
        } finally {
            setBusy(false);
        }
    };

    const remove = async () => {
        if (!target.existing) return;
        setBusy(true);
        try { await service.deleteAccount(target.existing.walletId); onSaved(); }
        catch (e: any) { setError(e?.message || 'Couldn’t remove it. Try again.'); }
        finally { setBusy(false); }
    };

    return (
        <Sheet
            visible
            title={target.existing ? `Edit ${target.existing.name}` : isCustom ? 'Add cash or other' : `Add ${target.providerName}`}
            onClose={onClose}
            busy={busy}
            error={error}
            primary={{ label: 'Save', onPress: () => void save(), disabled: isCustom && !customName.trim() }}
            secondary={target.existing ? { label: 'Remove', onPress: () => void remove(), danger: true } : undefined}
        >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <ProviderLogo type={target.providerType} code={target.providerCode} name={target.providerName} size={44} />
                <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 16, color: colors.text, flex: 1 }}>{isCustom ? 'Cash, a savings club or anything else' : target.providerName}</Text>
            </View>
            {isCustom && (
                <Field label="Name" value={customName} onChangeText={setCustomName} placeholder="e.g. Cash at hand, Chilimba" autoCapitalize="sentences" error={fieldErrors.customName} autoFocus={!customName} />
            )}
            <MoneyField
                label="Balance today"
                value={balance}
                onChange={setBalance}
                error={fieldErrors.balance}
                autoFocus={!isCustom && !target.existing}
                hint="What’s there right now. It can be 0. MoneyWise keeps it up to date from here."
            />
        </Sheet>
    );
}

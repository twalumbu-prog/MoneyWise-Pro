/**
 * Financial providers offered when linking an external account.
 *
 * Reference data both clients must show identically — an account created on the
 * phone under a provider code the web app doesn't recognise would reconcile
 * against nothing.
 */

export interface Provider {
    code: string;
    name: string;
}

export const PROVIDER_BANKS: Provider[] = [
    { code: 'ZANACO', name: 'Zanaco Bank' },
    { code: 'FNB', name: 'FNB' },
    { code: 'STANBIC', name: 'Stanbic Bank' },
    { code: 'ABSA', name: 'Absa Bank' },
    { code: 'ECOBANK', name: 'Ecobank' },
    { code: 'STANDARD_CHARTERED', name: 'Standard Chartered' },
    { code: 'ACCESS', name: 'Access Bank' },
    { code: 'INDO_ZAMBIA', name: 'Indo Zambia Bank' },
    { code: 'FIRST_CAPITAL', name: 'First Capital Bank' },
    { code: 'AB_BANK', name: 'AB Bank' },
    { code: 'ZNBS', name: 'ZNBS' },
    { code: 'NATSAVE', name: 'Natsave' },
    { code: 'FIRST_ALLIANCE', name: 'First Alliance Bank' },
    { code: 'BANK_OF_CHINA', name: 'Bank of China' },
    { code: 'CITI', name: 'Citibank' },
    { code: 'UBA', name: 'UBA' },
    { code: 'OTHER', name: 'Other Bank' },
];

export const PROVIDER_MOMO: Provider[] = [
    { code: 'MTN', name: 'MTN Mobile Money' },
    { code: 'AIRTEL', name: 'Airtel Money' },
    { code: 'ZAMTEL', name: 'Zamtel Kwacha' },
    { code: 'OTHER', name: 'Other Mobile Money' },
];

export type ExternalProviderType = 'BANK' | 'MOBILE_MONEY' | 'CUSTOM';

export function providersFor(type: ExternalProviderType): Provider[] {
    if (type === 'BANK') return PROVIDER_BANKS;
    if (type === 'MOBILE_MONEY') return PROVIDER_MOMO;
    return [];
}

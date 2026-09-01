import { PhasePlaceholder } from '../../src/components/PhasePlaceholder';

export default function WalletScreen() {
    return (
        <PhasePlaceholder
            title="Wallet"
            phase="P2"
            scope="CashLedger, wallets and sub-wallets, external wallets, transfers, deposit proof, the inflow inbox, statement import and the POS sale flow."
        />
    );
}

import React, { useState, useEffect } from 'react';
import { cashbookService } from '../services/cashbook.service';
import { Layout } from '../components/Layout';
import '../styles/cashbook.css';

const CashReconciliation: React.FC = () => {
    const [systemBalance, setSystemBalance] = useState<number>(0);
    const [physicalCount, setPhysicalCount] = useState<string>('');
    const [notes, setNotes] = useState<string>('');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<any>(null);

    const [denominations, setDenominations] = useState<Record<string, number>>({
        '100': 0, '50': 0, '20': 0, '10': 0, '5': 0, '2': 0, '1': 0, '0.5': 0, '0.05': 0
    });

    const denominationValues = [100, 50, 20, 10, 5, 2, 1, 0.5, 0.05];

    useEffect(() => {
        loadSystemBalance();
    }, []);

    const handleDenominationChange = (value: number, count: string) => {
        const numCount = parseInt(count) || 0;
        const newDenoms = { ...denominations, [value.toString()]: numCount };
        setDenominations(newDenoms);

        // Update total physical count based on denominations
        const newTotal = Object.entries(newDenoms).reduce((sum, [val, cnt]) => {
            return sum + (parseFloat(val) * cnt);
        }, 0);
        setPhysicalCount(newTotal.toFixed(2));
    };

    const loadSystemBalance = async () => {
        try {
            const balance = await cashbookService.getBalance();
            setSystemBalance(balance);
        } catch (error) {
            console.error('Failed to load system balance:', error);
        }
    };

    const handleReconcile = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setResult(null);

        try {
            const count = parseFloat(physicalCount);
            if (isNaN(count) || count < 0) {
                alert('Please enter a valid physical count');
                return;
            }

            const reconciliationResult = await cashbookService.reconcile(count, denominations, notes);
            setResult(reconciliationResult);

            // Reset form if balanced
            if (reconciliationResult.isBalanced) {
                setPhysicalCount('');
                setNotes('');
                setDenominations({
                    '100': 0, '50': 0, '20': 0, '10': 0, '5': 0, '2': 0, '1': 0, '0.5': 0, '0.05': 0
                });
            }
        } catch (error: any) {
            alert(error.response?.data?.error || 'Failed to reconcile cash');
        } finally {
            setLoading(false);
        }
    };

    const variance = physicalCount ? parseFloat(physicalCount) - systemBalance : 0;

    return (
        <Layout>
            <div className="reconciliation-container">
                <h1 className="text-2xl font-bold text-gray-900 mb-6">Cash Reconciliation</h1>

                <div className="reconciliation-grid">
                    <div className="reconciliation-card denominations-card">
                        <h3 className="section-title">Denomination Breakdown</h3>
                        <div className="denominations-list">
                            {denominationValues.map((val) => (
                                <div key={val} className="denomination-row">
                                    <div className="denom-label">K{val >= 1 ? val : val.toFixed(2)}</div>
                                    <div className="denom-times">×</div>
                                    <input
                                        type="number"
                                        min="0"
                                        className="denom-input"
                                        value={denominations[val.toString()] || ''}
                                        placeholder="0"
                                        onChange={(e) => handleDenominationChange(val, e.target.value)}
                                    />
                                    <div className="denom-equals">=</div>
                                    <div className="denom-total">
                                        K{(val * (denominations[val.toString()] || 0)).toFixed(2)}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="reconciliation-sidebar">
                        <div className="reconciliation-card summary-card">
                            <div className="balance-comparison-vertical">
                                <div className="balance-item">
                                    <label>System Balance</label>
                                    <div className="balance-value system">K{systemBalance.toFixed(2)}</div>
                                </div>

                                <div className="balance-item">
                                    <label>Total Physical Count</label>
                                    <div className="balance-value physical">K{parseFloat(physicalCount || '0').toFixed(2)}</div>
                                </div>

                                {physicalCount && (
                                    <div className={`balance-item variance ${variance >= 0 ? 'over' : 'short'}`}>
                                        <label>{variance >= 0 ? 'Surplus (Over)' : 'Shortage (Short)'}</label>
                                        <div className="balance-value">K{Math.abs(variance).toFixed(2)}</div>
                                    </div>
                                )}
                            </div>

                            <form onSubmit={handleReconcile} className="reconciliation-form">
                                <div className="form-group">
                                    <label>Variance Notes (optional)</label>
                                    <textarea
                                        value={notes}
                                        onChange={(e) => setNotes(e.target.value)}
                                        placeholder="Explain any variance..."
                                        rows={3}
                                    />
                                </div>

                                <button
                                    type="submit"
                                    disabled={loading || !physicalCount}
                                    className="reconcile-button"
                                >
                                    {loading ? 'Reconciling...' : 'Submit Reconciliation'}
                                </button>
                            </form>

                            {result && (
                                <div className={`result ${result.isBalanced ? 'balanced' : 'unbalanced'}`}>
                                    <h3>{result.isBalanced ? '✅ Balanced' : '⚠️ Variance Detected'}</h3>
                                    <p className="text-sm">
                                        System: K{result.systemBalance.toFixed(2)} |
                                        Physical: K{result.physicalCount.toFixed(2)} |
                                        Variance: K{Math.abs(result.variance).toFixed(2)}
                                    </p>
                                    {!result.isBalanced && (
                                        <small className="mt-2 text-xs">An adjustment entry has been created in the cashbook.</small>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </Layout>
    );
};

export default CashReconciliation;

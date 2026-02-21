import React, { useState, useEffect } from 'react';
import { aiService, AccountingRule } from '../../services/ai.service';
import { integrationService } from '../../services/integration.service';
import { Plus, Trash2, Edit2, Check, X, Zap, AlertCircle } from 'lucide-react';

export const RuleManagement: React.FC = () => {
    const [rules, setRules] = useState<AccountingRule[]>([]);
    const [accounts, setAccounts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [newRule, setNewRule] = useState<Partial<AccountingRule> | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            setLoading(true);
            const [rulesData, accountsData] = await Promise.all([
                aiService.getRules(),
                integrationService.getAccounts()
            ]);
            setRules(rulesData);
            setAccounts(accountsData);
        } catch (err: any) {
            setError('Failed to load rules or accounts');
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async (rule: Partial<AccountingRule>) => {
        try {
            if (rule.id) {
                await aiService.updateRule(rule.id, rule);
            } else {
                await aiService.createRule(rule);
                setNewRule(null);
            }
            await loadData();
            setEditingId(null);
        } catch (err: any) {
            setError('Failed to save rule');
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('Are you sure you want to delete this rule?')) return;
        try {
            await aiService.deleteRule(id);
            await loadData();
        } catch (err: any) {
            setError('Failed to delete rule');
        }
    };

    if (loading) return <div className="p-8 text-center text-gray-500">Loading Rules...</div>;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h3 className="text-lg font-bold text-brand-navy">AI Classification Rules</h3>
                    <p className="text-sm text-gray-500">Define custom logic for automatic transaction categorization.</p>
                </div>
                <button
                    onClick={() => setNewRule({ name: '', pattern: '', priority: 10, confidence_score: 0.95, is_active: true })}
                    className="inline-flex items-center px-4 py-2 bg-brand-green text-white text-sm font-bold rounded-xl hover:bg-green-600 transition-all shadow-sm"
                >
                    <Plus className="h-4 w-4 mr-2" />
                    New Rule
                </button>
            </div>

            {error && (
                <div className="bg-red-50 text-red-700 p-4 rounded-xl text-sm border border-red-100 flex items-center">
                    <AlertCircle className="h-4 w-4 mr-2" />
                    {error}
                </div>
            )}

            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-wider">Rule Details</th>
                            <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-wider">Pattern</th>
                            <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-wider">Priority</th>
                            <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-wider">Target Account</th>
                            <th className="px-6 py-3 text-right text-xs font-black text-gray-500 uppercase tracking-wider">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {newRule && (
                            <RuleRow
                                rule={newRule}
                                accounts={accounts}
                                onSave={handleSave}
                                onCancel={() => setNewRule(null)}
                            />
                        )}
                        {rules.map(rule => (
                            editingId === rule.id ? (
                                <RuleRow
                                    key={rule.id}
                                    rule={rule}
                                    accounts={accounts}
                                    onSave={handleSave}
                                    onCancel={() => setEditingId(null)}
                                />
                            ) : (
                                <tr key={rule.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center">
                                            <div className={`p-2 rounded-lg mr-3 ${rule.is_active ? 'bg-green-50 text-green-600' : 'bg-gray-50 text-gray-400'}`}>
                                                <Zap className="h-4 w-4" />
                                            </div>
                                            <div>
                                                <div className="text-sm font-bold text-gray-900">{rule.name}</div>
                                                <div className="text-[10px] text-gray-500 uppercase font-medium">Confidence: {Math.round(rule.confidence_score * 100)}%</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <code className="text-xs bg-gray-100 px-2 py-1 rounded text-purple-600 font-mono">
                                            {rule.pattern}
                                        </code>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-500">{rule.priority}</td>
                                    <td className="px-6 py-4 text-sm text-brand-navy font-medium">
                                        {accounts.find(a => a.Id === rule.target_account_id)?.Name || 'Unknown Account'}
                                    </td>
                                    <td className="px-6 py-4 text-right space-x-2">
                                        <button onClick={() => setEditingId(rule.id)} className="p-2 text-gray-400 hover:text-brand-navy"><Edit2 className="h-4 w-4" /></button>
                                        <button onClick={() => handleDelete(rule.id)} className="p-2 text-gray-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                                    </td>
                                </tr>
                            )
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const RuleRow: React.FC<{ rule: Partial<AccountingRule>, accounts: any[], onSave: (r: Partial<AccountingRule>) => void, onCancel: () => void }> = ({ rule, accounts, onSave, onCancel }) => {
    const [editRule, setEditRule] = useState(rule);

    return (
        <tr className="bg-brand-green/5 animate-in fade-in slide-in-from-left-2">
            <td className="px-6 py-4">
                <input
                    type="text"
                    value={editRule.name}
                    onChange={e => setEditRule({ ...editRule, name: e.target.value })}
                    placeholder="Rule Name"
                    className="w-full text-sm p-2 border border-brand-green/20 rounded-lg outline-none focus:ring-1 ring-brand-green"
                />
            </td>
            <td className="px-6 py-4">
                <input
                    type="text"
                    value={editRule.pattern}
                    onChange={e => setEditRule({ ...editRule, pattern: e.target.value })}
                    placeholder="regex or keywords"
                    className="w-full text-xs font-mono p-2 border border-brand-green/20 rounded-lg outline-none"
                />
            </td>
            <td className="px-6 py-4">
                <input
                    type="number"
                    value={editRule.priority}
                    onChange={e => setEditRule({ ...editRule, priority: Number(e.target.value) })}
                    className="w-16 text-sm p-2 border border-brand-green/20 rounded-lg outline-none"
                />
            </td>
            <td className="px-6 py-4">
                <select
                    value={editRule.target_account_id}
                    onChange={e => setEditRule({ ...editRule, target_account_id: e.target.value })}
                    className="w-full text-sm p-2 border border-brand-green/20 rounded-lg outline-none bg-white"
                >
                    <option value="">Select Account</option>
                    {accounts.map(a => <option key={a.Id} value={a.Id}>{a.Name}</option>)}
                </select>
            </td>
            <td className="px-6 py-4 text-right space-x-2">
                <button onClick={() => onSave(editRule)} className="p-2 text-brand-green hover:bg-white rounded-lg shadow-sm border border-brand-green/10"><Check className="h-4 w-4" /></button>
                <button onClick={onCancel} className="p-2 text-red-500 hover:bg-white rounded-lg shadow-sm border border-red-100"><X className="h-4 w-4" /></button>
            </td>
        </tr>
    );
};

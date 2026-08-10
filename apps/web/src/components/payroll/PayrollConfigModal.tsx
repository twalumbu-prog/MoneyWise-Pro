import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Plus, Trash2, CheckCircle2, Save } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { payrollService, PayrollConfig, AllowanceConfig, DeductionConfig } from '../../services/payroll.service';

interface PayrollConfigModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const generateId = () => Math.random().toString(36).substring(2, 9);

export function PayrollConfigModal({ isOpen, onClose }: PayrollConfigModalProps) {
    const { organizationId } = useAuth();
    const queryClient = useQueryClient();

    const { data: config } = useQuery({
        queryKey: ['payroll-config', organizationId],
        queryFn: () => payrollService.getPayrollConfig(),
        enabled: !!organizationId && isOpen,
    });

    const [allowances, setAllowances] = useState<AllowanceConfig[]>([]);
    const [deductions, setDeductions] = useState<DeductionConfig[]>([]);

    useEffect(() => {
        if (config) {
            setAllowances(config.allowance_types || []);
            setDeductions(config.deduction_types || []);
        }
    }, [config]);

    const saveMutation = useMutation({
        mutationFn: (data: Partial<PayrollConfig>) => payrollService.upsertPayrollConfig(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['payroll-config'] });
            onClose();
        },
    });

    if (!isOpen) return null;

    const handleSave = () => {
        saveMutation.mutate({
            basic_pay_configured: true,
            allowance_types: allowances.filter(a => a.name.trim()),
            deduction_types: deductions.filter(d => d.name.trim()),
        });
    };

    const addAllowance = () => {
        setAllowances([...allowances, { id: generateId(), name: '', separate_step: false, subject_to_statutory: true }]);
    };

    const addDeduction = () => {
        setDeductions([...deductions, { id: generateId(), name: '' }]);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
            <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl flex flex-col max-h-[90vh]">
                <div className="p-6 border-b border-gray-100 flex items-center justify-between shrink-0">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900">Payroll Configuration</h2>
                        <p className="text-sm text-gray-500 mt-1">Manage standard allowance and deduction types for the organization.</p>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-full transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-8">
                    {/* Basic Pay */}
                    <section>
                        <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4">Base Income</h3>
                        <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
                                        <CheckCircle2 className="w-4 h-4" />
                                    </div>
                                    <div>
                                        <p className="font-medium text-gray-900">Basic Pay</p>
                                        <p className="text-xs text-gray-500">Always present. Configurable per staff member.</p>
                                    </div>
                                </div>
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-200 text-gray-800">
                                    System Required
                                </span>
                            </div>
                        </div>
                    </section>

                    {/* Allowances */}
                    <section>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Allowance Types</h3>
                            <button
                                onClick={addAllowance}
                                className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors"
                            >
                                <Plus className="w-4 h-4" />
                                Add Allowance
                            </button>
                        </div>
                        
                        <div className="space-y-3">
                            {allowances.map((allowance, index) => (
                                <div key={allowance.id} className="flex items-start gap-4 p-4 bg-white border border-gray-200 rounded-xl shadow-sm">
                                    <div className="flex-1 space-y-3">
                                        <div>
                                            <label className="block text-xs font-medium text-gray-700 mb-1">Allowance Name</label>
                                            <input
                                                type="text"
                                                value={allowance.name}
                                                onChange={(e) => {
                                                    const newAllowances = [...allowances];
                                                    newAllowances[index].name = e.target.value;
                                                    setAllowances(newAllowances);
                                                }}
                                                placeholder="e.g. Housing Allowance"
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                            />
                                        </div>
                                        <div className="flex flex-col gap-2">
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={allowance.separate_step}
                                                    onChange={(e) => {
                                                        const newAllowances = [...allowances];
                                                        newAllowances[index].separate_step = e.target.checked;
                                                        setAllowances(newAllowances);
                                                    }}
                                                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                />
                                                <span className="text-sm text-gray-600">Requires separate adjustment step during payroll run</span>
                                            </label>
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={allowance.subject_to_statutory !== false} // default true for backwards compat
                                                    onChange={(e) => {
                                                        const newAllowances = [...allowances];
                                                        newAllowances[index].subject_to_statutory = e.target.checked;
                                                        setAllowances(newAllowances);
                                                    }}
                                                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                />
                                                <span className="text-sm text-gray-600">Include in Statutory Calculations (PAYE, NAPSA, NHIMA)</span>
                                            </label>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setAllowances(allowances.filter((_, i) => i !== index))}
                                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                            {allowances.length === 0 && (
                                <div className="text-center py-6 bg-gray-50 border border-gray-200 border-dashed rounded-xl">
                                    <p className="text-sm text-gray-500">No custom allowances configured.</p>
                                </div>
                            )}
                        </div>
                    </section>

                    {/* Deductions */}
                    <section>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Deduction Types</h3>
                            <button
                                onClick={addDeduction}
                                className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors"
                            >
                                <Plus className="w-4 h-4" />
                                Add Deduction
                            </button>
                        </div>

                        <div className="space-y-3">
                            {/* Built-in Deductions */}
                            <div className="bg-gray-50 rounded-xl p-4 border border-gray-200 flex items-center justify-between">
                                <div>
                                    <p className="font-medium text-gray-900">ZRA PAYE</p>
                                    <p className="text-xs text-gray-500">Standard statutory deduction.</p>
                                </div>
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-200 text-gray-800">
                                    System Calculated
                                </span>
                            </div>
                            <div className="bg-gray-50 rounded-xl p-4 border border-gray-200 flex items-center justify-between">
                                <div>
                                    <p className="font-medium text-gray-900">NAPSA</p>
                                    <p className="text-xs text-gray-500">Standard statutory deduction.</p>
                                </div>
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-200 text-gray-800">
                                    System Calculated
                                </span>
                            </div>
                            <div className="bg-gray-50 rounded-xl p-4 border border-gray-200 flex items-center justify-between">
                                <div>
                                    <p className="font-medium text-gray-900">NHIMA</p>
                                    <p className="text-xs text-gray-500">Standard statutory deduction.</p>
                                </div>
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-200 text-gray-800">
                                    System Calculated
                                </span>
                            </div>
                            <div className="bg-gray-50 rounded-xl p-4 border border-gray-200 flex items-center justify-between">
                                <div>
                                    <p className="font-medium text-gray-900">Staff Loan</p>
                                    <p className="text-xs text-gray-500">Auto-synced from approved loan requisitions.</p>
                                </div>
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                    Synced automatically
                                </span>
                            </div>
                            <div className="bg-gray-50 rounded-xl p-4 border border-gray-200 flex items-center justify-between">
                                <div>
                                    <p className="font-medium text-gray-900">Salary Advance</p>
                                    <p className="text-xs text-gray-500">Auto-synced from approved advance requisitions.</p>
                                </div>
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                    Synced automatically
                                </span>
                            </div>

                            {/* Custom Deductions */}
                            {deductions.map((deduction, index) => (
                                <div key={deduction.id} className="flex items-start gap-4 p-4 bg-white border border-gray-200 rounded-xl shadow-sm">
                                    <div className="flex-1">
                                        <label className="block text-xs font-medium text-gray-700 mb-1">Deduction Name (Fixed/Other)</label>
                                        <input
                                            type="text"
                                            value={deduction.name}
                                            onChange={(e) => {
                                                const newDeductions = [...deductions];
                                                newDeductions[index].name = e.target.value;
                                                setDeductions(newDeductions);
                                            }}
                                            placeholder="e.g. Union Dues, Health Insurance"
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                        />
                                    </div>
                                    <button
                                        onClick={() => setDeductions(deductions.filter((_, i) => i !== index))}
                                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors mt-5"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </section>
                </div>

                <div className="p-6 border-t border-gray-100 bg-gray-50 rounded-b-2xl flex justify-end gap-3 shrink-0">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saveMutation.isPending}
                        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                    >
                        <Save className="w-4 h-4" />
                        {saveMutation.isPending ? 'Saving...' : 'Save Configuration'}
                    </button>
                </div>
            </div>
        </div>
    );
}

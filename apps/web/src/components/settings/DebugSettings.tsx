import React, { useState, useEffect } from 'react';
import { Beaker, AlertTriangle, ShieldCheck, RefreshCw } from 'lucide-react';
import { organizationService, Organization } from '../../services/organization.service';

export const DebugSettings: React.FC = () => {
    const [org, setOrg] = useState<Organization | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        loadOrg();
    }, []);

    const loadOrg = async () => {
        try {
            setLoading(true);
            const data = await organizationService.getOrganization();
            setOrg(data);
        } catch (err: any) {
            setError(err.message || 'Failed to load organization');
        } finally {
            setLoading(false);
        }
    };

    const handleToggleTestMode = async () => {
        if (!org) return;
        
        try {
            setSaving(true);
            const updated = await organizationService.updateOrganization({
                payment_test_mode: !org.payment_test_mode
            });
            setOrg(updated);
        } catch (err: any) {
            alert('Failed to update: ' + err.message);
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center p-12">
                <RefreshCw className="w-8 h-8 animate-spin text-brand-green" />
            </div>
        );
    }

    return (
        <div className="space-y-8 max-w-4xl animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div>
                <h3 className="text-xl font-black text-brand-navy tracking-tight flex items-center">
                    <Beaker className="w-6 h-6 mr-2 text-brand-green" />
                    System Debug & Development
                </h3>
                <p className="text-sm text-gray-500 mt-2 font-medium"> Tools for testing and system verification. </p>
            </div>

            <div className="grid gap-6">
                {/* Error Banner */}
                {error && (
                    <div className="p-4 rounded-2xl bg-red-50 border border-red-100 flex items-start space-x-3 animate-in fade-in zoom-in-95 duration-300">
                        <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                        <div>
                            <p className="text-sm font-bold text-red-900">Connection Error</p>
                            <p className="text-xs text-red-700 mt-1 font-medium leading-relaxed"> {error} </p>
                        </div>
                    </div>
                )}

                {/* Payment Test Mode Card */}
                <div className={`p-6 rounded-3xl border-2 transition-all duration-300 ${org?.payment_test_mode ? 'border-brand-green bg-brand-green/5' : 'border-gray-100 bg-white shadow-sm'} ${!org ? 'opacity-60 cursor-not-allowed' : ''}`}>
                    <div className="flex items-start justify-between">
                        <div className="flex-1">
                            <div className="flex items-center space-x-2">
                                <h4 className="text-lg font-black text-gray-900">Payment Simulation Mode</h4>
                                {org?.payment_test_mode && (
                                    <span className="px-2 py-0.5 rounded-full bg-brand-green text-white text-[10px] font-black uppercase tracking-widest">Active</span>
                                )}
                            </div>
                            <p className="text-sm text-gray-500 mt-2 leading-relaxed">
                                {org ? (
                                    <>
                                        When enabled, all MoneyWise Wallet and Mobile Money disbursements will skip actual Lenco payouts. 
                                        Transactions will be marked as <span className="font-bold text-gray-900">SUCCESSFUL</span> instantly with a simulation reference. 
                                        <span className="block mt-2 font-bold text-red-500 italic">Warning: No real money will be transferred while this is ON.</span>
                                    </>
                                ) : (
                                    <span className="italic">No organization linked to this account. Simulation settings are unavailable.</span>
                                )}
                            </p>
                        </div>
                        <button
                            onClick={handleToggleTestMode}
                            disabled={saving || !org}
                            className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none ${org?.payment_test_mode ? 'bg-brand-green' : 'bg-gray-200'} ${!org ? 'cursor-not-allowed' : ''}`}
                        >
                            <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${org?.payment_test_mode ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                    </div>

                    {org?.payment_test_mode && (
                        <div className="mt-6 p-4 rounded-2xl bg-white/60 border border-brand-green/20 flex items-center text-brand-green text-xs font-bold leading-relaxed">
                            <ShieldCheck className="w-4 h-4 mr-2 flex-shrink-0" />
                            System is currently in Simulation Mode. All disbursement flows can be tested without fund movement.
                        </div>
                    )}
                </div>

                {/* Audit & Logs Policy Card */}
                <div className="p-6 rounded-3xl border border-gray-100 bg-white shadow-sm">
                    <div className="flex items-start">
                        <div className="h-10 w-10 rounded-2xl bg-amber-50 flex items-center justify-center mr-4">
                            <AlertTriangle className="w-5 h-5 text-amber-500" />
                        </div>
                        <div>
                            <h4 className="text-base font-black text-gray-900 italic underline decoration-amber-500 underline-offset-4 decoration-2">Debug Warning</h4>
                            <p className="text-xs text-gray-500 mt-2 font-medium"> Use these settings carefully. Debug actions are logged and associated with your admin profile for auditing purposes. </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

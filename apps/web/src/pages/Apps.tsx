import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { Users, CheckCircle2, ArrowRight } from 'lucide-react';

interface AppCard {
    id: string;
    name: string;
    description: string;
    icon: React.ComponentType<any>;
    color: string;
    route: string;
    activatedKey: string;
}

const APPS: AppCard[] = [
    {
        id: 'payroll',
        name: 'Payroll',
        description: 'Run monthly payroll, manage staff records, calculate statutory obligations (NAPSA, NHIMA, PAYE), and disburse salaries.',
        icon: Users,
        color: 'bg-blue-600',
        route: '/apps/payroll',
        activatedKey: 'mw_app_payroll_active',
    },
];

export const Apps: React.FC = () => {
    const navigate = useNavigate();
    const [activated, setActivated] = useState<Record<string, boolean>>(() => {
        const state: Record<string, boolean> = {};
        for (const app of APPS) {
            try {
                state[app.id] = localStorage.getItem(app.activatedKey) === '1';
            } catch {
                state[app.id] = false;
            }
        }
        return state;
    });

    const handleActivate = (app: AppCard) => {
        try {
            localStorage.setItem(app.activatedKey, '1');
        } catch {}
        setActivated(prev => ({ ...prev, [app.id]: true }));
    };

    const handleOpen = (app: AppCard) => {
        navigate(app.route);
    };

    return (
        <Layout noPadding={true}>
        <div className="flex flex-col h-full min-h-0 px-5 pb-5">
            <div className="flex-1 bg-white rounded-[20px] border border-gray-200 overflow-y-auto p-6">
                <div className="max-w-[1200px] mx-auto">
                    <div className="mb-6">
                        <h1 className="text-xl font-bold text-gray-900">Apps</h1>
                        <p className="text-sm text-gray-500 mt-0.5">Extend MoneyWise with powerful business tools</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {APPS.map(app => {
                            const Icon = app.icon;
                            const isActive = activated[app.id];
                            return (
                                <div
                                    key={app.id}
                                    className="bg-white rounded-2xl border border-violet-100 p-5 flex flex-col gap-4 shadow-sm hover:shadow-md transition-shadow"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex items-start gap-3 min-w-0">
                                            <div className={`w-10 h-10 rounded-xl ${app.color} flex items-center justify-center flex-shrink-0`}>
                                                <Icon size={20} className="text-white" />
                                            </div>
                                            <div className="min-w-0">
                                                <h3 className="text-sm font-bold text-gray-900">{app.name}</h3>
                                                <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{app.description}</p>
                                            </div>
                                        </div>
                                        {isActive && (
                                            <div className="flex items-center gap-1 text-[10px] font-semibold text-green-700 flex-shrink-0">
                                                <CheckCircle2 size={12} className="text-green-600" />
                                                Active
                                            </div>
                                        )}
                                    </div>

                                    {isActive ? (
                                        <button
                                            onClick={() => handleOpen(app)}
                                            className="flex items-center justify-center gap-2 h-8 px-3 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 transition-colors"
                                        >
                                            Open App
                                            <ArrowRight size={13} />
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => handleActivate(app)}
                                            className="h-8 px-3 border border-blue-600 text-blue-600 text-xs font-bold rounded-lg hover:bg-blue-50 transition-colors"
                                        >
                                            Activate
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
        </Layout>
    );
};

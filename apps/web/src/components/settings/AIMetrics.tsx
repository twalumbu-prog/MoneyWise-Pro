import React, { useState, useEffect } from 'react';
import { aiService, AIMetric } from '../../services/ai.service';
import { BarChart3, TrendingUp, Target, AlertTriangle, BrainCircuit } from 'lucide-react';

export const AIMetrics: React.FC = () => {
    const [metrics, setMetrics] = useState<AIMetric[]>([]);
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            setLoading(true);
            const [metricsData, statsData] = await Promise.all([
                aiService.getDailyMetrics(7), // Last 7 days
                aiService.getStats()
            ]);
            setMetrics(metricsData);
            setStats(statsData);
        } catch (err) {
            console.error('Failed to load metrics:', err);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div className="p-8 text-center text-gray-500">Loading Intelligence...</div>;

    const totalPredictions = stats?.total || 0;
    const accuracy = Math.round(stats?.accuracy || 0);

    return (
        <div className="space-y-6">
            {/* Top Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <MetricCard
                    title="Overall Accuracy"
                    value={`${accuracy}%`}
                    icon={<Target className="text-brand-green" />}
                    sub="Based on user verification"
                    color="bg-brand-green/10"
                />
                <MetricCard
                    title="Predictions"
                    value={totalPredictions.toLocaleString()}
                    icon={<BrainCircuit className="text-purple-600" />}
                    sub="Across all channels"
                    color="bg-purple-50"
                />
                <MetricCard
                    title="Overrides"
                    value={stats?.overridden || 0}
                    icon={<AlertTriangle className="text-amber-600" />}
                    sub="Manual account corrections"
                    color="bg-amber-50"
                />
            </div>

            {/* Daily Chart (Simplified as Bars for now) */}
            <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                <div className="flex justify-between items-center mb-6">
                    <h4 className="text-sm font-bold text-brand-navy flex items-center">
                        <BarChart3 className="h-4 w-4 mr-2 text-brand-green" />
                        Daily Efficiency (Last 7 Days)
                    </h4>
                </div>
                <div className="flex items-end justify-between h-40 gap-2">
                    {metrics.map((m, i) => {
                        const maxVal = Math.max(...metrics.map(x => x.prediction_count), 1);
                        const height = (m.prediction_count / maxVal) * 100;
                        return (
                            <div key={i} className="flex-1 flex flex-col items-center group relative">
                                <div
                                    className="w-full bg-brand-green/20 rounded-t-lg transition-all hover:bg-brand-green/40 cursor-help"
                                    style={{ height: `${height}%` }}
                                >
                                    <div className="absolute bottom-full mb-2 hidden group-hover:block bg-brand-navy text-white text-[10px] p-2 rounded shadow-lg whitespace-nowrap z-10">
                                        {m.prediction_count} Total<br />
                                        {m.rule_hits} Rules <br />
                                        {m.override_count} Overrides
                                    </div>
                                </div>
                                <span className="text-[10px] text-gray-400 mt-2 font-mono">
                                    {new Date(m.date).toLocaleDateString(undefined, { weekday: 'short' })}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Methods Table */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-50 flex items-center">
                    <TrendingUp className="h-4 w-4 mr-2 text-brand-green" />
                    <h4 className="text-sm font-bold text-brand-navy">Performance by Method</h4>
                </div>
                <table className="min-w-full divide-y divide-gray-100">
                    <thead className="bg-gray-50/50">
                        <tr>
                            <th className="px-6 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Logic Source</th>
                            <th className="px-6 py-3 text-right text-[10px] font-black text-gray-400 uppercase tracking-widest">Total Hits</th>
                            <th className="px-6 py-3 text-right text-[10px] font-black text-gray-400 uppercase tracking-widest">Accuracy</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {Object.entries(stats?.byMethod || {}).map(([method, data]: [string, any]) => (
                            <tr key={method} className="hover:bg-gray-50/50 transition-colors">
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="flex items-center">
                                        <div className="w-2 h-2 rounded-full bg-brand-green mr-3"></div>
                                        <span className="text-xs font-bold text-gray-700 capitalize">{method.toLowerCase().replace(/_/g, ' ')}</span>
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-right text-xs text-gray-500 font-mono">{data.total}</td>
                                <td className="px-6 py-4 text-right whitespace-nowrap">
                                    <div className="flex items-center justify-end">
                                        <span className="text-[10px] font-bold text-gray-900 mr-2">{Math.round(((data.total - data.overrides) / data.total) * 100)}%</span>
                                        <div className="w-16 h-1 bg-gray-100 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-brand-green"
                                                style={{ width: `${((data.total - data.overrides) / data.total) * 100}%` }}
                                            ></div>
                                        </div>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const MetricCard: React.FC<{ title: string, value: string | number, icon: React.ReactNode, sub: string, color: string }> = ({ title, value, icon, sub, color }) => (
    <div className={`p-6 rounded-2xl border border-gray-100 shadow-sm ${color}`}>
        <div className="flex justify-between items-start mb-4">
            <div className="p-2 bg-white rounded-xl shadow-sm border border-gray-50">{icon}</div>
        </div>
        <h4 className="text-2xl font-black text-brand-navy mb-1">{value}</h4>
        <p className="text-xs font-bold text-gray-600 uppercase tracking-tight">{title}</p>
        <p className="text-[10px] text-gray-400 mt-2">{sub}</p>
    </div>
);

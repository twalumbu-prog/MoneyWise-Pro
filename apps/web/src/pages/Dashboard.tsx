import React from 'react';
import { Layout } from '../components/Layout';
import { FileText, Clock, CheckCircle, AlertCircle } from 'lucide-react';

export const Dashboard: React.FC = () => {
    return (
        <Layout>
            <div className="space-y-6">
                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-gray-500">Pending Approvals</p>
                                <p className="text-3xl font-bold text-brand-navy mt-2">5</p>
                            </div>
                            <div className="bg-amber-50 rounded-xl p-3">
                                <Clock className="h-6 w-6 text-amber-500" />
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-gray-500">Active Requisitions</p>
                                <p className="text-3xl font-bold text-brand-navy mt-2">12</p>
                            </div>
                            <div className="bg-blue-50 rounded-xl p-3">
                                <FileText className="h-6 w-6 text-blue-500" />
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-gray-500">Approved This Month</p>
                                <p className="text-3xl font-bold text-brand-navy mt-2">28</p>
                            </div>
                            <div className="bg-green-50 rounded-xl p-3">
                                <CheckCircle className="h-6 w-6 text-brand-green" />
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-gray-500">Needs Attention</p>
                                <p className="text-3xl font-bold text-brand-navy mt-2">3</p>
                            </div>
                            <div className="bg-red-50 rounded-xl p-3">
                                <AlertCircle className="h-6 w-6 text-red-500" />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Recent Activity */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-50 bg-gray-50/30">
                        <h3 className="text-lg font-bold text-brand-navy">Recent Activity</h3>
                    </div>
                    <div className="divide-y divide-gray-50">
                        {[1, 2, 3, 4, 5].map((item) => (
                            <div key={item} className="px-6 py-4 hover:bg-gray-50/50 transition-colors cursor-pointer group">
                                <div className="flex items-center justify-between">
                                    <div className="flex-1">
                                        <p className="text-sm font-bold text-gray-900 group-hover:text-brand-green transition-colors">
                                            Requisition #{item.toString().padStart(4, '0')}
                                        </p>
                                        <p className="text-xs text-gray-400 mt-1 font-medium">
                                            Submitted by <span className="text-gray-600">John Doe</span> • 2 hours ago
                                        </p>
                                    </div>
                                    <div className="ml-4">
                                        <span className="px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide rounded-full bg-amber-50 text-amber-600 border border-amber-100">
                                            Pending
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Quick Actions */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                    <h3 className="text-lg font-bold text-brand-navy mb-4">Quick Actions</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <button className="flex items-center justify-center px-4 py-3 border border-transparent text-sm font-bold rounded-xl text-white bg-brand-navy hover:bg-brand-green transition-all shadow-lg shadow-brand-navy/10 transform hover:-translate-y-0.5">
                            New Requisition
                        </button>
                        <button className="flex items-center justify-center px-4 py-3 border border-gray-200 text-sm font-bold rounded-xl text-gray-600 bg-white hover:bg-gray-50 hover:border-gray-300 transition-all">
                            View All Approvals
                        </button>
                        <button className="flex items-center justify-center px-4 py-3 border border-gray-200 text-sm font-bold rounded-xl text-gray-600 bg-white hover:bg-gray-50 hover:border-gray-300 transition-all">
                            Generate Report
                        </button>
                    </div>
                </div>
            </div>
        </Layout>
    );
};

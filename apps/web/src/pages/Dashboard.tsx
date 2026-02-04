import React from 'react';
import { Layout } from '../components/Layout';
import { FileText, Clock, CheckCircle, AlertCircle } from 'lucide-react';

export const Dashboard: React.FC = () => {
    return (
        <Layout>
            <div className="space-y-6">
                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <div className="bg-white rounded-lg shadow p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-gray-600">Pending Approvals</p>
                                <p className="text-3xl font-bold text-gray-900 mt-2">5</p>
                            </div>
                            <div className="bg-yellow-100 rounded-full p-3">
                                <Clock className="h-6 w-6 text-yellow-600" />
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-lg shadow p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-gray-600">Active Requisitions</p>
                                <p className="text-3xl font-bold text-gray-900 mt-2">12</p>
                            </div>
                            <div className="bg-blue-100 rounded-full p-3">
                                <FileText className="h-6 w-6 text-blue-600" />
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-lg shadow p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-gray-600">Approved This Month</p>
                                <p className="text-3xl font-bold text-gray-900 mt-2">28</p>
                            </div>
                            <div className="bg-green-100 rounded-full p-3">
                                <CheckCircle className="h-6 w-6 text-green-600" />
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-lg shadow p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-gray-600">Needs Attention</p>
                                <p className="text-3xl font-bold text-gray-900 mt-2">3</p>
                            </div>
                            <div className="bg-red-100 rounded-full p-3">
                                <AlertCircle className="h-6 w-6 text-red-600" />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Recent Activity */}
                <div className="bg-white rounded-lg shadow">
                    <div className="px-6 py-4 border-b border-gray-200">
                        <h3 className="text-lg font-semibold text-gray-900">Recent Activity</h3>
                    </div>
                    <div className="divide-y divide-gray-200">
                        {[1, 2, 3, 4, 5].map((item) => (
                            <div key={item} className="px-6 py-4 hover:bg-gray-50">
                                <div className="flex items-center justify-between">
                                    <div className="flex-1">
                                        <p className="text-sm font-medium text-gray-900">
                                            Requisition #{item.toString().padStart(4, '0')}
                                        </p>
                                        <p className="text-sm text-gray-500 mt-1">
                                            Submitted by John Doe • 2 hours ago
                                        </p>
                                    </div>
                                    <div className="ml-4">
                                        <span className="px-3 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800">
                                            Pending
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Quick Actions */}
                <div className="bg-white rounded-lg shadow p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <button className="flex items-center justify-center px-4 py-3 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700">
                            New Requisition
                        </button>
                        <button className="flex items-center justify-center px-4 py-3 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50">
                            View All Approvals
                        </button>
                        <button className="flex items-center justify-center px-4 py-3 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50">
                            Generate Report
                        </button>
                    </div>
                </div>
            </div>
        </Layout>
    );
};

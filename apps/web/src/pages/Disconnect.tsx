
import { Link } from 'react-router-dom';
import { CheckCircle } from 'lucide-react';

export const Disconnect = () => {
    return (
        <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
            <div className="sm:mx-auto sm:w-full sm:max-w-md">
                <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10 text-center">
                    <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mb-4">
                        <CheckCircle className="h-6 w-6 text-green-600" aria-hidden="true" />
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">QuickBooks Disconnected</h2>
                    <p className="text-sm text-gray-500 mb-6">
                        Your QuickBooks account has been successfully disconnected from Money Wise Pro.
                        All stored authentication tokens have been permanently deleted from our system.
                    </p>

                    <div className="mt-6">
                        <Link
                            to="/"
                            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                        >
                            Return to Homepage
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
};

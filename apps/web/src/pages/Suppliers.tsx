import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Layout } from '../components/Layout';
import { SuppliersPanel } from '../components/purchasing/SuppliersPanel';

/** Suppliers, purchase bills and what is owed. An app of its own, opened from Apps. */
export const Suppliers: React.FC = () => {
    const navigate = useNavigate();
    return (
        <Layout noPadding={true}>
            <div className="flex h-full min-h-0 flex-col">
                <div className="flex flex-1 flex-col gap-2.5 overflow-hidden px-5 pb-5 pt-0">
                    <div className="flex flex-1 flex-col gap-3 overflow-hidden rounded-[20px] bg-white p-3.5 md:border md:border-gray-200">
                        <div className="flex items-center gap-3">
                            <button onClick={() => navigate('/apps')} aria-label="Back to apps" className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-700 transition-colors hover:bg-gray-100"><ArrowLeft size={18} /></button>
                            <div>
                                <h1 className="font-['DM_Sans'] text-base font-bold text-gray-900">Suppliers</h1>
                                <p className="text-[11px] text-gray-500">Who you buy from, what you owe them, and what has arrived</p>
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto"><SuppliersPanel /></div>
                    </div>
                </div>
            </div>
        </Layout>
    );
};

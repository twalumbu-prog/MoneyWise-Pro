import React, { useRef } from 'react';
import { Layout } from '../components/Layout';
import { ProductSettings } from '../components/settings/ProductSettings';
import { useAuth } from '../context/AuthContext';
import { Plus } from 'lucide-react';

export const ProductsServices: React.FC = () => {
    const { userRole } = useAuth();
    const isAdmin = userRole === 'ADMIN';
    const openAddRef = useRef<(() => void) | null>(null);

    const mobileHeaderAction = isAdmin ? (
        <button
            onClick={() => openAddRef.current?.()}
            className="h-8 pl-3 pr-3 bg-[#0058DB] rounded-xl flex items-center gap-1.5 active:opacity-80 transition-opacity"
        >
            <Plus size={14} className="text-white" />
            <span className="text-white text-xs font-bold">Add</span>
        </button>
    ) : undefined;

    return (
        <Layout noPadding backgroundColor="bg-gray-50" mobileHeaderAction={mobileHeaderAction}>
            <ProductSettings onRequestAdd={(fn) => { openAddRef.current = fn; }} />
        </Layout>
    );
};

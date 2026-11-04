import React, { useRef, useState } from 'react';
import { Layout } from '../components/Layout';
import { ProductSettings } from '../components/settings/ProductSettings';
import { useAuth } from '../context/AuthContext';
import { Plus } from 'lucide-react';
import { InventoryPanel } from '../components/purchasing/InventoryPanel';

export const ProductsServices: React.FC = () => {
    const { userRole } = useAuth();
    const isAdmin = userRole === 'ADMIN';
    const openAddRef = useRef<(() => void) | null>(null);
    const [view, setView] = useState<'products' | 'stock'>('products');

    const mobileHeaderAction = isAdmin ? (
        <button
            onClick={() => openAddRef.current?.()}
            className="h-8 pl-3 pr-3 bg-[#0B57D0] rounded-xl flex items-center gap-1.5 active:opacity-80 transition-opacity"
        >
            <Plus size={14} className="text-white" />
            <span className="text-white text-xs font-bold">Add</span>
        </button>
    ) : undefined;

    return (
        <Layout noPadding backgroundColor="bg-gray-50" mobileHeaderAction={mobileHeaderAction}>
            <div className="mx-5 mb-2 flex h-8 w-fit items-center gap-1 rounded-[10px] bg-slate-100 p-1 md:bg-[#F8FAFD]">
                {([['products', 'Products'], ['stock', 'Stock & value']] as const).map(([id, label]) => (
                    <button key={id} onClick={() => setView(id)} className={`h-full rounded-lg px-4 text-[11px] font-['DM_Sans'] ${view === id ? 'bg-white font-bold text-gray-900 shadow-[0px_2px_4px_0px_rgba(0,0,0,0.10)]' : 'text-gray-900 hover:bg-white/50'}`}>{label}</button>
                ))}
            </div>
            {view === 'products' ? <ProductSettings onRequestAdd={(fn) => { openAddRef.current = fn; }} /> : <InventoryPanel />}
        </Layout>
    );
};

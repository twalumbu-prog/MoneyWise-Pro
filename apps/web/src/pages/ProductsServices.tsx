import React from 'react';
import { Layout } from '../components/Layout';
import { ProductSettings } from '../components/settings/ProductSettings';

/**
 * Products & Services now lives as its own top-level page (Sidebar entry)
 * instead of a tab buried inside Settings — same underlying component, new home.
 */
export const ProductsServices: React.FC = () => {
    return (
        <Layout noPadding>
            <ProductSettings />
        </Layout>
    );
};

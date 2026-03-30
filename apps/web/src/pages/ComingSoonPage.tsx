import React from 'react';
import { Layout } from '../components/Layout';
import { ComingSoon } from '../components/ComingSoon';

interface ComingSoonPageProps {
    featureName: string;
}

export const ComingSoonPage: React.FC<ComingSoonPageProps> = ({ featureName }) => {
    return (
        <Layout>
            <div className="max-w-4xl mx-auto py-12">
                <ComingSoon featureName={featureName} />
            </div>
        </Layout>
    );
};

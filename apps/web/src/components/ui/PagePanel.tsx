import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Layout } from '../Layout';

/**
 * The page frame the newer screens share: the app shell, then a white rounded panel (like Reports and Intelligence) holding a page
 * title row (optional back arrow, title, actions on the right) and the content.
 */
export const PagePanel: React.FC<{
    title: string;
    subtitle?: string;
    back?: string | boolean;
    actions?: React.ReactNode;
    maxWidth?: string;
    /** A tab bar shown between the title row and the content (the Plan area's Savings / Budgets / Rewards). */
    tabs?: React.ReactNode;
    children: React.ReactNode;
}> = ({ title, subtitle, back, actions, maxWidth = 'max-w-[1800px]', tabs, children }) => {
    const navigate = useNavigate();
    // In the Marketplace on a phone the top bar already names the page, so the big title under it is left out.
    const inMarketplace = useLocation().pathname.startsWith('/marketplace');
    return (
        <Layout noPadding={true} backgroundColor="bg-white" title={title}>
            <div className="flex-1 overflow-y-auto bg-white md:mx-4 md:mb-4 md:h-[calc(100%-1rem)] md:flex-none md:rounded-[20px] md:border md:border-[rgba(116,119,117,0.22)] overflow-x-hidden">
                <div className={`mx-auto w-full ${maxWidth} px-5 py-6 md:px-8 md:py-8`}>
                    <div className={`mb-6 flex items-start justify-between gap-4 ${inMarketplace ? (actions ? 'max-md:mb-4 max-md:justify-end' : 'max-md:hidden') : ''}`}>
                        <div className={`flex min-w-0 items-center gap-3 ${inMarketplace ? 'max-md:hidden' : ''}`}>
                            {back && (
                                <button
                                    type="button"
                                    onClick={() => (typeof back === 'string' ? navigate(back) : navigate(-1))}
                                    aria-label="Go back"
                                    className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-[#1F1F1F] hover:bg-[#E9EEF6]"
                                >
                                    <ArrowLeft size={20} />
                                </button>
                            )}
                            <div className="min-w-0">
                                <h1 className="truncate font-advercase text-3xl font-bold text-[#1F1F1F]">{title}</h1>
                                {subtitle && <p className="mt-0.5 truncate text-sm text-[#5F6368]">{subtitle}</p>}
                            </div>
                        </div>
                        {actions && <div className="flex flex-shrink-0 items-center gap-2">{actions}</div>}
                    </div>
                    {tabs}
                    {children}
                </div>
            </div>
        </Layout>
    );
};

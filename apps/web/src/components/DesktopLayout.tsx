import React from 'react';
import { TopNavbar } from './TopNavbar';
import { SubNavbar } from './SubNavbar';

interface DesktopLayoutProps {
    children: React.ReactNode;
}

export const DesktopLayout: React.FC<DesktopLayoutProps> = ({ children }) => {
    return (
        <div className="min-h-screen bg-[#F8F9FA] flex flex-col font-sans">
            <TopNavbar />
            <SubNavbar />
            <main className="flex-1 overflow-x-hidden overflow-y-auto p-8">
                <div className="max-w-[1400px] mx-auto">
                    {children}
                </div>
            </main>
        </div>
    );
};

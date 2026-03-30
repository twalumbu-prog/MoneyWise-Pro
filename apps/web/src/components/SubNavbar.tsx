import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';

export const SubNavbar: React.FC = () => {
    const location = useLocation();

    const menuItems = [
        { label: 'Inbox', path: '/requisitions' },
        { label: 'Cash Ledger', path: '/cashbook' },
        { label: 'Budgets & Reporting', path: '/reporting' },
        { label: 'Business Intelligence', path: '/intelligence', hasDot: true },
        { label: 'Audit', path: '/audit' },
        { label: 'Settings', path: '/settings' },
    ];

    return (
        <nav className="bg-white border-b border-gray-100 hidden md:block w-full">
            <div className="max-w-[1440px] mx-auto px-12 flex items-center space-x-2 overflow-x-auto no-scrollbar py-4">
                {menuItems.map((item) => {
                    const isActive = location.pathname === item.path || (item.path === '/requisitions' && location.pathname === '/');
                    
                    return (
                        <NavLink
                            key={item.path}
                            to={item.path}
                            className={`flex items-center space-x-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap
                                ${isActive 
                                    ? 'bg-[#F0F7FF] text-[#006AFF] shadow-sm shadow-blue-50' 
                                    : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'}`}
                        >
                            {item.path === '/intelligence' && ( // Changed from '/business-intelligence' to '/intelligence' based on menuItems path
                                <div className="h-1.5 w-1.5 rounded-full bg-gray-300 mr-1" />
                            )}
                            <span>{item.label}</span>
                        </NavLink>
                    );
                })}
            </div>
        </nav>
    );
};

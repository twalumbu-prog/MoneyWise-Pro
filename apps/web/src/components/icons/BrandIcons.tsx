import React from 'react';

/**
 * Custom outline icons for nav items that don't have a natural lucide-react
 * equivalent (Wallets, Business Intelligence). Shared between the mobile
 * bottom nav (Layout.tsx) and the desktop Sidebar so both pick the same mark.
 */

export const WalletCardsIcon: React.FC<{ size?: number; className?: string }> = ({ size = 22, className }) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
    >
        <rect width="18" height="18" x="3" y="3" rx="2"/>
        <path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2"/>
        <path d="M3 11h3c.8 0 1.6.3 2.1.9l1.1.9c1.6 1.6 4.1 1.6 5.7 0l1.1-.9c.5-.5 1.3-.9 2.1-.9H21"/>
    </svg>
);

export const AstroidIcon: React.FC<{ size?: number; className?: string }> = ({ size = 22, className }) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
    >
        <path d="M12.983 21.186a1 1 0 0 1-1.966 0 10 10 0 0 0-8.203-8.203 1 1 0 0 1 0-1.966 10 10 0 0 0 8.203-8.203 1 1 0 0 1 1.966 0 10 10 0 0 0 8.203 8.203 1 1 0 0 1 0 1.966 10 10 0 0 0-8.203 8.203"/>
    </svg>
);

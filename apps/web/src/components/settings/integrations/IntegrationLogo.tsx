import React from 'react';

export type IntegrationLogoKey = 'quickbooks' | 'sage' | 'lenco' | 'masterfees' | 'whatsapp' | 'facebook' | 'instagram';

const SRC: Record<IntegrationLogoKey, string> = {
    quickbooks: '/integration-logos/quickbooks.svg',
    sage: '/integration-logos/sage.svg',
    lenco: '/integration-logos/lenco.png',
    masterfees: '/integration-logos/masterfees.png',
    whatsapp: '/integration-logos/whatsapp.svg',
    facebook: '/integration-logos/facebook.svg',
    instagram: '/integration-logos/instagram.svg',
};

const ALT: Record<IntegrationLogoKey, string> = {
    quickbooks: 'QuickBooks', sage: 'Sage', lenco: 'Lenco', masterfees: 'Master Fees',
    whatsapp: 'WhatsApp', facebook: 'Facebook', instagram: 'Instagram',
};

/** Brand mark on a white tile. `wide` is for wordmarks (Lenco), which would be unreadable squeezed into a square. */
export const IntegrationLogo: React.FC<{ name: IntegrationLogoKey; size?: number; wide?: boolean; className?: string }> = ({ name, size = 48, wide, className = '' }) => (
    <div
        className={`rounded-xl bg-white border border-gray-100 flex items-center justify-center shrink-0 shadow-sm ${className}`}
        style={{ height: size, width: wide ? size * 2 : size }}
    >
        <img
            src={SRC[name]}
            alt={ALT[name]}
            draggable={false}
            style={wide ? { width: '75%' } : { width: size * 0.58, height: size * 0.58 }}
            className="object-contain"
        />
    </div>
);

import React, { useState, useEffect } from 'react';
import { X, Download } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
    readonly platforms: Array<string>;
    readonly userChoice: Promise<{
        outcome: 'accepted' | 'dismissed',
        platform: string
    }>;
    prompt(): Promise<void>;
}

const PWAInstallPrompt: React.FC = () => {
    const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
    const [isDismissed, setIsDismissed] = useState(false);

    useEffect(() => {
        const handler = (e: Event) => {
            // Prevent the mini-infobar from appearing on mobile
            e.preventDefault();
            // Stash the event so it can be triggered later.
            setDeferredPrompt(e as BeforeInstallPromptEvent);
        };

        window.addEventListener('beforeinstallprompt', handler);

        // Check if already installed
        window.addEventListener('appinstalled', () => {
            setDeferredPrompt(null);
            console.log('PWA was installed');
        });

        return () => {
            window.removeEventListener('beforeinstallprompt', handler);
        };
    }, []);

    if (!deferredPrompt || isDismissed) {
        return null;
    }

    const handleInstallClick = async () => {
        if (!deferredPrompt) return;
        
        // Show the install prompt
        deferredPrompt.prompt();
        
        // Wait for the user to respond to the prompt
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`User response to the install prompt: ${outcome}`);
        
        // We've used the prompt, and can't use it again, throw it away
        setDeferredPrompt(null);
    };

    return (
        <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-gray-100 p-4 z-50 animate-in slide-in-from-bottom-4 fade-in duration-500">
            <div className="flex items-start justify-between">
                <div className="flex items-center space-x-4">
                    <img src="/icons/icon-192.png" alt="MoneyWise App Icon" className="w-12 h-12 rounded-xl object-cover shadow-sm border border-gray-50" />
                    <div className="flex flex-col">
                        <span className="text-sm font-bold text-gray-900">Install MoneyWise Pro</span>
                        <span className="text-xs font-medium text-gray-500 mt-0.5">Add to Home Screen for a faster, full-screen experience.</span>
                    </div>
                </div>
                <button 
                    onClick={() => setIsDismissed(true)}
                    className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors shrink-0 -mt-1 -mr-1"
                >
                    <X size={16} />
                </button>
            </div>
            <button 
                onClick={handleInstallClick}
                className="w-full mt-4 bg-[#006AFF] hover:bg-blue-600 text-white font-bold py-2.5 rounded-xl shadow-sm transition-colors text-sm flex items-center justify-center space-x-2"
            >
                <Download size={16} />
                <span>Install App</span>
            </button>
        </div>
    );
};

export default PWAInstallPrompt;

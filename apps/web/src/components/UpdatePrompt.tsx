// @ts-ignore - virtual module provided by vite-plugin-pwa
import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw, X } from 'lucide-react';

export function UpdatePrompt() {
    const {
        needRefresh: [needRefresh, setNeedRefresh],
        updateServiceWorker,
    } = useRegisterSW({
        onRegistered(r: any) {
            console.log('SW Registered:', r);
        },
        onRegisterError(error: any) {
            console.log('SW registration error', error);
        },
    });

    if (!needRefresh) return null;

    return (
        <div className="fixed bottom-4 right-4 left-4 md:left-auto md:w-96 z-50 bg-slate-900 text-white p-4 rounded-2xl shadow-2xl flex flex-col gap-3">
            <div className="flex items-start justify-between">
                <div>
                    <h3 className="font-bold text-sm">Update Available</h3>
                    <p className="text-xs text-slate-300 mt-0.5">A new version of MoneyWise Pro has been deployed. Refresh to apply changes.</p>
                </div>
                <button onClick={() => setNeedRefresh(false)} className="text-slate-400 hover:text-white transition-colors">
                    <X size={18} />
                </button>
            </div>
            <button
                onClick={() => updateServiceWorker(true)}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2.5 rounded-xl text-sm flex items-center justify-center gap-2 transition-colors"
            >
                <RefreshCw size={16} />
                Refresh Now
            </button>
        </div>
    );
}

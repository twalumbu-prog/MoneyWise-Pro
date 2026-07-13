// @ts-ignore - virtual module provided by vite-plugin-pwa
import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw, X } from 'lucide-react';

export function UpdatePrompt() {
    const [isRefreshing, setIsRefreshing] = React.useState(false);
    
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

    const handleRefresh = async () => {
        setIsRefreshing(true);
        // The service worker will activate and automatically reload the page.
        // We set the state to true so the button spins while we wait for the page reload.
        await updateServiceWorker(true);
    };

    return (
        <div className="fixed bottom-4 right-4 left-4 md:left-auto md:w-96 z-50 bg-slate-900 text-white p-4 rounded-2xl shadow-2xl flex flex-col gap-3">
            <div className="flex items-start justify-between">
                <div>
                    <h3 className="font-bold text-sm">Update Available</h3>
                    <p className="text-xs text-slate-300 mt-0.5">A new version of MoneyWise Pro has been deployed. Refresh to apply changes.</p>
                </div>
                <button onClick={() => setNeedRefresh(false)} className="text-slate-400 hover:text-white transition-colors" disabled={isRefreshing}>
                    <X size={18} />
                </button>
            </div>
            <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 disabled:text-blue-200 text-white font-semibold py-2.5 rounded-xl text-sm flex items-center justify-center gap-2 transition-colors"
            >
                <RefreshCw size={16} className={isRefreshing ? "animate-spin" : ""} />
                {isRefreshing ? "Refreshing..." : "Refresh Now"}
            </button>
        </div>
    );
}

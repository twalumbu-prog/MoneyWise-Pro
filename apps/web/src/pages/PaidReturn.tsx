import { CheckCircle } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';

/**
 * Where the MoneyWise app sends someone back to in Safari after they paid a link from their wallet: a plain "payment sent" page.
 * (It is excluded from the app's universal links, so it opens here and not back in the app.) Nothing sensitive is on it: only the
 * name of who was paid and the amount, which the payer just saw in the app.
 */
export const PaidReturn = () => {
    const [params] = useSearchParams();
    const to = (params.get('to') || '').slice(0, 80);
    const amount = Number(params.get('amount'));
    return (
        <div className="min-h-screen bg-gray-50 flex flex-col justify-center px-4 py-12">
            <div className="mx-auto w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-sm">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                    <CheckCircle className="h-8 w-8 text-green-600" aria-hidden="true" />
                </div>
                <h1 className="mb-2 text-2xl font-bold text-gray-900">Payment sent</h1>
                <p className="text-sm text-gray-500">
                    {Number.isFinite(amount) && amount > 0 ? <>K{amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} </> : null}
                    {to ? <>was paid to <span className="font-semibold text-gray-800">{to}</span> from your MoneyWise wallet.</> : 'was paid from your MoneyWise wallet.'}
                </p>
                <p className="mt-4 text-xs text-gray-400">You can close this page.</p>
            </div>
        </div>
    );
};

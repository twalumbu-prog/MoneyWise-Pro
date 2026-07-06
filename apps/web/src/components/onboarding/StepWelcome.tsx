import React, { useState } from 'react';
import { Pencil, Check, X } from 'lucide-react';
import { onboardingService } from '../../services/onboarding.service';
import { StepFooter, ErrorBanner } from './ui';

interface Props {
    organizationName: string;
    onNameSaved: (name: string) => void;
    onContinue: () => void;
    saving: boolean;
}

/** Step 1 — Welcome. Greets the business and lets the name be corrected inline. */
export const StepWelcome: React.FC<Props> = ({ organizationName, onNameSaved, onContinue, saving }) => {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(organizationName);
    const [savingName, setSavingName] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const saveName = async () => {
        const name = draft.trim();
        if (name.length < 2) {
            setError('Please enter a name with at least 2 characters.');
            return;
        }
        if (name === organizationName) {
            setEditing(false);
            return;
        }
        try {
            setSavingName(true);
            setError(null);
            await onboardingService.updateOrganizationName(name);
            onNameSaved(name);
            setEditing(false);
        } catch (err: any) {
            setError(err.message || 'Failed to update the organization name.');
        } finally {
            setSavingName(false);
        }
    };

    return (
        <div className="text-center">
            <div className="mx-auto mb-8 w-20 h-20 rounded-3xl bg-blue-50 flex items-center justify-center mw-anim" style={{ animation: 'mw-scale-in 0.5s cubic-bezier(0.34,1.56,0.64,1) both' }}>
                <span className="text-3xl font-bold text-blue-600">
                    {organizationName.charAt(0).toUpperCase()}
                </span>
            </div>

            <ErrorBanner message={error} />

            {editing ? (
                <div className="flex items-center justify-center gap-2 mb-3">
                    <input
                        autoFocus
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') { e.preventDefault(); saveName(); }
                            if (e.key === 'Escape') { setDraft(organizationName); setEditing(false); }
                        }}
                        aria-label="Organization name"
                        className="text-2xl sm:text-3xl font-bold text-gray-800 text-center border-b-2 border-blue-600 bg-transparent outline-none max-w-xs sm:max-w-md"
                    />
                    <button
                        onClick={saveName}
                        disabled={savingName}
                        aria-label="Save organization name"
                        className="p-2 rounded-full bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
                    >
                        <Check className="h-4 w-4" />
                    </button>
                    <button
                        onClick={() => { setDraft(organizationName); setEditing(false); setError(null); }}
                        aria-label="Cancel editing"
                        className="p-2 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>
            ) : (
                <h1 tabIndex={-1} className="text-3xl font-bold text-gray-800 leading-9 mb-3 outline-none">
                    Welcome, {organizationName}
                    <button
                        onClick={() => { setDraft(organizationName); setEditing(true); }}
                        aria-label="Edit organization name"
                        title="Edit organization name"
                        className="ml-3 inline-flex p-2 rounded-full text-gray-400 hover:text-blue-700 hover:bg-blue-50 transition-colors align-middle"
                    >
                        <Pencil className="h-4 w-4" />
                    </button>
                </h1>
            )}

            <p className="mw-font-dmsans text-gray-600 text-base leading-6 max-w-md mx-auto">
                We'll take just a few minutes to set up your business — your brand, your store,
                your books, and a wallet to get paid into.
            </p>

            <div className="max-w-md mx-auto">
                <StepFooter continueLabel="Let's get started" loading={saving} onContinue={onContinue} />
            </div>
        </div>
    );
};

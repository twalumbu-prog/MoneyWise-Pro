import React from 'react';
import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';

/**
 * Shared UI primitives for the onboarding wizard. Every step composes these so
 * spacing, typography and interactions stay consistent (and there's exactly one
 * implementation of each control).
 *
 * Design language (from the Figma onboarding redesign):
 *  - Figtree for headings/labels/buttons, DM Sans for the step subtitle line
 *  - black pill (rounded-full) primary buttons with an arrow
 *  - content sits directly on the slate-50 page background, no card chrome
 */

// Inject the wizard's animation keyframes + font scoping once (same pattern as
// PublicPay). The app globally forces DM Sans via `* { … !important }` in
// index.html, so the Figtree scoping here must also be !important — and the
// DM Sans override must come AFTER the Figtree universal rule to win ties.
const STYLE_ID = 'mw-onboarding-keyframes';
if (typeof document !== 'undefined' && !document.getElementById(STYLE_ID)) {
    const el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = `
.mw-font-figtree, .mw-font-figtree * {
  font-family: 'Figtree', 'DM Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
}
.mw-font-figtree .mw-font-dmsans {
  font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
}
/* These animate the positioned-offset "left" property rather than
   "transform: translateX(...)". A transform (even one left behind by
   animation-fill-mode: both once the animation ends) makes its element a
   containing block for any position:fixed descendant — which would pull the
   sticky step footer out of the viewport and pin it to this wrapper instead.
   "left" has no such effect, so the same slide-in visual is safe to use
   around the fixed footer. */
@keyframes mw-step-in-right {
  from { opacity: 0; left: 28px; }
  to   { opacity: 1; left: 0; }
}
@keyframes mw-step-in-left {
  from { opacity: 0; left: -28px; }
  to   { opacity: 1; left: 0; }
}
@keyframes mw-fade-up {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes mw-scale-in {
  0%   { opacity: 0; transform: scale(0.6); }
  70%  { transform: scale(1.08); }
  100% { opacity: 1; transform: scale(1); }
}
@keyframes mw-check-draw {
  from { stroke-dashoffset: 48; }
  to   { stroke-dashoffset: 0; }
}
@keyframes mw-shimmer {
  0%   { background-position: -400px 0; }
  100% { background-position: 400px 0; }
}
.mw-skeleton {
  background: linear-gradient(90deg, #f1f5f9 0%, #e2e8f0 40px, #f1f5f9 80px);
  background-size: 400px 100%;
  animation: mw-shimmer 1.2s infinite linear;
}
@media (prefers-reduced-motion: reduce) {
  .mw-anim { animation: none !important; }
}`;
    document.head.appendChild(el);
}

interface TextFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label: string;
    error?: string | null;
    hint?: string;
    optional?: boolean;
}

/** Labelled input with inline validation message. */
export const TextField: React.FC<TextFieldProps> = ({ label, error, hint, optional, id, className, ...rest }) => {
    const inputId = id || `f-${label.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
    return (
        <div>
            <label htmlFor={inputId} className="block text-sm font-bold text-gray-800 mb-1">
                {label}
                {optional && <span className="ml-1.5 text-xs font-medium text-gray-400">Optional</span>}
            </label>
            <input
                id={inputId}
                aria-invalid={!!error}
                aria-describedby={error ? `${inputId}-error` : undefined}
                className={`appearance-none block w-full px-4 py-3 border rounded-2xl bg-white placeholder-gray-400 focus:outline-none focus:ring-2 sm:text-sm transition-all ${
                    error
                        ? 'border-red-300 focus:ring-red-100 focus:border-red-400'
                        : 'border-gray-200 focus:ring-blue-600/20 focus:border-blue-600'
                } ${className || ''}`}
                {...rest}
            />
            {error ? (
                <p id={`${inputId}-error`} className="mt-1.5 text-xs font-bold text-red-600">{error}</p>
            ) : hint ? (
                <p className="mt-1.5 text-xs text-gray-400">{hint}</p>
            ) : null}
        </div>
    );
};

/** Black pill primary button (Figma: bg-black rounded-full, semibold Figtree). */
export const PrimaryButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }> = ({
    loading, children, disabled, className, ...rest
}) => (
    <button
        disabled={disabled || loading}
        className={`inline-flex items-center justify-center gap-2.5 min-h-12 px-6 py-3 rounded-full text-base font-semibold text-white bg-black hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98] ${className || ''}`}
        {...rest}
    >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {children}
    </button>
);

export const GhostButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ children, className, ...rest }) => (
    <button
        type="button"
        className={`inline-flex items-center justify-center gap-2 min-h-12 px-5 py-3 rounded-full text-base font-semibold text-gray-500 hover:text-gray-800 hover:bg-gray-200/60 focus:outline-none focus:ring-2 focus:ring-gray-200 transition-all ${className || ''}`}
        {...rest}
    >
        {children}
    </button>
);

/**
 * Consistent Back / Continue footer for every step — pinned to the bottom of
 * the viewport (not the step card) so it's always reachable regardless of
 * scroll position or content length. Still renders wherever each step places
 * it in the JSX (usually inside that step's own <form>), since `position:
 * fixed` doesn't change the DOM tree — a submit button in here still submits
 * its ancestor form correctly.
 */
export const StepFooter: React.FC<{
    onBack?: () => void;
    continueLabel?: string;
    loading?: boolean;
    disabled?: boolean;
    /** Renders Continue as type=submit so forms submit on Enter. */
    submit?: boolean;
    /** Hide the Continue button entirely (e.g. when the step's CTA lives elsewhere). */
    hideContinue?: boolean;
    onContinue?: () => void;
}> = ({ onBack, continueLabel = 'Continue', loading, disabled, submit, hideContinue, onContinue }) => (
    <div className="fixed bottom-0 inset-x-0 z-30 bg-slate-50/95 backdrop-blur-sm border-t border-gray-100">
        <div className="max-w-3xl mx-auto px-4 sm:px-8 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] flex items-center justify-between">
            {onBack ? (
                <GhostButton onClick={onBack} aria-label="Go to previous step">
                    <ArrowLeft className="h-4 w-4" />
                    Back
                </GhostButton>
            ) : <span />}
            {hideContinue ? <span /> : (
                <PrimaryButton
                    type={submit ? 'submit' : 'button'}
                    onClick={submit ? undefined : onContinue}
                    loading={loading}
                    disabled={disabled}
                >
                    {continueLabel}
                    <ArrowRight className="h-5 w-5" strokeWidth={2.5} />
                </PrimaryButton>
            )}
        </div>
    </div>
);

/** iOS-style toggle used by the product modal and COA rows. */
export const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }> = ({
    checked, onChange, label, description,
}) => (
    <label className="flex items-center justify-between gap-4 cursor-pointer py-1 select-none">
        <span>
            <span className="block text-sm font-bold text-gray-800">{label}</span>
            {description && <span className="block text-xs text-gray-400">{description}</span>}
        </span>
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={label}
            onClick={() => onChange(!checked)}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-600/40 ${
                checked ? 'bg-blue-600' : 'bg-gray-200'
            }`}
        >
            <span
                className={`inline-block h-5 w-5 mt-0.5 rounded-full bg-white shadow transform transition-transform ${
                    checked ? 'translate-x-[22px]' : 'translate-x-0.5'
                }`}
            />
        </button>
    </label>
);

/** Error banner used across steps. */
export const ErrorBanner: React.FC<{ message: string | null }> = ({ message }) =>
    message ? (
        <div role="alert" className="rounded-2xl p-4 bg-red-50 text-red-700 border border-red-100 mb-6">
            <p className="text-sm font-bold">{message}</p>
        </div>
    ) : null;

/** Skeleton loading row. */
export const SkeletonRow: React.FC<{ className?: string }> = ({ className }) => (
    <div className={`mw-skeleton rounded-xl ${className || 'h-12 w-full'}`} aria-hidden />
);

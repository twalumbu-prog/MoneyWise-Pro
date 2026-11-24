import { Dimensions, StyleSheet, Text, TextInput } from 'react-native';

/**
 * Small-screen scaling. The app was designed on a 393 × 852 phone; on an iPhone SE (375 × 667) the same sizes leave
 * less than 80% of the height, so everything felt squeezed. `ui` is 1 on those larger phones and shrinks smoothly
 * towards 0.86 on the shortest ones. Text is scaled globally (see `installTextScaling`), spacing helpers use `sz()`.
 * Phones at or above the design size are untouched.
 */
const DESIGN_W = 393;
const DESIGN_H = 852;
const MIN = 0.86;

const { width, height } = Dimensions.get('window');
const short = Math.min(width, height), long = Math.max(width, height);
const raw = 0.5 * (short / DESIGN_W) + 0.5 * (long / DESIGN_H);

/** 1 on normal and large phones, down to 0.86 on the smallest. */
export const ui = raw >= 0.98 ? 1 : Math.max(MIN, raw);
export const isCompact = ui < 1;

/** A size (spacing, icon, fixed height) scaled for the screen, to the nearest half point. */
export const sz = (n: number) => (ui === 1 ? n : Math.round(n * ui * 2) / 2);

const scaleFont = (n: number) => Math.max(10, Math.round(n * ui * 2) / 2);

function scaleStyle(style: any) {
    if (!style) return style;
    const flat = StyleSheet.flatten(style);
    if (!flat || (flat.fontSize == null && flat.lineHeight == null)) return style;
    const next = { ...flat };
    if (typeof flat.fontSize === 'number') next.fontSize = scaleFont(flat.fontSize);
    if (typeof flat.lineHeight === 'number') next.lineHeight = Math.round(flat.lineHeight * ui);
    return next;
}

let installed = false;
/** Wraps Text and TextInput once so every fontSize / lineHeight in the app follows `ui`. No-op on larger phones. */
export function installTextScaling() {
    if (installed || !isCompact) return;
    installed = true;
    for (const C of [Text, TextInput] as any[]) {
        const render = C?.render;
        if (typeof render !== 'function') continue;
        C.render = function patched(this: unknown, props: any, ref: unknown) {
            return render.call(this, { ...props, style: scaleStyle(props.style) }, ref);
        };
    }
}

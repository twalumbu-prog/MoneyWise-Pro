import { createContext } from 'react';
import type { SharedValue } from 'react-native-reanimated';

/**
 * The wizard gives each step layer a horizontal offset; the step shell applies it to its middle content only, so the top
 * bar (and its progress animation) and the bottom buttons stay put while the content pushes from one page to the next.
 */
export const SlideContext = createContext<SharedValue<number> | null>(null);

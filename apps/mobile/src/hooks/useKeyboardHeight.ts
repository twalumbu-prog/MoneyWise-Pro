import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/**
 * Current on-screen keyboard height (0 when hidden). Used where the layout must make room itself —
 * React Native's KeyboardAvoidingView guesses the offset from the screen's position, which goes wrong under
 * a tab bar or a custom header and leaves the input half-hidden.
 */
export function useKeyboardHeight(): number {
    const [height, setHeight] = useState(0);
    useEffect(() => {
        const ios = Platform.OS === 'ios';
        const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', (e) => setHeight(e.endCoordinates?.height ?? 0));
        const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () => setHeight(0));
        return () => { show.remove(); hide.remove(); };
    }, []);
    return height;
}

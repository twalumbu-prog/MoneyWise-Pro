import { useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';

/**
 * Speech-to-text for a text box (the Assistant composer, the box on Home). Interim results replace what has been dictated so far,
 * appended after whatever text was there when recording started. `level` is the live microphone loudness, 0 (silent) to 1, for the
 * voice animation.
 *
 * Speech recognition is one device-wide session, but several text boxes can be mounted at once (Home and the Assistant are both
 * tabs), and every mounted listener hears every event. So the box that started recording "owns" the session and only it reacts.
 */
let owner: number | null = null;
let nextId = 1;

export function useDictation(value: string, onChange: (v: string) => void) {
    const id = useRef(nextId++).current;
    const [listening, setListening] = useState(false);
    const [level, setLevel] = useState(0);
    const baseText = useRef('');
    const mine = () => owner === id;

    useSpeechRecognitionEvent('result', (event) => {
        if (!mine()) return;
        const transcript = event.results[0]?.transcript ?? '';
        const prefix = baseText.current;
        onChange(prefix ? `${prefix} ${transcript}` : transcript);
    });
    useSpeechRecognitionEvent('volumechange', (event) => {
        if (!mine()) return;
        // Reported between -2 and 10; anything at or below 0 is silence.
        setLevel(Math.max(0, Math.min(1, event.value / 8)));
    });
    const finish = () => { if (mine()) owner = null; setListening(false); setLevel(0); };
    useSpeechRecognitionEvent('error', () => { if (mine()) finish(); });
    useSpeechRecognitionEvent('end', () => { if (mine()) finish(); });

    // Leaving the screen stops a recording it started.
    useEffect(() => () => { if (owner === id) { ExpoSpeechRecognitionModule.stop(); owner = null; } }, [id]);

    const toggle = async () => {
        if (listening) {
            ExpoSpeechRecognitionModule.stop();
            finish();
            return;
        }
        const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
        if (!perm.granted) {
            Alert.alert('Microphone access needed', 'MoneyWise needs microphone and speech recognition access to dictate. Enable it in Settings > MoneyWise.');
            return;
        }
        if (owner !== null) ExpoSpeechRecognitionModule.stop(); // another box was recording: hand the session over
        owner = id;
        baseText.current = value;
        ExpoSpeechRecognitionModule.start({
            lang: 'en-US',
            interimResults: true,
            continuous: true,
            volumeChangeEventOptions: { enabled: true, intervalMillis: 90 },
        });
        setListening(true);
    };

    return { listening, level, toggle };
}

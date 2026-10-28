import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState } from 'react-native';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';

/**
 * Speech-to-text for a text box (the Assistant composer, the box on Home). Interim results replace what has been dictated so far,
 * appended after whatever text was there when recording started. `level` is the live microphone loudness, 0 (silent) to 1, for the
 * voice animation.
 *
 * Speech recognition is one device-wide session, but several text boxes can be mounted at once (Home and the Assistant are both
 * tabs), and every mounted listener hears every event. So the box that started recording "owns" the session and only it reacts.
 *
 * Stopping, and why it has two flavours:
 *   • `toggle()` while listening is a *graceful* stop: the microphone closes but the last words still arrive, so they aren't lost.
 *   • `stop()` is a *hard* stop for when the text is being sent (or the screen is left): it aborts the session and ignores
 *     anything that still comes in. Without it, words recognised after "Send" were typed back into the box that had just been
 *     cleared, and the microphone kept running.
 *
 * A session's native "end" event arrives a moment after it was stopped. If a new session was started in the meantime, that late
 * "end" used to be taken for the new session's, so the button showed "stopped" while the microphone was still live. `sessions` lists
 * the native sessions that haven't ended yet (oldest first); each "end" retires the oldest, and only when none is left does the
 * owner close. A session that was stopped but whose "end" never came is forgotten after a few seconds, so one lost event can't
 * leave the button stuck.
 */
let owner: number | null = null;
let nextId = 1;
interface Session { stoppedAt: number | null }
let sessions: Session[] = [];
const STALE_AFTER_MS = 4000;
const markStopped = () => { const last = sessions[sessions.length - 1]; if (last && last.stoppedAt === null) last.stoppedAt = Date.now(); };
/** Closes the owner's side (state, ownership) when the native session has really ended, or when it is taken over. */
let endCurrent: (() => void) | null = null;

ExpoSpeechRecognitionModule.addListener('end', () => {
    sessions.shift();
    if (sessions.length > 0) return; // that was an older session winding down; a newer one is still running
    const close = endCurrent;
    endCurrent = null;
    close?.();
});

type Phase = 'idle' | 'listening' | 'stopping';

export function useDictation(value: string, onChange: (v: string) => void) {
    const id = useRef(nextId++).current;
    const [listening, setListening] = useState(false);
    const [level, setLevel] = useState(0);
    const baseText = useRef('');
    const phase = useRef<Phase>('idle');
    const mine = () => owner === id;

    const closeUi = useCallback(() => { setListening(false); setLevel(0); }, []);
    /** This box is no longer the owner of the session. */
    const release = useCallback(() => {
        phase.current = 'idle';
        if (owner === id) { owner = null; markStopped(); }
        if (endCurrent && owner === null) endCurrent = null;
        closeUi();
    }, [id, closeUi]);

    useSpeechRecognitionEvent('result', (event) => {
        if (!mine() || phase.current === 'idle') return;
        const transcript = event.results[0]?.transcript ?? '';
        const prefix = baseText.current;
        onChange(prefix ? `${prefix} ${transcript}` : transcript);
    });
    useSpeechRecognitionEvent('volumechange', (event) => {
        if (!mine() || phase.current !== 'listening') return;
        // Reported between -2 and 10; anything at or below 0 is silence.
        setLevel(Math.max(0, Math.min(1, event.value / 8)));
    });
    useSpeechRecognitionEvent('error', (event) => {
        if (!mine() || phase.current === 'idle') return;
        console.warn('[Dictation] stopped:', event.error, event.message);
        release();
        // Silence or the person stopping it is not a problem worth an alert; anything else is, or the button just looks broken.
        if (event.error !== 'no-speech' && event.error !== 'aborted' && event.error !== 'speech-timeout') {
            Alert.alert('Dictation stopped', event.message || 'The microphone could not be used just now. Please try again.');
        }
    });

    /** Hard stop: close the microphone now and ignore anything still on its way (used when sending, and when leaving the screen). */
    const stop = useCallback(() => {
        if (phase.current === 'idle') return;
        const wasOwner = owner === id;
        release();
        if (wasOwner) ExpoSpeechRecognitionModule.abort();
    }, [id, release]);

    // Leaving the screen, or the app going to the background, stops a recording this box started.
    useEffect(() => () => stop(), [stop]);
    useEffect(() => {
        const sub = AppState.addEventListener('change', (s) => { if (s !== 'active') stop(); });
        return () => sub.remove();
    }, [stop]);

    const toggle = async () => {
        if (phase.current === 'listening') {
            // Graceful: the microphone closes, the final words still arrive, and the native "end" event finishes the job.
            phase.current = 'stopping';
            markStopped();
            closeUi();
            ExpoSpeechRecognitionModule.stop();
            return;
        }
        const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
        if (!perm.granted) {
            Alert.alert('Microphone access needed', 'MoneyWise needs microphone and speech recognition access to dictate. Enable it in Settings > MoneyWise.');
            return;
        }
        if (owner !== null && owner !== id) {
            // Another box was recording: close its side now and hand the session over.
            const previous = endCurrent;
            endCurrent = null;
            previous?.();
            owner = null;
            ExpoSpeechRecognitionModule.abort();
        }
        const now = Date.now();
        sessions = sessions.filter((x) => x.stoppedAt === null || now - x.stoppedAt < STALE_AFTER_MS);
        owner = id;
        phase.current = 'listening';
        baseText.current = value;
        endCurrent = release;
        sessions.push({ stoppedAt: null });
        ExpoSpeechRecognitionModule.start({
            lang: 'en-US',
            interimResults: true,
            continuous: true,
            volumeChangeEventOptions: { enabled: true, intervalMillis: 90 },
        });
        setListening(true);
    };

    return { listening, level, toggle, stop };
}

import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

/**
 * The capture guide's looping how-to video. It keeps playing in a floating picture-in-picture window when the person
 * switches to Shortcuts, so the steps stay in view while they tap. expo-video is a native module: builds made before
 * it was added don't have it, and `videoAvailable` is false there (the guide then shows its screenshots only).
 */
function loadVideo(): any | null {
    try { return require('expo-video'); } catch (e) { if (__DEV__) console.warn('[capture-guide] video unavailable:', (e as Error)?.message); return null; }
}
const Video = loadVideo();

export const videoAvailable = !!Video;
export const pipAvailable = (() => { try { return !!Video?.isPictureInPictureSupported?.(); } catch { return false; } })();

export interface GuideVideoHandle {
    /** Plays and lifts the video into the floating window, so it stays on top of the app opened next. */
    float: () => void;
    stopFloating: () => void;
}

const SOURCE = require('../../../assets/capture-guide/guide.mp4');

const Player = forwardRef<GuideVideoHandle, { style?: ViewStyle }>(({ style }, ref) => {
    const player = Video.useVideoPlayer(SOURCE, (p: any) => { p.loop = true; p.muted = true; p.play(); });
    const view = useRef<any>(null);
    useImperativeHandle(ref, () => ({
        float: () => {
            try { player.play(); } catch { /* nothing to play */ }
            // startsPictureInPictureAutomatically covers the app leaving; starting it here as well makes it certain.
            try { void view.current?.startPictureInPicture?.(); } catch { /* picture-in-picture not possible here */ }
        },
        stopFloating: () => { try { void view.current?.stopPictureInPicture?.(); } catch { /* not floating */ } },
    }), [player]);
    return (
        <Video.VideoView
            ref={view}
            player={player}
            style={[StyleSheet.absoluteFill, style]}
            contentFit="cover"
            nativeControls={false}
            allowsPictureInPicture
            startsPictureInPictureAutomatically
        />
    );
});

export const GuideVideo = forwardRef<GuideVideoHandle, { style?: ViewStyle }>((props, ref) =>
    Video ? <Player ref={ref} {...props} /> : <View style={props.style} />);

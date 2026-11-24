import type { ImageSourcePropType } from 'react-native';
import spec from '../../../assets/capture-guide/steps.json';

/**
 * The taps for "When I get a message containing ZMW, run Capture mobile money message" in Apple's Shortcuts app.
 * assets/capture-guide/steps.json is the single source: these screens and the floating video
 * (scripts/capture-guide/make-video.swift) are both made from it, so they always show the same thing.
 * Screenshots are from iOS 26 in light mode, 402 × 874 points; x/y is the tap, in those points.
 */
export interface GuideStep {
    key: string;
    image: ImageSourcePropType;
    caption: string;
    tip?: string;
    x: number;
    y: number;
}

// Metro needs each image named literally.
const IMAGES: Record<string, ImageSourcePropType> = {
    '01-automation.jpg': require('../../../assets/capture-guide/01-automation.jpg'),
    '02-message.jpg': require('../../../assets/capture-guide/02-message.jpg'),
    '03-when.jpg': require('../../../assets/capture-guide/03-when.jpg'),
    '04-zmw.jpg': require('../../../assets/capture-guide/04-zmw.jpg'),
    '05-run-immediately.jpg': require('../../../assets/capture-guide/05-run-immediately.jpg'),
    '06-next.jpg': require('../../../assets/capture-guide/06-next.jpg'),
    '07-pick.jpg': require('../../../assets/capture-guide/07-pick.jpg'),
    '08-search-actions.jpg': require('../../../assets/capture-guide/08-search-actions.jpg'),
    '08-search.jpg': require('../../../assets/capture-guide/08-search.jpg'),
    '09-input.jpg': require('../../../assets/capture-guide/09-input.jpg'),
    '10-variable.jpg': require('../../../assets/capture-guide/10-variable.jpg'),
    '11-shortcut-input.jpg': require('../../../assets/capture-guide/11-shortcut-input.jpg'),
    '12-save.jpg': require('../../../assets/capture-guide/12-save.jpg'),
};

export const SHOT_W = spec.pointsWidth;
export const SHOT_H = spec.pointsHeight;

export const GUIDE_STEPS: GuideStep[] = spec.steps
    .filter((s) => IMAGES[s.image])
    .map((s) => ({ key: s.key, image: IMAGES[s.image], caption: s.caption, tip: (s as { tip?: string }).tip, x: s.x, y: s.y }));

/** What usually went wrong when the test message isn't caught, and the step that fixes it. */
export const TROUBLESHOOT: { title: string; body: string; step: string }[] = [
    { title: 'Run Immediately is off', body: 'iPhone is waiting for you to confirm each message.', step: 'immediately' },
    { title: 'The message isn’t passed on', body: 'In the action, Message must be set to Shortcut Input.', step: 'input' },
    { title: 'A different word was typed', body: 'Message Contains should be exactly ZMW.', step: 'zmw' },
];

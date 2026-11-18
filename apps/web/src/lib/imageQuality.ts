/**
 * A quick, private check on a photo before it is uploaded: is it big enough, sharp, lit properly and free of glare? It runs in the browser on a
 * shrunken copy, so nothing leaves the device and it costs nothing. It can't tell what the document is or whether it can be read: that is the
 * server's job. A "poor" photo is turned away so the person can retake it straight away.
 */

export type QualityLevel = 'good' | 'ok' | 'poor';

export interface QualityResult {
    /** 0 to 100. */
    score: number;
    level: QualityLevel;
    /** What is wrong, in plain words, worst first. Empty for a good photo. */
    issues: string[];
    metrics: { width: number; height: number; sharpness: number; brightness: number; contrast: number; glare: number };
}

const MAX_SIDE = 800;

function load(file: File): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('The image could not be opened')); };
        img.src = url;
    });
}

export async function assessImage(file: File): Promise<QualityResult> {
    const img = await load(file);
    const width = img.naturalWidth, height = img.naturalHeight;
    const k = Math.min(1, MAX_SIDE / Math.max(width, height));
    const w = Math.max(1, Math.round(width * k)), h = Math.max(1, Math.round(height * k));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return { score: 70, level: 'ok', issues: [], metrics: { width, height, sharpness: 0, brightness: 0, contrast: 0, glare: 0 } };
    ctx.drawImage(img, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);

    // Brightness, contrast and blown-out areas from the luma of every pixel.
    const luma = new Float32Array(w * h);
    let sum = 0, blown = 0;
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
        const y = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        luma[p] = y; sum += y;
        if (y >= 250) blown++;
    }
    const n = w * h;
    const mean = sum / n;
    let varSum = 0;
    for (let p = 0; p < n; p++) varSum += (luma[p] - mean) ** 2;
    const contrast = Math.sqrt(varSum / n);
    const glare = blown / n;

    // Sharpness: how much the Laplacian (an edge detector) varies. A blurred photo has soft edges and a low value.
    let lapSum = 0, lapSq = 0, count = 0;
    for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
            const i = y * w + x;
            const lap = 4 * luma[i] - luma[i - 1] - luma[i + 1] - luma[i - w] - luma[i + w];
            lapSum += lap; lapSq += lap * lap; count++;
        }
    }
    const sharpness = count ? lapSq / count - (lapSum / count) ** 2 : 0;

    let score = 100;
    const found: { cost: number; text: string }[] = [];
    let severe = false; // a fault bad enough that the document can't be used, whatever the rest of the score says
    const flag = (cost: number, text: string, hard = false) => { score -= cost; if (hard) severe = true; found.push({ cost, text }); };
    const small = Math.min(width, height);
    if (small < 500) flag(35, 'The photo is too small to read. Use a higher-quality setting or move closer.', true);
    else if (small < 800) flag(12, 'The photo is on the small side.');
    if (sharpness < 40) flag(45, 'The photo is blurry. Hold the phone steady and let it focus.', true);
    else if (sharpness < 90) flag(18, 'The photo is a little soft.');
    if (mean < 50) flag(35, 'The photo is too dark. Move into better light.', true);
    else if (mean < 75) flag(12, 'The photo is a bit dark.');
    else if (mean > 215) flag(30, 'The photo is too bright or washed out.', true);
    else if (mean > 200) flag(10, 'The photo is a bit bright.');
    if (glare > 0.10) flag(25, 'There is glare or a reflection. Tilt the document away from the light.', true);
    else if (glare > 0.04) flag(10, 'There is some glare.');
    if (contrast < 28) flag(15, 'The photo looks flat. Check the document is lit evenly against a plain background.');

    score = Math.max(0, Math.min(100, Math.round(score)));
    return {
        score, level: severe ? 'poor' : score >= 75 ? 'good' : score >= 55 ? 'ok' : 'poor',
        issues: found.sort((a, b) => b.cost - a.cost).map((f) => f.text),
        metrics: { width, height, sharpness: Math.round(sharpness), brightness: Math.round(mean), contrast: Math.round(contrast), glare: Math.round(glare * 1000) / 10 },
    };
}

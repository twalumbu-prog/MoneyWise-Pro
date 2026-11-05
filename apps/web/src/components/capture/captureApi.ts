export { captureService as captureApi } from 'core';
export type { CaptureRow, CaptureDetail, CaptureConversation, CaptureSettings, CaptureStatus, CustomerCapture } from 'core';

export const kwacha = (n: number | null | undefined) =>
    n == null ? '—' : `K${Number(n).toLocaleString('en-ZM', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const readFileAsBase64 = (file: File) => new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^;]+;base64,/, ''));
    r.onerror = () => reject(new Error('Could not read the file'));
    r.readAsDataURL(file);
});

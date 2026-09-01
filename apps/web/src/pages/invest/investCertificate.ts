export interface CertificateDetails {
    companyName: string;
    companyLogo: string;
    productName: string;
    productTypeLabel: string;
    amount: number;
    units?: number;
    unitPrice?: number;
    reference: string;
    date: Date;
    method: string;
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
    return new Promise(resolve => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = src;
    });
}

function formatKwacha(n: number): string {
    return `K${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

export async function downloadInvestmentCertificate(details: CertificateDetails): Promise<void> {
    const W = 1200, H = 850;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Background
    ctx.fillStyle = '#FDFBF6';
    ctx.fillRect(0, 0, W, H);

    // Outer decorative border
    ctx.strokeStyle = '#0058DB';
    ctx.lineWidth = 6;
    roundRect(ctx, 28, 28, W - 56, H - 56, 4);
    ctx.stroke();

    ctx.strokeStyle = '#0058DB55';
    ctx.lineWidth = 1.5;
    roundRect(ctx, 44, 44, W - 88, H - 88, 4);
    ctx.stroke();

    // Corner flourishes
    ctx.fillStyle = '#0058DB';
    [[28, 28], [W - 28, 28], [28, H - 28], [W - 28, H - 28]].forEach(([cx, cy]) => {
        ctx.beginPath();
        ctx.arc(cx, cy, 5, 0, Math.PI * 2);
        ctx.fill();
    });

    // Logo
    const logo = await loadImage(details.companyLogo);
    const logoSize = 84;
    const logoX = W / 2 - logoSize / 2;
    const logoY = 78;
    ctx.save();
    ctx.strokeStyle = '#E8EEF8';
    ctx.lineWidth = 2;
    roundRect(ctx, logoX - 4, logoY - 4, logoSize + 8, logoSize + 8, 16);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.stroke();
    if (logo) {
        // contain-fit the logo inside the box
        const scale = Math.min(logoSize / logo.width, logoSize / logo.height);
        const dw = logo.width * scale;
        const dh = logo.height * scale;
        ctx.drawImage(logo, logoX + (logoSize - dw) / 2, logoY + (logoSize - dh) / 2, dw, dh);
    }
    ctx.restore();

    // Title
    ctx.textAlign = 'center';
    ctx.fillStyle = '#111827';
    ctx.font = '700 40px Georgia, "Times New Roman", serif';
    ctx.fillText('Certificate of Deposit', W / 2, logoY + logoSize + 68);

    ctx.font = '400 15px Georgia, serif';
    ctx.fillStyle = '#6B7280';
    ctx.fillText(details.companyName, W / 2, logoY + logoSize + 96);

    // Divider
    ctx.strokeStyle = '#D9C98A';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(W / 2 - 90, logoY + logoSize + 116);
    ctx.lineTo(W / 2 + 90, logoY + logoSize + 116);
    ctx.stroke();

    // Body copy
    ctx.font = '400 16px "DM Sans", Arial, sans-serif';
    ctx.fillStyle = '#374151';
    const bodyY = logoY + logoSize + 160;
    ctx.fillText('This certifies that a deposit was made through MoneyWise Pro into the', W / 2, bodyY);
    ctx.font = '700 18px "DM Sans", Arial, sans-serif';
    ctx.fillStyle = '#111827';
    ctx.fillText(details.productName, W / 2, bodyY + 30);
    ctx.font = '400 14px "DM Sans", Arial, sans-serif';
    ctx.fillStyle = '#6B7280';
    ctx.fillText(details.productTypeLabel, W / 2, bodyY + 52);

    // Details table
    const rows: [string, string][] = [
        ['Amount Deposited', formatKwacha(details.amount)],
        ...(details.units != null ? [['Units Acquired', `${details.units.toLocaleString()} units`] as [string, string]] : []),
        ...(details.unitPrice != null ? [['Price per Unit', formatKwacha(details.unitPrice)] as [string, string]] : []),
        ['Payment Method', details.method],
        ['Date', details.date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })],
        ['Reference', details.reference],
    ];

    const tableTop = bodyY + 96;
    const tableW = 620;
    const tableX = W / 2 - tableW / 2;
    const rowH = 40;

    ctx.strokeStyle = '#E8EEF8';
    ctx.lineWidth = 1;
    roundRect(ctx, tableX, tableTop, tableW, rowH * rows.length, 12);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.stroke();

    rows.forEach(([label, value], i) => {
        const y = tableTop + i * rowH;
        if (i > 0) {
            ctx.strokeStyle = '#F1F3F5';
            ctx.beginPath();
            ctx.moveTo(tableX, y);
            ctx.lineTo(tableX + tableW, y);
            ctx.stroke();
        }
        ctx.textAlign = 'left';
        ctx.font = '400 14px "DM Sans", Arial, sans-serif';
        ctx.fillStyle = '#6B7280';
        ctx.fillText(label, tableX + 24, y + rowH / 2 + 5);

        ctx.textAlign = 'right';
        ctx.font = '700 14px "DM Sans", Arial, sans-serif';
        ctx.fillStyle = '#111827';
        ctx.fillText(value, tableX + tableW - 24, y + rowH / 2 + 5);
    });

    // Footer
    ctx.textAlign = 'center';
    ctx.font = 'italic 400 12px Georgia, serif';
    ctx.fillStyle = '#9CA3AF';
    ctx.fillText('This certificate is auto-generated and serves as a record of deposit. Not a negotiable instrument.', W / 2, H - 70);

    ctx.font = '700 13px "DM Sans", Arial, sans-serif';
    ctx.fillStyle = '#0058DB';
    ctx.fillText('MoneyWise Pro', W / 2, H - 46);

    const blob: Blob | null = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) return;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Certificate-of-Deposit-${details.reference}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

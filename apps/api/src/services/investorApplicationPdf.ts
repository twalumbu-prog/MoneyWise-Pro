/**
 * Renders an investor account application to a PDF. Produced by the API at
 * submit time and emailed to the investment company (and kept in storage so the
 * CRM can offer it for download).
 */
import PDFDocument from 'pdfkit';

export interface ApplicationPdfInput {
    companyName: string;
    applicationId: string;
    submittedAt: Date;
    applicant: Record<string, any>;
    /** Human labels of the documents that were uploaded (not the files themselves). */
    uploadedDocuments: string[];
    declarationAcceptedAt: Date;
    /** Passport photo bytes if available and a format PDFKit can embed (JPEG/PNG). */
    photo?: Buffer | null;
}

const PRIMARY = '#002E3B';
const ACCENT = '#006AFF';
const MUTED = '#64748b';
const BORDER = '#e2e8f0';
const LIGHT = '#f8fafc';

const LEFT = 50;
const RIGHT = 545;
const WIDTH = RIGHT - LEFT;

const GENDER_LABEL: Record<string, string> = { MALE: 'Male', FEMALE: 'Female', OTHER: 'Other' };

function formatDate(iso?: string): string {
    if (!iso) return '—';
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    if (!m) return iso;
    return `${m[3]}/${m[2]}/${m[1]}`;
}

export function buildApplicationPdf(input: ApplicationPdfInput): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 50, size: 'A4', info: { Title: `Investor Account Application – ${input.companyName}` } });
        const chunks: Buffer[] = [];
        doc.on('data', (c: Buffer) => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const a = input.applicant;
        const fullName = [a.first_name, a.middle_name, a.last_name].filter(Boolean).join(' ');

        // ── Header ──────────────────────────────────────────────────────────
        doc.rect(0, 0, 595, 96).fill(PRIMARY);
        doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(18).text(input.companyName.toUpperCase(), LEFT, 30, { width: 380 });
        doc.font('Helvetica').fontSize(10).fillColor('#BFD4DC').text('Investor Account Application', LEFT, 56);
        doc.font('Helvetica').fontSize(8).fillColor('#BFD4DC')
            .text(`Application ref: ${input.applicationId.slice(0, 8).toUpperCase()}`, LEFT, 72)
            .text(`Submitted: ${input.submittedAt.toLocaleString('en-GB', { timeZone: 'Africa/Lusaka' })} (CAT)`, 220, 72);

        if (input.photo) {
            try {
                doc.image(input.photo, 470, 14, { fit: [75, 90], align: 'center', valign: 'center' });
                doc.rect(470, 14, 75, 90).strokeColor('#FFFFFF').lineWidth(1).stroke();
            } catch { /* unsupported image — skip the photo, the rest of the form still stands */ }
        }

        let y = 120;
        const ensureSpace = (needed: number) => {
            if (y + needed > 780) {
                doc.addPage();
                y = 50;
            }
        };

        const section = (title: string) => {
            ensureSpace(48);
            doc.rect(LEFT, y, WIDTH, 20).fill(LIGHT);
            doc.rect(LEFT, y, 3, 20).fill(ACCENT);
            doc.fillColor(PRIMARY).font('Helvetica-Bold').fontSize(10).text(title.toUpperCase(), LEFT + 12, y + 6);
            y += 28;
        };

        const row = (label: string, value?: string | null) => {
            const text = value && String(value).trim() ? String(value) : '—';
            doc.font('Helvetica').fontSize(9);
            const h = Math.max(doc.heightOfString(text, { width: 300 }), 12);
            ensureSpace(h + 8);
            doc.fillColor(MUTED).font('Helvetica').fontSize(8.5).text(label, LEFT + 6, y, { width: 175 });
            doc.fillColor('#0f172a').font('Helvetica').fontSize(9).text(text, LEFT + 190, y, { width: 300 });
            y += h + 6;
            doc.moveTo(LEFT + 6, y - 3).lineTo(RIGHT, y - 3).strokeColor(BORDER).lineWidth(0.4).stroke();
        };

        // ── Applicant summary ───────────────────────────────────────────────
        doc.fillColor(PRIMARY).font('Helvetica-Bold').fontSize(15).text(fullName || 'Applicant', LEFT, y);
        y += 24;

        section('Personal details');
        row('First name', a.first_name);
        row('Middle name', a.middle_name);
        row('Last name', a.last_name);
        row('Date of birth', formatDate(a.date_of_birth));
        row('Gender', GENDER_LABEL[a.gender] || a.gender);
        row('Nationality', a.nationality);

        section('Contact details');
        row('Email address', a.email);
        row('Phone number', a.phone);
        row('Physical address', a.physical_address);

        section('Identification');
        row('ID type', a.id_type);
        row('ID number', a.id_number);

        section('Occupation & source of funds');
        row('Occupation', a.occupation);
        row('Source of income', a.source_of_income);

        section('Banking details');
        row('Bank name', a.bank_name);
        row('Account number', a.bank_account_number);
        row('Account name (verified with the bank)', a.bank_account_name);

        section('Sales & next of kin');
        row('Sales person', a.sales_person);
        row('Next of kin – full name', a.nok_full_name);
        row('Next of kin – ID / NRC / passport no.', a.nok_id_number);
        row('Next of kin – date of birth', formatDate(a.nok_date_of_birth));
        row('Next of kin – contact number', a.nok_phone);
        row('Relationship', a.nok_relationship);

        section('Documents provided');
        if (input.uploadedDocuments.length === 0) {
            row('Documents', 'None');
        } else {
            for (const d of input.uploadedDocuments) row(d, 'Provided');
        }
        ensureSpace(20);
        doc.fillColor(MUTED).font('Helvetica-Oblique').fontSize(8)
            .text('The document files are available to you in the CRM (Investors) and are attached to the notification email where size allows.', LEFT + 6, y, { width: WIDTH - 12 });
        y += 24;

        section('Declaration');
        const decl = 'I declare that all information provided is true and accurate to the best of my knowledge. I understand that providing false information may result in my application being rejected.';
        doc.font('Helvetica').fontSize(9);
        const dh = doc.heightOfString(decl, { width: WIDTH - 12 });
        ensureSpace(dh + 40);
        doc.fillColor('#334155').text(decl, LEFT + 6, y, { width: WIDTH - 12 });
        y += dh + 10;
        doc.fillColor(PRIMARY).font('Helvetica-Bold').fontSize(9)
            .text(`Accepted electronically by ${fullName || 'applicant'} on ${input.declarationAcceptedAt.toLocaleString('en-GB', { timeZone: 'Africa/Lusaka' })} (CAT).`, LEFT + 6, y, { width: WIDTH - 12 });

        doc.end();
    });
}

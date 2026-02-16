import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { CashbookEntry } from '../services/cashbook.service';

const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-ZM', {
        style: 'currency',
        currency: 'ZMW',
        minimumFractionDigits: 2
    }).format(amount);
};

const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString() + ' ' +
        new Date(dateString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const formatDescription = (entry: CashbookEntry) => {
    let desc = entry.description;
    if (entry.requisitions?.reference_number) {
        desc += ` (Voucher ${entry.requisitions.reference_number})`;
    }
    if (entry.requisitions?.requestor?.name) {
        desc += ` - Paid to: ${entry.requisitions.requestor.name}`;
    }
    return desc;
};

const formatStatusType = (entry: CashbookEntry) => {
    const type = entry.entry_type.replace(/_/g, ' ');
    const status = entry.requisitions?.status || '-';
    // If it's just a system entry like Opening Balance, just show Type
    if (entry.entry_type === 'OPENING_BALANCE' || entry.entry_type === 'CLOSING_BALANCE') {
        return type;
    }
    return `${status} / ${type}`;
};

export const exportToCSV = (entries: CashbookEntry[], filename: string) => {
    const headers = ['Date', 'Description & Details', 'Status / Type', 'Debit', 'Credit', 'Balance'];

    const rows = entries.map(entry => [
        formatDate(entry.date),
        `"${formatDescription(entry).replace(/"/g, '""')}"`, // Handle quotes in CSV
        formatStatusType(entry),
        entry.debit > 0 ? entry.debit : '',
        entry.credit > 0 ? entry.credit : '',
        entry.balance_after
    ]);

    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `${filename}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
};

export const exportToExcel = (entries: CashbookEntry[], filename: string, period: { start: string, end: string }) => {
    const data = entries.map(entry => ({
        Date: formatDate(entry.date),
        'Description & Details': formatDescription(entry),
        'Status / Type': formatStatusType(entry),
        Debit: entry.debit > 0 ? entry.debit : null,
        Credit: entry.credit > 0 ? entry.credit : null,
        Balance: entry.balance_after
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);

    // Add period info header
    XLSX.utils.sheet_add_aoa(worksheet, [[`Cash Ledger Export: ${period.start} to ${period.end}`]], { origin: 'A1' });

    // Adjust column widths (approximate)
    worksheet['!cols'] = [
        { wch: 20 }, // Date
        { wch: 50 }, // Description
        { wch: 25 }, // Status/Type
        { wch: 12 }, // Debit
        { wch: 12 }, // Credit
        { wch: 15 }  // Balance
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Cash Ledger');
    XLSX.writeFile(workbook, `${filename}.xlsx`);
};

export const exportToPDF = (entries: CashbookEntry[], filename: string, period: { start: string, end: string }, organizationName?: string) => {
    const doc = new jsPDF();

    // Header
    doc.setFontSize(18);
    doc.text(organizationName || 'MoneyWise Pro', 14, 22);

    doc.setFontSize(14);
    doc.text('Cash Ledger Report', 14, 32);

    doc.setFontSize(10);
    doc.text(`Period: ${period.start} to ${period.end}`, 14, 40);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 46);

    const tableColumn = ["Date", "Description & Details", "Status / Type", "Debit", "Credit", "Balance"];
    const tableRows = entries.map(entry => [
        formatDate(entry.date),
        formatDescription(entry),
        formatStatusType(entry),
        entry.debit > 0 ? formatCurrency(entry.debit) : '-',
        entry.credit > 0 ? formatCurrency(entry.credit) : '-',
        formatCurrency(entry.balance_after)
    ]);

    autoTable(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: 55,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [41, 128, 185] }, // Brand color approximation
        alternateRowStyles: { fillColor: [245, 245, 245] },
        columnStyles: {
            0: { cellWidth: 25 },
            1: { cellWidth: 'auto' }, // Description gets auto width
            2: { cellWidth: 30 },
            3: { cellWidth: 20, halign: 'right' },
            4: { cellWidth: 20, halign: 'right' },
            5: { cellWidth: 25, halign: 'right' }
        }
    });

    doc.save(`${filename}.pdf`);
};

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

export const exportToCSV = (entries: CashbookEntry[], filename: string) => {
    const headers = ['Date', 'Description', 'Type', 'Status', 'Debit', 'Credit', 'Balance'];

    const rows = entries.map(entry => [
        formatDate(entry.date),
        entry.description,
        entry.entry_type,
        entry.requisitions?.status || '-',
        entry.debit > 0 ? entry.debit : '',
        entry.credit > 0 ? entry.credit : '',
        entry.balance_after
    ]);

    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
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
        Description: entry.description,
        Type: entry.entry_type,
        Status: entry.requisitions?.status || '-',
        Debit: entry.debit > 0 ? entry.debit : null,
        Credit: entry.credit > 0 ? entry.credit : null,
        Balance: entry.balance_after,
        'Requisition ID': entry.requisition_id || '-'
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);

    // Add period info header (hacky insert at top)
    XLSX.utils.sheet_add_aoa(worksheet, [[`Cash Ledger Export: ${period.start} to ${period.end}`]], { origin: 'A1' });
    // Move original data down? slightly complex with json_to_sheet. 
    // Simpler: Just make the filename descriptive and the sheet content standard tabular data.
    // Let's stick to standard tabular data for easier processing by users.

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

    const tableColumn = ["Date", "Description", "Type", "Debit", "Credit", "Balance"];
    const tableRows = entries.map(entry => [
        formatDate(entry.date),
        entry.description,
        entry.entry_type.replace('_', ' '),
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
        alternateRowStyles: { fillColor: [245, 245, 245] }
    });

    doc.save(`${filename}.pdf`);
};

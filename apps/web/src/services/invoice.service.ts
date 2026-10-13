/** Lives in `core` (shared with mobile). Re-exported so existing import paths keep working. */
export { invoiceService } from 'core';
export type {
    CustomerInvoice,
    InvoiceLine,
    InvoiceStatus,
    InvoicePaymentRow,
    CreateCreditSaleInput,
    EntryAllocation,
    InvoicePayLink,
} from 'core';

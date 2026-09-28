/** Moved to `core`. Re-exported so existing import paths keep working. */
export {
    PRODUCT_TYPE_OPTIONS,
    isBookingProductType,
    getBookingTerminology,
    formatBookingDuration,
    productService,
    paymentLinkService,
} from 'core';
export type {
    ProductType,
    DigitalAsset,
    BookingRange,
    BookingTerminology,
    Product,
    OrderDeliveryDetails,
    InvoiceLinkSnapshotItem,
    PaymentLink,
    UpdateInvoiceLinkPayload,
    InvoiceLinkItem,
    InvoiceLinkPayload,
} from 'core';

/** Moved to `core`. Re-exported so existing import paths keep working. */
export {
    PRODUCT_TYPE_OPTIONS,
    isBookingProductType,
    getBookingTerminology,
    formatBookingDuration,
    isAppointmentProductType,
    formatSlotTime,
    DEFAULT_APPOINTMENT_CONFIG,
    productService,
    paymentLinkService,
} from 'core';
export type {
    ProductType,
    DigitalAsset,
    BookingRange,
    BookingTerminology,
    AppointmentConfig,
    AppointmentInfo,
    AppointmentSlot,
    Product,
    OrderDeliveryDetails,
    CheckoutField,
    InvoiceLinkSnapshotItem,
    PaymentLink,
    UpdateInvoiceLinkPayload,
    InvoiceLinkItem,
    InvoiceLinkPayload,
} from 'core';

/**
 * `core` — everything the web app and the native app agree on.
 *
 * Nothing in here may touch the DOM, Vite's import.meta, or a native module.
 * Host-specific behaviour arrives through `configureCore` (see platform.ts).
 *
 * Migration is incremental by design: each module moves here and the old
 * apps/web file becomes a one-line re-export, so the web build stays green at
 * every commit and there is never a window where main is broken. See
 * docs/mobile-app/PLAN.md §3.
 */

export {
    configureCore,
    getCore,
    requireCapability,
} from './platform';

export type {
    CoreConfig,
    CoreEnv,
    KeyValueStore,
    Telemetry,
    TrackProps,
    EventStatus,
    FileAdapter,
    FilePickOptions,
    PickedFile,
    StreamAdapter,
} from './platform';

export { apiFetch, apiJson } from './api/apiFetch';
export { ApiError, isApiError } from './api/ApiError';

export { userService } from './services/user.service';
export type {
    UserProfile,
    UserRole,
    UserStatus,
    CreateUserInput,
    CreateUserResult,
    MutationAck,
} from './services/user.service';

export { accountService } from './services/account.service';
export type { Account } from './services/account.service';

export { budgetService } from './services/budget.service';
export type { Budget, SetBudgetPayload } from './services/budget.service';

export { departmentService } from './services/department.service';
export type { Department, DepartmentConfig } from './services/department.service';

export { highlightsService } from './services/highlights.service';
export type {
    HighlightCard,
    HighlightHeadline,
    HighlightsPayload,
    Achievement,
} from './services/highlights.service';

export { reportService } from './services/report.service';
export type {
    ExpenditureAggregation,
    ExpenditureItem,
    ExpenditureMode,
} from './services/report.service';

export { scheduleService } from './services/schedule.service';
export type {
    ScheduledItem,
    ScheduledItemRun,
    ScheduleCategory,
    ScheduleCadence,
    CategoryCounts,
    CreateScheduledItemPayload,
} from './services/schedule.service';

export { voucherService } from './services/voucher.service';
export type { Voucher, VoucherLine } from './services/voucher.service';

export { aiService } from './services/ai.service';
export type { AccountingRule, AIMetric } from './services/ai.service';

export { cashbookService } from './services/cashbook.service';
export type { CashbookEntry, CashbookSummary } from './services/cashbook.service';

export { PL_SECTIONS, onboardingService } from './services/onboarding.service';
export type { OnboardingProgress, BusinessProfile, OnboardingState, PlSection, CoaAccount, WalletStatus } from './services/onboarding.service';

export { organizationService } from './services/organization.service';
export type { Organization } from './services/organization.service';

export { integrationService, masterFeesService } from './services/integration.service';
export type {
    IntegrationStatus,
    MasterFeesStatus,
    MasterFeesCategory,
    MasterFeesReconciliation,
} from './services/integration.service';

export { lencoService } from './services/lenco.service';

export { payrollService } from './services/payroll.service';
export type {
    StaffAllowance,
    StaffDeduction,
    AllowanceConfig,
    DeductionConfig,
    PayrollConfig,
    StaffMember,
    PayrollRun,
    PayrollRunItem,
    PayrollRunDetail,
    PayrollDocument,
    StaffPayrollHistoryItem,
    CreatePayrollRunItem,
    CreatePayrollRunPayload,
} from './services/payroll.service';

export {
    PRODUCT_TYPE_OPTIONS,
    isBookingProductType,
    getBookingTerminology,
    formatBookingDuration,
    productService,
    paymentLinkService,
} from './services/product.service';
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
} from './services/product.service';

export {
    REQUISITION_STATUS_CONFIG,
    getStatusConfig,
    requisitionService,
} from './services/requisition.service';
export type {
    Requisition,
    RequisitionMessage,
} from './services/requisition.service';

export {
    formatKwacha,
    formatKwachaCompact,
    formatShortDate,
    formatRelative,
    groupByDate,
} from './format';
export type { DateGroup } from './format';

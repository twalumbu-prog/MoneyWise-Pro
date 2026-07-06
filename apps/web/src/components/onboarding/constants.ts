import {
    Shirt, MonitorSmartphone, Smartphone, Armchair, Sparkles, ShoppingBasket,
    Pill, Wheat, Hammer, UtensilsCrossed, BedDouble, Printer, NotebookPen,
    Briefcase, Handshake, Wrench, PartyPopper, GraduationCap, Cloud, WashingMachine,
    LucideIcon,
} from 'lucide-react';

/** Step 2 — industries the business operates in. */
export const INDUSTRIES = [
    'Retail', 'Wholesale', 'Grocery', 'Restaurant', 'Hotel', 'Pharmacy',
    'Healthcare', 'Agriculture', 'Construction', 'Education', 'Manufacturing',
    'Professional Services', 'Beauty', 'Automotive', 'Logistics', 'Technology',
    'Real Estate', 'NGO', 'Entertainment',
] as const;

/** Step 6 — store categories shown as selectable cards. */
export const STORE_CATEGORIES: { name: string; icon: LucideIcon }[] = [
    { name: 'Clothing & Shoes', icon: Shirt },
    { name: 'Electronics', icon: MonitorSmartphone },
    { name: 'Mobile Phones', icon: Smartphone },
    { name: 'Furniture', icon: Armchair },
    { name: 'Beauty', icon: Sparkles },
    { name: 'Grocery', icon: ShoppingBasket },
    { name: 'Pharmacy', icon: Pill },
    { name: 'Agriculture', icon: Wheat },
    { name: 'Hardware', icon: Hammer },
    { name: 'Restaurant', icon: UtensilsCrossed },
    { name: 'Hotel', icon: BedDouble },
    { name: 'Printing', icon: Printer },
    { name: 'Stationery', icon: NotebookPen },
    { name: 'Services', icon: Briefcase },
    { name: 'Consulting', icon: Handshake },
    { name: 'Repairs', icon: Wrench },
    { name: 'Events', icon: PartyPopper },
    { name: 'Education', icon: GraduationCap },
    { name: 'Digital Products', icon: Cloud },
    { name: 'Home Appliances', icon: WashingMachine },
];

/**
 * Wizard step definitions. Step ids are persisted — never renumber.
 * `heroTitle` is the two-line persistent heading (Figma copy is "Lets Setup",
 * no apostrophe — kept verbatim for fidelity) and switches from "your
 * Business" to "your Store" once the store-building phase starts (step 6).
 * `subtitle` is the DM Sans line rendered underneath it (step 1 renders its
 * own hero and ignores both).
 */
export const ONBOARDING_STEPS = [
    { id: 1, key: 'welcome', label: 'Welcome', heroTitle: ['', ''], subtitle: '' },
    { id: 2, key: 'logo', label: 'Logo', heroTitle: ['Lets Setup', 'your Business'], subtitle: 'Add your Business Logo' },
    { id: 3, key: 'contact', label: 'Contact', heroTitle: ['Lets Setup', 'your Business'], subtitle: 'Add your Contact Information' },
    { id: 4, key: 'address', label: 'Address', heroTitle: ['Lets Setup', 'your Business'], subtitle: 'Where is your Business located?' },
    { id: 5, key: 'industries', label: 'Industry', heroTitle: ['Lets Setup', 'your Business'], subtitle: 'What does your Business do?' },
    { id: 6, key: 'categories', label: 'Store', heroTitle: ['Lets Setup', 'your Store'], subtitle: 'What Category best describes the services you offer' },
    { id: 7, key: 'products', label: 'Products', heroTitle: ['Lets Setup', 'your Store'], subtitle: 'Add your Products & Services' },
    { id: 8, key: 'accounts', label: 'Accounts', heroTitle: ['Lets Setup', 'your Business'], subtitle: 'How would you like to track your income and expenses?' },
    { id: 9, key: 'wallet', label: 'Wallet', heroTitle: ['Lets Setup', 'your Business'], subtitle: 'Activate your Wallet' },
] as const;

export const TOTAL_STEPS = ONBOARDING_STEPS.length;

/**
 * Starter listings by type of business, so a new business is selling in minutes instead of inventing every product and service from nothing.
 *
 * A template is a list of the things businesses of that kind usually sell: a name, a short description, the right kind of listing (a fixed-price
 * service, a per-night booking, an appointment, an open-priced quote, a donation...) and a category. It deliberately carries NO prices: a price
 * invented for someone else's business would be wrong, so the owner types their own for each item they want, and only those are added.
 *
 * Listings made from a template are for the business's OWN pay links and store; they are not put on the marketplace (no photos yet, so they would
 * look bare there). The owner can switch that on later per listing.
 *
 * Pure data and rules (no network), shared by the web and mobile apps and tested on their own.
 */
import type { Product, ProductType } from '../services/product.service';

export interface TemplateItem {
    name: string;
    description?: string;
    product_type: ProductType;
    category?: string;
    /** Appointment services only: how long one booking takes. */
    duration_minutes?: number;
}

export interface BusinessTemplate {
    id: string;
    name: string;
    blurb: string;
    /** The onboarding industries this suits (so the right template is suggested first). */
    industries: string[];
    items: TemplateItem[];
}

const fixed = (name: string, category: string, description?: string): TemplateItem => ({ name, category, description, product_type: 'SERVICE_FIXED' });
const goods = (name: string, category: string, description?: string): TemplateItem => ({ name, category, description, product_type: 'PRODUCT' });
const quote = (name: string, category: string, description?: string): TemplateItem => ({ name, category, description, product_type: 'SERVICE_VARIABLE' });
const appt = (name: string, minutes: number, category: string, description?: string): TemplateItem => ({ name, category, description, product_type: 'SERVICE_APPOINTMENT', duration_minutes: minutes });
const give = (name: string, description?: string): TemplateItem => ({ name, category: 'Giving', description, product_type: 'DONATION' });

export const BUSINESS_TEMPLATES: BusinessTemplate[] = [
    {
        id: 'school', name: 'School or tuition centre', blurb: 'Fees, uniforms, transport and trips.', industries: ['Education'],
        items: [
            fixed('Tuition fee (per term)', 'School fees', 'Tuition for one term.'),
            fixed('Registration fee', 'School fees', 'One-off registration for a new learner.'),
            fixed('Application form', 'School fees'),
            fixed('Examination fee', 'School fees'),
            fixed('Transport (per term)', 'Transport', 'Bus service for one term.'),
            fixed('Lunch / canteen (per term)', 'Canteen'),
            goods('School uniform', 'Uniforms'),
            goods('Books and stationery pack', 'Books'),
            fixed('School trip', 'Trips'),
            fixed('PTA / development levy', 'Levies'),
        ],
    },
    {
        id: 'salon', name: 'Salon or barbershop', blurb: 'Bookable services with a time slot.', industries: ['Beauty'],
        items: [
            appt('Haircut', 45, 'Hair'),
            appt('Hair wash and blow-dry', 45, 'Hair'),
            appt('Braids', 180, 'Hair', 'Time depends on the style; set the length that fits most clients.'),
            appt('Weave installation', 120, 'Hair'),
            appt('Relaxer or treatment', 90, 'Hair'),
            appt('Manicure and pedicure', 60, 'Nails'),
            appt('Cut and shave', 45, 'Barber'),
            goods('Hair care product', 'Products'),
        ],
    },
    {
        id: 'florist', name: 'Florist or gift shop', blurb: 'Bouquets, boxes and event flowers.', industries: ['Retail', 'Entertainment'],
        items: [
            goods('Small bouquet', 'Bouquets'),
            goods('Medium bouquet', 'Bouquets'),
            goods('Large bouquet', 'Bouquets'),
            goods('Flower box', 'Boxes'),
            goods('Gift hamper', 'Gifts'),
            quote('Wedding or event flowers', 'Events', 'Priced per event after you agree what is needed.'),
            fixed('Delivery', 'Delivery'),
        ],
    },
    {
        id: 'restaurant', name: 'Restaurant, takeaway or bakery', blurb: 'Meals, drinks and cakes.', industries: ['Restaurant', 'Grocery'],
        items: [
            goods('Meal of the day', 'Meals'),
            goods('Chicken and chips', 'Meals'),
            goods('Burger', 'Meals'),
            goods('Pizza', 'Meals'),
            goods('Cold drink', 'Drinks'),
            goods('Whole cake', 'Bakery'),
            goods('Box of cupcakes', 'Bakery'),
            quote('Catering platter', 'Catering', 'Priced per order after you agree the numbers.'),
        ],
    },
    {
        id: 'clothing', name: 'Clothing and shoes', blurb: 'Fashion, footwear and accessories.', industries: ['Retail'],
        items: [
            goods('T-shirt', 'Clothing'),
            goods('Jeans', 'Clothing'),
            goods('Dress', 'Clothing'),
            goods('Sneakers', 'Shoes'),
            goods('Sandals', 'Shoes'),
            goods('Handbag', 'Accessories'),
            goods('Belt', 'Accessories'),
        ],
    },
    {
        id: 'phones', name: 'Phones and accessories', blurb: 'Handsets, chargers and repairs.', industries: ['Technology', 'Retail'],
        items: [
            goods('Phone case', 'Accessories'),
            goods('Screen protector', 'Accessories'),
            goods('Charger and cable', 'Accessories'),
            goods('Earphones', 'Accessories'),
            goods('Power bank', 'Accessories'),
            goods('Smartphone', 'Phones'),
            quote('Phone repair', 'Repairs', 'Priced after you see the fault.'),
        ],
    },
    {
        id: 'hardware', name: 'Hardware and building supplies', blurb: 'Cement, sand, roofing and delivery.', industries: ['Construction', 'Wholesale'],
        items: [
            goods('Cement (50 kg bag)', 'Cement'),
            goods('Building sand (per load)', 'Aggregates'),
            goods('Quarry stone (per load)', 'Aggregates'),
            goods('Roofing sheet', 'Roofing'),
            goods('Paint (20 litres)', 'Paint'),
            goods('Nails (per kg)', 'Fixings'),
            goods('PVC pipe', 'Plumbing'),
            quote('Delivery to site', 'Delivery', 'Priced by distance and load.'),
        ],
    },
    {
        id: 'professional', name: 'Consulting and professional services', blurb: 'Hourly work, projects and retainers.', industries: ['Professional Services', 'Real Estate', 'Technology'],
        items: [
            quote('Consultation (per hour)', 'Consulting'),
            quote('Project or assignment', 'Projects', 'Priced per project after you agree the scope.'),
            fixed('Monthly retainer', 'Retainers'),
            fixed('Report or audit fee', 'Reports'),
            fixed('Training workshop', 'Training'),
        ],
    },
    {
        id: 'repairs', name: 'Repairs and mechanic', blurb: 'Checks, services, labour and parts.', industries: ['Automotive'],
        items: [
            fixed('Diagnostic check', 'Services'),
            fixed('Full service', 'Services'),
            fixed('Wheel alignment', 'Services'),
            fixed('Tyre fitting', 'Services'),
            quote('Labour (per hour)', 'Labour'),
            quote('Parts (as quoted)', 'Parts', 'Priced per job once you know what is needed.'),
        ],
    },
    {
        id: 'giving', name: 'Church, NGO or community group', blurb: 'Donations, memberships and events.', industries: ['NGO'],
        items: [
            give('General donation', 'Any amount the giver chooses.'),
            give('Building fund'),
            give('Welfare fund'),
            fixed('Membership fee', 'Membership'),
            fixed('Event ticket', 'Events'),
        ],
    },
    {
        id: 'lodge', name: 'Lodge, guesthouse or hotel', blurb: 'Rooms by the night and meeting space by the day.', industries: ['Hotel'],
        items: [
            { name: 'Standard room (per night)', category: 'Rooms', product_type: 'SERVICE_BOOKING' },
            { name: 'Executive room (per night)', category: 'Rooms', product_type: 'SERVICE_BOOKING' },
            { name: 'Conference room (per day)', category: 'Meetings', product_type: 'SERVICE_BOOKING_DAILY' },
            goods('Breakfast', 'Food'),
            fixed('Airport transfer', 'Transport'),
        ],
    },
    {
        id: 'farm', name: 'Farm and agri-business', blurb: 'Produce, livestock and farm inputs.', industries: ['Agriculture'],
        items: [
            goods('Maize (50 kg bag)', 'Produce'),
            goods('Eggs (tray of 30)', 'Produce'),
            goods('Live chicken', 'Livestock'),
            goods('Vegetable box', 'Produce'),
            goods('Fertiliser (50 kg bag)', 'Inputs'),
            fixed('Farm visit', 'Visits'),
        ],
    },
];

/** Listings that need the owner's price before they can be sold (fixed price, per night or day, appointment). Quotes and donations don't: the amount is chosen at sale. */
export const needsPrice = (item: Pick<TemplateItem, 'product_type'>): boolean => item.product_type !== 'SERVICE_VARIABLE' && item.product_type !== 'DONATION';

/** The templates that suit these industries, best match first (a template matching more of them comes first), then the rest in their usual order. */
export function templatesForIndustries(industries: string[]): { template: BusinessTemplate; suggested: boolean }[] {
    const mine = new Set((industries || []).map((i) => i.trim().toLowerCase()));
    const score = (t: BusinessTemplate) => t.industries.filter((i) => mine.has(i.toLowerCase())).length;
    return BUSINESS_TEMPLATES
        .map((template, order) => ({ template, order, s: score(template) }))
        .sort((a, b) => b.s - a.s || a.order - b.order)
        .map(({ template, s }) => ({ template, suggested: s > 0 }));
}

/**
 * The listing to create for one template item, or null when it can't be made yet (it needs a price and none, or a bad one, was given).
 * Quotes and donations get no price. Never put on the marketplace (see the top of this file).
 */
export function productFromTemplate(item: TemplateItem, price?: number | string | null): Partial<Product> | null {
    let amount = 0;
    if (needsPrice(item)) {
        const n = typeof price === 'string' ? Number(price.trim()) : Number(price);
        if (!Number.isFinite(n) || n <= 0 || n > 10_000_000 || Math.abs(n * 100 - Math.round(n * 100)) > 1e-6) return null;
        amount = Math.round(n * 100) / 100;
    }
    return {
        name: item.name,
        description: item.description,
        price: amount,
        product_type: item.product_type,
        category: item.category,
        marketplace_listed: false,
        ...(item.product_type === 'SERVICE_APPOINTMENT' ? { appointment_config: { duration_minutes: item.duration_minutes ?? 60 } as any } : {}),
    };
}

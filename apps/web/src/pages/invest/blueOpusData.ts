/**
 * What the Blue Opus page shows besides the agreement: the benefits and the company's own projections.
 * Every number here is from Blue Opus's investor deck (Nov 2026). The projections are THE COMPANY'S forecasts (base case "Expected"), not results and not
 * guarantees, and the page says so next to every chart. Nothing between the points the deck gives is filled in.
 */
export const DECK_SOURCE = 'Blue Opus investor deck, November 2026';

/** The base case, in millions of kwacha, by calendar year (deck: cash flow forecast). */
export const PROJECTION_YEARS = [2027, 2028, 2029, 2030, 2031] as const;
export const REVENUE_EXPECTED = [3.0, 8.9, 14.0, 18.6, 22.7];
export const EBITDA_EXPECTED = [0.9, 6.6, 11.6, 16.0, 20.0];

/** Year-5 revenue under the deck's three scenarios, in millions of kwacha. */
export const YEAR5_SCENARIOS = [
    { id: 'conservative', label: 'Conservative', revenue: 6.2, color: '#8A94A6' },
    { id: 'expected', label: 'Expected', revenue: 22.7, color: '#0B57D0' },
    { id: 'high', label: 'High growth', revenue: 66.4, color: '#137333' },
] as const;

export interface Benefit { title: string; text: string; stat?: string }
export const BENEFITS: Benefit[] = [
    { title: 'A share of the dividends', stat: 'In proportion to your share', text: 'Blue Opus expects to be generating cash from 2028 and intends to share dividends with shareholders. Dividends are decided by the board and are not promised.' },
    { title: 'A way to cash out', stat: 'Buyback option', text: 'The company may offer to buy your shares back for cash at its value at that time, so your return does not depend on a stock market listing.' },
    { title: 'Early-stage ownership', stat: 'Fixed at signing', text: 'Your percentage is set when you sign and becomes yours once Blue Opus accepts and you pay. Later share issues can reduce it, but you are in before the company scales across industries and countries.' },
    { title: 'Already live and earning', stat: 'K2M+ in 6 months', text: 'Schools and businesses are already using Master-Fees and MoneyWise: over K2 million processed in the first six months, with net income above K70,000.' },
    { title: 'Strong unit economics', stat: 'LTV/CAC 62 to 68x', text: 'The deck shows each product paying back what it costs to win a customer in under three months, against a usual target of 3x.' },
    { title: 'A network that grows on its own', stat: '1.5% of school fees', text: 'Free tools bring schools and businesses in, and the company earns a small share of every transaction that flows through the network.' },
];

/** Where the base case is expected to be by the end of 2031. */
export const GROWTH_2031 = [
    { label: 'Schools on Master-Fees', value: 357 },
    { label: 'Businesses on MoneyWise', value: 1048 },
    { label: 'Teachers on Project Genius', value: 659 },
];

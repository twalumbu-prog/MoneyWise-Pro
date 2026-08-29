import { isToday, isThisWeek, isThisMonth, isThisQuarter } from 'date-fns';

export function calculateBuckets(items: any[]) {
    const buckets = { today: 0, week: 0, month: 0, quarter: 0, year: 0 };
    
    items.forEach(item => {
        const d = item.date ? new Date(item.date) : new Date();
        const amt = Number(item.amount) || 0;
        
        if (isToday(d)) {
            buckets.today += amt;
        } else if (isThisWeek(d)) {
            buckets.week += amt;
        } else if (isThisMonth(d)) {
            buckets.month += amt;
        } else if (isThisQuarter(d)) {
            buckets.quarter += amt;
        } else {
            // Anything older (YTD or even older)
            buckets.year += amt;
        }
    });
    
    return buckets;
}

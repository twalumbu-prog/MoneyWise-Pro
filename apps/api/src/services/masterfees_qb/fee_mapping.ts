/**
 * Which QuickBooks Item a Master Fees fee should be invoiced against.
 *
 * Not invented: these mappings are what the school itself used on the 443
 * invoices its own Term 2 reconciliation created (lunch -> CANTEEN SERVICES,
 * transport -> Transport (MasterFees), tuition -> the per-grade Tuition item).
 * Deriving them from precedent keeps new invoices landing in the same income
 * accounts the existing ones do, so the P&L stays consistent.
 */

export function normText(s: string | null | undefined): string {
    return (s || '')
        .toUpperCase()
        .replace(/(\d+)(ST|ND|RD|TH)\b/g, '$1')
        .replace(/[^A-Z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

export type FeeFamily = 'LUNCH' | 'TRANSPORT' | 'UNIFORM' | 'TOUR' | 'ADMIN' | 'EXAM' | 'TUITION' | 'OTHER';

export function feeFamily(description: string, category: string): FeeFamily {
    const d = normText(description) + ' ' + normText(category);
    if (/LUNCH|CANTEEN|MEAL/.test(d)) return 'LUNCH';
    // Route codes (KAT07, CMB05, PTC02, CHS04) and "Local/Long Routes" are transport.
    if (/BUS|TRANSPORT|BETWEEN|DROP OFF|ZONE|ROUTES?|KAT\d|CMB\d|PTC\d|CHS\d/.test(d)) return 'TRANSPORT';
    if (/UNIFORM/.test(d)) return 'UNIFORM';
    if (/TOUR|TRIP|EXCURSION/.test(d)) return 'TOUR';
    if (/APPLICATION|ADMISSION|ENROL|REGISTRATION/.test(d)) return 'ADMIN';
    if (/EXAM|TEST/.test(d)) return 'EXAM';
    if (/TUITION|PRIMARY PHASE|ACADEMIC|GRADE|RECEPTION|MIDDLE CLASS|BABY/.test(d)) return 'TUITION';
    return 'OTHER';
}

/** Grade key used to pick the per-grade tuition item. */
export function gradeKey(description: string, studentGrade: string): string {
    const t = normText(description) + ' ' + normText(studentGrade);
    const m = t.match(/GRADE\s*(\d+)/);
    if (m) return m[1];
    if (/RECEPTION/.test(t)) return 'RECEPTION';
    if (/MIDDLE/.test(t)) return 'MIDDLE';
    if (/BABY/.test(t)) return 'BABY';
    return 'UNKNOWN';
}

const FAMILY_ITEM: Record<string, string> = {
    LUNCH: 'CANTEEN SERVICES',
    TRANSPORT: 'Transport (MasterFees)',
    ADMIN: 'Enrolment and Admin income:Application forms',
    TOUR: 'Educational Tour',
    UNIFORM: 'School Uniforms',
    EXAM: 'Enrolment and Admin income:Application forms',
};

const TUITION_ITEM_BY_GRADE: Record<string, string> = {
    '1': 'Tuition:Grade 1A',
    '2': 'Tuition:Grade 2A',
    '3': 'Tuition:Grade 3A',
    '4': 'Tuition:Grade 4A',
    '5': 'Tuition:Grade 5A',
    '6': 'Tuition:Grade 6A',
    '7': 'Tuition:Grade 7A',
    BABY: 'Tuition:Baby Class',
    MIDDLE: 'Tuition:Middle Class A',
    RECEPTION: 'Tuition:Reception',
};

export interface ItemChoice { itemName: string | null; family: FeeFamily; basis: string; }

export function chooseQbItem(description: string, category: string, studentGrade: string): ItemChoice {
    const family = feeFamily(description, category);
    if (family === 'TUITION') {
        const g = gradeKey(description, studentGrade);
        const item = TUITION_ITEM_BY_GRADE[g];
        return item
            ? { itemName: item, family, basis: `Tuition, grade resolved as "${g}"` }
            : { itemName: null, family, basis: `Tuition but grade could not be resolved from "${description}" / "${studentGrade}"` };
    }
    const item = FAMILY_ITEM[family];
    return item
        ? { itemName: item, family, basis: `${family} fee, mapped as in the school's own Term 2 reconciliation` }
        : { itemName: null, family, basis: `Could not classify "${description}" (category "${category}")` };
}

/** Resolve a mapped item NAME to a QuickBooks Item id, tolerant of the
 *  "Parent:Child" fully-qualified form vs the bare child name. */
export function resolveItemId(
    itemName: string,
    items: Array<{ id: string; name: string; fullyQualifiedName: string; active: boolean }>,
): string | null {
    const want = itemName.toUpperCase();
    const exactFq = items.find(i => i.fullyQualifiedName.toUpperCase() === want);
    if (exactFq) return exactFq.id;
    const exactName = items.find(i => i.name.toUpperCase() === want);
    if (exactName) return exactName.id;
    // "Tuition:Grade 4A" -> match on the leaf when the parent differs
    const leaf = want.includes(':') ? want.split(':').pop()!.trim() : want;
    const byLeaf = items.filter(i => i.name.toUpperCase() === leaf);
    if (byLeaf.length === 1) return byLeaf[0].id;
    return null;
}

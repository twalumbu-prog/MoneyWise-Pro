/**
 * Which QuickBooks customer a Master Fees student is.
 *
 * The map (masterfees_qb_customer_map, keyed on student_id) always wins. Name matching is only the fallback for students not in it, and it may not hand a student a
 * customer that is already mapped to a DIFFERENT student: that is how two children with one name ended up on one account.
 */
import { matchStudentName, NameCandidate } from './name_match';

export interface MappedCustomer { id: string; name: string }
export interface CustomerMap { byStudent: Map<string, MappedCustomer>; studentsByCustomer: Map<string, Set<string>> }

export function buildCustomerMap(rows: Array<{ student_id: string; qb_customer_id: string; qb_customer_name?: string | null }>): CustomerMap {
    const byStudent = new Map<string, MappedCustomer>(); const studentsByCustomer = new Map<string, Set<string>>();
    for (const r of rows) {
        const id = String(r.qb_customer_id);
        byStudent.set(String(r.student_id), { id, name: r.qb_customer_name || '' });
        (studentsByCustomer.get(id) ?? studentsByCustomer.set(id, new Set()).get(id)!).add(String(r.student_id));
    }
    return { byStudent, studentsByCustomer };
}

export function resolveStudentCustomer(studentId: string | null | undefined, studentName: string, roster: NameCandidate[], map: CustomerMap): ReturnType<typeof matchStudentName> {
    const sid = studentId ? String(studentId) : '';
    const mapped = sid ? map.byStudent.get(sid) : undefined;
    if (mapped) return { tier: 'EXACT', match: { id: mapped.id, name: mapped.name }, detail: `Mapped student to QuickBooks customer "${mapped.name}".` } as ReturnType<typeof matchStudentName>;
    const m = matchStudentName(studentName, roster);
    const owners = m.match ? map.studentsByCustomer.get(String(m.match.id)) : undefined;
    if ((m.tier === 'EXACT' || m.tier === 'CONTAINED') && owners && owners.size > 0 && !(sid && owners.has(sid))) {
        return { ...m, tier: 'AMBIGUOUS', detail: `"${studentName}" matches QuickBooks customer "${m.match!.name}", but that customer already belongs to a different student — needs a person (same name, different child?)` } as ReturnType<typeof matchStudentName>;
    }
    return m;
}

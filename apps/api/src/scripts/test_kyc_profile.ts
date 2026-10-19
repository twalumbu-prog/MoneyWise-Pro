/** KYC profile service test: save/get round-trip, completeness, path safety. Uses a throwaway storage folder; applies to no company. */
import 'dotenv/config';
import { supabase } from '../lib/supabase';
import { investorAccountService as svc, KYC_BUCKET } from '../services/investorAccount.service';

const results: boolean[] = [];
const must = (c: any, m: string) => { if (!c) throw new Error(m); };
async function step(name: string, fn: () => Promise<void>) {
    try { await fn(); results.push(true); console.log('PASS ', name); } catch (e: any) { results.push(false); console.log('FAIL ', name, '—', e.message); }
}
async function main() {
    const uid = crypto.randomUUID();
    const paths = ['id_front', 'id_back', 'photo', 'proof_of_residence'].map((k) => `${uid}/kyc-profile/${k}.png`);
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
    for (const p of paths) await supabase.storage.from(KYC_BUCKET).upload(p, png, { contentType: 'image/png', upsert: true });
    const applicant: any = { first_name: 'Test', last_name: 'Person', date_of_birth: '1990-05-01', gender: 'MALE', nationality: 'Zambian', email: 'test@example.com', phone: '+260971234567', physical_address: '1 Test Rd', id_number: '123456/10/1', source_of_income: 'Salary', occupation: 'Engineer', bank_name: 'Zanaco', bank_account_number: '1234567890', bank_account_name: 'TEST PERSON', nok_full_name: 'Next Kin', nok_id_number: '654321/10/1', nok_date_of_birth: '1992-02-02', nok_phone: '+260961234567', nok_relationship: 'Spouse' };
    const documents = { id_front: paths[0], id_back: paths[1], photo: paths[2], proof_of_residence: paths[3] };
    try {
        await step('no profile yet → exists=false', async () => { const p = await svc.getKycProfile(uid); must(!p.exists && !p.complete, 'expected empty'); });
        await step('partial save is kept but reported incomplete with reasons', async () => {
            const p = await svc.saveKycProfile(uid, { applicant: { first_name: 'Test' }, idType: 'NRC', documents: {} });
            must(p.exists && !p.complete && p.missing.length > 3, 'expected incomplete'); must(p.applicant?.first_name === 'Test', 'name lost');
        });
        await step('full save → complete, documents + preview urls returned', async () => {
            const p = await svc.saveKycProfile(uid, { applicant, idType: 'NRC', documents });
            must(p.complete, `should be complete, missing: ${p.missing.join('; ')}`);
            must(Object.keys(p.documents).length === 4 && !!p.documentUrls.photo, 'documents/urls missing');
        });
        await step('saving again updates in place (one row per person)', async () => {
            await svc.saveKycProfile(uid, { applicant: { ...applicant, occupation: 'Doctor' }, idType: 'NRC', documents });
            const { data } = await supabase.from('investor_kyc_profiles').select('user_id').eq('user_id', uid);
            must(data?.length === 1, 'duplicate rows'); must((await svc.getKycProfile(uid)).applicant?.occupation === 'Doctor', 'not updated');
        });
        await step("another user's file path is refused", async () => {
            let threw = false;
            try { await svc.saveKycProfile(uid, { applicant, idType: 'NRC', documents: { ...documents, photo: `${crypto.randomUUID()}/x.png` } }); } catch { threw = true; }
            must(threw, 'should refuse');
        });
        await step('one-click refuses when the profile is incomplete', async () => {
            await svc.saveKycProfile(uid, { applicant: { ...applicant, bank_name: '' }, idType: 'NRC', documents });
            let code = '';
            try { await svc.applyWithProfile({ investorOrgId: crypto.randomUUID(), userId: uid, targetId: crypto.randomUUID(), declaration: true }); } catch (e: any) { code = e.code; }
            must(code === 'PROFILE_INCOMPLETE', `expected PROFILE_INCOMPLETE, got ${code}`);
        });
    } finally {
        await supabase.from('investor_kyc_profiles').delete().eq('user_id', uid);
        await supabase.storage.from(KYC_BUCKET).remove(paths);
    }
    const bad = results.filter((r) => !r).length;
    console.log(`${results.length - bad}/${results.length} passed`);
    process.exit(bad ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });

import { ledgerService } from '../services/ledger.service';

/**
 * One-off backfill for the "batch payout posts every line item to every entry"
 * bug in ledgerService.repostForCashbookEntry (apps/api/src/services/ledger.service.ts).
 *
 * For requisitions with multiple cashbook_entries (e.g. batch payroll — one row
 * per recipient), the contra leg summed ALL of the requisition's line items into
 * EVERY entry instead of scoping to the one line item that entry actually pays,
 * producing enormous residuals dumped into QB-SUSPENSE. Fixed by using
 * disbursements.line_item_id (keyed by external_reference == the entry's
 * reference_number) to scope the contra to just that entry's line item when such
 * a link exists.
 *
 * This is the exact set of requisitions confirmed via SQL to be fully classified
 * (every line item has account_id set) yet still posted against QB-SUSPENSE:
 *
 *   SELECT DISTINCT ce.requisition_id, ce.organization_id
 *   FROM cashbook_entries ce
 *   JOIN journal_entries je ON je.source_type = 'CASHBOOK' AND je.source_id = ce.id
 *   JOIN journal_lines jl ON jl.journal_entry_id = je.id
 *   JOIN accounts susp ON susp.organization_id = ce.organization_id AND susp.code = 'QB-SUSPENSE'
 *   WHERE jl.account_id = susp.id AND ce.requisition_id IS NOT NULL
 *     AND (SELECT COUNT(*) FROM line_items li WHERE li.requisition_id = ce.requisition_id) =
 *         (SELECT COUNT(*) FROM line_items li WHERE li.requisition_id = ce.requisition_id AND li.account_id IS NOT NULL);
 *
 * 42 requisitions, all in orgs e359c84e-... and fa99669d-... (captured 2026-09-14).
 */
const AFFECTED_REQUISITION_IDS: string[] = [
    '0495e9c0-ff43-4a21-a673-a77d2e1de3f7',
    '107405e6-f349-44c4-a56d-d77f615d6860',
    '112a77b6-f76f-4d9a-9e8d-98fd3671dc8d',
    '132cc514-3972-4c5d-a26e-19afc1a5512a',
    '1e3ee504-1313-45f8-8b60-5a85e5e8ab68',
    '25e2afcc-38d7-4035-9192-1e9e5024edc4',
    '2d79f482-1730-4937-ad16-a4f2307af714',
    '38513996-df7c-4f6b-9ebf-a9db4c0ef0c7',
    '3de403ef-05a7-4efc-a7ce-61b79468d461',
    '447c8e56-e902-4054-983e-ea3d30038397',
    '5310ce20-2a00-45f3-97f8-2e12c2190974',
    '53bc7e0d-762a-4e6b-a639-38fe87874ef3',
    '547ab7fe-be34-4210-a327-f34f2b750fdf',
    '5c41fb59-b4ad-4027-b78c-9e8b286b6594',
    '61405890-5771-4d69-8ece-c092c1388506',
    '73cb9d5c-edbc-46e2-b31d-eb046425e28c',
    '774d4025-d015-4391-bebc-0a009eb8fa33',
    '7cdcce2a-44d5-450c-bd55-bfdbae8289d6',
    '7dd79704-5564-4a16-bd47-e29a566a643e',
    '838f3acc-30af-438d-8da2-20effe2dd21b',
    '84375f29-a555-44a1-ac5b-18a24d716cf8',
    '8777774d-4286-4e7f-9565-b69403a3f499',
    '8786a055-d48f-4572-9553-7ab67db908ff',
    '8880575f-9d20-45a2-9a48-72295c180941',
    '8eab92f4-3ead-40e4-859c-351eb08c6838',
    '9a657c3e-3146-40e1-a030-baad64a88bac',
    '9bea3bac-2e5f-4df2-9cf6-ce2cc3a167ff',
    'a2aa4083-63ba-4b43-bbe1-4aa604b6c8d5',
    'abe95d76-b890-4884-be7d-6048796ed453',
    'af202de3-b5bf-49f6-b642-8b3bfa181fe8',
    'aff7c61b-d617-4f15-af0d-1b2af001f947',
    'b4332046-e8e5-4674-9f84-9a9b5e0dea1a',
    'c32fa343-f51e-4885-88c6-b84f52b20212',
    'cdbb23ac-6fe1-4b00-b598-27fee81858d3',
    'd3a68129-21c6-42e0-8e9e-e5fed7490613',
    'da71773c-4371-48b8-afcd-4c3306631eba',
    'db7e5d05-e328-401a-a398-ee4c9a2a3ae0',
    'dbe8ca3b-0148-4a11-b9e2-0418e7e3815f',
    'dc1a6c00-d9fb-4eec-945c-5ad6d27cdfac',
    'f4f7223e-ec55-4302-8fd0-d4cc72014e53',
    'f5290c60-5816-45a8-9787-f4a404ed8e67',
    'fab8e582-0075-4b0d-acdb-8b077a3a523a',
];

async function main() {
    console.log(`[Backfill] Re-posting ${AFFECTED_REQUISITION_IDS.length} requisitions with the corrected per-entry line-item scoping...`);

    let done = 0;
    let failed = 0;
    for (const requisitionId of AFFECTED_REQUISITION_IDS) {
        try {
            await ledgerService.repostForRequisition(requisitionId);
        } catch (err: any) {
            failed++;
            console.error(`  [FAIL] requisition ${requisitionId}: ${err?.message}`);
        }
        if (++done % 10 === 0) console.log(`  ...${done}/${AFFECTED_REQUISITION_IDS.length}`);
    }
    console.log(`[Backfill] Done. ${done - failed} succeeded, ${failed} failed.`);
    process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => { console.error(err); process.exit(1); });

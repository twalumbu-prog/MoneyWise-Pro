import { ledgerService } from '../services/ledger.service';

/**
 * One-off backfill for the third round of "classification wrote line_items.account_id
 * but nothing reposted the GL" gaps, found in apps/api/src/controllers/requisition.controller.ts
 * (triggerAIReview — both the PAYROLL BYPASS branch and the standard AI classification
 * loop, plus triggerEarlyClassification, plus approveCategorization) and
 * apps/api/src/controllers/accounting.controller.ts (postVoucher). All four now call
 * ledgerService.repostForRequisition after writing account_id/qb_account_id.
 *
 * This is the exact set of requisitions confirmed via SQL to be classified (every
 * line item with account_id set has one) yet still posted against QB-SUSPENSE, as of
 * this backfill:
 *
 *   SELECT DISTINCT ce.requisition_id, ce.organization_id
 *   FROM cashbook_entries ce
 *   JOIN journal_entries je ON je.source_type = 'CASHBOOK' AND je.source_id = ce.id
 *   JOIN journal_lines jl ON jl.journal_entry_id = je.id
 *   JOIN accounts susp ON susp.organization_id = ce.organization_id AND susp.code = 'QB-SUSPENSE'
 *   WHERE jl.account_id = susp.id AND ce.requisition_id IS NOT NULL
 *     AND EXISTS (SELECT 1 FROM line_items li WHERE li.requisition_id = ce.requisition_id AND li.account_id IS NOT NULL);
 *
 * 78 requisitions across 3 orgs — Twalumbu Education Centre, Blue Opus Software,
 * Lubangi Technology Consulting (captured 2026-09-14). Overlaps with the two earlier
 * backfills wherever those root causes left a requisition only partially repaired
 * (e.g. it was fixed for the earlier bug but a *later* AI reclassification, through
 * one of these newly-fixed checkpoints, put it back in Suspense) — repost is
 * idempotent, so re-running it here is safe.
 */
const AFFECTED_REQUISITION_IDS: string[] = [
    '0495e9c0-ff43-4a21-a673-a77d2e1de3f7',
    '0e043256-9a23-431f-ac87-18e82bb27071',
    '100e8b78-24da-44e4-bea0-c74ca34de12c',
    '107405e6-f349-44c4-a56d-d77f615d6860',
    '10dddf88-cf1b-43a7-9c8c-c7439508e3b2',
    '112a77b6-f76f-4d9a-9e8d-98fd3671dc8d',
    '132cc514-3972-4c5d-a26e-19afc1a5512a',
    '15861e52-7597-4d73-99b1-30b259a69852',
    '1bad45c0-80e9-4ab1-b90f-1b40bc554c97',
    '1e3ee504-1313-45f8-8b60-5a85e5e8ab68',
    '25e2afcc-38d7-4035-9192-1e9e5024edc4',
    '2d79f482-1730-4937-ad16-a4f2307af714',
    '3819ae23-f061-4ea1-9413-59d82512646e',
    '38513996-df7c-4f6b-9ebf-a9db4c0ef0c7',
    '3de403ef-05a7-4efc-a7ce-61b79468d461',
    '447c8e56-e902-4054-983e-ea3d30038397',
    '456cd4e8-f48d-42ff-b77f-dc8ba391e08d',
    '45aa1360-df23-49f2-9f29-a644cbde222a',
    '4aad4b68-d497-4947-97ec-17adc038bed5',
    '5310ce20-2a00-45f3-97f8-2e12c2190974',
    '53bc7e0d-762a-4e6b-a639-38fe87874ef3',
    '547ab7fe-be34-4210-a327-f34f2b750fdf',
    '5c41fb59-b4ad-4027-b78c-9e8b286b6594',
    '61405890-5771-4d69-8ece-c092c1388506',
    '65cd8484-5415-44bb-9311-035c5487e133',
    '66764568-2efc-4f2e-8fcb-f847851f0ea0',
    '6855d352-637f-403d-887a-322ae7f53adf',
    '699ec676-2696-453f-83eb-b0d22a76b3bb',
    '69be41f7-1f50-44be-b0af-b3bfd5f61f50',
    '6a8264fb-31c1-435c-b2d7-047e42219ec6',
    '6fef54e2-e279-48f4-9c04-e78a2d3eb6e5',
    '739fe925-f913-49b3-affb-2a7b4c3f996d',
    '73cb9d5c-edbc-46e2-b31d-eb046425e28c',
    '74d2d95a-18cc-443f-9622-8a785db88efc',
    '754720a2-15c2-4867-8018-ab834100b079',
    '774d4025-d015-4391-bebc-0a009eb8fa33',
    '7cdcce2a-44d5-450c-bd55-bfdbae8289d6',
    '7dd79704-5564-4a16-bd47-e29a566a643e',
    '7e96f533-df50-473f-b902-baa1fdea0114',
    '838f3acc-30af-438d-8da2-20effe2dd21b',
    '83f7b765-78b3-4bef-921e-b34170738b01',
    '84375f29-a555-44a1-ac5b-18a24d716cf8',
    '8777774d-4286-4e7f-9565-b69403a3f499',
    '8786a055-d48f-4572-9553-7ab67db908ff',
    '8880575f-9d20-45a2-9a48-72295c180941',
    '8eab92f4-3ead-40e4-859c-351eb08c6838',
    '94805da8-9781-4891-a3bd-fb37ee1b0ea4',
    '9a5bb89c-b0da-418c-ae3f-df8362bf47fe',
    '9a657c3e-3146-40e1-a030-baad64a88bac',
    '9bea3bac-2e5f-4df2-9cf6-ce2cc3a167ff',
    '9ef65b7f-fbdb-4b77-9bba-0d852f1ab628',
    'a2aa4083-63ba-4b43-bbe1-4aa604b6c8d5',
    'a83d1450-7a84-4bc4-be53-52784bdcd105',
    'abe95d76-b890-4884-be7d-6048796ed453',
    'ac595a6c-bf56-4244-86c7-25043fcfc6de',
    'af202de3-b5bf-49f6-b642-8b3bfa181fe8',
    'aff7c61b-d617-4f15-af0d-1b2af001f947',
    'b4332046-e8e5-4674-9f84-9a9b5e0dea1a',
    'b77d3bb7-f37b-4596-a189-3bb3805cdf02',
    'b8b33985-f46e-4ed4-bed4-10bcbeb16b36',
    'bd093270-0001-4806-ad24-5f8ea8c56f96',
    'c32fa343-f51e-4885-88c6-b84f52b20212',
    'cb247624-0062-48b2-a23f-46c127d7582a',
    'cdbb23ac-6fe1-4b00-b598-27fee81858d3',
    'd0bb4cf4-91b3-4119-b7c1-7ab3a28b01eb',
    'd34aa547-cf34-4525-9d4f-601a49618665',
    'd3a68129-21c6-42e0-8e9e-e5fed7490613',
    'da71773c-4371-48b8-afcd-4c3306631eba',
    'db7e5d05-e328-401a-a398-ee4c9a2a3ae0',
    'dbe8ca3b-0148-4a11-b9e2-0418e7e3815f',
    'dc1a6c00-d9fb-4eec-945c-5ad6d27cdfac',
    'dec16780-9a65-474d-a396-2b7bc2264935',
    'f4140a34-214e-4289-bc12-860d6503694b',
    'f4f7223e-ec55-4302-8fd0-d4cc72014e53',
    'f5290c60-5816-45a8-9787-f4a404ed8e67',
    'f6cb9bbe-9b9a-4b07-9386-3ed8830e4ebd',
    'f78b1fb9-d595-4382-8bea-846bfbec84e7',
    'fab8e582-0075-4b0d-acdb-8b077a3a523a',
];

async function main() {
    console.log(`[Backfill] Re-posting ${AFFECTED_REQUISITION_IDS.length} requisitions...`);

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

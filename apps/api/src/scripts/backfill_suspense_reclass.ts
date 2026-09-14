import { supabase } from '../lib/supabase';
import { ledgerService } from '../services/ledger.service';

/**
 * One-off backfill for the "inline classification didn't repost the GL" bug
 * (apps/api/src/controllers/requisition.controller.ts updateLineItemAccount,
 * fixed alongside this script — it now calls ledgerService.repostForRequisition
 * after saving line_items.account_id).
 *
 * This list is the exact set of requisitions confirmed via SQL to have a
 * journal entry still posted against QB-SUSPENSE despite their line_items
 * already carrying a resolved account_id:
 *
 *   SELECT DISTINCT ce.requisition_id, ce.organization_id
 *   FROM cashbook_entries ce
 *   JOIN journal_entries je ON je.source_type = 'CASHBOOK' AND je.source_id = ce.id
 *   JOIN journal_lines jl ON jl.journal_entry_id = je.id
 *   JOIN accounts susp ON susp.organization_id = ce.organization_id AND susp.code = 'QB-SUSPENSE'
 *   WHERE jl.account_id = susp.id
 *     AND ce.requisition_id IS NOT NULL
 *     AND EXISTS (
 *       SELECT 1 FROM line_items li
 *       WHERE li.requisition_id = ce.requisition_id AND li.account_id IS NOT NULL
 *     );
 *
 * 219 requisitions across 6 orgs (captured 2026-09-14).
 */
const AFFECTED_REQUISITION_IDS: string[] = [
    '02a4d95d-e17f-4cc1-bc05-76452c87ec58',
    '0495e9c0-ff43-4a21-a673-a77d2e1de3f7',
    '055b648a-3a09-4d9d-8aa6-04909cb6c48e',
    '05a6347a-24b1-4b7c-ba91-acba3f8cbf35',
    '06cdf361-e7c1-404f-a00c-460e27ccfe9b',
    '098588b5-102e-48ed-bfe7-9214b23a1f1a',
    '0a036594-2dfc-47f1-b04e-bfff4bb6e347',
    '0a5dd1bd-5560-4691-a1fb-ffe83dbfa85e',
    '0e043256-9a23-431f-ac87-18e82bb27071',
    '0ea1d9b7-c199-48c9-9a1b-95b805142753',
    '0ebd1af3-70aa-461d-b4a2-981347907fb0',
    '0f01d05e-fc62-47e9-956f-5703c1d5cfae',
    '0f9b4c4b-593c-40e4-b2ad-d7054514dbf0',
    '100e8b78-24da-44e4-bea0-c74ca34de12c',
    '107405e6-f349-44c4-a56d-d77f615d6860',
    '10dddf88-cf1b-43a7-9c8c-c7439508e3b2',
    '112a77b6-f76f-4d9a-9e8d-98fd3671dc8d',
    '114c5913-0284-420c-8dff-3bfe5322e347',
    '132cc514-3972-4c5d-a26e-19afc1a5512a',
    '15861e52-7597-4d73-99b1-30b259a69852',
    '1aaac6a9-efa6-48a8-aec6-668365a9ddc2',
    '1bad45c0-80e9-4ab1-b90f-1b40bc554c97',
    '1e3ee504-1313-45f8-8b60-5a85e5e8ab68',
    '206a10c8-028c-4aa5-93c2-dce2461abeae',
    '2212827b-056c-4bc7-8fb0-1a335da6dd00',
    '251c0b72-c3db-4f47-917b-263c915b3eb5',
    '254048cd-3a87-4ece-a521-ac290363055a',
    '25e2afcc-38d7-4035-9192-1e9e5024edc4',
    '2627eec6-fa17-4a50-89d0-55b2268ccc08',
    '26913ca6-df65-4f6e-b492-e6bb141eba69',
    '29fb570c-62ea-4f31-9675-2ab1786747a2',
    '2a60ccee-487d-4ea5-99db-ba726c18a99e',
    '2c26d52e-0d0c-40d2-a33d-00b2cc8ec156',
    '2d5a3f55-175b-4bbb-86fa-89a54999c708',
    '2d79f482-1730-4937-ad16-a4f2307af714',
    '2e6c86ce-3634-48d7-bf35-d6906ddfe023',
    '2ee48c6e-7bb0-48d9-a5e3-ea60869f0b86',
    '32757d44-9c83-4921-8402-c481fa67c1e8',
    '3620c044-0fb5-47b9-9732-af95d323eb9d',
    '3819ae23-f061-4ea1-9413-59d82512646e',
    '38513996-df7c-4f6b-9ebf-a9db4c0ef0c7',
    '39054674-9fe6-4df4-9791-433fcabc19e3',
    '3b635c06-b991-419e-8bda-e573e0e81f48',
    '3de403ef-05a7-4efc-a7ce-61b79468d461',
    '40ba3205-617e-457e-93d0-d5c7fa3b55fb',
    '414f472a-27c5-4cee-a8e5-5fd53b9bbbf5',
    '427fafc6-f351-49b0-9601-78cda6d17d6b',
    '438ae67b-7116-4d6f-a502-b70414c70f28',
    '447c8e56-e902-4054-983e-ea3d30038397',
    '44e98da4-9306-42ef-9d79-d259039136b9',
    '456cd4e8-f48d-42ff-b77f-dc8ba391e08d',
    '45cc754c-3470-4d8b-89cb-356909172123',
    '47307577-60a6-4b15-843b-301c942406e0',
    '4731592a-2350-4d07-9e3a-621561e479af',
    '478fefa8-5359-4d81-aedf-5b99d4deb47c',
    '4aad4b68-d497-4947-97ec-17adc038bed5',
    '4bb3e8df-afe1-4858-b774-fac901d24288',
    '4d58a0bc-93b8-423f-93e7-cf05c86e517c',
    '4ef05f2c-f753-47eb-8e6e-5d2ac0aff387',
    '524e4690-1239-411d-a89d-0f146b0bf431',
    '5310ce20-2a00-45f3-97f8-2e12c2190974',
    '53bc7e0d-762a-4e6b-a639-38fe87874ef3',
    '547ab7fe-be34-4210-a327-f34f2b750fdf',
    '550f975d-82ad-4414-adbd-234fbadd8a74',
    '588df3f8-4ca0-495a-ad76-eb151b10f8ac',
    '5afb0746-af80-4654-b8d7-5f05c26c0ed6',
    '5b14c900-bccb-4acd-a985-15c5c9a7274f',
    '5b1b2451-3e57-467a-9888-bc31755868ba',
    '5b46e13e-00cd-449f-8382-055484619cd8',
    '5c41fb59-b4ad-4027-b78c-9e8b286b6594',
    '5e0a890f-a011-46b8-836d-67c601f80893',
    '602194d6-0c1f-43b5-95ac-539a39a46f26',
    '6063320b-8ff5-4750-95db-31b6d9cc9571',
    '613b534f-cec4-4972-9401-731824fbd034',
    '61405890-5771-4d69-8ece-c092c1388506',
    '63585995-1176-4ae2-9088-555362b8cf55',
    '64b5779d-eec0-43af-a8d8-f569e438ef24',
    '650374ea-7185-4622-8812-b7d6cb24c355',
    '6542b382-b09b-43e1-a223-f6ccc1c7c01d',
    '65cd8484-5415-44bb-9311-035c5487e133',
    '66764568-2efc-4f2e-8fcb-f847851f0ea0',
    '677e5c87-ae16-4d72-ad3a-423b2971b76a',
    '6855d352-637f-403d-887a-322ae7f53adf',
    '699ec676-2696-453f-83eb-b0d22a76b3bb',
    '69be41f7-1f50-44be-b0af-b3bfd5f61f50',
    '6d28f98f-abeb-4fc1-825f-30eb4cb8ed49',
    '6d6b7b85-936b-41d9-93f5-c0bdfb980722',
    '6fef54e2-e279-48f4-9c04-e78a2d3eb6e5',
    '72500648-42a2-4964-8214-c730468479e2',
    '739fe925-f913-49b3-affb-2a7b4c3f996d',
    '73c701de-91b0-42bc-8529-76b61923ddea',
    '73cb9d5c-edbc-46e2-b31d-eb046425e28c',
    '74d2d95a-18cc-443f-9622-8a785db88efc',
    '754720a2-15c2-4867-8018-ab834100b079',
    '774d4025-d015-4391-bebc-0a009eb8fa33',
    '775c839f-40fb-41f4-a9e3-5f7943b3858c',
    '777ccf00-32b6-40bd-8077-99cd44cdbcf5',
    '7cdcce2a-44d5-450c-bd55-bfdbae8289d6',
    '7db2a026-010c-4607-8391-d4cdc01aa0b6',
    '7dd79704-5564-4a16-bd47-e29a566a643e',
    '7e96f533-df50-473f-b902-baa1fdea0114',
    '8382e5e5-c145-4bc3-bfb6-1a6ea743d5ad',
    '838f3acc-30af-438d-8da2-20effe2dd21b',
    '83f7b765-78b3-4bef-921e-b34170738b01',
    '84375f29-a555-44a1-ac5b-18a24d716cf8',
    '8777774d-4286-4e7f-9565-b69403a3f499',
    '8786a055-d48f-4572-9553-7ab67db908ff',
    '878f1abe-ceff-4687-a48a-13511a8e1c4b',
    '87e1da74-b3ee-49a0-8184-838cd2f41694',
    '88400c7e-5230-4434-9dbf-237c71e1feff',
    '88791b33-2c54-4a56-a247-f5ec867ba9cb',
    '8880575f-9d20-45a2-9a48-72295c180941',
    '8c1fe7f7-001a-4eb6-9520-8298b4e07b45',
    '8eab92f4-3ead-40e4-859c-351eb08c6838',
    '90f61ee1-de2a-4184-b59c-002016e7450a',
    '91faa574-852a-4b8f-925d-5f1bcc20ac59',
    '9216934c-7d06-4b3a-a1ce-c6982b7a0a90',
    '92a99532-0829-4fbc-9e17-c40ce265a25c',
    '93107e02-1908-49b9-9ecc-de8374e99973',
    '93b52d5d-ad3a-4952-afbb-074d206d87d1',
    '95d81c20-f9db-48b3-8ab1-ee5cf31d1295',
    '9a5bb89c-b0da-418c-ae3f-df8362bf47fe',
    '9a657c3e-3146-40e1-a030-baad64a88bac',
    '9a7eb8ef-9847-49f0-933f-c716e13aaadb',
    '9bb75155-1ba8-4d7d-8e83-c447243193c2',
    '9be7ef69-b5dc-4041-a3e3-e05d6f570e41',
    '9bea3bac-2e5f-4df2-9cf6-ce2cc3a167ff',
    '9bebceb0-0928-4f0e-ae97-7a604ab24e43',
    '9d136bca-309d-4a60-8bf5-cce952b4bc95',
    '9d65b492-4d97-402d-980b-7146afaf4b4c',
    '9ea79ceb-331f-4f49-a92d-3b7aa24b63e5',
    '9ef65b7f-fbdb-4b77-9bba-0d852f1ab628',
    'a2aa4083-63ba-4b43-bbe1-4aa604b6c8d5',
    'a4646873-a03b-4e30-8287-5b79f3a7b78a',
    'a696ff5f-8ede-4b2a-8c1c-b72c9457274d',
    'a83d1450-7a84-4bc4-be53-52784bdcd105',
    'a8fe91c6-07f7-49c4-8c80-5c1c5aff569a',
    'abe95d76-b890-4884-be7d-6048796ed453',
    'ac4859b9-a79e-4720-899e-1484b91a4d8e',
    'ac595a6c-bf56-4244-86c7-25043fcfc6de',
    'ac7d9102-1ef2-47bb-9e4d-393f465bb61d',
    'acdd9f57-0d32-4cff-9496-3796cffb169f',
    'adfa492a-c700-45b8-bbb5-9a686229e8cd',
    'af202de3-b5bf-49f6-b642-8b3bfa181fe8',
    'afdfc9a5-7cc2-450d-86e7-93bb636abb5b',
    'aff7c61b-d617-4f15-af0d-1b2af001f947',
    'b138227a-5166-4234-a2a9-3aedd00fadcc',
    'b1edf6dc-e10a-49a9-9bdc-bd2945e53d8d',
    'b29454f1-d4ad-46e7-8c74-64aeeb15277b',
    'b3ecbb3a-0117-40e7-8e71-bf96cb2b820d',
    'b4332046-e8e5-4674-9f84-9a9b5e0dea1a',
    'b650c2a6-6ac1-4f08-a942-923c86729537',
    'b6fd9348-abfa-4667-9b05-a72abffe570f',
    'b70af4f5-b260-4872-8080-941645cb17ee',
    'b77d3bb7-f37b-4596-a189-3bb3805cdf02',
    'b8b33985-f46e-4ed4-bed4-10bcbeb16b36',
    'b9b7f6cc-c4e2-4149-88c3-0a86f71769aa',
    'babe31bc-c07c-4484-aa83-6ab1c5ea709f',
    'baebb860-d541-4203-ab3d-143d18a2eef1',
    'baf3463f-19bd-44f6-aa56-df1175569267',
    'bb387468-5ea7-4214-9264-f15609d234dd',
    'bc923bb8-835e-4433-a26c-41e428104943',
    'bd093270-0001-4806-ad24-5f8ea8c56f96',
    'be62205a-4877-4bad-972d-11d10a2fa646',
    'c12583ec-38cc-461d-a7a4-dd1f03170003',
    'c32fa343-f51e-4885-88c6-b84f52b20212',
    'c3746f5c-a4f6-4831-968c-6333b0bbecf6',
    'c83d928d-82f6-494a-aa26-bc2d67ac8361',
    'ca8b2fba-f985-405f-9b65-cce54eab8e23',
    'cb247624-0062-48b2-a23f-46c127d7582a',
    'cb897df5-7d96-463f-986f-1615787bc1e3',
    'cb9bb509-54d7-45ee-9620-e710052e5d12',
    'cc0337dd-b9ff-4e47-91fb-229b2c2316bf',
    'cdbb23ac-6fe1-4b00-b598-27fee81858d3',
    'cea38b01-2d6c-4339-b59b-8d4fa06c7765',
    'cf647299-9bc7-43cf-9847-f68f5c7ce252',
    'd06a9582-b25d-4607-b377-623f73709181',
    'd0bb4cf4-91b3-4119-b7c1-7ab3a28b01eb',
    'd0e6df47-524a-42fe-bd1e-8d248ad6def2',
    'd115e3ee-535b-4741-8a85-e8a49d5e0e07',
    'd1840967-d654-4fcb-85a4-e4a76e18f623',
    'd1ab49fd-6282-462b-bf8a-f584ead82088',
    'd2ad1b0e-f3a6-4607-95f8-7d5716c06c5f',
    'd3042c9e-522d-451b-b235-548454d984fb',
    'd34aa547-cf34-4525-9d4f-601a49618665',
    'd3a68129-21c6-42e0-8e9e-e5fed7490613',
    'd486f66f-9097-4043-b285-4065c788a03a',
    'd4c0f668-87d7-47e0-92f9-489f7a8226e2',
    'd640ad70-8087-49bc-b743-46813c19aa57',
    'd7c987e7-a3e3-4c47-b58b-80ac77c1b99a',
    'd88ff2cf-20ca-4860-b4e0-4b83dc303c14',
    'd8d136ad-0d8b-49fe-81aa-43af76f290c7',
    'd8ea2a73-4261-4781-81c7-12bad59da3bd',
    'da71773c-4371-48b8-afcd-4c3306631eba',
    'db149015-8b9a-4dd5-8e41-9cb164fc6c0e',
    'db7e5d05-e328-401a-a398-ee4c9a2a3ae0',
    'db926e69-b758-41e9-b8e3-aa06c834204e',
    'dbe8ca3b-0148-4a11-b9e2-0418e7e3815f',
    'dc1a6c00-d9fb-4eec-945c-5ad6d27cdfac',
    'dec16780-9a65-474d-a396-2b7bc2264935',
    'dec5f8c6-47c9-4932-b6b8-e0cf66fd2eff',
    'e3e57186-1ef0-4c73-8b68-5ff9324cb55d',
    'e53701a1-d25a-4c49-82cd-b3d0f11ece19',
    'e563ab2a-3373-4e85-a2a7-ebe193407248',
    'e565e225-e2e1-4772-9c81-d3b30fd7e945',
    'e642e0e2-d445-4ca8-917c-f51a70f5bcad',
    'e6daf880-76b8-4a9c-87d1-6a1112b931e7',
    'e94d46c9-fd2e-4416-9465-46c55a4620d3',
    'f2d8cf6b-13f4-4ad6-9c73-33f87faba27e',
    'f4140a34-214e-4289-bc12-860d6503694b',
    'f48af028-b3e9-4fdb-bfb0-f1ec113970ba',
    'f4f7223e-ec55-4302-8fd0-d4cc72014e53',
    'f5290c60-5816-45a8-9787-f4a404ed8e67',
    'f6cb9bbe-9b9a-4b07-9386-3ed8830e4ebd',
    'f78b1fb9-d595-4382-8bea-846bfbec84e7',
    'fab8e582-0075-4b0d-acdb-8b077a3a523a',
    'fc6b2a3d-1891-4c2e-a89d-b4fa527f3cf8',
    'fd6eb91b-8432-4f1b-ad36-5d2b20922060',
    'ff4ba0f9-23e6-4a3d-9b2f-2b81ae82543d',
];

async function main() {
    console.log(`[Backfill] Re-posting ${AFFECTED_REQUISITION_IDS.length} requisitions out of Suspense...`);

    let done = 0;
    let failed = 0;
    for (const requisitionId of AFFECTED_REQUISITION_IDS) {
        try {
            await ledgerService.repostForRequisition(requisitionId);
        } catch (err: any) {
            failed++;
            console.error(`  [FAIL] requisition ${requisitionId}: ${err?.message}`);
        }
        if (++done % 25 === 0) console.log(`  ...${done}/${AFFECTED_REQUISITION_IDS.length}`);
    }
    console.log(`[Backfill] Done. ${done - failed} succeeded, ${failed} failed.`);

    // Confirm nothing classified is left pointing at Suspense.
    const { data: remaining, error } = await supabase
        .from('cashbook_entries')
        .select('id, requisition_id, organization_id, journal_entries!inner(journal_lines!inner(account_id, accounts!inner(code)))')
        .eq('journal_entries.journal_lines.accounts.code', 'QB-SUSPENSE')
        .in('requisition_id', AFFECTED_REQUISITION_IDS);
    if (error) console.error('[Verify] check failed:', error.message);
    else console.log(`[Verify] ${remaining?.length || 0} of the backfilled entries still reference QB-SUSPENSE (expect 0, or >0 only for genuinely unclassified line items on that requisition).`);

    process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => { console.error(err); process.exit(1); });

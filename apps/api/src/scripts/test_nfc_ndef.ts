/**
 * The bytes the phone's NFC "tag" answers with. TapHceService.kt cannot be compiled here, so this is the same logic written again
 * in TypeScript and read back the way a phone's tag reader does (select the application, read the capability container, select the
 * NDEF file, read it, decode the link). If the two ever differ, the Kotlin file is the one to fix.
 * Run: npx tsx src/scripts/test_nfc_ndef.ts
 */
let failed = 0;
const check = (name: string, ok: boolean, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`); if (!ok) failed++; };

const AID = [0xd2, 0x76, 0x00, 0x00, 0x85, 0x01, 0x01];
const CC = [0x00, 0x0f, 0x20, 0x00, 0x3b, 0x00, 0x34, 0x04, 0x06, 0xe1, 0x04, 0x00, 0xff, 0x00, 0xff];
const OK = [0x90, 0x00], NOT_FOUND = [0x6a, 0x82];

function buildNdefFile(url: string): number[] {
    let prefix = 0x00, rest = url;
    if (url.startsWith('https://')) { prefix = 0x04; rest = url.slice(8); } else if (url.startsWith('http://')) { prefix = 0x03; rest = url.slice(7); }
    const body = [...Buffer.from(rest, 'utf8')].slice(0, 200);
    const payload = [prefix, ...body];
    const record = [0xd1, 0x01, payload.length, 0x55, ...payload];
    return [(record.length >> 8) & 0xff, record.length & 0xff, ...record];
}

class Tag {
    selected = 0;
    constructor(public file: number[]) {}
    send(apdu: number[]): number[] {
        if (!this.file.length) return NOT_FOUND;
        if (apdu[1] === 0xa4) {
            const lc = apdu[4]; const data = apdu.slice(5, 5 + lc);
            if (apdu[2] === 0x04) return JSON.stringify(data) === JSON.stringify(AID) ? (this.selected = 0, OK) : NOT_FOUND;
            if (apdu[2] === 0x00) { if (data[0] === 0xe1 && data[1] === 0x03) { this.selected = 1; return OK; } if (data[0] === 0xe1 && data[1] === 0x04) { this.selected = 2; return OK; } }
            return NOT_FOUND;
        }
        if (apdu[1] === 0xb0) {
            const f = this.selected === 1 ? CC : this.selected === 2 ? this.file : null;
            if (!f) return NOT_FOUND;
            const offset = (apdu[2] << 8) | apdu[3];
            if (offset > f.length) return [0x6b, 0x00];
            const wanted = apdu.length > 4 ? (apdu[4] === 0 ? 256 : apdu[4]) : f.length - offset;
            return [...f.slice(offset, Math.min(f.length, offset + wanted)), ...OK];
        }
        return [0x6d, 0x00];
    }
}

/** What a phone's reader does, byte for byte. */
function read(tag: Tag): string | null {
    if (tag.send([0x00, 0xa4, 0x04, 0x00, AID.length, ...AID, 0x00]).join() !== OK.join()) return null;
    if (tag.send([0x00, 0xa4, 0x00, 0x0c, 0x02, 0xe1, 0x03]).join() !== OK.join()) return null;
    const cc = tag.send([0x00, 0xb0, 0x00, 0x00, 0x0f]);
    if (cc.length !== 17 || cc.slice(-2).join() !== OK.join()) return null;
    const ndefId = [cc[9], cc[10]];
    if (tag.send([0x00, 0xa4, 0x00, 0x0c, 0x02, ...ndefId]).join() !== OK.join()) return null;
    const lenResp = tag.send([0x00, 0xb0, 0x00, 0x00, 0x02]);
    const nlen = (lenResp[0] << 8) | lenResp[1];
    const data = tag.send([0x00, 0xb0, 0x00, 0x02, nlen]);
    const rec = data.slice(0, -2);
    if (rec[0] !== 0xd1 || rec[3] !== 0x55) return null;
    const prefix = rec[4] === 0x04 ? 'https://' : rec[4] === 0x03 ? 'http://' : '';
    return prefix + Buffer.from(rec.slice(5, 4 + rec[2])).toString('utf8');
}

const url = 'https://moneywise.blueopus.cloud/r/K7M2QX9TBA';
const tag = new Tag(buildNdefFile(url));
check('a reader gets the request link back exactly', read(tag) === url, String(read(tag)));
check('the capability container is 15 bytes and points at the NDEF file', CC.length === 15 && CC[0] === 0 && CC[1] === 15 && CC[9] === 0xe1 && CC[10] === 0x04);
const file = buildNdefFile(url);
check('the length prefix matches the record', ((file[0] << 8) | file[1]) === file.length - 2);
check('the record is a short well-known URI record', file[2] === 0xd1 && file[3] === 0x01 && file[5] === 0x55);
check('the file fits the 255 bytes the capability container promises', file.length <= 255, String(file.length));
check('a link is read back when the phone asks for a few bytes at a time', (() => {
    const t = new Tag(buildNdefFile(url)); t.send([0, 0xa4, 4, 0, 7, ...AID, 0]); t.send([0, 0xa4, 0, 0x0c, 2, 0xe1, 0x04]);
    let out: number[] = []; let off = 0; const total = ((t.file[0] << 8) | t.file[1]) + 2;
    while (off < total) { const r = t.send([0, 0xb0, off >> 8, off & 0xff, 8]); out = out.concat(r.slice(0, -2)); off += 8; }
    return out.length >= total && JSON.stringify(out.slice(0, total)) === JSON.stringify(t.file);
})());
check('with nothing being shared the phone is not a tag', read(new Tag([])) === null);
check('another application is refused', new Tag(file).send([0, 0xa4, 4, 0, 2, 1, 2, 0]).join() === NOT_FOUND.join());
check('a different link also round-trips', read(new Tag(buildNdefFile('http://localhost:5173/r/ABCDEFGHJK'))) === 'http://localhost:5173/r/ABCDEFGHJK');

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);

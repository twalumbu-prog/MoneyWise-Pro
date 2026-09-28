#!/usr/bin/env node
/**
 * Feature-parity inventory generator.
 *
 * Enumerates EVERY user-reachable surface of the web app (routes, screens,
 * modals/overlays, mobile-specific components, service methods) and every
 * backend endpoint, then joins it against hand-maintained porting status in
 * `docs/mobile-app/parity.status.json`.
 *
 * The point is that parity is never asserted from memory: anything that exists
 * in apps/web or apps/api but has no status entry shows up as UNTRIAGED, and
 * `--check` exits non-zero so CI blocks the drift.
 *
 * Usage:
 *   node scripts/parity/generate-inventory.mjs           # regenerate docs
 *   node scripts/parity/generate-inventory.mjs --check   # fail on UNTRIAGED
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const WEB = join(ROOT, 'apps/web/src');
const API_ROUTES = join(ROOT, 'apps/api/src/routes');
const CORE = join(ROOT, 'packages/core/src');
const OUT_MD = join(ROOT, 'docs/mobile-app/PARITY.generated.md');
const OUT_JSON = join(ROOT, 'docs/mobile-app/parity.inventory.json');
const STATUS_FILE = join(ROOT, 'docs/mobile-app/parity.status.json');

const walk = (dir, acc = []) => {
    if (!existsSync(dir)) return acc;
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p, acc);
        else if (['.ts', '.tsx'].includes(extname(name))) acc.push(p);
    }
    return acc;
};

const read = (p) => readFileSync(p, 'utf8');
const loc = (src) => src.split('\n').length;

// ── 1. Routes declared in App.tsx ────────────────────────────────────────────
function collectRoutes() {
    const src = read(join(WEB, 'App.tsx'));
    const lazy = new Map();
    for (const m of src.matchAll(/const (\w+) = React\.lazy\(\(\) => import\('\.\/(pages\/[\w/]+)'\)/g)) {
        lazy.set(m[1], m[2]);
    }
    const routes = [];
    for (const m of src.matchAll(/<Route\s+path="([^"]+)"[\s\S]{0,400?}?/g)) { /* noop */ }
    // Route blocks are multi-line; match path then the first component referenced after it.
    const blocks = src.split('<Route').slice(1);
    for (const b of blocks) {
        const path = b.match(/path="([^"]+)"/)?.[1];
        if (!path) continue;
        const comp = b.match(/<(\w+)\s*\/>/g)?.map((s) => s.replace(/[<>/\s]/g, ''))
            .find((c) => c !== 'ProtectedRoute');
        const guarded = /ProtectedRoute/.test(b.slice(0, b.indexOf('/>') + 2) || b);
        routes.push({
            path,
            component: comp ?? 'unknown',
            file: lazy.get(comp) ?? null,
            auth: guarded ? 'protected' : 'public',
        });
    }
    return routes;
}

// ── 2. Screens (pages) with their mobile/desktop split ───────────────────────
function collectScreens() {
    return walk(join(WEB, 'pages')).map((p) => {
        const src = read(p);
        return {
            id: relative(WEB, p),
            name: basename(p, '.tsx'),
            loc: loc(src),
            hasMobileBranch: /md:hidden|hidden md:|max-md:/.test(src),
            usesLayout: /<Layout\b/.test(src),
            modals: [...new Set([...src.matchAll(/<(\w*(?:Modal|Overlay|Drawer|Sheet|Wizard))\b/g)].map((m) => m[1]))],
        };
    });
}

// ── 3. Components, tagged by platform intent ─────────────────────────────────
function collectComponents() {
    return walk(join(WEB, 'components')).map((p) => {
        const src = read(p);
        const name = basename(p, '.tsx');
        let surface = 'shared';
        if (/^Mobile/.test(name)) surface = 'mobile-only';
        else if (/^Desktop/.test(name)) surface = 'desktop-only';
        else if (/md:hidden/.test(src)) surface = 'responsive';
        return { id: relative(WEB, p), name, loc: loc(src), surface };
    });
}

// ── 4. Service layer — the code that actually ports to packages/core ─────────
function collectServices() {
    // Scan BOTH locations. As each module migrates, its web file becomes a
    // one-line re-export with no methods left to find — without the core sweep
    // the inventory would silently shrink exactly as the port progressed, which
    // is the drift this tool exists to prevent.
    const files = [
        ...walk(join(WEB, 'services')).map((p) => ({ p, home: 'web' })),
        ...walk(join(CORE, 'services')).map((p) => ({ p, home: 'core' })),
    ];
    const byName = new Map();
    for (const { p, home } of files) {
        const src = read(p);
        const name = basename(p, '.ts');
        const methods = [
            ...[...src.matchAll(/^\s{4}(?:async\s+)?(\w+)\s*(?:<[^>]*>)?\s*\(/gm)].map((m) => m[1]),
            ...[...src.matchAll(/export (?:async )?function (\w+)/g)].map((m) => m[1]),
        ].filter((m) => !['if', 'for', 'catch', 'switch', 'while', 'return'].includes(m));

        const prev = byName.get(name);
        // A migrated module lives in core; the web file is a shim. Core wins,
        // and the module is recorded as ported.
        if (home === 'core' || !prev) {
            byName.set(name, {
                id: relative(ROOT, p),
                name,
                home,
                loc: loc(src),
                methods: [...new Set([...(prev?.methods ?? []), ...methods])],
                touchesSupabaseDirectly: /supabase\s*\n?\s*\.from\(|supabase\.storage/.test(src),
            });
        } else if (prev) {
            prev.methods = [...new Set([...prev.methods, ...methods])];
        }
    }
    return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// ── 5. Backend endpoints (the real contract both clients share) ──────────────
function collectEndpoints() {
    const index = read(join(ROOT, 'apps/api/src/index.ts'));
    const mounts = new Map();
    for (const m of index.matchAll(/app\.use\('([^']+)',\s*(?:[\w.{}\s(),*/'"]*?)(\w+Routes)\)/g)) {
        mounts.set(m[2], m[1]);
    }
    const fileToVar = new Map();
    for (const m of index.matchAll(/import (\w+Routes) from '\.\/routes\/([\w.]+)'/g)) {
        fileToVar.set(`${m[2]}.ts`, m[1]);
    }
    const endpoints = [];
    for (const f of readdirSync(API_ROUTES)) {
        const src = read(join(API_ROUTES, f));
        const prefix = mounts.get(fileToVar.get(f)) ?? `/${f.replace('.routes.ts', '')}`;
        for (const m of src.matchAll(/router\.(get|post|put|patch|delete)\(\s*'([^']*)'([\s\S]{0,200}?)\)\s*;/g)) {
            const roles = m[3].match(/requireRole\(\[([^\]]*)\]/)?.[1]?.replace(/['\s]/g, '') ?? '';
            endpoints.push({
                method: m[1].toUpperCase(),
                path: `${prefix}${m[2] === '/' ? '' : m[2]}`,
                file: f,
                roles: roles ? roles.split(',') : [],
                public: /public|webhook/.test(f) || !/requireAuth|requireRole/.test(src),
            });
        }
    }
    return endpoints.sort((a, b) => a.path.localeCompare(b.path));
}

// ── 6. Native-porting hazards: browser APIs with no RN equivalent ────────────
const HAZARDS = [
    ['localStorage', /localStorage/, 'expo-secure-store / react-native-mmkv'],
    ['window/document DOM', /\b(?:window|document)\./, 'Dimensions / RN primitives'],
    ['file input + FileReader', /type="file"|new FileReader/, 'expo-image-picker / expo-document-picker'],
    ['Blob/createObjectURL', /createObjectURL|new Blob\(/, 'expo-file-system + base64'],
    ['jsPDF', /from 'jspdf/, 'server-side PDF (API already has pdfkit)'],
    ['SheetJS xlsx', /from 'xlsx'/, 'server-side export + expo-sharing'],
    ['recharts (SVG/DOM)', /from 'recharts'/, 'victory-native / react-native-svg'],
    ['framer-motion', /from 'framer-motion'/, 'react-native-reanimated'],
    ['getUserMedia (audio)', /getUserMedia/, 'expo-audio'],
    ['heic2any', /heic2any/, 'server-side convert (API has heic-convert)'],
    ['browser-image-compression', /browser-image-compression/, 'expo-image-manipulator'],
    ['fetch stream reader (SSE)', /\.body\.getReader\(\)/, 'expo/fetch streaming or react-native-sse'],
    ['service worker / PWA', /serviceWorker|workbox/, 'expo-updates + expo-notifications'],
    ['qrcode.react', /qrcode\.react/, 'react-native-qrcode-svg'],
    ['react-markdown', /react-markdown/, 'react-native-markdown-display'],
];

function collectHazards() {
    const rows = [];
    for (const p of walk(WEB)) {
        const src = read(p);
        for (const [label, re, fix] of HAZARDS) {
            if (re.test(src)) rows.push({ file: relative(WEB, p), hazard: label, replacement: fix });
        }
    }
    const byHazard = new Map();
    for (const r of rows) {
        if (!byHazard.has(r.hazard)) byHazard.set(r.hazard, { hazard: r.hazard, replacement: r.replacement, files: [] });
        byHazard.get(r.hazard).files.push(r.file);
    }
    return [...byHazard.values()].sort((a, b) => b.files.length - a.files.length);
}

// ── Assemble ─────────────────────────────────────────────────────────────────
const inventory = {
    generatedAt: new Date().toISOString().slice(0, 10),
    routes: collectRoutes(),
    screens: collectScreens(),
    components: collectComponents(),
    services: collectServices(),
    endpoints: collectEndpoints(),
    hazards: collectHazards(),
};

const status = existsSync(STATUS_FILE) ? JSON.parse(read(STATUS_FILE)) : {};
const statusOf = (key) => status[key]?.state ?? 'UNTRIAGED';
const noteOf = (key) => status[key]?.note ?? '';
const phaseOf = (key) => status[key]?.phase ?? '—';

// Every trackable unit gets a stable key.
const units = [
    ...inventory.routes.map((r) => ({ key: `route:${r.path}`, kind: 'route', label: `\`${r.path}\``, detail: `${r.component} · ${r.auth}` })),
    ...inventory.screens.map((s) => ({ key: `screen:${s.name}`, kind: 'screen', label: s.name, detail: `${s.loc} LOC${s.modals.length ? ` · ${s.modals.length} overlays` : ''}` })),
    ...inventory.services.flatMap((s) => s.methods.map((m) => ({ key: `service:${s.name}.${m}`, kind: 'service', label: `${s.name}.${m}()`, detail: s.touchesSupabaseDirectly ? 'direct supabase' : 'api' }))),
    ...inventory.endpoints.map((e) => ({ key: `api:${e.method} ${e.path}`, kind: 'endpoint', label: `${e.method} ${e.path}`, detail: e.roles.join('/') || 'any' })),
];

const untriaged = units.filter((u) => statusOf(u.key) === 'UNTRIAGED');
const counts = units.reduce((acc, u) => { const s = statusOf(u.key); acc[s] = (acc[s] ?? 0) + 1; return acc; }, {});

const table = (rows, headers) =>
    [`| ${headers.join(' | ')} |`, `| ${headers.map(() => '---').join(' | ')} |`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');

const md = `<!-- GENERATED by scripts/parity/generate-inventory.mjs — do not edit by hand. -->
# MoneyWise Pro — Web ⇄ Native Parity Inventory

Generated **${inventory.generatedAt}** from \`apps/web\` + \`apps/api\`.
Porting status lives in \`docs/mobile-app/parity.status.json\` and survives regeneration.

## Scorecard

${table(
    Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, v]) => [`**${k}**`, String(v), `${((v / units.length) * 100).toFixed(1)}%`]),
    ['State', 'Units', 'Share']
)}

**${units.length}** trackable units · **${untriaged.length}** untriaged.

## 1. Routes (${inventory.routes.length})

${table(inventory.routes.map((r) => [`\`${r.path}\``, r.component, r.auth, phaseOf(`route:${r.path}`), statusOf(`route:${r.path}`), noteOf(`route:${r.path}`)]), ['Path', 'Screen', 'Access', 'Phase', 'Status', 'Note'])}

## 2. Screens (${inventory.screens.length})

${table(inventory.screens.sort((a, b) => b.loc - a.loc).map((s) => [s.name, String(s.loc), s.hasMobileBranch ? 'yes' : '—', String(s.modals.length), phaseOf(`screen:${s.name}`), statusOf(`screen:${s.name}`), noteOf(`screen:${s.name}`)]), ['Screen', 'LOC', 'Mobile branch', 'Overlays', 'Phase', 'Status', 'Note'])}

## 3. Components by surface (${inventory.components.length})

${table(
    ['mobile-only', 'responsive', 'shared', 'desktop-only'].map((surface) => {
        const list = inventory.components.filter((c) => c.surface === surface);
        return [surface, String(list.length), String(list.reduce((n, c) => n + c.loc, 0)), list.slice(0, 6).map((c) => c.name).join(', ') + (list.length > 6 ? ', …' : '')];
    }),
    ['Surface', 'Files', 'LOC', 'Examples']
)}

### Mobile-specific components (direct visual spec for the native build)

${table(inventory.components.filter((c) => c.surface === 'mobile-only' || c.surface === 'responsive').map((c) => [c.name, c.surface, String(c.loc), c.id]), ['Component', 'Surface', 'LOC', 'Path'])}

## 4. Service layer → \`packages/core\` (${inventory.services.length} modules, ${inventory.services.reduce((n, s) => n + s.methods.length, 0)} methods)

${table(inventory.services.map((s) => [s.name, s.home === 'core' ? '**core**' : 'web', String(s.methods.length), s.touchesSupabaseDirectly ? '⚠️ direct supabase/storage' : 'apiFetch only', statusOf(`service:${s.name}.${s.methods[0] ?? ''}`) === 'DONE' ? 'DONE' : phaseOf(`service:${s.name}.${s.methods[0] ?? ''}`)]), ['Service', 'Lives in', 'Methods', 'Transport', 'Status'])}

## 5. Backend endpoints (${inventory.endpoints.length})

Both clients share this contract verbatim — the same DB, the same rows, the same RLS.

${table(inventory.endpoints.map((e) => [e.method, `\`${e.path}\``, e.roles.join(' / ') || '—', statusOf(`api:${e.method} ${e.path}`)]), ['Method', 'Path', 'Roles', 'Consumed by app'])}

## 6. Native porting hazards

Browser APIs with no React Native equivalent, by blast radius.

${table(inventory.hazards.map((h) => [h.hazard, String(h.files.length), h.replacement, h.files.slice(0, 4).join(', ') + (h.files.length > 4 ? ` +${h.files.length - 4}` : '')]), ['Browser API', 'Files', 'Native replacement', 'Where'])}

## 7. Untriaged (${untriaged.length})

${untriaged.length === 0 ? '✅ Every unit has a parity decision.' : untriaged.slice(0, 200).map((u) => `- \`${u.key}\` — ${u.label} (${u.detail})`).join('\n')}
${untriaged.length > 200 ? `\n…and ${untriaged.length - 200} more.` : ''}
`;

writeFileSync(OUT_MD, md);
writeFileSync(OUT_JSON, JSON.stringify({ ...inventory, units: units.map((u) => ({ ...u, state: statusOf(u.key) })) }, null, 2));

console.log(`Inventory: ${units.length} units · ${untriaged.length} untriaged`);
console.log(`  ${OUT_MD.replace(ROOT, '')}`);
console.log(`  ${OUT_JSON.replace(ROOT, '')}`);

if (process.argv.includes('--check') && untriaged.length > 0) {
    console.error(`\n✗ ${untriaged.length} unit(s) have no parity decision in parity.status.json:`);
    for (const u of untriaged.slice(0, 40)) console.error(`    ${u.key}`);
    if (untriaged.length > 40) console.error(`    …and ${untriaged.length - 40} more`);
    console.error('\nAdd each to docs/mobile-app/parity.status.json with a state of');
    console.error('DONE | IN_PROGRESS | PLANNED | WEB_ONLY | NOT_APPLICABLE and a note.');
    process.exit(1);
}

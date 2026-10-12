// Metro must be told about the workspace explicitly: `core` and `shared` live
// outside this app's folder, so without watchFolders their sources are never
// watched and `import from 'core'` resolves in tsc but fails at bundle time.
const { getDefaultConfig } = require('expo/metro-config');
const metroResolver = require('metro-resolver');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
    path.resolve(projectRoot, 'node_modules'),
    path.resolve(workspaceRoot, 'node_modules'),
];

// Force ONE copy of the React runtime.
//
// watchFolders covers the whole repo, which also contains apps/web and
// apps/admin with their own nested React 18. Metro will happily resolve a
// second copy through those paths, and two Reacts means every hook call gets a
// null dispatcher — it surfaces as "Cannot read property 'useRef' of null"
// inside whichever provider renders first, which points nowhere near the cause.
config.resolver.extraNodeModules = {
    react: path.resolve(workspaceRoot, 'node_modules/react'),
    'react-dom': path.resolve(workspaceRoot, 'node_modules/react-dom'),
    'react-native': path.resolve(workspaceRoot, 'node_modules/react-native'),
};

// Never walk up out of the app into another workspace member's node_modules.
config.resolver.disableHierarchicalLookup = true;

// Resolve ESM explicit extensions (.js, .mjs, etc.) in node_modules imports
// to prevent Metro from looking for file.js.js or file.js.ts
//
// Narrow exception to disableHierarchicalLookup above: markdown-it (used by the assistant's Markdown renderer) needs its
// OWN nested copies of `entities` (v2) and `linkify-it`; the hoisted `entities` is v4 and lacks the paths it requires.
// Only these packages, only when imported from inside markdown-it, so React etc. can never be duplicated.
const MARKDOWN_IT_NESTED = new Set(['entities', 'linkify-it']);
const nestedForMarkdownIt = (origin, moduleName) => {
    if (!origin || !origin.includes(`${path.sep}node_modules${path.sep}markdown-it${path.sep}`)) return null;
    const pkg = moduleName.split('/')[0];
    if (!MARKDOWN_IT_NESTED.has(pkg)) return null;
    const root = origin.slice(0, origin.indexOf(`${path.sep}node_modules${path.sep}markdown-it${path.sep}`)) + `${path.sep}node_modules${path.sep}markdown-it`;
    const nested = path.join(root, 'node_modules', moduleName);
    return require('fs').existsSync(path.join(root, 'node_modules', pkg)) ? nested : null;
};

config.resolver.resolveRequest = (context, moduleName, platform) => {
    const nested = nestedForMarkdownIt(context.originModulePath, moduleName);
    if (nested) {
        const { resolveRequest: _skip, ...ctx } = context;
        return metroResolver.resolve(ctx, nested, platform);
    }
    let targetName = moduleName;
    if ((moduleName.startsWith('./') || moduleName.startsWith('../')) && (moduleName.endsWith('.js') || moduleName.endsWith('.mjs'))) {
        targetName = moduleName.replace(/\.(m)?js$/, '');
    }
    const { resolveRequest, ...restContext } = context;
    return metroResolver.resolve(restContext, targetName, platform);
};

module.exports = config;

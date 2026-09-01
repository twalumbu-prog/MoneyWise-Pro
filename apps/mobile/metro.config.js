// Metro must be told about the workspace explicitly: `core` and `shared` live
// outside this app's folder, so without watchFolders their sources are never
// watched and `import from 'core'` resolves in tsc but fails at bundle time.
//
// nodeModulesPaths covers the hoisted root install (see the repo .npmrc —
// Expo/RN require the hoisted layout). Hierarchical lookup is deliberately left
// ON: it is what lets Expo's packages find peers they do not declare.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
    path.resolve(projectRoot, 'node_modules'),
    path.resolve(workspaceRoot, 'node_modules'),
];

module.exports = config;

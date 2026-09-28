// Metro must be told about the workspace explicitly: `core` and `shared` live
// outside this app's folder, so without watchFolders their sources are never
// watched and `import from 'core'` resolves in tsc but fails at bundle time.
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

module.exports = config;

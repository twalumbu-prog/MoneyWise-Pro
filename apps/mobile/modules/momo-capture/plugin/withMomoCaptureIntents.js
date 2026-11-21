/**
 * Copies the App Intent (app-target/*.swift) into the generated iOS app target at prebuild. Shortcuts only discovers
 * App Intents compiled into the app itself, so this can't live in the MomoCapture pod with the rest of the module.
 */
const { withDangerousMod, withXcodeProject, IOSConfig } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const FILES = ['MoneyWiseCaptureIntent.swift'];
const SRC_DIR = path.join(__dirname, '..', 'app-target');

const withCopy = (config) => withDangerousMod(config, ['ios', (cfg) => {
    const projectName = IOSConfig.XcodeUtils.getProjectName(cfg.modRequest.projectRoot);
    const dest = path.join(cfg.modRequest.platformProjectRoot, projectName);
    for (const f of FILES) fs.copyFileSync(path.join(SRC_DIR, f), path.join(dest, f));
    return cfg;
}]);

const withProject = (config) => withXcodeProject(config, (cfg) => {
    const projectName = IOSConfig.XcodeUtils.getProjectName(cfg.modRequest.projectRoot);
    for (const f of FILES) {
        const filepath = `${projectName}/${f}`;
        if (!cfg.modResults.hasFile(filepath)) {
            IOSConfig.XcodeUtils.addBuildSourceFileToGroup({ filepath, groupName: projectName, project: cfg.modResults });
        }
    }
    return cfg;
});

module.exports = (config) => withProject(withCopy(config));

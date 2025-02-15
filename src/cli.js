#!/usr/bin/env node

import {deploy, deployZip, list, check, showConfig, showExampleConfig, clearAll, clear} from "./index.js";

console.log(process.argv)

if (process.argv[2] == 'deploy') {
    await deploy(process.argv[3], process.argv[4])
} else if (process.argv[2] == 'list') {
    await list()
} else if (process.argv[2] == 'deployZip') {
    await deployZip(process.argv[3], process.argv[4], process.argv[5])
} else if (process.argv[2] == 'check') {
    await check(false)
} else if (process.argv[2] == 'checkAndDeploy') {
    await check(true)
    await clearAll(30,7)
} else if (process.argv[2] == 'config') {
    if (process.argv[3] == 'example') {
        showExampleConfig()
    } else {
        await showConfig()
    }
} else if (process.argv[2] == 'clear') {
    await clear(process.argv[3], +(process.argv[4] ?? 0), +(process.argv[5] ?? 0))
} else if (process.argv[2] == 'clearAll') {
    await clearAll(+(process.argv[3] ?? 0), +(process.argv[4] ?? 0))
} else {
    console.log('Green deploy \r\n\r\ndeploy list - shows config\r\ndeploy [name] [version] - deploys\r\ncheck - check if newest version is deployed\r\ncheckAndDeploy - check and deploy if needed, automatically deletes versions older than 2 or 30 days\r\nconfig - shows config file\r\nclear [name] [daysToKeep] [versionsToKeep]\r\nclearAll [daysToKeep] [versionsToKeep]')
}

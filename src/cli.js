#!/usr/local/bin/node

import {deploy, deployZip, list, check, showConfig} from "./index.js";

console.log(process.argv)

if (process.argv[2] == 'deploy') {
    await deploy(process.argv[3], process.argv[4])
} else if (process.argv[2] == 'list') {
    await list()
} else if (process.argv[2] == 'deployZip') {
    await deployZip(process.argv[3], process.argv[4], process.argv[5])
} else if (process.argv[2] == 'check'){
    await check(false)
}else if (process.argv[2] == 'checkAndDeploy'){
    await check(true)
} else if (process.argv[2] == 'config'){
    if(process.argv[3] == 'example'){

    }
    await showConfig()
} else {
    console.log('Green deploy \r\n\r\ndeploy list - shows config\r\ndeploy name version - deploys\r\ncheck - check if newest version is deployed\r\ncheckAndDeploy - check and deploy if needed\r\nconfig - shows config file')
}

#!/usr/local/bin/node

import {deploy, deployZip, list, listenQueue} from "./index.js";

console.log(process.argv)

if (process.argv[2] == 'deploy') {
    await deploy(process.argv[3], process.argv[4])
} else if (process.argv[2] == 'list') {
    await list()
} else if (process.argv[2] == 'deployZip') {
    await deployZip(process.argv[3], process.argv[4], process.argv[5])
} else if (process.argv[2] == 'listenQueue') {
    await listenQueue(process.argv[3], process.argv[4])
} else {
    console.log('Green deploy \r\n\r\ndeploy list - shows config\r\ndeploy name version - deploys')
}

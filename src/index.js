import {GetObjectCommand, S3Client} from "@aws-sdk/client-s3";
import {createWriteStream, promises as fsPromises, existsSync} from 'fs';
import extractZip from "extract-zip";
import readline from "node:readline";
import express from "express";

function getConfigPath() {
    let isWin = process.platform === "win32";
    let filePath = isWin ? 'file:///' + process.env.APPDATA + '/green-deployer-conf.js' : 'file:///etc/green-deployer-conf.js';
    return filePath;
}

function getConfigPathClean() {
    let isWin = process.platform === "win32";
    let filePath = isWin ? process.env.APPDATA + '/green-deployer-conf.js' : '/etc/green-deployer-conf.js';
    return filePath;
}

export async function loadConfig() {
    await checkConfigExisting();
    const filePath = getConfigPath();
    return (await import (filePath)).default;
}

async function getLatestVersion(name) {
    let allConfig = (await loadConfig());
    let config = allConfig [name];
    const client = new S3Client({region: "eu-central-1"});
    const command = new GetObjectCommand({Bucket: config.source.bucket, Key: config.source.lastVersionKey});
    const response = await client.send(command);
    return (await response.Body.transformToString('UTF-8')).trim()
}

export async function deploy(name, version) {
    if (!version) version = await getLatestVersion(name)
    let isWin = process.platform === "win32";
    let allConfig = (await loadConfig());
    let config = allConfig [name];
    const client = new S3Client({region: "eu-central-1"});
    const command = new GetObjectCommand({Bucket: config.source.bucket, Key: config.source.key(version)});
    const response = await client.send(command);

    let filePath = (isWin ? process.env.TEMP + '/' : '/tmp/') + 'green-deployer-' + Math.random() + '.zip';
    console.log('downloaing ' + filePath + ' ...')
    let file = await createWriteStream(filePath);
    let bytes = await response.Body.transformToByteArray();//todo for a stream for ram usage
    await file.write(bytes)
    await file.close();
    console.log('downloaded ' + filePath)
    await new Promise(r => setTimeout(r, 100));
    await deployZip(name, version, filePath);
}

export async function deployZip(name, version, zipPath) {
    let allConfig = (await loadConfig());
    let config = allConfig [name];
    const sufix = +new Date();
    console.log('extracting to  ' + config.path + '/versions/' + version + '_' + sufix)
    await extractZip(zipPath, {
        dir: config.path + '/versions/' + version + '_' + sufix,
        defaultDirMode: 0o777,
        defaultFileMode: 0o777
    })
    let path = config.path;
    let isWin = process.platform === "win32";
    console.log('process.platform', process.platform)
    if (isWin) {
        path = 'file://' + path
    }
    console.log('extracted to  ' + config.path + '/versions/' + version + '_' + sufix)

    let versionScripts = null
    try {
        versionScripts = await import(path + '/versions/' + version + '_' + sufix + '/deployment.js')

        versionScripts?.afterUnzip?.call(null, config.path + '/versions/' + version + '_' + sufix);
    } catch (ex) {
        console.warn('after unzip', ex)
    }
    await fsPromises.unlink(config.path + '/currentVersion').catch(() => false);


    await fsPromises.symlink('./versions/' + version + '_' + sufix, config.path + '/currentVersion', 'dir')
    try {
        versionScripts?.afterInstall?.call(null, config.path + '/versions/' + version + '_' + sufix);
    } catch (ex) {
        console.warn('after afterInstall', ex)
    }
}


export async function list() {
    let allConfig = (await loadConfig());
    console.log(allConfig)
}

export async function check(deployAfterCheck = false) {
    let allConfig = (await loadConfig());
    for (let name in allConfig) {
        let config = allConfig [name];
        let latestVersion = await getLatestVersion(name)
        let installedVersion = null;
        try {
            installedVersion = (await fsPromises.readlink(config.path + '/currentVersion')).split('/').pop().split('_').shift();
        } catch (e) {
            console.warn(e)
            continue;
        }

        if (installedVersion === latestVersion) {
            console.log(name + ' is up to date');
        } else {
            console.log(name + ' can be updated from ' + installedVersion + ' to ' + latestVersion);
            if (deployAfterCheck) {
                await deploy(name, latestVersion)
            }
        }
    }
}

async function checkConfigExisting() {
    const filePath = getConfigPathClean();
    const exists = existsSync(filePath);
    if (exists) {
        return true
    } else {
        console.log('Config file not found. ');
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        const answer = await new Promise(r => rl.question('Want to create one? [Yn]', r));
        if (answer.toLowerCase() === 'n') {
            return false;
        }
        const fileContent = `
module.exports= {
    /*"projectname":{
        "path":"/var/www/demo",
        "source":{
            "type":"s3",
            "bucket":"bucketname",
            "key":x=>\`projectname/\${x}.zip\`,
            "lastVersionKey":"projectname/lastVersion"
        }
    }*/
}
`
        await fsPromises.writeFile(filePath.replace('file:///', ''), fileContent);
        return true;
    }
}

export async function showConfig() {
    const filePath = getConfigPathClean();
    console.log('Config file path: ' + filePath);
    console.log('');
    const exists = await checkConfigExisting();
    if (exists) {
        console.log('Config file content:');
        const data = await fsPromises.readFile(filePath);
        console.log(data.toString());
        console.log('Config file executed:')
        console.log(await loadConfig());
    } else {
        console.log('Config file not found. ');
    }

}

export function showExampleConfig() {
    console.log(`
module.exports= {
    "projectname":{
        "path":"/var/www/demo",
        "source":{
            "type":"s3",
            "bucket":"bucketname",
            "key":x=>\`projectname/\${x}.zip\`,
            "lastVersionKey":"projectname/lastVersion"
        }
    }
    "projectname2":{
    "path":"/var/www/demo",
    "source":{
        "type":"listeningApi",
        "port":9999,
        "project_name":"projectname",
        "secret":"secret",
    }
}
`);
}

export async function clear(name, daysToKeep, versionsToKeep) {
    let allConfig = (await loadConfig());
    await clearByConfig(allConfig[name], daysToKeep, versionsToKeep);
}

export async function clearByConfig(config, daysToKeep, versionsToKeep) {

    let installedVersion = null;
    try {
        installedVersion = (await fsPromises.readlink(config.path + '/currentVersion')).split(/[\/\\]/).pop();
    } catch (e) {
        console.warn(e)
        return;
    }
    console.log({installedVersion})
    const oldVersions = await Promise.all((await fsPromises.readdir(config.path + '/versions/')).filter(x => x != '.' && x != '..' && x != installedVersion).map(async version => {
        const path = config.path + '/versions/' + version;
        const stat = (await fsPromises.stat(path));
        return {version, path, daysOld: (new Date() - stat.ctimeMs) / 1000 / 3600 / 24}
    }));
    oldVersions.sort((a, b) => a.daysOld - b.daysOld);
    const toDelete = oldVersions.slice(versionsToKeep).filter(x => x.daysOld >= daysToKeep);
    for (let x of toDelete) {
        console.log('Deleting ', x);
        await fsPromises.rm(x.path, {recursive: true});
    }
}

export async function clearAll(daysToKeep, versionsToKeep) {
    let allConfig = (await loadConfig());
    for (let name in allConfig) {
        await clearByConfig(allConfig[name], daysToKeep, versionsToKeep)
    }
}

export async function backgroundProcess() {

    let isWin = process.platform === "win32";
    let allConfig = (await loadConfig());
    let ports = new Set(Object.values(allConfig).filter(x => x.source.type === 'listeningApi').map(x => x.source.port));
    if (ports.size > 0) {
        const api = express();

        api.use((err, req, res, next) => {
            console.error(err.stack); // Logowanie błędu na serwerze
            res.status(500).json({ message: 'Error occured'});
        });

        for (const projectConfig of Object.values(allConfig).filter(x => x.source.type === 'listeningApi')) {
            console.log('/' + projectConfig.source.project_name + '/deploy');
            api.post('/' + projectConfig.source.project_name + '/deploy', async (req, res) => {
                if (req.headers.authorization?.length > 0 && req.headers.authorization == projectConfig.source.secret) {
                    let tmpPath = (isWin ? process.env.TEMP + '/' : '/tmp/') + 'green-deployer-' + Math.random() + '.zip';
                    const version = req.query.version || 'unknown';
                    const file = await createWriteStream(tmpPath);
                    req.pipe(file);
                    await new Promise(r => file.on('finish', r));
                    await deployZip(projectConfig.source.project_name, version, tmpPath);
                    res.send('OK');
                } else {
                    res.status(403).send('Unauthorized');
                }
            });
        }

        for (let port of ports) {
            api.listen(port);
        }
    }
}

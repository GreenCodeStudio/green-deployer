import {GetObjectCommand, S3Client} from "@aws-sdk/client-s3";
import {createWriteStream, promises as fsPromises, existsSync} from 'fs';
import extractZip from "extract-zip";
import AWS from "aws-sdk";
import {Consumer} from 'sqs-consumer';

function getConfigPath() {
    let isWin = process.platform === "win32";
    let filePath = isWin ? 'file:///' + process.env.APPDATA + '/green-deployer-conf.js' : 'file:///etc/green-deployer-conf.js';
    return filePath;
}

export async function loadConfig() {
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
    console.log('extracting to  ' + config.path + '/versions/' + version)
    await extractZip(zipPath, {
        dir: config.path + '/versions/' + version,
        defaultDirMode: 0o777,
        defaultFileMode: 0o777
    })
    let path = config.path;
    let isWin = process.platform === "win32";
    console.log('process.platform', process.platform)
    if (isWin) {
        path = 'file://' + path
    }
    console.log('extracted to  ' + config.path + '/versions/' + version)

    let versionScripts = null
    try {
        versionScripts = await import(path + '/versions/' + version + '/deployment.js')

        versionScripts?.afterUnzip?.call(null, config.path + '/versions/' + version);
    } catch (ex) {
        console.warn('after unzip', ex)
    }
    await fsPromises.unlink(config.path + '/currentVersion').catch(() => false);


    await fsPromises.symlink('./versions/' + version, config.path + '/currentVersion', 'dir')
    try {
        versionScripts?.afterInstall?.call(null, config.path + '/versions/' + version);
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
            installedVersion = (await fsPromises.readlink(config.path + '/currentVersion')).split('/').pop()
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
export async function showConfig() {
    const filePath = getConfigPath();
    console.log('Config file path: ' + filePath);
    console.log('');
    console.log('Config file content:');
    const data = await fsPromises.readFile(filePath.replace('file://', ''));
    console.log(data.toString());
    console.log('Config file executed:')
    console.log(await loadConfig());
}

import {GetObjectCommand, S3Client} from "@aws-sdk/client-s3";
import {createWriteStream, promises as fsPromises, existsSync} from 'fs';
import extractZip from "extract-zip";
import AWS from "aws-sdk";
import {Consumer} from 'sqs-consumer';

export async function loadConfig() {
    let isWin = process.platform === "win32";
    let filePath = isWin ? 'file:///' + process.env.APPDATA + '/green-deployer-conf.js' : 'file:///etc/green-deployer-conf.js';
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

export async function listenQueue(queueUrl, region) {
    AWS.config.update({region});

    // const sqs = new AWS.SQS({apiVersion: '2012-11-05'});
    // const params = {
    //     QueueUrl: queueUrl,
    //     MaxNumberOfMessages: 1,
    //     VisibilityTimeout: 0,
    //     WaitTimeSeconds: 0
    // };
    // let tmp = sqs.receiveMessage(params, (err, data) => {
    //     if (err) {
    //         console.log(err, err.stack);
    //     } else {
    //         for (const name of new Set(data.Messages.map(x => x.Body))) {
    //             if (allConfig[name]) {
    //                 deploy(name, process.argv[4])
    //             }
    //         }
    //     }
    // });
    // console.log({tmp})


    const app = Consumer.create({
        queueUrl,
        handleMessage: async (message, done) => {
            console.log(message);
            console.log(message.Body);
            try {
                let allConfig = (await loadConfig());
                let data = JSON.parse(message.Body);
                if (allConfig[data.name]) {
                    await deploy(data.name, data.version)
                    done();
                    process.exit()
                }
            } catch (ex) {
            }
        }
    });

    app.on('error', (err) => {
        console.log(err.message);
    });

    app.start();
}

export async function list() {
    let allConfig = (await loadConfig());
    console.log(allConfig)
}

```bash
yarn global add green-deployer
```


## config file:
* windows: %appdata%/green-deployer-conf.js
* linux: /etc/green-deployer-conf.js

example:

```js
module.exports= {
"example":{
"path":"/home/example",
"source":{
        "type":"s3",
        "bucket":"gcs-deployment",
        "key":x=>`ems-warehouse/${x}.zip`,
        "lastVersionKey":"ems-warehouse/lastVersion"
}
}
}
```
* `path` - where will be deployed app 
* `source` - wfrom where download app
    * `source.type` - now available: `s3` - AWS S3
    * `source.bucket` - s3 bucket name
    * `source.key` - function, that gives path for given version
    * `source.lastVersionKey` - path for file contains name of last version

## cli
### listenQueue _queueUrl_ _region_
Listen for changes in AWS SQS
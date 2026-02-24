#  ABCI-App接口说明

Cometbft ABCI App (abci-v2-Identity-app) 接受以下格式的数据。同时需要注意，请求需要提供有效的token。token可以通过启动client/example/server.js后得到的URL来获取。

## API

### create

{ baseurl }\did\create

POST
{
"id":"cd1123sob",
"document":"base64-string",
"hashcode":"",
"revoked": false
}

### update

{ baseurl }\did\update

POST
{
"id":"cd1123sob",
"document":"new-base64-string",
"hashcode":"",
"revoked": false
}

### revoke

{ baseurl }\did\revoke\cd1123sob
DELETE

### search

{ baseurl }\did\search\cd1123sob
GET

### list

{ baseurl }\did\list
GET

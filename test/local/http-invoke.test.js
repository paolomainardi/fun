'use strict';

const HttpInvoke = require('../../lib/local/http-invoke');

const sinon = require('sinon');
const assert = sinon.assert;

var express = require('express');
const path = require('path');
const mkdirp = require('mkdirp-promise');
const { hasDocker } = require('../conditions');
const tempDir = require('temp-dir');
const rimraf = require('rimraf');
const fs = require('fs');
const expect = require('expect.js');
const httpx = require('httpx');

const FC = require('@alicloud/fc2');

const { serviceName, serviceRes, functionName, functionRes,
  httptriggerServiceRes, httpTriggerFunctionRes
} = require('./mock-data');

const { setProcess } = require('../test-utils');

const httpOutputStream = `"FC Invoke Start RequestId: 65ca478d-b3cf-41d5-b668-9b89a4d481d8
load code for handler:read.handler
--------------------response begin-----------------
SFRUUC8xLjEgMjAwIE9LCngtZmMtaHR0cC1wYXJhbXM6IGV5Snp
kR0YwZFhNaU9qSXdNQ3dpYUdWaFpHVnljeUk2ZXlKamIyNTBaVz
UwTFhSNWNHVWlPaUpoY0hCc2FXTmhkR2x2Ymk5cWMyOXVJbjBzS
W1obFlXUmxjbk5OWVhBaU9uc2lZMjl1ZEdWdWRDMTBlWEJsSWpw
YkltRndjR3hwWTJGMGFXOXVMMnB6YjI0aVhYMTkKCnRlc3RCb2R5
--------------------response end-----------------
--------------------execution info begin-----------------
OWM4MWI1M2UtZWQxNy00MzI3LWFjNzctMjhkYWMzNzRlMDU1CjE4MgoxOTk4CjIwCg==
--------------------execution info end-----------------
    
    
[0;32mRequestId: 65ca478d-b3cf-41d5-b668-9b89a4d481d8 	 Billed Duration: 44 ms 	 Memory Size: 1998 MB 	 Max Memory Used: 19 MB[0m
`;

const httpErrorOutputStream = `--------------------response begin-----------------
SFRUUC8xLjEgNDAwIE9LCgp0ZXN0Qm9keQ==
--------------------response end-----------------`;

describe('test http response', async () => {

  const httpInvoke = new HttpInvoke(serviceName, serviceRes, functionName, functionRes);

  it('test response success http trigger', async () => {
    const resp = {
      send: sinon.stub(),
      status: sinon.stub(),
      setHeader: sinon.stub()
    };

    httpInvoke.response(httpOutputStream, '', resp);
  
    assert.calledWith(resp.status, 200);
    assert.calledWith(resp.setHeader, 'content-type', ['application/json']);
    assert.calledWith(resp.send, Buffer.from('testBody'));
  });
  
  it('test response with 4xx invoke http status', async () => {
    const resp = {
      send: sinon.stub(),
      status: sinon.stub(),
      setHeader: sinon.stub()
    };
  
    httpInvoke.response(httpErrorOutputStream, '', resp);
  
    assert.calledWith(resp.status, '400');
    assert.calledWith(resp.send, Buffer.from('testBody'));
  });
  
  it('test response error http trigger', async () => {
    const resp = {
      send: sinon.stub(),
      status: sinon.stub(),
      setHeader: sinon.stub()
    };
      
    httpInvoke.response(httpErrorOutputStream, 'function invoke error', resp);
      
    assert.calledWith(resp.status, '400');
    assert.calledWith(resp.send, Buffer.from('testBody'));
  });
});

(hasDocker ? describe : describe.skip)('Integration::http-invoke', () => {
  const projectDir = path.join(tempDir, 'http-invoke-it-dir'); 
  const ymlPath = path.join(projectDir, 'template.yml');
  const index = path.join(projectDir, 'index.py');
  const serverPort = 8990;
  const accountId = 'testAccountId';
  const accessKeyId = 'testKeyId';
  const accessKeySecret = 'testKeySecret';

  let app;
  let server;
  let restoreProcess;
  let httpInvoke;
  
  beforeEach(async () => {

    await mkdirp(projectDir);

    app = express();

    restoreProcess = setProcess({
      ACCOUNT_ID: accountId,
      ACCESS_KEY_ID: accessKeyId,
      ACCESS_KEY_SECRET: accessKeySecret,
    }, projectDir);

    console.log('tempDir: %s', projectDir);
  
    fs.writeFileSync(index, `
def handler(environ, start_response):
    status = '200 OK'
    response_headers = [('Content-type', 'text/plain')]
    start_response(status, response_headers)
    return [b"Hello world!\\n"]
`);
  });
    
  afterEach(async () => {
    rimraf.sync(projectDir);
    restoreProcess();

    server.close();
  });
  
  it('test http local invoke with authType anonymous', async () => {

    server = app.listen(serverPort, () => {
      console.log(`anonymous http server start on port ${serverPort}!`);
      console.log();
    });

    const endpointPrefix = `/2016-08-15/proxy/${serviceName}/${functionName}`;
    const endpoint = `${endpointPrefix}*`;

    httpInvoke = new HttpInvoke(serviceName, httptriggerServiceRes,
      functionName, httpTriggerFunctionRes, null, null, ymlPath, 'ANONYMOUS', endpointPrefix);

    app.get(endpoint, async (req, res) => {
      await httpInvoke.invoke(req, res);
    });

    const resp = await httpx.request(`http://localhost:${serverPort}${endpointPrefix}`, {
      method: 'GET',
      timeout: '3000'
    });

    const body = await httpx.read(resp, 'utf8');

    expect(body).to.contain('Hello world!');

    await httpInvoke.runner.stop();
  });

  it('test http local invoke with authType function with invalid signature', async () => {
    const functionServerPort = serverPort + 1;

    server = app.listen(functionServerPort, () => {
      console.log(`function http server start on port ${functionServerPort}!`);
      console.log();
    });

    const endpointPrefix = `/2016-08-15/proxy/${serviceName}/${functionName}`;
    const endpoint = `${endpointPrefix}*`;

    httpInvoke = new HttpInvoke(serviceName, httptriggerServiceRes,
      functionName, httpTriggerFunctionRes, null, null, ymlPath, 'FUNCTION', endpointPrefix);

    app.get(endpoint, async (req, res) => {
      await httpInvoke.invoke(req, res);
    });

    const resp = await httpx.request(`http://localhost:${functionServerPort}${endpointPrefix}`, {
      method: 'GET',
      timeout: '3000'
    });

    const body = await httpx.read(resp, 'utf8');

    expect(body).to.contain('Signature doesn\'t match, request signature is');
    
    await httpInvoke.runner.stop();
  });

  it('test http local invoke with authType function with valid signature', async () => {
    const functionServerPort = serverPort + 2;

    server = app.listen(functionServerPort, () => {
      console.log(`function http server start on port ${functionServerPort}!`);
      console.log();
    });

    const endpointPrefix = `/2016-08-15/proxy/${serviceName}/${functionName}`;
    const endpoint = `${endpointPrefix}*`;

    const httpInvoke = new HttpInvoke(serviceName, httptriggerServiceRes,
      functionName, httpTriggerFunctionRes, null, null, ymlPath, 'FUNCTION', endpointPrefix);

    app.get(endpoint, async (req, res) => {
      await httpInvoke.invoke(req, res);
    });

    const headers = {
      'content-type': 'text/plain'
    };

    const signature = FC.getSignature(accessKeyId, accessKeySecret, 'GET', endpointPrefix, headers);

    headers['authorization'] = signature;

    const resp = await httpx.request(`http://localhost:${functionServerPort}${endpointPrefix}`, {
      method: 'GET',
      timeout: '3000',
      headers
    });

    const body = await httpx.read(resp, 'utf8');

    expect(body).to.contain('Hello world!');
    
    await httpInvoke.runner.stop();
  });
});

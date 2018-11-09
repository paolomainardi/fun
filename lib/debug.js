'use strict';

const util = require('util');
const fs = require('fs');
const path = require('path');

const lstat = util.promisify(fs.lstat);
const { red } = require('colors');

const debug = require('debug')('fun:local');


async function generateVscodeDebugConfig(serviceName, functionName, runtime, codePath, debugPort) {
    
    const stats = await lstat(codePath);

    if (!stats.isDirectory()) {
        codePath = path.dirname(codePath);
    }

    switch (runtime) {
        case "nodejs6":
            return {
                "version": "0.2.0",
                "configurations": [
                    {
                        "name": `fc/${serviceName}/${functionName}`,
                        "type": "node",
                        "request": "attach",
                        "address": "localhost",
                        "port": debugPort,
                        "localRoot": `${codePath}`,
                        "remoteRoot": "/code",
                        "protocol": "legacy",
                        "stopOnEntry": false
                    }
                ]
            };
        case "nodejs8":
            return {
                "version": "0.2.0",
                "configurations": [
                    {
                        "name": `fc/${serviceName}/${functionName}`,
                        "type": "node",
                        "request": "attach",
                        "address": "localhost",
                        "port": debugPort,
                        "localRoot": `${codePath}`,
                        "remoteRoot": "/code",
                        "protocol": "inspect",
                        "stopOnEntry": false
                    }
                ]
            };
        case "python3":
        case "python2.7":
            return {
                "version": "0.2.0",
                "configurations": [
                    {
                        "name": `fc/${serviceName}/${functionName}`,
                        "type": "python",
                        "request": "attach",
                        "host": "localhost",
                        "port": debugPort,
                        "pathMappings": [
                            {
                                "localRoot": `${codePath}`,
                                "remoteRoot": "/code"
                            }
                        ]
                    }
                ]
            };
        case "java8":
            return {
                "version": "0.2.0",
                "configurations": [
                    {  
                        "name": `fc/${serviceName}/${functionName}`,
                        "type": "java",
                        "request": "attach",
                        "hostName": "localhost",
                        "port": debugPort,
                    }
                ]
            };
        // todo: add more runtime support
        case "php7.2":
            
            break;
        default:
            break;
    }

    debug("CodePath: " + codePath);
}

function generateDebugEnv(runtime, debugPort) {
    switch (runtime) {
        case "nodejs8":
            return `DEBUG_OPTIONS=--inspect-brk=0.0.0.0:${debugPort}`;
        case "nodejs6":
            return `DEBUG_OPTIONS=--debug-brk=${debugPort}`;
        case "python2.7":
        case "python3":
            return '';
        case "java8":
            return `DEBUG_OPTIONS=-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,quiet=y,address=${debugPort}`;
        case "php7.2":
            // todo: add more runtime support
            break;
        default:
            console.error(red("could not found runtime."));
            process.exit(-1);
    }
}

function generateDockerDebugOpts(debug_port) {
    const exposedPort = `${debug_port}/tcp`

    return {
        ExposedPorts: {
            [exposedPort]: {}
        },
        HostConfig: {
            PortBindings: {
                [exposedPort]: [
                    {
                        "HostIp": "",
                        "HostPort": `${debug_port}`
                    }
                ]
            },
        }
    };
}

module.exports = {
    generateVscodeDebugConfig, generateDebugEnv, generateDockerDebugOpts
}
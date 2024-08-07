#!/usr/bin/env node

const { Command } = require("commander");
const { logger } = require("./logger/index");
const cfUtil = require("./lib/util/cf")
// Declare the program
const program = new Command();

// Add actions onto that CLI
program.command('hello')
        .description("say hello to some one..!")
        .argument("<string>", "string to say hi to")
        .action((string) => {
                console.log(`hi ${string} ..!`);
        })

program.command('cftarget')
        .description("get cloud foundry target")        
        .action(async () => {
                        result = await cfUtil.getCfTarget();
                        console.log(result);
                });


// program.command('mycfoauth')
//         .action(async () => {
//                 result = await cfUtil.getCfAuthorization();
//                 console.log(result);
//         })
//         .description("Cloud Foundry OAuthToken");

// program.command('mycfv')
//         .action(async () => {
//                 result = await cfUtil.checkCliVersion();
//                 console.log(result);
//         })
//         .description("Cloud Foundry Version");

// program.command('mycfspaceinfo')
//         .action(async () => {
//                 try {
//                         result = await cfUtil.getCfSpaceInfo();
//                         console.log(result);
//                 }
//                 catch (e) {
//                         console.log(e);
//                 }
//         })
//         .description("Cloud Foundry Version");

// program.command('mycfservice')
//         .addArgument("<serviceName>", "Service")
//         .addArgument("<servicePlan>", "Plan")
//         .addArgument("<serviceInstanceName>", "Service Instance Name")
//         .action(async (serviceName, servicePlan, serviceInstanceName) => {
//                 try {
//                         result = await cfUtil.getOrProvisionService(serviceName, servicePlan, serviceInstanceName);
//                         console.log(result);
//                 }
//                 catch (e) {
//                         console.log(e);
//                 }
//         })
//         .description("Create/ Get Cloud Foundry Service");

// program.command('mysflightsetup')
//         .action(async () => {
//                 try {
//                         await hanaUtil.setupSflight();
//                 }
//                 catch (e) {
//                         console.log(e);
//                 }
//         }).description("Setup SFLIGHT Demo in SAP HANA Cloud")


// Execute the CLI with the given arguments
program.parse(process.argv);

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


program.command('cfv')
        .description("get cf cli version")
        .action(async () => {
                        result = await cfUtil.checkCliVersion();
                        console.log(result);
                });


program.command('cfoauth')
        .description("get cloud foundry oauth token")
        .action(async () => {
                result = await cfUtil.getCfAuthorization();
                console.log(result);
        });

program.command('cftarget')
        .description("get cloud foundry target information")        
        .action(async () => {
                        result = await cfUtil.getCfTarget();
                        console.log(result);
                });



program.command('cfspace')
        .description("get cf space info")
        .action(async () => {
                try {
                        result = await cfUtil.getCfSpaceInfo();
                        console.log(result);
                }
                catch (e) {
                        console.log(e);
                }
        });

program.command('cfservice')
        .description("create / get cloud foundry service")
        .addArgument("<serviceName>", "service")
        .addArgument("<servicePlan>", "plan")
        .addArgument("<serviceInstanceName>", "service instance name")
        .action(async (serviceName, servicePlan, serviceInstanceName) => {
                try {
                        result = await cfUtil.getOrProvisionService(serviceName, servicePlan, serviceInstanceName);
                        console.log(result);
                }
                catch (e) {
                        console.log(e);
                }
        })
        

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

#!/usr/bin/env node

const { Command } = require("commander");
const { logger } = require("./logger/index");
const cfUtil = require("./lib/util/cf")
// Declare the program
const program = new Command();

// Add actions onto that CLI
program.command('hello')
        .argument("<string>", "String to say hi to")
        .action((string) => {
                console.log(`Hello ${string}`);
        })
        .description("Say Hello..!");

program.command('mycftarget')
        .action(async () => {
                result = await cfUtil.getCfTarget();
                console.log(result);
        })
        .description("Cloud Foundry Target");

program.command('mycfoauth')
        .action(async () => {
                result = await cfUtil.getCfAuthorization();
                console.log(result);
        })
        .description("Cloud Foundry OAuthToken");

program.command('mycfv')
        .action(async () => {
                result = await cfUtil.checkCliVersion();
                console.log(result);
        })
        .description("Cloud Foundry Version");

program.command('mycfspaceinfo')
        .action(async () => {
                try {
                        result = await cfUtil.getCfSpaceInfo();
                        console.log(result);
                }
                catch (e) {
                        console.log(e);
                }
        })
        .description("Cloud Foundry Version");


// Execute the CLI with the given arguments
program.parse(process.argv);

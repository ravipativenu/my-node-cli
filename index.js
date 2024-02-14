#!/usr/bin/env node

const { Command } = require("commander");
const { logger } = require("./logger/index");

// Declare the program
const program = new Command();

// Add actions onto that CLI
program
    .argument("<string>", "string to log")
    .action((message) => {
        logger.info("Info Message", { meta1: 'meta1' });
        logger.warn("Warning Message");
        logger.error("Error Message");
        console.log(`Hello ${message}`);
    })
    .description("Say Hello..!");

// Execute the CLI with the given arguments
program.parse(process.argv);

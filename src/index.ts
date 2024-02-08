#! /usr/bin/env node

import { Command } from "commander";
import { logger } from "./logger/index"

// Declare the program

const program = new Command();

// Add actions onto that CLI

program
    .argument("<string>", "string to log")
    .action((message: string) => {
        logger.info("Info Message", {meta1: 'meta1'});
        logger.warn("Warning Message");
        logger.error("Error Message");
        console.log(`Hello ${message}`);
    }).description("Say Hello..!");

// Execute the CLI with the given arguments

program.parse(process.argv)

import { timeStamp } from "console";
import { createLogger, transports, format, Logger } from "winston";

export function buildProdLogger(): Logger {

    const logger: Logger = createLogger({
        transports: [new transports.Console()],
        format: format.combine(format.colorize(), format.timestamp(), format.errors({stack: true}), format.json()),
        defaultMeta: { service: 'my-node-cli' },
    });

    return logger
}

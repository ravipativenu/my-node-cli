import { timeStamp } from "console";
import { createLogger, transports, format, Logger } from "winston";

export function buildDevLogger(): Logger {

  const myCustomFormat = format.printf((info) => {
    return `${info.timestamp} ${info.level}: ${info.stack || info.message}`;
  })

  const logger: Logger = createLogger({
    transports: [new transports.Console()],
    format: format.combine(format.colorize(), format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), myCustomFormat),
  });

  return logger
}










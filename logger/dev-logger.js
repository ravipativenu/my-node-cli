const { createLogger, transports, format } = require('winston');

function buildDevLogger() {
    const myCustomFormat = format.printf((info) => {
        return `${info.timestamp}: ${info.level}: ${info.stack || info.message}`;
    });

    const logger = createLogger({
        transports: [new transports.Console()],
        format: format.combine(format.colorize(), format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), myCustomFormat),
    });

    return logger;
}

module.exports = { buildDevLogger };

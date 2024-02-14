const { createLogger, transports, format } = require('winston');

function buildProdLogger() {
    const logger = createLogger({
        transports: [new transports.Console()],
        format: format.combine(format.colorize(), format.timestamp(), format.errors({ stack: true }), format.json()),
        defaultMeta: { service: 'my-node-cli' },
    });

    return logger;
}

module.exports = { buildProdLogger };

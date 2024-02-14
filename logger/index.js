const { buildDevLogger } = require('./dev-logger');
const { buildProdLogger } = require('./prod-logger');
const { Logger } = require('winston');

let logger;

if (process.env.NODE_ENV === 'development') {
    logger = buildDevLogger();
} else if (process.env.NODE_ENV === 'production') {
    logger = buildProdLogger();
} else {
    logger = buildDevLogger();
}

module.exports = { logger };

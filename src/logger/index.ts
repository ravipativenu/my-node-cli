import { buildDevLogger } from "./dev-logger"
import { buildProdLogger } from "./prod-logger"
import { Logger } from "winston"

let logger: Logger;

if (process.env.NODE_ENV === 'development') {
    logger = buildDevLogger();
} else if (process.env.NODE_ENV === 'production') {
    logger = buildProdLogger();
} else {
    logger = buildDevLogger();
};


export { logger };
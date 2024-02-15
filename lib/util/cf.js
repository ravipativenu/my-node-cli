const { logger } = require("../../logger/index");

const cp = require('child_process');
const util = require('util');
const path = require('path');
const fsp = require('fs').promises;
const os = require('os');
const execAsync = util.promisify(cp.exec);
const { bold, warn } = require('./term');

const CF_CLIENT_MINIMUM_VERSION = 9;

class CFUtil {

    async parseOptions(command) {
        logger.info("parseOptions method");
        logger.info(`Command: ${command}`);
        let response;
        switch (command) {
            case 't':
                logger.info(`Routing to ${command}`);
                response = await this.getCfTargetFromCli();
            case 'o':
                logger.info(`Routing to ${command}`);
                response = await this.getCfAuthorization();
        }
        return response;
    }


/**
 * Executes a Cloud Foundry (CF) command asynchronously.
 *
 * @async
 * @param {...string} args - Arguments for the CF command.
 * @returns {Promise<{ stdout: string, stderr: string }>} - A promise that resolves with the result of the command execution.
 * @throws {Error} - If there's an error during execution.
 */
    async cfRun(...args) {
        let cmdLine = ""
        if (args.length === 1) {
            cmdLine = `cf ${args}`;
        } else {
            args = args.map(arg => arg.replace(/"/g, '\\"'));
            cmdLine = `cf "${args.join('" "')}"`;
        }
        logger.info(`>>> ${cmdLine}`);

        try {
            const result = await execAsync(cmdLine, {
                shell: true,
                stdio: ['inherit', 'pipe', 'inherit']
            });
            result.stdout = result.stdout?.trim();
            result.stderr = result.stderr?.trim();
            return result;
        } catch (err) {
            err.stdout = err.stdout?.trim();
            err.stderr = err.stderr?.trim();
            throw err;
        } finally {
            // eslint-disable-next-line no-console
            logger.debug('>>>', "Timeout");
        }
    }

    async cfRequest(urlPath, queryObj, bodyObj) {
        if (queryObj) {
            const entries = Object.entries(queryObj);
            const queryStr = entries.map(([key, value]) => {
                // commas cause problems in cf curl when not double encoded
                value = value.replace(/,/g, encodeURIComponent(','));
                return `${key}=${encodeURIComponent(value)}`;
            }).join('&');

            urlPath = urlPath + `?${queryStr}`;
        }

        // cf curl PATH [-iv] [-X METHOD] [-H HEADER]... [-d DATA] [--output FILE]
        const args = ['curl', urlPath];
        if (bodyObj) {
            args.push('-d');
            args.push(JSON.stringify(bodyObj)); // cfRun uses spawn so no special handling for quotes on cli required
        }

        const result = await this.cfRun(...args);
        let response = {};
        if (result.stdout) {
            response = JSON.parse(result.stdout);
        } else if (result.stderr) {
            response = { errors: [{ title: result.stderr }] };
        }

        if (response.errors) {
            const errorMessage = response.errors.map((entry) => `${entry.title || ''}: ${entry.detail || ''} (${entry.code || ''})`).join('\n');
            throw new Error(errorMessage);
        }

        return response;
    }

    _extract(string, pattern, errorMsg) {
        const match = string.match(pattern);
        if (match?.[1]) {
            return match[1];
        }
        throw new Error(errorMsg);
    }

    async getCfAuthorization() {
        logger.info('getting authorization');
        return await this.cfRun('oauth-token');
    }

    async checkCliVersion() {
        logger.info("get version")
        const result = await this.cfRun('-v');
        const version = result?.stdout?.match(/version.*(\d+\.\d+\.\d+)/i)
        if (parseInt(version?.[1]) < CF_CLIENT_MINIMUM_VERSION) {
            console.log(warn(`
[Warning] You are using Cloud Foundry client version ${version[1]}. We recommend version ${CF_CLIENT_MINIMUM_VERSION} or higher.
Deployment will stop in the near future for Cloud Foundry client versions < ${CF_CLIENT_MINIMUM_VERSION}.
`));
        }
    }

    async getOrCreateService(serviceOfferingName, planName, serviceName, options) {

        const probeService = await this.getService(serviceName, false);
        if (probeService) {
            console.log(`Getting service ${bold(serviceName)}`);
            return probeService;
        }

        console.log(`Creating service ${bold(serviceName)} - please be patient...`);

        const spaceInfo = await this.getCfSpaceInfo();

        const servicePlan = await this._cfRequest(`/v3/service_plans`, {
            names: planName,
            space_guids: spaceInfo.spaceGuid,
            organization_guids: spaceInfo.orgGuid,
            service_offering_names: serviceOfferingName
        });

        if (!servicePlan?.resources?.length) {
            throw new Error(`No service plans found`);
        }

        const body = {
            type: 'managed',
            name: serviceName,
            tags: [serviceOfferingName],
            relationships: {
                space: {
                    data: {
                        guid: spaceInfo.spaceGuid
                    }
                },
                service_plan: {
                    data: {
                        guid: servicePlan.resources[0].guid
                    }
                }
            }
        }

        if (options) {
            body.parameters = { ...options };
        }

        const postResult = await this._cfRequest('/v3/service_instances', undefined, body);
        if (postResult?.errors) {
            throw new Error(postResult.errors[0].detail);
        }

        const newService = await this.getService(serviceName, false);
        if (newService) {
            return newService;
        }

        throw new Error(`Could not create service ${bold(serviceName)}`);
    }


    async getService(serviceName, showMessage = true) {
        logger.info(`Getting service ${bold(serviceName)}`);
        const spaceInfo = await this.getCfSpaceInfo();

        let counter = POLL_COUNTER;
        while (counter > 0) {
            counter--;
            const serviceInstances = await this._cfRequest('/v3/service_instances', {
                names: serviceName,
                space_guids: spaceInfo.spaceGuid,
                organization_guids: spaceInfo.orgGuid
            });
            if (!serviceInstances?.resources?.length) {
                return null;
            }

            const serviceInstance = serviceInstances.resources[0];
            switch (serviceInstance?.last_operation?.state?.toLowerCase()) {
                case OPERATION_STATE_INITIAL:
                case OPERATION_STATE_IN_PROGRESS:
                    await this._sleep(POLL_DELAY);
                    break;

                case OPERATION_STATE_SUCCEEDED:
                    return serviceInstance;

                case OPERATION_STATE_FAILED:
                    throw new Error(`The returned service reported state '${OPERATION_STATE_FAILED}'.\n${JSON.stringify(serviceInstance, null, 4)}`);

                default:
                    console.error(`Unsupported server response state '${serviceInstance?.last_operation?.state}'. Waiting for next response.`);
                    break;
            }
        }

        throw new Error(`Timeout occurred while getting service ${bold(serviceName)}`);
    }

    async getCfSpaceInfo() {
        if (!this.spaceInfo) {
            logger.info('getting space info');

            const target = await this.getCfTarget();

            const { org, space } = target;
            const orgs = await this.cfRequest(`/v3/organizations`, { names: org });
            if (!orgs?.resources?.length) {
                throw new Error(`CF org ${bold(org)} not found!`);
            }

            const orgGuid = orgs.resources[0].guid;
            const spaces = await this.cfRequest(`/v3/spaces`, { names: space, organization_guids: orgGuid });
            if (!spaces?.resources?.length) {
                throw new Error(`CF space ${bold(space)} not found in org ${bold(org)}!`);
            }

            const spaceGuid = spaces.resources[0].guid;

            this.spaceInfo = Object.assign({}, target, { orgGuid, spaceGuid });
        }

        return this.spaceInfo;
    }


    async getCfTarget() {
        await this.checkCliVersion();
        await this.getCfAuthorization();
        return await this.getCfTargetFromConfigFile() || await this.getCfTargetFromCli();
    }


    async getCfTargetFromConfigFile() {
        logger.info('getting cf target from config')
        const cfHome = process.env.CF_HOME || process.env.cf_home || path.join(os.homedir(), '.cf');
        try {
            const fileContent = await fsp.readFile(path.join(cfHome, 'config.json'));
            const config = JSON.parse(fileContent);
            if (config) {
                return {
                    apiEndpoint: this._extract(config.Target, /\s*(.+)\s*/, `CF API endpoint is missing. Use 'cf login' to login.`),
                    org: this._extract(config.OrganizationFields.Name, /\s*(.+)\s*/, `CF org is missing. Use 'cf target -o <ORG>' to specify.`),
                    space: this._extract(config.SpaceFields.Name, /\s*(.+)\s*/, `CF space is missing. Use 'cf target -s <SPACE>' to specify.`)
                }
            }
        } catch (err) {
            LOG.debug(`getCfTargetFromConfigFile: ${err}`);
        }
    }

    async getCfTargetFromCli() {
        logger.info('getting target');
        const result = await this.cfRun('target');
        if (result?.stdout) {
            return {
                apiEndpoint: this._extract(result.stdout, /api endpoint\s*:\s*([^\s]+)/i, `CF API endpoint is missing. Use 'cf login' to login.`),
                user: this._extract(result.stdout, /user\s*:\s*(.+)/i, `CF user is missing. Use 'cf login' to login.`),
                org: this._extract(result.stdout, /org\s*:\s*(.+)/i, `CF org is missing. Use 'cf target -o <ORG>' to specify.`),
                space: this._extract(result.stdout, /space\s*:\s*(.+)/i, `CF space is missing. Use 'cf target -s <SPACE>' to specify.`),
            };
        }
    }


}


module.exports = new CFUtil();
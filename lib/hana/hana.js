const { logger } = require("../../logger/index");

const cp = require('child_process');
const util = require('util');
const path = require('path');
const fsp = require('fs').promises;
const os = require('os');
const execAsync = util.promisify(cp.exec);
const { bold, warn } = require('./term');

const CF_COMMAND = 'cf';
const CF_CLIENT_MINIMUM_VERSION = 9;
const POLL_COUNTER = 40;
const POLL_DELAY = 2500; //ms

const OPERATION_STATE_INITIAL = 'initial';
const OPERATION_STATE_IN_PROGRESS = 'in progress';
const OPERATION_STATE_FAILED = 'failed';
const OPERATION_STATE_SUCCEEDED = 'succeeded';

class CFUtil {

    async _sleep(ms) {
        return new Promise((resolve) => {
            setTimeout(resolve, ms);
        });
    }

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
        args = args.map(arg => arg.replace(/"/g, '\\"'));
        const cmdLine = `${CF_COMMAND} "${args.join('" "')}"`;
        console.time(cmdLine);
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
            console.timeEnd(cmdLine);
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
            logger.info(`Getting service ${bold(serviceName)}`);
            return probeService;
        }

        console.log(`Creating service ${bold(serviceName)} - please be patient...`);

        const spaceInfo = await this.getCfSpaceInfo();

        const servicePlan = await this.cfRequest(`/v3/service_plans`, {
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

        const postResult = await this.cfRequest('/v3/service_instances', undefined, body);
        if (postResult?.errors) {
            throw new Error(postResult.errors[0].detail);
        }

        const newService = await this.getService(serviceName, false);
        if (newService) {
            return newService;
        }

        throw new Error(`Could not create service ${bold(serviceName)}`);
    }

    /**
     * Asynchronously retrieves information about a Cloud Foundry (CF) service.
     *
     * @async
     * @param {string} serviceName - The name of the service to retrieve.
     * @returns {Promise<{
    *   apiEndpoint: string,
    *   user: string,
    *   org: string,
    *   space: string,
    *   orgGuid: string,
    *   spaceGuid: string,
    *   lastOperation: {
    *     state: string
    *   }
    * } | null>} - A promise that resolves with an object containing service details or null if not found.
    * @throws {Error} - If there's an error during execution or a timeout occurs.
    */

    async getService(serviceName) {
        logger.info(`Getting service ${bold(serviceName)}`);
        const spaceInfo = await this.getCfSpaceInfo();

        let counter = POLL_COUNTER;
        while (counter > 0) {
            counter--;
            const serviceInstances = await this.cfRequest('/v3/service_instances', {
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

    /**
     * Asynchronously retrieves information about the Cloud Foundry (CF) space.
     *
     * @async
     * @returns {Promise<{
    *   apiEndpoint: string,
    *   user: string,
    *   org: string,
    *   space: string,
    *   orgGuid: string,
    *   spaceGuid: string
    * }>} - A promise that resolves with an object containing CF space details.
    * @throws {Error} - If there's an error during execution or required information is missing.
    */
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

    /**
     * Asynchronously retrieves the Cloud Foundry (CF) target.
     *
     * @async
     * @returns {Promise<{ stdout: string, stderr: string }>} - A promise that resolves with the result of the CF target retrieval.
     * @throws {Error} - If there's an error during execution.
     */

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
            logger.debug(`getCfTargetFromConfigFile: ${err}`);
        }
    }

    /**
     * Asynchronously retrieves the Cloud Foundry (CF) target information from the CLI.
     *
     * @async
     * @returns {Promise<{
     *   apiEndpoint: string,
     *   user: string,
     *   org: string,
     *   space: string
     * }>} - A promise that resolves with an object containing CF target details.
     * @throws {Error} - If there's an error during execution or required information is missing.
     */

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


    /**
     * Asynchronously retrieves an existing service key for a given service instance.
     *
     * @async
     * @param {Object} serviceInstance - The service instance object.
     * @param {string} serviceKeyName - The name of the service key.
     * @returns {Promise<Object | null>} - A promise that resolves with the service key object or null if not found.
     * @throws {Error} - If there's an error during execution or if the service key cannot be created.
     */

    async getServiceKey(serviceInstance, serviceKeyName) {
        logger.info(`Getting service key ${bold(serviceKeyName)}`);

        let counter = POLL_COUNTER;
        while (counter > 0) {
            counter--;
            const bindings = await this.cfRequest(`/v3/service_credential_bindings`, { names: serviceKeyName, service_instance_guids: serviceInstance.guid });
            if (!bindings?.resources?.length) {
                return null;
            }

            const binding = bindings.resources[0];
            switch (binding?.last_operation?.state?.toLowerCase()) {
                case OPERATION_STATE_INITIAL:
                case OPERATION_STATE_IN_PROGRESS:
                    await this._sleep(POLL_DELAY);
                    break;

                case OPERATION_STATE_SUCCEEDED: {
                    const keyDetails = await this.cfRequest(`/v3/service_credential_bindings/${encodeURIComponent(binding.guid)}/details`);
                    return keyDetails.credentials;
                }

                case OPERATION_STATE_FAILED:
                    throw new Error(`The returned binding reported state '${OPERATION_STATE_FAILED}'.\n${JSON.stringify(binding, null, 4)}`);

                default:
                    console.error(`Unsupported server response state '${binding?.last_operation?.state}'. Waiting for next response.`);
                    break;
            }
        }

        throw new Error(`Timeout occurred while getting service key ${bold(serviceKeyName)}`);
    }


    /**
     * Asynchronously gets an existing service key or creates a new one for a given service instance.
     *
     * @async
     * @param {Object} serviceInstance - The service instance object.
     * @param {string} serviceKeyName - The name of the service key.
     * @param {Object} parameters - Additional parameters for creating the service key.
     * @returns {Promise<Object>} - A promise that resolves with the service key object or rejects with an error.
     * @throws {Error} - If there's an error during execution or if the service key cannot be created.
     */

    async getOrCreateServiceKey(serviceInstance, serviceKeyName, parameters) {
        const serviceKey = await this.getServiceKey(serviceInstance, serviceKeyName);
        if (serviceKey) {
            logger.info(`Getting service key ${bold(serviceKeyName)}`);
            return serviceKey;
        }

        logger.info(`Creating service key ${bold(serviceKeyName)} - please be patient...`);

        const body = {
            type: 'key',
            name: serviceKeyName,
            relationships: {
                service_instance: {
                    data: {
                        guid: serviceInstance.guid
                    }
                }
            },
            parameters
        }

        const postResult = await this.cfRequest('/v3/service_credential_bindings', undefined, body);
        if (postResult?.errors) {
            throw new Error(postResult.errors[0].detail);
        }

        const newServiceKey = await this.getServiceKey(serviceInstance, serviceKeyName, false);
        if (newServiceKey) {
            return newServiceKey;
        }

        throw new Error(`Could not create service key ${bold(serviceKeyName)}`);
    }

    async getOrProvisionService(serviceOfferingName, planName, serviceName, options) {
        const serviceInstance = await this.getOrCreateService(serviceOfferingName, planName, serviceName, options);
        const serviceKeyName = serviceInstance.name + "-key";
        let parameters = {};
        const serviceKey = await this.getOrCreateServiceKey(serviceInstance, serviceKeyName, parameters);
        return serviceKey;
    }

}


module.exports = new CFUtil();
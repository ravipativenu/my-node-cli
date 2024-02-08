// import * as cp from 'child_process';
// import * as fsp from 'fs/promises';
// import * as os from 'os';
// import * as path from 'path';
// import * as util from 'util';

// const IS_WIN: Boolean = os.platform() === 'win32';
// const execAsync = util.promisify(cp.exec);

// const CF_COMMAND = 'cf';

// const POLL_COUNTER = 40;
// const POLL_DELAY = 2500; //ms

// const OPERATION_STATE_INITIAL = 'initial';
// const OPERATION_STATE_IN_PROGRESS = 'in progress';
// const OPERATION_STATE_FAILED = 'failed';
// const OPERATION_STATE_SUCCEEDED = 'succeeded';

// const CF_CLIENT_MINIMUM_VERSION = 8;

// class CFUtil {

//         private spaceInfo: any | null;
    
//         private async _cfRun(args: string[]): Promise<{ stdout: string; stderr: string }> {
//             args = args.map((arg) => arg.replace(/"/g, '\\"'));
//             const cmdLine = `${CF_COMMAND} "${args.join('" "')}"`;
//             console.time(cmdLine);
//             LOG.debug('>>>', cmdLine);
    
//             try {
//                 const result = await execAsync(cmdLine, {
//                     shell: IS_WIN,
//                     stdio: ['inherit', 'pipe', 'inherit'],
//                 });
//                 result.stdout = result.stdout?.trim();
//                 result.stderr = result.stderr?.trim();
//                 return result;
//             } catch (err) {
//                 err.stdout = err.stdout?.trim();
//                 err.stderr = err.stderr?.trim();
//                 throw err;
//             } finally {
//                 // eslint-disable-next-line no-console
//                 DEBUG && console.timeEnd(cmdLine);
//             }
//         }
// }
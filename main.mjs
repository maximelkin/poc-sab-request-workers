import { Worker } from 'worker_threads';
import * as http from 'http';

const WORKERS_COUNT = process.env.WORKERS_COUNT || 2;
const WAIT_QUEUE_LENGTH = process.env.WAIT_QUEUE_LENGTH || 5;

let exiting = false;

const sabs_pool = [];
for (let i = 0; i < WORKERS_COUNT + WAIT_QUEUE_LENGTH; i++) {
    sabs_pool.push({
        sab: new SharedArrayBuffer(128 * 1024),
        inProcess: false,
    })
}
function spinWorker() {
    if (exiting) {
        return;
    }
    const worker = new Worker('./worker.mjs');
    let pos = workers_pool.push({
        schedule: (data) => {
            return new Promise((resolve, reject) => {
                worker.once('message', resolve);
                worker.once('error', reject);
                worker.postMessage(data);
            })
        },
        inProcess: false,
    });
    worker.on('exit', (code) => {
        if (code !== 0) {
            console.error(new Error(`Worker stopped with exit code ${code}`));
            spinWorker();
        }

        workers_pool.splice(pos, 1);
    });
}

const workers_pool = [];
for (let i = 0; i < WORKERS_COUNT; i++) {
    spinWorker();
}

const onFreeWorker = []; // queue of promises
async function pickWorker() {
    // queueing|waiting stuff
    let worker = workers_pool.find(worker => !worker.inProcess);
    if (!worker) {
        worker = await new Promise((resolve) => {
            onFreeWorker.push(resolve);
        })
    }
    worker.inProcess = true;

    return worker;
}

function pickSAB() {
    const sab = sabs_pool.find(sab => !sab.inProcess);
    if (!sab) {
        return null;
    }
    sab.inProcess = true;
    return sab;
}

const server = http.createServer(async (request, response) => {
    const sabObj = pickSAB();
    if (!sabObj) {
        response.statusCode = 400;
        return response.end('no available workers');
    }

    let totalLength = 0;
    const sab = sabObj.sab;
    const sab8Array = new Uint8Array(sab, 4);
    request.on('data', d => {
        // preprocess???
        d.copy(sab8Array, totalLength);
        totalLength += d.length;
    });

    const worker = await pickWorker();

    request.on('end', () => {
        const dataView = new DataView(sab);
        dataView.setUint32(0, totalLength);

        worker.schedule(sab)
            .then(() => {
                const lengthInBytes = dataView.getUint32(0);
                const result = sab8Array.subarray(0, lengthInBytes);
                response.end(result, () => {
                    worker.inProcess = false;
                    sabObj.inProcess = false;

                    if (onFreeWorker.length > 0) {
                        onFreeWorker.shift()(worker);
                    }
                });
            });
    })
}).listen(8080);

process.on('exit', () => {
    server.close();
    exiting = true;
});

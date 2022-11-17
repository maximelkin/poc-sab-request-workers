import * as worker_threads from 'worker_threads';

worker_threads.parentPort.on('message', message => {
    const result = processor(message);
    worker_threads.parentPort.postMessage(result);
});

const encoder = new TextEncoder();
function processor(sab) {
    const d = new DataView(sab);
    const res = new Uint8Array(sab, 4);

    const encodeResult = encoder.encodeInto('Hello World', res);
    d.setUint32(0, encodeResult.written);

    return sab;
}

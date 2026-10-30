import {parentPort,workerData} from 'node:worker_threads';
import fs from 'node:fs';

// The production module and message protocol, with only file transport adapted
// for Node. It still verifies and decodes the complete original source bundle.
globalThis.fetch=async input=>new Response(fs.readFileSync(input));
globalThis.self={addEventListener:(_name,listener)=>parentPort.on('message',data=>listener({data})),postMessage:data=>parentPort.postMessage(data)};
await import(workerData.url);

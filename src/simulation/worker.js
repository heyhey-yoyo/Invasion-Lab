import { SimulationWorkerRuntime } from './worker-runtime.js';

const runtime = new SimulationWorkerRuntime((message, transfer = []) => self.postMessage(message, transfer));
self.addEventListener('message', event => runtime.handle(event.data, performance.now()));
setInterval(() => runtime.tick(performance.now()), 16);

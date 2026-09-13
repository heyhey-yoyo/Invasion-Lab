import { SimulationWorkerRuntime } from './worker-runtime.js?v=1.0.1-upgrade-2';

const runtime = new SimulationWorkerRuntime((message, transfer = []) => self.postMessage(message, transfer));
self.addEventListener('message', event => runtime.handle(event.data, performance.now()));
setInterval(() => runtime.tick(performance.now()), 16);

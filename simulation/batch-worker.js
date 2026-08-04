import { runBatchScan } from './batch.js';

self.addEventListener('message', event => {
  const message = event.data || {};
  if (message.type !== 'batch-scan') return;
  try {
    const result = runBatchScan(message.config || {}, {
      size: message.size,
      seedCount: message.seedCount,
      maxTime: message.maxTime,
      cellCount: message.cellCount
    }, progress => self.postMessage({ type: 'batch-progress', requestId: message.requestId ?? null, ...progress }));
    self.postMessage({ ...result, requestId: message.requestId ?? null });
  } catch (error) {
    self.postMessage({ type: 'batch-error', requestId: message.requestId ?? null, message: error instanceof Error ? error.message : String(error) });
  }
});

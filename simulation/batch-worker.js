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
    }, progress => self.postMessage({ type: 'batch-progress', ...progress }));
    self.postMessage(result);
  } catch (error) {
    self.postMessage({ type: 'batch-error', message: error instanceof Error ? error.message : String(error) });
  }
});

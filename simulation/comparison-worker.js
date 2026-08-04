import { runPairedComparison } from './comparison.js';

self.addEventListener('message', event => {
  const message = event.data || {};
  if (message.type !== 'paired-comparison') return;
  try {
    const result = runPairedComparison(message.config || {}, message.treatmentId, {
      seedCount: 5,
      maxTime: message.maxTime,
      cellCount: message.cellCount
    }, progress => self.postMessage({ type: 'comparison-progress', requestId: message.requestId ?? null, ...progress }));
    self.postMessage({ ...result, requestId: message.requestId ?? null });
  } catch (error) {
    self.postMessage({ type: 'comparison-error', requestId: message.requestId ?? null, message: error instanceof Error ? error.message : String(error) });
  }
});

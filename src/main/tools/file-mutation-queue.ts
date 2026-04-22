/**
 * Per-path async mutex. Ensures concurrent edits/writes against the same
 * absolute path are serialized so we don't lose updates between read-modify-write
 * cycles. Different paths still run in parallel.
 */

const queues = new Map<string, Promise<unknown>>();

export async function withFileMutationQueue<T>(
  absolutePath: string,
  task: () => Promise<T>,
): Promise<T> {
  const previous = queues.get(absolutePath) ?? Promise.resolve();
  const next = previous.then(task, task);
  // Track failures too so the chain is not broken by a thrown error.
  const tracked = next.catch(() => undefined);
  queues.set(absolutePath, tracked);

  try {
    return await next;
  } finally {
    if (queues.get(absolutePath) === tracked) {
      queues.delete(absolutePath);
    }
  }
}

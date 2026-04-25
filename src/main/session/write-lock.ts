const lockedSessionIds = new Set<string>();

export function withSessionWriteLock<T>(
  sessionId: string,
  action: () => T,
): T {
  if (lockedSessionIds.has(sessionId)) {
    throw new Error(`会话正在写入中：${sessionId}`);
  }

  lockedSessionIds.add(sessionId);
  try {
    return action();
  } finally {
    lockedSessionIds.delete(sessionId);
  }
}

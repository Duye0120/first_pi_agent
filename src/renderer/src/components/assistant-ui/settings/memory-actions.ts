export type MemoryActionDesktopApi = {
  memory: {
    delete: (memoryId: number) => Promise<boolean>;
    feedback: (memoryId: number, delta: number) => Promise<boolean>;
  };
};

export type MemoryRefreshers = {
  loadStats: () => Promise<unknown>;
  loadMemories: () => Promise<unknown>;
};

async function refreshMemoryState(refreshers: MemoryRefreshers): Promise<void> {
  await Promise.all([refreshers.loadStats(), refreshers.loadMemories()]);
}

export async function deleteMemoryAndRefresh(
  desktopApi: MemoryActionDesktopApi,
  memoryId: number,
  refreshers: MemoryRefreshers,
): Promise<boolean> {
  const deleted = await desktopApi.memory.delete(memoryId);
  if (deleted) {
    await refreshMemoryState(refreshers);
  }
  return deleted;
}

export async function feedbackMemoryAndRefresh(
  desktopApi: MemoryActionDesktopApi,
  memoryId: number,
  delta: number,
  refreshers: MemoryRefreshers,
): Promise<boolean> {
  const updated = await desktopApi.memory.feedback(memoryId, delta);
  if (updated) {
    await refreshMemoryState(refreshers);
  }
  return updated;
}

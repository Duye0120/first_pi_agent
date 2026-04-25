import { IPC_CHANNELS } from "../../shared/ipc.js";
import {
  deleteEntry,
  deleteSource,
  getCredentials,
  getEntry,
  getSource,
  listEntries,
  listEntriesBySource,
  listSources,
  saveEntry,
  saveSource,
  setCredentials,
  testSource,
  fetchSourceModels,
} from "../providers.js";
import { handleIpc } from "./handle.js";

export function registerProvidersIpc(): void {
  handleIpc(IPC_CHANNELS.providersListSources, async () => listSources());
  handleIpc(
    IPC_CHANNELS.providersGetSource,
    async (_event, sourceId: string) => getSource(sourceId),
  );
  handleIpc(
    IPC_CHANNELS.providersSaveSource,
    async (_event, draft) => saveSource(draft),
  );
  handleIpc(
    IPC_CHANNELS.providersDeleteSource,
    async (_event, sourceId: string) => deleteSource(sourceId),
  );
  handleIpc(
    IPC_CHANNELS.providersTestSource,
    async (_event, draft) => testSource(draft),
  );
  handleIpc(
    IPC_CHANNELS.providersFetchModels,
    async (_event, draft) => fetchSourceModels(draft),
  );
  handleIpc(
    IPC_CHANNELS.providersGetCredentials,
    async (_event, sourceId: string) => getCredentials(sourceId),
  );
  handleIpc(
    IPC_CHANNELS.providersSetCredentials,
    async (_event, sourceId: string, apiKey: string) =>
      setCredentials(sourceId, apiKey),
  );

  handleIpc(IPC_CHANNELS.modelsListEntries, async () => listEntries());
  handleIpc(
    IPC_CHANNELS.modelsListEntriesBySource,
    async (_event, sourceId: string) => listEntriesBySource(sourceId),
  );
  handleIpc(
    IPC_CHANNELS.modelsSaveEntry,
    async (_event, draft) => saveEntry(draft),
  );
  handleIpc(
    IPC_CHANNELS.modelsDeleteEntry,
    async (_event, entryId: string) => deleteEntry(entryId),
  );
  handleIpc(
    IPC_CHANNELS.modelsGetEntry,
    async (_event, entryId: string) => getEntry(entryId),
  );
}

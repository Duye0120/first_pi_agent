import { IPC_CHANNELS } from "../../shared/ipc.js";
import { handleIpc } from "./handle.js";
import {
  installSkill,
  listInstalledSkills,
  openSkillDirectory,
  openSkillFile,
  searchSkillCatalog,
} from "../skills.js";

export function registerSkillsIpc(): void {
  handleIpc(IPC_CHANNELS.skillsListInstalled, async () => listInstalledSkills());
  handleIpc(IPC_CHANNELS.skillsSearchCatalog, async (_event, query: string) =>
    searchSkillCatalog(query),
  );
  handleIpc(IPC_CHANNELS.skillsInstall, async (_event, request) =>
    installSkill(request),
  );
  handleIpc(
    IPC_CHANNELS.skillsOpenDirectory,
    async (_event, skillId: string, source) => openSkillDirectory(skillId, source),
  );
  handleIpc(
    IPC_CHANNELS.skillsOpenSkillFile,
    async (_event, skillId: string, source) => openSkillFile(skillId, source),
  );
}

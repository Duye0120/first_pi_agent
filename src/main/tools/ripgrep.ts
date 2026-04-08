import fs from "node:fs";
import { rgPath } from "@vscode/ripgrep";

export function resolveRipgrepCommand(): string {
  return fs.existsSync(rgPath) ? rgPath : "rg";
}

export type ChelaPluginPermissionSet = {
  tools: string[];
  mcpServers: string[];
  uiPanels: string[];
  workflows: string[];
};

export type ChelaWorkflowStep = {
  id: string;
  type: "tool";
  toolName: string;
  input?: Record<string, unknown>;
};

export type ChelaWorkflowDefinition = {
  id: string;
  name: string;
  steps: ChelaWorkflowStep[];
};

export type ChelaPluginManifest = {
  id: string;
  name: string;
  version: string;
  description?: string;
  permissions: ChelaPluginPermissionSet;
  workflows: ChelaWorkflowDefinition[];
};

export type ChelaPluginManifestValidationResult =
  | { ok: true; manifest: ChelaPluginManifest; errors: [] }
  | { ok: false; manifest: null; errors: string[] };

const SAFE_ID_PATTERN = /^[a-z][a-z0-9_-]{1,63}$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9._-]+)?$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function asStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  if (!value.every((item) => typeof item === "string" && item.trim())) {
    return null;
  }
  return value.map((item) => item.trim());
}

function validateSafeId(value: unknown, path: string, errors: string[]): string | null {
  if (typeof value !== "string" || !SAFE_ID_PATTERN.test(value)) {
    errors.push(`${path} 必须是安全 id。`);
    return null;
  }
  return value;
}

function validateWorkflow(value: unknown, index: number, errors: string[]): ChelaWorkflowDefinition | null {
  if (!isRecord(value)) {
    errors.push(`workflows.${index} 必须是对象。`);
    return null;
  }
  const id = validateSafeId(value.id, `workflows.${index}.id`, errors);
  const name = typeof value.name === "string" && value.name.trim() ? value.name.trim() : null;
  if (!name) {
    errors.push(`workflows.${index}.name 必须是非空字符串。`);
  }
  if (!Array.isArray(value.steps)) {
    errors.push(`workflows.${index}.steps 必须是数组。`);
    return null;
  }

  const steps: ChelaWorkflowStep[] = [];
  value.steps.forEach((step, stepIndex) => {
    if (!isRecord(step)) {
      errors.push(`workflows.${index}.steps.${stepIndex} 必须是对象。`);
      return;
    }
    const stepId = validateSafeId(step.id, `workflows.${index}.steps.${stepIndex}.id`, errors);
    if (step.type !== "tool") {
      errors.push(`workflows.${index}.steps.${stepIndex}.type 必须是 tool。`);
    }
    const toolName =
      typeof step.toolName === "string" && step.toolName.trim()
        ? step.toolName.trim()
        : null;
    if (!toolName) {
      errors.push(`workflows.${index}.steps.${stepIndex}.toolName 必须是非空字符串。`);
    }
    if (step.input !== undefined && !isRecord(step.input)) {
      errors.push(`workflows.${index}.steps.${stepIndex}.input 必须是对象。`);
    }
    if (stepId && toolName && step.type === "tool") {
      steps.push({
        id: stepId,
        type: "tool",
        toolName,
        input: isRecord(step.input) ? step.input : undefined,
      });
    }
  });

  return id && name && value.steps.length === steps.length
    ? { id, name, steps }
    : null;
}

export function validateChelaPluginManifest(
  value: unknown,
): ChelaPluginManifestValidationResult {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return { ok: false, manifest: null, errors: ["manifest 必须是对象。"] };
  }

  const id = validateSafeId(value.id, "id", errors);
  const name = typeof value.name === "string" && value.name.trim() ? value.name.trim() : null;
  if (!name) {
    errors.push("name 必须是非空字符串。");
  }
  const version =
    typeof value.version === "string" && VERSION_PATTERN.test(value.version)
      ? value.version
      : null;
  if (!version) {
    errors.push("version 必须是 semver 字符串。");
  }

  const permissionInput = isRecord(value.permissions) ? value.permissions : null;
  if (!permissionInput) {
    errors.push("permissions 必须是对象。");
  }
  const permissions: ChelaPluginPermissionSet = {
    tools: asStringArray(permissionInput?.tools) ?? [],
    mcpServers: asStringArray(permissionInput?.mcpServers) ?? [],
    uiPanels: asStringArray(permissionInput?.uiPanels) ?? [],
    workflows: asStringArray(permissionInput?.workflows) ?? [],
  };
  for (const key of ["tools", "mcpServers", "uiPanels", "workflows"] as const) {
    if (permissionInput && asStringArray(permissionInput[key]) === null) {
      errors.push(`permissions.${key} 必须是非空字符串数组。`);
    }
  }

  const workflowInputs = Array.isArray(value.workflows) ? value.workflows : [];
  if (!Array.isArray(value.workflows)) {
    errors.push("workflows 必须是数组。");
  }
  const workflows = workflowInputs
    .map((workflow, index) => validateWorkflow(workflow, index, errors))
    .filter((workflow): workflow is ChelaWorkflowDefinition => !!workflow);

  if (errors.length > 0 || !id || !name || !version) {
    return { ok: false, manifest: null, errors };
  }

  return {
    ok: true,
    manifest: {
      id,
      name,
      version,
      description:
        typeof value.description === "string" && value.description.trim()
          ? value.description.trim()
          : undefined,
      permissions,
      workflows,
    },
    errors: [],
  };
}

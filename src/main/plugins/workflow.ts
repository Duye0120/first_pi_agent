import type { ChelaWorkflowDefinition } from "../../shared/plugins.js";

export type WorkflowTool = (input: Record<string, unknown>) => Promise<unknown> | unknown;

export type WorkflowRunContext = {
  tools: Record<string, WorkflowTool>;
};

export type WorkflowStepResult = {
  id: string;
  success: boolean;
  output?: unknown;
  error?: string;
};

export type WorkflowRunResult = {
  success: boolean;
  steps: WorkflowStepResult[];
};

export async function runWorkflow(
  workflow: ChelaWorkflowDefinition,
  context: WorkflowRunContext,
): Promise<WorkflowRunResult> {
  const steps: WorkflowStepResult[] = [];

  for (const step of workflow.steps) {
    const tool = context.tools[step.toolName];
    if (!tool) {
      steps.push({
        id: step.id,
        success: false,
        error: `Workflow tool is unavailable: ${step.toolName}`,
      });
      return { success: false, steps };
    }

    try {
      const output = await tool(step.input ?? {});
      steps.push({ id: step.id, success: true, output });
    } catch (error) {
      steps.push({
        id: step.id,
        success: false,
        error: error instanceof Error ? error.message : "Workflow step failed.",
      });
      return { success: false, steps };
    }
  }

  return { success: true, steps };
}

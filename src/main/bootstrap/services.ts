import { scheduler } from "../scheduler.js";
import { initBusAuditLog, stopBusAuditLog } from "../bus-audit.js";
import { initSelfDiagnosis, stopSelfDiagnosis } from "../self-diagnosis/service.js";
import { initMetrics, stopMetrics } from "../metrics.js";
import { initActiveLearning, stopActiveLearning } from "../learning/engine.js";
import {
  initEmotionalStateMachine,
  stopEmotionalStateMachine,
} from "../emotional/state-machine.js";
import { initReflectionService, stopReflectionService } from "../reflection/service.js";
import { initPersonalityDrift } from "../reflection/personality-drift.js";
import { startWebhookServer, stopWebhookServer } from "../webhook.js";
import { initTraceService, stopTraceService } from "../trace/service.js";
import { appLogger } from "../logger.js";

type BackgroundServiceDefinition = {
  name: string;
  start: () => void | Promise<void>;
  stop?: () => void;
};

const BACKGROUND_SERVICES: BackgroundServiceDefinition[] = [
  { name: "bus-audit", start: initBusAuditLog, stop: stopBusAuditLog },
  { name: "metrics", start: initMetrics, stop: stopMetrics },
  { name: "self-diagnosis", start: initSelfDiagnosis, stop: stopSelfDiagnosis },
  { name: "active-learning", start: initActiveLearning, stop: stopActiveLearning },
  { name: "personality-drift", start: initPersonalityDrift },
  {
    name: "emotional-state-machine",
    start: initEmotionalStateMachine,
    stop: stopEmotionalStateMachine,
  },
  {
    name: "reflection-service",
    start: initReflectionService,
    stop: stopReflectionService,
  },
  { name: "scheduler", start: () => scheduler.start(), stop: () => scheduler.stop() },
  { name: "webhook", start: () => startWebhookServer(), stop: stopWebhookServer },
  { name: "trace-service", start: initTraceService, stop: stopTraceService },
];

const startedBackgroundServices = new Set<string>();

export async function startBackgroundServices(): Promise<void> {
  if (startedBackgroundServices.size === BACKGROUND_SERVICES.length) {
    return;
  }

  const startedThisRound: BackgroundServiceDefinition[] = [];

  try {
    for (const service of BACKGROUND_SERVICES) {
      if (startedBackgroundServices.has(service.name)) {
        continue;
      }

      await service.start();
      startedBackgroundServices.add(service.name);
      startedThisRound.push(service);
    }
  } catch (error) {
    appLogger.error({
      scope: "bootstrap.services",
      message: "后台服务启动失败，已开始回滚已启动服务",
      data: {
        startedServices: startedThisRound.map((service) => service.name),
      },
      error,
    });

    for (const service of [...startedThisRound].reverse()) {
      try {
        service.stop?.();
      } catch (stopError) {
        appLogger.warn({
          scope: "bootstrap.services",
          message: `后台服务回滚失败: ${service.name}`,
          error: stopError,
        });
      } finally {
        startedBackgroundServices.delete(service.name);
      }
    }

    throw error;
  }

  appLogger.info({
    scope: "bootstrap.services",
    message: "后台服务启动完成",
    data: {
      services: [...startedBackgroundServices],
    },
  });
}

export function stopBackgroundServices(): void {
  for (const service of [...BACKGROUND_SERVICES].reverse()) {
    if (!startedBackgroundServices.has(service.name)) {
      continue;
    }

    try {
      service.stop?.();
    } catch (error) {
      appLogger.warn({
        scope: "bootstrap.services",
        message: `后台服务停止失败: ${service.name}`,
        error,
      });
    } finally {
      startedBackgroundServices.delete(service.name);
    }
  }
}

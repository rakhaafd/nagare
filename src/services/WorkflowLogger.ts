import { Context, Effect, Layer } from "effect";

export interface WorkflowLogger {
  readonly info: (message: string, context?: Record<string, unknown>) => Effect.Effect<void>;
  readonly warn: (message: string, context?: Record<string, unknown>) => Effect.Effect<void>;
  readonly error: (message: string, context?: Record<string, unknown>) => Effect.Effect<void>;
  readonly debug: (message: string, context?: Record<string, unknown>) => Effect.Effect<void>;
}

export const WorkflowLogger = Context.GenericTag<WorkflowLogger>("@nagare/WorkflowLogger");

export const ConsoleWorkflowLogger = Layer.succeed(
  WorkflowLogger,
  WorkflowLogger.of({
    info: (msg, ctx) =>
      Effect.sync(() => {
        if (ctx) console.log(`[INFO] ${msg}`, ctx);
        else console.log(`[INFO] ${msg}`);
      }),
    warn: (msg, ctx) =>
      Effect.sync(() => {
        if (ctx) console.warn(`[WARN] ${msg}`, ctx);
        else console.warn(`[WARN] ${msg}`);
      }),
    error: (msg, ctx) =>
      Effect.sync(() => {
        if (ctx) console.error(`[ERROR] ${msg}`, ctx);
        else console.error(`[ERROR] ${msg}`);
      }),
    debug: (msg, ctx) =>
      Effect.sync(() => {
        if (ctx) console.debug(`[DEBUG] ${msg}`, ctx);
        else console.debug(`[DEBUG] ${msg}`);
      })
  })
);

export const SilentWorkflowLogger = Layer.succeed(
  WorkflowLogger,
  WorkflowLogger.of({
    info: () => Effect.void,
    warn: () => Effect.void,
    error: () => Effect.void,
    debug: () => Effect.void
  })
);

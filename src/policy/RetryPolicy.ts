import { Duration, Schedule } from "effect";

export type RetryStrategy =
  | { readonly type: "fixed"; readonly maxAttempts: number; readonly delay: Duration.DurationInput }
  | { readonly type: "exponential"; readonly maxAttempts: number; readonly initialDelay: Duration.DurationInput; readonly factor?: number };

export interface RetryConfig {
  readonly strategy?: RetryStrategy;
  readonly while?: (error: unknown) => boolean;
}

export const RetryPolicy = {
  fixed: (options: { maxAttempts: number; delay: Duration.DurationInput }) => ({
    type: "fixed" as const,
    maxAttempts: options.maxAttempts,
    delay: options.delay
  }),
  exponential: (options: { maxAttempts: number; initialDelay: Duration.DurationInput; factor?: number }) => ({
    type: "exponential" as const,
    maxAttempts: options.maxAttempts,
    initialDelay: options.initialDelay,
    factor: options.factor ?? 2
  }),
  toSchedule: (config: RetryConfig | RetryStrategy): Schedule.Schedule<unknown, unknown, unknown> => {
    const strategy: RetryStrategy | undefined = "type" in config ? config : config.strategy;
    if (!strategy) {
      return Schedule.stop;
    }

    let baseSchedule: Schedule.Schedule<unknown, unknown, unknown>;
    if (strategy.type === "fixed") {
      baseSchedule = Schedule.intersect(
        Schedule.recurs(strategy.maxAttempts - 1),
        Schedule.spaced(strategy.delay)
      );
    } else {
      baseSchedule = Schedule.intersect(
        Schedule.recurs(strategy.maxAttempts - 1),
        Schedule.exponential(strategy.initialDelay, strategy.factor)
      );
    }

    if ("while" in config && config.while) {
      const condition = config.while;
      return Schedule.whileInput(baseSchedule, condition);
    }

    return baseSchedule;
  }
};

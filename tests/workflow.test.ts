import { describe, expect, it } from "vitest";
import { Cause, Context, Duration, Effect, Exit, Fiber, Layer } from "effect";
import {
  Step,
  Workflow,
  RetryPolicy,
  ValidationError,
  StepTimeoutError,
  WorkflowLogger
} from "../src/index.js";

describe("Nagare Workflow Engine", () => {
  it("executes single step successfully", async () => {
    const step = Step.make({
      name: "greet",
      execute: (name: string) => Effect.succeed(`Hello, ${name}!`)
    });

    const result = await Effect.runPromise(step.execute("Nagare"));
    expect(result).toBe("Hello, Nagare!");
  });

  it("executes sequential workflow steps via Workflow.sequence", async () => {
    const addOne = Step.make({
      name: "add-one",
      execute: (n: number) => Effect.succeed(n + 1)
    });

    const double = Step.make({
      name: "double",
      execute: (n: number) => Effect.succeed(n * 2)
    });

    const toString = Step.make({
      name: "to-string",
      execute: (n: number) => Effect.succeed(`Result: ${n}`)
    });

    const workflow = Workflow.sequence("math-flow", [addOne, double, toString]);

    const result = await Effect.runPromise(workflow.execute(5));
    // (5 + 1) * 2 = 12 -> "Result: 12"
    expect(result).toBe("Result: 12");
  });

  it("handles typed validation error explicitly", async () => {
    const validateAge = Step.make({
      name: "validate-age",
      execute: (age: number) =>
        age >= 18
          ? Effect.succeed(age)
          : Effect.fail(new ValidationError({ message: "Age must be at least 18" }))
    });

    const exit = await Effect.runPromiseExit(validateAge.execute(15));
    expect(Exit.isFailure(exit)).toBe(true);

    if (Exit.isFailure(exit)) {
      const failure = Cause.failureOption(exit.cause);
      expect(failure._tag).toBe("Some");
      if (failure._tag === "Some") {
        expect(failure.value._tag).toBe("ValidationError");
        expect(failure.value.message).toBe("Age must be at least 18");
      }
    }
  });

  it("supports retries on failure until success", async () => {
    let attempts = 0;

    const flakyStep = Step.make({
      name: "flaky-operation",
      retry: RetryPolicy.fixed({ maxAttempts: 3, delay: "10 millis" }),
      execute: () =>
        Effect.gen(function* () {
          attempts++;
          if (attempts < 3) {
            return yield* Effect.fail(new Error("Temporary glitch"));
          }
          return "recovered";
        })
    });

    const result = await Effect.runPromise(flakyStep.execute(undefined));
    expect(result).toBe("recovered");
    expect(attempts).toBe(3);
  });

  it("fails when retry attempts are exhausted", async () => {
    let attempts = 0;

    const failingStep = Step.make({
      name: "always-fails",
      retry: RetryPolicy.fixed({ maxAttempts: 3, delay: "5 millis" }),
      execute: () =>
        Effect.gen(function* () {
          attempts++;
          return yield* Effect.fail(new Error("Persistent failure"));
        })
    });

    const exit = await Effect.runPromiseExit(failingStep.execute(undefined));
    expect(Exit.isFailure(exit)).toBe(true);
    expect(attempts).toBe(3);
  });

  it("handles step timeout with typed StepTimeoutError", async () => {
    const slowStep = Step.make({
      name: "slow-step",
      timeout: "50 millis",
      execute: () => Effect.sleep("200 millis").pipe(Effect.as("done"))
    });

    const exit = await Effect.runPromiseExit(slowStep.execute(undefined));
    expect(Exit.isFailure(exit)).toBe(true);

    if (Exit.isFailure(exit)) {
      const failure = Cause.failureOption(exit.cause);
      expect(failure._tag).toBe("Some");
      if (failure._tag === "Some") {
        expect(failure.value._tag).toBe("StepTimeoutError");
        expect((failure.value as StepTimeoutError).stepName).toBe("slow-step");
      }
    }
  });

  it("executes steps in parallel", async () => {
    const stepA = Step.make({
      name: "step-a",
      execute: (id: string) => Effect.succeed(`user-${id}`)
    });

    const stepB = Step.make({
      name: "step-b",
      execute: (id: string) => Effect.succeed(`account-${id}`)
    });

    const parallelStep = Workflow.parallel("fetch-all", [stepA, stepB]);

    const result = await Effect.runPromise(parallelStep.execute("123"));
    expect(result).toEqual(["user-123", "account-123"]);
  });

  it("supports cancellation via fiber interruption", async () => {
    let completed = false;

    const longRunningStep = Step.make({
      name: "cancellable-step",
      execute: () =>
        Effect.gen(function* () {
          yield* Effect.sleep("1 second");
          completed = true;
          return "finished";
        })
    });

    const program = Effect.gen(function* () {
      const fiber = yield* Effect.fork(longRunningStep.execute(undefined));
      yield* Effect.sleep("50 millis");
      yield* Fiber.interrupt(fiber);
      return yield* Fiber.join(fiber);
    });

    const exit = await Effect.runPromiseExit(program);
    expect(Exit.isFailure(exit)).toBe(true);
    expect(completed).toBe(false);
  });

  it("supports dependency injection with Effect Context and Layer", async () => {
    const logs: string[] = [];

    const testLoggerLayer = Layer.succeed(
      WorkflowLogger,
      WorkflowLogger.of({
        info: (msg) => Effect.sync(() => { logs.push(msg); }),
        warn: () => Effect.void,
        error: () => Effect.void,
        debug: () => Effect.void
      })
    );

    const loggedStep = Step.make({
      name: "logged-step",
      execute: (input: string) =>
        Effect.gen(function* () {
          const logger = yield* WorkflowLogger;
          yield* logger.info(`Processing ${input}`);
          return input.toUpperCase();
        })
    });

    const program = loggedStep.execute("nagare").pipe(Effect.provide(testLoggerLayer));
    const result = await Effect.runPromise(program);

    expect(result).toBe("NAGARE");
    expect(logs).toEqual(["Processing nagare"]);
  });
});

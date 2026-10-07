import { Effect } from "effect";
import { Step } from "../step/Step.js";
import { StepExecutionError, StepTimeoutError } from "../errors/index.js";

export interface WorkflowDefinition<In, Out, Err = never, R = never> {
  readonly name: string;
  readonly execute: (input: In) => Effect.Effect<Out, Err, R>;
}

export interface Workflow<In, Out, Err = never, R = never> {
  readonly _tag: "Workflow";
  readonly name: string;
  readonly execute: (input: In) => Effect.Effect<Out, Err, R>;
  readonly pipe: <NextOut, NextErr, NextR>(
    next: Step<Out, NextOut, NextErr, NextR> | Workflow<Out, NextOut, NextErr, NextR>
  ) => Workflow<In, NextOut, Err | NextErr | StepTimeoutError | StepExecutionError, R | NextR>;
}

export const Workflow = {
  make: <In, Out, Err = never, R = never>(
    definition: WorkflowDefinition<In, Out, Err, R>
  ): Workflow<In, Out, Err, R> => {
    const pipe = <NextOut, NextErr, NextR>(
      next: Step<Out, NextOut, NextErr, NextR> | Workflow<Out, NextOut, NextErr, NextR>
    ): Workflow<In, NextOut, Err | NextErr | StepTimeoutError | StepExecutionError, R | NextR> => {
      return Workflow.make({
        name: `${definition.name} -> ${next.name}`,
        execute: (input: In) =>
          Effect.gen(function* () {
            const intermediate = yield* definition.execute(input);
            return yield* next.execute(intermediate);
          })
      });
    };

    return {
      _tag: "Workflow",
      name: definition.name,
      execute: definition.execute,
      pipe
    };
  },

  define: <In, Out, Err = never, R = never>(config: {
    readonly name: string;
    readonly execute: (input: In) => Effect.Effect<Out, Err, R>;
  }): Workflow<In, Out, Err, R> => {
    return Workflow.make(config);
  },

  /**
   * Run multiple steps or workflows in parallel for the same input.
   */
  parallel: <In, Steps extends readonly Step<In, any, any, any>[]>(
    name: string,
    steps: Steps
  ): Step<
    In,
    { [K in keyof Steps]: Steps[K] extends Step<In, infer O, any, any> ? O : never },
    { [K in keyof Steps]: Steps[K] extends Step<In, any, infer E, any> ? E : never }[number],
    { [K in keyof Steps]: Steps[K] extends Step<In, any, any, infer R> ? R : never }[number]
  > => {
    return Step.make({
      name,
      execute: (input: In) =>
        Effect.all(
          steps.map((step) => step.execute(input)),
          { concurrency: "unbounded" }
        ) as any
    });
  },

  /**
   * Compose a sequence of steps where each step takes the output of the previous step.
   */
  sequence: <Steps extends readonly [Step<any, any, any, any>, ...Step<any, any, any, any>[]]>(
    name: string,
    steps: Steps
  ) => {
    return Workflow.make({
      name,
      execute: (initialInput: any) =>
        Effect.gen(function* () {
          let current = initialInput;
          for (const step of steps) {
            current = yield* step.execute(current);
          }
          return current;
        })
    });
  }
};

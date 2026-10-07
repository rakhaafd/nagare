import { Duration, Effect } from "effect";
import { StepExecutionError, StepTimeoutError } from "../errors/index.js";
import { RetryConfig, RetryPolicy, RetryStrategy } from "../policy/RetryPolicy.js";

export interface StepDefinition<In, Out, Err = never, R = never> {
  readonly name: string;
  readonly execute: (input: In) => Effect.Effect<Out, Err, R>;
  readonly retry?: RetryConfig | RetryStrategy;
  readonly timeout?: Duration.DurationInput;
}

export interface Step<In, Out, Err = never, R = never> {
  readonly _tag: "Step";
  readonly name: string;
  readonly definition: StepDefinition<In, Out, Err, R>;
  readonly execute: (input: In) => Effect.Effect<Out, Err | StepTimeoutError | StepExecutionError, R>;
}

export const Step = {
  make: <In, Out, Err = never, R = never>(
    definition: StepDefinition<In, Out, Err, R>
  ): Step<In, Out, Err, R> => {
    const execute = (input: In): Effect.Effect<Out, Err | StepTimeoutError | StepExecutionError, R> => {
      let effect: Effect.Effect<Out, Err | StepTimeoutError | StepExecutionError, R> = definition.execute(input);

      // Apply timeout if configured
      if (definition.timeout !== undefined) {
        const duration = Duration.decode(definition.timeout);
        const millis = Duration.toMillis(duration);
        effect = Effect.timeoutFail(effect, {
          duration,
          onTimeout: () =>
            new StepTimeoutError({
              stepName: definition.name,
              durationMillis: millis
            })
        });
      }

      // Apply retry schedule if configured
      if (definition.retry !== undefined) {
        const schedule = RetryPolicy.toSchedule(definition.retry);
        effect = Effect.retry(effect, schedule) as Effect.Effect<Out, Err | StepTimeoutError | StepExecutionError, R>;
      }

      return effect;
    };

    return {
      _tag: "Step",
      name: definition.name,
      definition,
      execute
    };
  }
};

import { Data } from "effect";

export class ValidationError extends Data.TaggedError("ValidationError")<{
  readonly message: string;
  readonly details?: unknown;
}> {}

export class StepTimeoutError extends Data.TaggedError("StepTimeoutError")<{
  readonly stepName: string;
  readonly durationMillis: number;
}> {}

export class StepExecutionError extends Data.TaggedError("StepExecutionError")<{
  readonly stepName: string;
  readonly cause: unknown;
  readonly retryable: boolean;
}> {}

export class WorkflowCancelledError extends Data.TaggedError("WorkflowCancelledError")<{
  readonly workflowName: string;
  readonly reason?: string;
}> {}

export type WorkflowError =
  | ValidationError
  | StepTimeoutError
  | StepExecutionError
  | WorkflowCancelledError;

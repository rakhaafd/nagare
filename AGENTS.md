# Nagare

> A type-safe, composable workflow engine built with TypeScript and Effect.ts.

## 1. Project Overview

**Nagare** adalah workflow execution engine yang dibangun menggunakan **TypeScript dan Effect.ts**.

Tujuan utama project adalah membangun engine yang mampu menjalankan workflow multi-step secara reliable dengan:

* typed errors
* retry
* timeout
* cancellation
* concurrency
* dependency injection
* execution state
* composable workflow steps

Nagare pada tahap awal **hanya berfokus pada core workflow engine**.

Persistence menggunakan PostgreSQL akan ditambahkan setelah core engine stabil.

Frontend dan third-party integration berada pada fase berikutnya.

---

# 2. Current Scope

Fase pertama hanya mencakup:

```text
Workflow Definition
        ↓
Workflow Executor
        ↓
Step Execution
        ↓
Error Handling
        ↓
Retry
        ↓
Timeout
        ↓
Cancellation
        ↓
Concurrency
        ↓
Execution Result
```

Core engine harus dapat dijalankan tanpa:

* database
* HTTP server
* frontend
* external API
* Redis
* third-party service

Engine harus dapat dijalankan langsung dari TypeScript.

Contoh:

```ts
const result = await Effect.runPromise(
  workflow.execute(input)
);
```

---

# 3. Project Goals

Primary goals:

1. Build a composable workflow engine.
2. Learn and properly utilize Effect.ts.
3. Model workflow execution using typed data.
4. Handle failures explicitly.
5. Support retry and timeout.
6. Support sequential and parallel execution.
7. Support cancellation.
8. Make dependencies injectable through Effect `Context` and `Layer`.
9. Keep the core independent from infrastructure.
10. Make the engine testable without external services.
11. Persist workflow and execution data using PostgreSQL in a later phase.

---

# 4. Non-Goals

Untuk fase awal, **jangan implementasikan**:

* Frontend
* HTMX
* Alpine.js
* React
* Next.js
* Hono
* REST API
* GraphQL
* PostgreSQL integration
* Redis
* Docker infrastructure
* Frappe
* SatuSehat
* GitHub integration
* Discord integration
* Notion integration
* Payment integration
* Visual workflow editor
* Authentication
* Authorization
* Multi-tenancy
* Microservices
* Distributed execution
* Cloud deployment

PostgreSQL akan menjadi bagian dari fase persistence setelah core engine stabil.

---

# 5. Core Principle

Nagare harus menjadi **library/engine terlebih dahulu**, bukan aplikasi web.

Core harus dapat digunakan seperti:

```ts
import { Workflow } from "./workflow";

const workflow = Workflow.define({
  name: "example",
  steps: [
    stepA,
    stepB,
    stepC,
  ],
});

const result = await Effect.runPromise(
  workflow.execute(input)
);
```

Tidak boleh ada dependency terhadap HTTP, database, browser, atau external service di dalam core engine.

---

# 6. Technology Stack

## Phase 1 — Core Engine

Required:

* TypeScript
* Node.js
* Effect.ts

Development:

* pnpm
* Vitest
* ESLint
* Prettier

## Phase 2 — Persistence

* PostgreSQL

Database access must remain behind repository abstractions and must not leak into the domain layer.

---

# 7. Effect.ts Usage

Effect.ts adalah fondasi utama project.

Gunakan Effect untuk:

* workflow execution
* error handling
* retry
* timeout
* cancellation
* concurrency
* dependency injection
* resource management
* scheduling jika diperlukan

Jangan menggunakan Effect hanya sebagai wrapper Promise.

---

# 8. Core Concepts

Nagare memiliki beberapa konsep utama:

```text
Workflow
Step
WorkflowContext
WorkflowResult
WorkflowError
Execution
ExecutionStatus
RetryPolicy
TimeoutPolicy
```

Future concepts:

```text
Trigger
Condition
Branch
Parallel
Scheduler
Event
```

Future concepts tidak perlu diimplementasikan sebelum core engine stabil.

---

# 9. Workflow

Workflow adalah kumpulan step yang dieksekusi oleh engine.

Conceptual example:

```ts
const workflow = Workflow.define({
  name: "user-registration",

  steps: [
    validateUser,
    createUser,
    sendNotification,
  ],
});
```

Workflow harus:

* immutable
* composable
* type-safe
* independent dari infrastructure

Workflow tidak boleh mengetahui:

* HTTP
* database
* Redis
* external API
* specific external provider

---

# 10. Step

Step adalah unit terkecil dari workflow.

Conceptual type:

```ts
type WorkflowStep<I, O, E> = {
  readonly name: string;

  readonly execute: (
    input: I
  ) => Effect.Effect<O, E>;
};
```

Step harus:

* menerima input
* menghasilkan output
* memiliki typed error
* dapat dikomposisikan
* tidak memiliki global mutable state

---

# 11. Step Composition

Workflow harus memungkinkan output sebuah step menjadi input step berikutnya.

```text
Step A
  │
  ▼
Output A
  │
  ▼
Step B
  │
  ▼
Output B
  │
  ▼
Step C
```

Contoh:

```ts
Effect.gen(function* () {
  const user = yield* validateUser(input);

  const createdUser = yield* createUser(user);

  yield* sendNotification(createdUser);

  return createdUser;
});
```

Gunakan `Effect.gen` untuk workflow yang memiliki sequential dependency.

---

# 12. Execution Model

Basic execution lifecycle:

```text
CREATED
   ↓
RUNNING
   ↓
 ┌─┴──────────────┐
 ↓                ↓
COMPLETED        FAILED
```

Execution dapat dibatalkan:

```text
RUNNING
   ↓
CANCELLED
```

Execution state harus dapat direpresentasikan secara type-safe.

---

# 13. Execution Status

Gunakan status yang eksplisit:

```ts
type ExecutionStatus =
  | "PENDING"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";
```

Hindari arbitrary string yang tersebar di codebase.

---

# 14. Typed Errors

Expected errors harus direpresentasikan sebagai typed errors.

Contoh:

```ts
class ValidationError extends Data.TaggedError(
  "ValidationError"
)<{
  readonly message: string;
}> {}
```

Contoh lainnya:

```ts
class StepTimeout extends Data.TaggedError(
  "StepTimeout"
)<{
  readonly step: string;
}> {}
```

```ts
class StepFailed extends Data.TaggedError(
  "StepFailed"
)<{
  readonly step: string;
  readonly reason: unknown;
}> {}
```

Business logic tidak boleh mengandalkan generic:

```ts
throw new Error("Something went wrong");
```

untuk expected failures.

---

# 15. Error Categories

Engine harus dapat membedakan error berdasarkan behavior.

Minimal:

```text
ValidationError
RetryableError
FatalError
TimeoutError
Cancellation
```

Engine harus dapat menentukan apakah sebuah error:

```text
retryable
atau
non-retryable
```

---

# 16. Retry

Step harus dapat memiliki retry policy.

Example:

```ts
{
  retry: {
    maxAttempts: 3,
    strategy: "exponential",
  },
}
```

Supported strategies:

```text
fixed
exponential
```

Example:

```text
Attempt 1
   ↓
100ms
   ↓
Attempt 2
   ↓
200ms
   ↓
Attempt 3
   ↓
Failed
```

Gunakan Effect `Schedule`.

Jangan membuat custom retry implementation jika abstraction Effect yang sesuai tersedia.

---

# 17. Timeout

Step dapat memiliki timeout.

Example:

```ts
Effect.timeout(
  Effect.seconds(5)
)
```

Setiap operation yang berpotensi tidak selesai harus dapat dibatasi.

Timeout harus menghasilkan typed error.

---

# 18. Cancellation

Workflow harus dapat dihentikan sebelum selesai.

Conceptual flow:

```text
Workflow
   ↓
Step A ✓
   ↓
Step B
   ↓
Cancel
   ↓
Workflow CANCELLED
```

Gunakan interruption mechanism dari Effect.

Jangan membuat cancellation flag manual jika Effect menyediakan abstraction yang sesuai.

---

# 19. Concurrency

Engine harus mendukung execution secara concurrent.

Contoh:

```text
             Step A
                │
         ┌──────┴──────┐
         ▼             ▼
      Step B         Step C
         │             │
         └──────┬──────┘
                ▼
             Step D
```

Step B dan C dapat berjalan secara parallel jika tidak memiliki dependency satu sama lain.

Gunakan Effect concurrency primitives.

Hindari manual `Promise.all` di core engine jika Effect menyediakan abstraction yang lebih tepat.

---

# 20. Sequential vs Parallel

Engine harus dapat membedakan:

### Sequential

```text
A → B → C → D
```

### Parallel

```text
      ┌→ B ─┐
A ────┤     ├→ D
      └→ C ─┘
```

Parallel execution hanya boleh digunakan ketika dependency antar-step memungkinkan.

---

# 21. Context & Dependency Injection

Gunakan Effect `Context` dan `Layer`.

Example:

```text
Workflow
   │
   ├── Logger
   ├── Clock
   └── Config
```

Jangan menggunakan global singleton:

```ts
const logger = new Logger();
```

Prefer service abstraction:

```ts
class Logger extends Context.Tag("Logger")<
  Logger,
  {
    readonly info: (
      message: string
    ) => Effect.Effect<void>;
  }
>() {}
```

Dependency harus dapat diganti saat testing.

---

# 22. Pure Core

Sebisa mungkin, domain workflow tetap pure.

Contoh:

```text
Domain
├── Workflow
├── Step
├── Execution
├── Errors
└── Policies
```

Tidak boleh bergantung langsung pada:

```text
Database
HTTP
Filesystem
Redis
Environment
External API
```

Infrastructure dapat ditambahkan melalui dependency injection pada fase selanjutnya.

---

# 23. Current Architecture

```text
src/
│
├── domain/
│   ├── workflow/
│   ├── step/
│   ├── execution/
│   └── errors/
│
├── engine/
│   ├── executor/
│   ├── retry/
│   ├── timeout/
│   └── concurrency/
│
├── services/
│   ├── logger/
│   └── clock/
│
├── config/
│
└── index.ts
```

Structure boleh berkembang jika kebutuhan engine berubah.

Jangan membuat folder hanya untuk future features.

---

# 24. Suggested Internal Structure

Conceptual:

```text
src/
│
├── workflow/
│   ├── Workflow.ts
│   ├── WorkflowStep.ts
│   └── WorkflowBuilder.ts
│
├── execution/
│   ├── Executor.ts
│   ├── Execution.ts
│   └── ExecutionStatus.ts
│
├── policy/
│   ├── RetryPolicy.ts
│   └── TimeoutPolicy.ts
│
├── errors/
│   ├── WorkflowError.ts
│   ├── ValidationError.ts
│   ├── RetryableError.ts
│   └── TimeoutError.ts
│
├── services/
│   └── Logger.ts
│
└── index.ts
```

Jangan menganggap struktur ini final. Prioritaskan separation of concerns daripada mengikuti folder structure secara kaku.

---

# 25. Testing

Testing adalah bagian penting dari engine.

Gunakan Vitest.

Minimal test coverage untuk core:

```text
Workflow creation
Step execution
Sequential execution
Parallel execution
Successful execution
Failed execution
Retry
Retry exhaustion
Timeout
Cancellation
Typed errors
Dependency injection
```

Example:

```ts
it("executes workflow successfully", async () => {
  const result = await Effect.runPromise(
    workflow.execute(input)
  );

  expect(result).toEqual(expected);
});
```

Test harus sebisa mungkin tidak membutuhkan:

* database
* network
* external API
* Docker

---

# 26. Failure Testing

Jangan hanya test happy path.

Setiap feature harus mempertimbangkan:

```text
Success
Failure
Retry
Timeout
Cancellation
Invalid Input
Concurrency
```

Example:

```text
Step A ✓
Step B ✗
   ↓
Retry
   ↓
Step B ✓
   ↓
Step C ✓
```

---

# 27. Example Workflow

Target example sederhana:

```ts
const workflow = Workflow.define({
  name: "order-processing",

  steps: [
    validateOrder,
    reserveStock,
    processPayment,
    completeOrder,
  ],
});
```

Execution:

```text
Validate Order
      ↓
Reserve Stock
      ↓
Process Payment
      ↓
Complete Order
```

Jika payment gagal:

```text
Process Payment
      ↓
   FAILED
      ↓
   Retry #1
      ↓
   Retry #2
      ↓
   Success
```

---

# 28. Example Parallel Workflow

```text
              Create Order
                   │
          ┌────────┴────────┐
          ▼                 ▼
     Send Email       Update Analytics
          │                 │
          └────────┬────────┘
                   ▼
              Finish Order
```

Engine harus dapat mengeksekusi dua independent steps secara concurrent.

---

# 29. Public API

Core library harus memiliki API yang sederhana.

Target:

```ts
import {
  Workflow,
  Step,
  RetryPolicy,
} from "Nagare";
```

Example:

```ts
const workflow = Workflow.define({
  name: "hello-world",

  steps: [
    Step.make({
      name: "hello",
      execute: () =>
        Effect.succeed("Hello"),
    }),

    Step.make({
      name: "world",
      execute: (input) =>
        Effect.succeed(`${input} World`),
    }),
  ],
});
```

Execution:

```ts
const result = await Effect.runPromise(
  workflow.execute(undefined)
);
```

Public API harus dijaga tetap kecil.

---

# 30. Persistence with PostgreSQL

PostgreSQL ditambahkan setelah core engine stabil.

Persistence layer harus berada di luar domain.

Architecture:

```text
Application
     ↓
Workflow Engine
     ↓
Repository Interface
     ↓
PostgreSQL Repository
     ↓
PostgreSQL
```

Domain hanya mengetahui abstraction:

```ts
interface WorkflowRepository {
  save(
    workflow: Workflow
  ): Effect.Effect<void, RepositoryError>;

  findById(
    id: WorkflowId
  ): Effect.Effect<Workflow, RepositoryError>;
}
```

Implementasi PostgreSQL tidak boleh bocor ke domain.

Target persistence:

```text
workflows
workflow_versions
workflow_runs
step_runs
```

Persistence harus mendukung:

* workflow storage
* workflow versioning
* execution history
* step execution history

---

# 31. Database Rules

PostgreSQL digunakan sebagai persistence layer, bukan sebagai bagian dari workflow execution logic.

Jangan melakukan:

```text
Workflow → PostgreSQL Client
```

Prefer:

```text
Workflow
    ↓
Repository abstraction
    ↓
PostgreSQL implementation
```

Database operations harus memiliki typed errors.

Credentials dan connection configuration harus berada pada infrastructure/configuration layer.

---

# 32. No Premature Infrastructure

Jangan menambahkan:

```text
Redis
GraphQL
Hono
Frontend
Docker infrastructure
```

hanya karena nantinya mungkin dibutuhkan.

PostgreSQL hanya ditambahkan ketika persistence phase dimulai.

Core engine harus selesai dan dapat digunakan secara standalone terlebih dahulu.

---

# 33. Future Third-party Integrations

Setelah persistence stabil, Nagare dapat dikembangkan menjadi integration workflow platform.

Potential integrations:

```text
HTTP
Webhook
GitHub
Discord
Slack
Notion
Resend
Telegram
```

Integration layer harus terpisah dari core engine.

Third-party integration tidak boleh mengubah behavior inti workflow engine.

---

# 34. Future Frontend

Frontend dibuat setelah engine, persistence, dan integration layer cukup stabil.

Potential stack:

```text
HTMX
Alpine.js
```

Potential features:

```text
Dashboard
Workflow List
Workflow Detail
Execution History
Execution Detail
Manual Workflow Execution
```

Visual workflow editor bukan prioritas awal.

---

# 35. Development Phases

## Phase 1 — Core Engine

```text
- Initialize TypeScript
- Configure Effect.ts
- Configure Vitest
- Workflow abstraction
- Step abstraction
- Executor
- Execution status
- Typed errors
- Retry
- Timeout
- Cancellation
- Sequential execution
- Parallel execution
- Context / Layer
- Comprehensive tests
```

**Current priority.**

---

## Phase 2 — Persistence

```text
- PostgreSQL
- Workflow repository
- Workflow versioning
- WorkflowRun persistence
- StepRun persistence
- Execution history
```

---

## Phase 3 — Third-party Integrations

```text
- HTTP
- Webhook
- GitHub
- Discord
- Additional integrations
```

---

## Phase 4 — Frontend

```text
- Dashboard
- Workflow management
- Execution history
- Execution detail
```

Visual editor dapat dipertimbangkan setelah semua core functionality stabil.

---

# 36. Development Rules

When working on Nagare:

1. Read `AGENTS.md` before modifying architecture.
2. Keep the core independent from infrastructure.
3. Prefer Effect primitives over manual Promise orchestration.
4. Use typed errors.
5. Use `Context` and `Layer` for dependencies.
6. Keep functions small and composable.
7. Avoid global mutable state.
8. Avoid unnecessary dependencies.
9. Add tests for every core feature.
10. Test failure scenarios.
11. Do not add frontend code during Phase 1.
12. Do not add PostgreSQL code during Phase 1.
13. Do not add third-party integrations during Phase 1.
14. Do not introduce microservices.
15. Do not build a visual editor during Phase 1.
16. Avoid premature abstractions.
17. Keep the public API minimal.
18. Prioritize correctness and composability over feature count.
19. Do not introduce GraphQL.
20. Do not introduce Frappe-specific logic.

---

# 37. Definition of Done

A core engine feature is complete when:

```text
Implementation
      ↓
Type-safe
      ↓
Effect-native
      ↓
Error handling
      ↓
Failure tests
      ↓
Documentation
```

For execution-related features, test:

```text
✓ Success
✓ Failure
✓ Retry
✓ Timeout
✓ Cancellation
✓ Concurrency
```

For persistence features, additionally test:

```text
✓ Save
✓ Retrieve
✓ Update
✓ Versioning
✓ Repository failure
```

---

# 38. Project Philosophy

Nagare should demonstrate that **Effect.ts can be used to build a reliable, composable workflow runtime**.

The project should prioritize:

```text
Correctness
    >
Type Safety
    >
Reliability
    >
Composability
    >
Testability
    >
Performance
    >
Feature Count
```

The main question when adding a feature:

> Does this improve the workflow engine itself?

If not, defer it to a future phase.

---

# 39. Current Priority

The current priority is **ONLY**:

```text
┌─────────────────────────────┐
│      Nagare ENGINE       │
├─────────────────────────────┤
│                             │
│ Workflow                    │
│ Step                        │
│ Executor                    │
│ Typed Errors                │
│ Retry                       │
│ Timeout                     │
│ Cancellation                │
│ Sequential Execution        │
│ Parallel Execution          │
│ Context / Layer             │
│ Testing                     │
│                             │
└─────────────────────────────┘
```

The first milestone is:

> **Execute a type-safe multi-step workflow reliably using Effect.ts, without any external infrastructure.**

Only after this milestone is stable should PostgreSQL persistence be introduced.

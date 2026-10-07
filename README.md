# 🌊 Nagare (流れ)

> A type-safe, composable workflow execution engine built with **TypeScript** and **Effect.ts**.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Effect](https://img.shields.io/badge/Effect-3.x-8a2be2.svg)](https://effect.website/)
[![Vitest](https://img.shields.io/badge/Tested%20with-Vitest-green.svg)](https://vitest.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Nagare** (Japanese for *Flow*) is a lightweight, pure, and resilient workflow orchestration library. It leverages Effect.ts primitives to execute complex multi-step workflows with full type safety, predictable error handling, built-in retries, timeouts, cancellation, and dependency injection.

---

## ✨ Features

- 🎯 **Type-Safe Pipelines**: Full end-to-end type inference from input to final output across sequential and parallel steps.
- 🛡️ **Explicit Typed Errors**: No unhandled generic exceptions. Expected failures are tagged errors (`Data.TaggedError`).
- 🔁 **Resilient Retries**: Native retry strategies (Fixed, Exponential backoff) powered by Effect `Schedule`.
- ⏱️ **Timeouts & Cancellation**: Granular per-step timeout limits and cooperative fiber cancellation.
- ⚡ **Sequential & Parallel Execution**: Compose steps in series (`Workflow.sequence`, `.pipe`) or concurrent parallel branches (`Workflow.parallel`).
- 💉 **Dependency Injection**: Easily mock and swap external services (APIs, Loggers, Databases) using Effect `Context` and `Layer`.
- 📦 **Infrastructure Agnostic**: The core engine runs pure in-memory without external dependencies (no forced HTTP, database, or cloud requirements).

---

## 🏗️ Architecture

```text
               Workflow Definition
                        │
         ┌──────────────┴──────────────┐
         ▼                             ▼
  Sequential Steps              Parallel Branches
   (Step A → Step B)            (Step C & Step D)
         │                             │
         └──────────────┬──────────────┘
                        ▼
                 Step Execution
   ┌────────────────────────────────────────┐
   │ • Timeout Controls                     │
   │ • Auto-Retry Policies (Fixed/Exp)      │
   │ • Fiber Cancellation Support           │
   │ • Typed Error Handling                 │
   │ • Dependency Injection (Context/Layer) │
   └────────────────────────────────────────┘
                        │
                        ▼
                 Execution Result
```

---

## 🚀 Quick Start

### Installation

```bash
pnpm install
```

### 1. Basic Step Execution

```ts
import { Effect } from "effect";
import { Step } from "nagare";

const greetStep = Step.make({
  name: "greet-user",
  execute: (name: string) => Effect.succeed(`Hello, ${name}!`)
});

const result = await Effect.runPromise(greetStep.execute("World"));
console.log(result); // "Hello, World!"
```

---

### 2. Sequential Workflow Pipeline

Compose multiple steps where the output of one step becomes the input of the next:

```ts
import { Effect } from "effect";
import { Step, Workflow } from "nagare";

const addOne = Step.make({
  name: "add-one",
  execute: (n: number) => Effect.succeed(n + 1)
});

const double = Step.make({
  name: "double",
  execute: (n: number) => Effect.succeed(n * 2)
});

const format = Step.make({
  name: "format-string",
  execute: (n: number) => Effect.succeed(`Final Result: ${n}`)
});

// Method A: Using Workflow.sequence
const mathWorkflow = Workflow.sequence("math-pipeline", [
  addOne,
  double,
  format
]);

// Method B: Using .pipe
// const mathWorkflow = Workflow.make(addOne).pipe(double).pipe(format);

const result = await Effect.runPromise(mathWorkflow.execute(5));
// (5 + 1) * 2 = 12 -> "Final Result: 12"
console.log(result);
```

---

### 3. Parallel Execution

Execute multiple independent steps concurrently:

```ts
import { Effect } from "effect";
import { Step, Workflow } from "nagare";

const fetchUserProfile = Step.make({
  name: "fetch-profile",
  execute: (userId: string) => Effect.succeed({ id: userId, name: "Alice" })
});

const fetchUserOrders = Step.make({
  name: "fetch-orders",
  execute: (userId: string) => Effect.succeed(["order-1", "order-2"])
});

// Run both steps concurrently in parallel
const fetchAllData = Workflow.parallel("fetch-user-data", [
  fetchUserProfile,
  fetchUserOrders
]);

const [profile, orders] = await Effect.runPromise(fetchAllData.execute("user-123"));
console.log(profile, orders);
```

---

### 4. Retries & Timeout Policies

Add automatic retry strategies and timeout boundaries to flaky network steps:

```ts
import { Effect } from "effect";
import { Step, RetryPolicy } from "nagare";

const paymentStep = Step.make({
  name: "process-payment",
  // Step timeout limit
  timeout: "5 seconds",
  // Exponential backoff retry: 3 attempts starting with 100ms delay
  retry: RetryPolicy.exponential({
    maxAttempts: 3,
    initialDelay: "100 millis",
    factor: 2
  }),
  execute: (order) =>
    Effect.gen(function* () {
      // Your network call here
      return { status: "PAID", orderId: order.id };
    })
});
```

---

### 5. Dependency Injection (Context & Layer)

Keep your workflow steps completely decoupled from third-party APIs or infrastructure:

```ts
import { Context, Effect, Layer } from "effect";
import { Step, Workflow } from "nagare";

// 1. Service Definition
interface EmailService {
  readonly send: (to: string, body: string) => Effect.Effect<void>;
}
const EmailService = Context.GenericTag<EmailService>("@app/EmailService");

// 2. Pure Step using the service
const sendWelcomeEmailStep = Step.make({
  name: "send-welcome-email",
  execute: (email: string) =>
    Effect.gen(function* () {
      const mailer = yield* EmailService;
      yield* mailer.send(email, "Welcome to our platform!");
      return { sent: true };
    })
});

// 3. Provide Layer (Mock for testing, or Live for production)
const MockEmailLayer = Layer.succeed(
  EmailService,
  EmailService.of({
    send: (to, body) => Effect.sync(() => console.log(`[MOCK EMAIL] To: ${to}, Body: ${body}`))
  })
);

// 4. Run with provided layer
const program = sendWelcomeEmailStep.execute("user@example.com").pipe(
  Effect.provide(MockEmailLayer)
);

await Effect.runPromise(program);
```

---

## 🛠️ Included Example: GitHub Webhook to Discord

An end-to-end real-world example handling GitHub webhook events (**Push, Stars, Issues, Pull Requests**) and forwarding them as rich embeds to Discord.

```bash
# 1. Setup your environment
cp .env.example .env
# Edit .env and put your DISCORD_WEBHOOK_URL

# 2. Test direct notification dispatch
pnpm run example:dispatch

# 3. Run the live webhook receiver server (with hot reload)
pnpm run example:server:watch
```

---

## 🧪 Testing

Nagare is built with 100% test coverage for core engine behaviors using **Vitest**:

```bash
# Run all tests once
pnpm test

# Run tests in watch mode
pnpm test:watch

# Build TypeScript
pnpm run build
```

---

## 🗺️ Roadmap

- [x] **Phase 1: Core Engine** *(Current)*
  - Type-safe Step & Workflow definitions
  - Sequential & Parallel composition
  - Typed error modeling (`Data.TaggedError`)
  - Retries (`Schedule`) and Timeout management
  - Cooperative Fiber Cancellation
  - Dependency Injection via `Context` & `Layer`
- [ ] **Phase 2: Persistence Layer**
  - PostgreSQL repository adapter
  - Workflow & Step run state history
  - Versioning and resumption
- [ ] **Phase 3: Extended Integrations**
  - Pre-built connectors (HTTP, GitHub, Discord, Slack, S3)
- [ ] **Phase 4: Dashboard & Runtime Monitor**
  - Real-time workflow visualizer & execution inspector

---

## 📄 License

MIT © [Rakha](https://github.com/rakha)

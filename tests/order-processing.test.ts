import { describe, expect, it } from "vitest";
import { Cause, Context, Data, Effect, Exit, Layer } from "effect";
import {
  Step,
  Workflow,
  RetryPolicy,
  WorkflowLogger
} from "../src/index.js";

// 1. Domain Types
interface Order {
  readonly id: string;
  readonly amount: number;
  readonly customerEmail: string;
}

interface ReservedOrder extends Order {
  readonly stockReservationId: string;
}

interface ProcessedOrder extends ReservedOrder {
  readonly transactionId: string;
}

interface CompletedOrder extends ProcessedOrder {
  readonly completedAt: Date;
}

// 2. Typed Errors
class OrderValidationError extends Data.TaggedError("OrderValidationError")<{
  readonly reason: string;
}> {}

class StockUnavailableError extends Data.TaggedError("StockUnavailableError")<{
  readonly orderId: string;
}> {}

class PaymentFailedError extends Data.TaggedError("PaymentFailedError")<{
  readonly orderId: string;
  readonly amount: number;
}> {}

describe("Order Processing Workflow Scenario", () => {
  it("executes a complete end-to-end order workflow with sequential and parallel steps", async () => {
    // Step 1: Validate Order
    const validateOrder = Step.make({
      name: "validate-order",
      execute: (order: Order) =>
        Effect.gen(function* () {
          if (order.amount <= 0) {
            return yield* Effect.fail(
              new OrderValidationError({ reason: "Order amount must be positive" })
            );
          }
          return order;
        })
    });

    // Step 2: Reserve Stock
    const reserveStock = Step.make({
      name: "reserve-stock",
      execute: (order: Order) =>
        Effect.gen(function* () {
          return {
            ...order,
            stockReservationId: `stock-res-${order.id}`
          } satisfies ReservedOrder;
        })
    });

    // Step 3: Process Payment (with retry policy)
    let paymentAttempts = 0;
    const processPayment = Step.make({
      name: "process-payment",
      retry: RetryPolicy.fixed({ maxAttempts: 3, delay: "10 millis" }),
      execute: (order: ReservedOrder) =>
        Effect.gen(function* () {
          paymentAttempts++;
          if (paymentAttempts < 2) {
            // Simulasi temporary payment gateway network glitch
            return yield* Effect.fail(
              new PaymentFailedError({ orderId: order.id, amount: order.amount })
            );
          }
          return {
            ...order,
            transactionId: `txn-${order.id}`
          } satisfies ProcessedOrder;
        })
    });

    // Step 4: Parallel Step (Send Email & Update Analytics)
    const sendEmail = Step.make({
      name: "send-email",
      execute: (order: ProcessedOrder) =>
        Effect.succeed(`Email sent to ${order.customerEmail}`)
    });

    const updateAnalytics = Step.make({
      name: "update-analytics",
      execute: (order: ProcessedOrder) =>
        Effect.succeed(`Analytics updated for revenue $${order.amount}`)
    });

    const notifyAndRecord = Workflow.parallel("notify-and-record", [
      sendEmail,
      updateAnalytics
    ]);

    // Step 5: Complete Order
    const completeOrder = Step.make({
      name: "complete-order",
      execute: (order: ProcessedOrder) =>
        Effect.succeed({
          ...order,
          completedAt: new Date("2026-10-07T12:00:00Z")
        } satisfies CompletedOrder)
    });

    // Compose Full Workflow:
    // validate -> reserve -> payment -> (parallel notifications & complete)
    const orderWorkflow = Workflow.define({
      name: "order-processing-pipeline",
      execute: (initialOrder: Order) =>
        Effect.gen(function* () {
          const validated = yield* validateOrder.execute(initialOrder);
          const reserved = yield* reserveStock.execute(validated);
          const paid = yield* processPayment.execute(reserved);
          
          // Jalankan parallel notification & update analytics
          yield* notifyAndRecord.execute(paid);

          // Selesaikan order
          return yield* completeOrder.execute(paid);
        })
    });

    const initialOrder: Order = {
      id: "ord-999",
      amount: 150,
      customerEmail: "user@example.com"
    };

    const result = await Effect.runPromise(orderWorkflow.execute(initialOrder));

    expect(result.id).toBe("ord-999");
    expect(result.stockReservationId).toBe("stock-res-ord-999");
    expect(result.transactionId).toBe("txn-ord-999");
    expect(paymentAttempts).toBe(2); // Membuktikan auto-retry berhasil pulih
  });

  it("handles order validation failure without continuing to next steps", async () => {
    let stockReserved = false;

    const validateOrder = Step.make({
      name: "validate-order",
      execute: (order: Order) =>
        order.amount > 0
          ? Effect.succeed(order)
          : Effect.fail(new OrderValidationError({ reason: "Invalid amount" }))
    });

    const reserveStock = Step.make({
      name: "reserve-stock",
      execute: (order: Order) =>
        Effect.sync(() => {
          stockReserved = true;
          return { ...order, stockReservationId: "res-1" };
        })
    });

    const workflow = Workflow.define({
      name: "failing-validation-workflow",
      execute: (order: Order) =>
        Effect.gen(function* () {
          const validated = yield* validateOrder.execute(order);
          return yield* reserveStock.execute(validated);
        })
    });

    const invalidOrder: Order = {
      id: "ord-000",
      amount: -10,
      customerEmail: "invalid@example.com"
    };

    const exit = await Effect.runPromiseExit(workflow.execute(invalidOrder));
    expect(Exit.isFailure(exit)).toBe(true);
    expect(stockReserved).toBe(false); // Step berikutnya tidak pernah dieksekusi

    if (Exit.isFailure(exit)) {
      const error = Cause.failureOption(exit.cause);
      expect(error._tag).toBe("Some");
      if (error._tag === "Some") {
        expect(error.value._tag).toBe("OrderValidationError");
      }
    }
  });
});

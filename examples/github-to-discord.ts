import { Context, Data, Effect, Layer } from "effect";
import { Step, Workflow, RetryPolicy } from "../src/index.js";

// ==========================================
// 1. Domain Types (GitHub Webhook & Discord)
// ==========================================

export interface GitHubPushPayload {
  readonly repository: {
    readonly full_name: string;
  };
  readonly sender: {
    readonly login: string;
  };
  readonly commits: ReadonlyArray<{
    readonly id: string;
    readonly message: string;
    readonly author: {
      readonly name: string;
    };
  }>;
}

export interface DiscordMessage {
  readonly content: string;
  readonly embeds?: ReadonlyArray<{
    readonly title: string;
    readonly description: string;
    readonly color?: number;
  }>;
}

// ==========================================
// 2. Typed Errors
// ==========================================

export class InvalidWebhookPayloadError extends Data.TaggedError("InvalidWebhookPayloadError")<{
  readonly message: string;
}> {}

export class DiscordDeliveryError extends Data.TaggedError("DiscordDeliveryError")<{
  readonly status: number;
  readonly message: string;
}> {}

// ==========================================
// 3. Service Definition (Dependency Injection)
// ==========================================

export interface DiscordService {
  readonly sendNotification: (
    message: DiscordMessage
  ) => Effect.Effect<void, DiscordDeliveryError>;
}

export const DiscordService = Context.GenericTag<DiscordService>("@app/DiscordService");

// ==========================================
// 4. Workflow Steps
// ==========================================

// Step 1: Validasi payload GitHub Webhook
export const validatePayloadStep = Step.make({
  name: "validate-github-payload",
  execute: (payload: GitHubPushPayload) =>
    Effect.gen(function* () {
      if (!payload.repository?.full_name) {
        return yield* Effect.fail(
          new InvalidWebhookPayloadError({ message: "Missing repository name" })
        );
      }
      if (!payload.commits || payload.commits.length === 0) {
        return yield* Effect.fail(
          new InvalidWebhookPayloadError({ message: "No commits in push event" })
        );
      }
      return payload;
    })
});

// Step 2: Format data menjadi Discord Embed message
export const formatDiscordMessageStep = Step.make({
  name: "format-discord-message",
  execute: (payload: GitHubPushPayload) =>
    Effect.gen(function* () {
      const commitCount = payload.commits.length;
      const commitList = payload.commits
        .map((c) => `• [\`${c.id.substring(0, 7)}\`] ${c.message} (${c.author.name})`)
        .join("\n");

      const message: DiscordMessage = {
        content: `🚀 **New Push to ${payload.repository.full_name}** by \`${payload.sender.login}\``,
        embeds: [
          {
            title: `${commitCount} new commit(s)`,
            description: commitList,
            color: 0x2b2d31
          }
        ]
      };

      return message;
    })
});

// Step 3: Kirim notifikasi ke Discord dengan Retry & Timeout
export const sendDiscordNotificationStep = Step.make({
  name: "send-discord-notification",
  timeout: "3 seconds",
  retry: RetryPolicy.exponential({
    maxAttempts: 3,
    initialDelay: "100 millis",
    factor: 2
  }),
  execute: (message: DiscordMessage) =>
    Effect.gen(function* () {
      const discord = yield* DiscordService;
      yield* discord.sendNotification(message);
      return { success: true, timestamp: new Date() };
    })
});

// ==========================================
// 5. Compose Workflow
// ==========================================

export const githubToDiscordWorkflow = Workflow.define({
  name: "github-webhook-to-discord",
  execute: (webhookPayload: GitHubPushPayload) =>
    Effect.gen(function* () {
      const validated = yield* validatePayloadStep.execute(webhookPayload);
      const discordMsg = yield* formatDiscordMessageStep.execute(validated);
      const result = yield* sendDiscordNotificationStep.execute(discordMsg);
      return result;
    })
});

// ==========================================
// 6. Layer Implementations (Mock & Live)
// ==========================================

// Mock Layer untuk testing/local
export const MockDiscordServiceLive = Layer.succeed(
  DiscordService,
  DiscordService.of({
    sendNotification: (msg) =>
      Effect.sync(() => {
        console.log("Mock Discord Message Sent:", JSON.stringify(msg, null, 2));
      })
  })
);

// Live HTTP Layer menggunakan webhook URL
export const makeLiveDiscordService = (webhookUrl: string) =>
  Layer.succeed(
    DiscordService,
    DiscordService.of({
      sendNotification: (msg) =>
        Effect.tryPromise({
          try: async () => {
            const res = await fetch(webhookUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(msg)
            });
            if (!res.ok) {
              throw new Error(`Discord API error: ${res.statusText}`);
            }
          },
          catch: (err) =>
            new DiscordDeliveryError({
              status: 500,
              message: String(err)
            })
        })
    })
  );

import { describe, expect, it } from "vitest";
import { Cause, Effect, Exit, Layer } from "effect";
import {
  githubToDiscordWorkflow,
  GitHubPushPayload,
  DiscordService,
  DiscordDeliveryError,
  MockDiscordServiceLive
} from "../examples/github-to-discord.js";

describe("GitHub Webhook to Discord Notification Workflow", () => {
  const samplePayload: GitHubPushPayload = {
    repository: {
      full_name: "rakha/effect-workflow-engine"
    },
    sender: {
      login: "rakha"
    },
    commits: [
      {
        id: "a1b2c3d4e5f6",
        message: "feat: add workflow engine support",
        author: { name: "Rakha" }
      }
    ]
  };

  it("successfully processes webhook payload and sends discord notification", async () => {
    let capturedMessage: any = null;

    const testDiscordLayer = Layer.succeed(
      DiscordService,
      DiscordService.of({
        sendNotification: (msg) =>
          Effect.sync(() => {
            capturedMessage = msg;
          })
      })
    );

    const program = githubToDiscordWorkflow
      .execute(samplePayload)
      .pipe(Effect.provide(testDiscordLayer));

    const result = await Effect.runPromise(program);

    expect(result.success).toBe(true);
    expect(capturedMessage).not.toBeNull();
    expect(capturedMessage.content).toContain("rakha/effect-workflow-engine");
    expect(capturedMessage.embeds[0].description).toContain("feat: add workflow engine support");
  });

  it("handles invalid webhook payload with typed error", async () => {
    const invalidPayload = {
      repository: { full_name: "" },
      sender: { login: "rakha" },
      commits: []
    } as GitHubPushPayload;

    const program = githubToDiscordWorkflow
      .execute(invalidPayload)
      .pipe(Effect.provide(MockDiscordServiceLive));

    const exit = await Effect.runPromiseExit(program);
    expect(Exit.isFailure(exit)).toBe(true);

    if (Exit.isFailure(exit)) {
      const error = Cause.failureOption(exit.cause);
      expect(error._tag).toBe("Some");
      if (error._tag === "Some") {
        expect(error.value._tag).toBe("InvalidWebhookPayloadError");
      }
    }
  });

  it("retries when discord service temporarily fails", async () => {
    let attempts = 0;

    const flakyDiscordLayer = Layer.succeed(
      DiscordService,
      DiscordService.of({
        sendNotification: () =>
          Effect.gen(function* () {
            attempts++;
            if (attempts < 2) {
              return yield* Effect.fail(
                new DiscordDeliveryError({ status: 503, message: "Service Unavailable" })
              );
            }
          })
      })
    );

    const program = githubToDiscordWorkflow
      .execute(samplePayload)
      .pipe(Effect.provide(flakyDiscordLayer));

    const result = await Effect.runPromise(program);
    expect(result.success).toBe(true);
    expect(attempts).toBe(2);
  });
});

import { describe, expect, it } from "vitest";
import { Cause, Effect, Exit, Layer } from "effect";
import {
  githubMultiEventWorkflow,
  githubToDiscordWorkflow,
  GitHubPushPayload,
  GitHubStarPayload,
  DiscordService,
  DiscordDeliveryError,
  MockDiscordServiceLive
} from "../examples/github-to-discord.js";

describe("GitHub Webhook to Discord Notification Workflow", () => {
  const samplePushPayload: GitHubPushPayload = {
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

  it("successfully processes push payload and sends discord notification", async () => {
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
      .execute(samplePushPayload)
      .pipe(Effect.provide(testDiscordLayer));

    const result = await Effect.runPromise(program);

    expect(result.success).toBe(true);
    expect(capturedMessage).not.toBeNull();
    expect(capturedMessage.content).toContain("rakha/effect-workflow-engine");
    expect(capturedMessage.embeds[0].description).toContain("feat: add workflow engine support");
  });

  it("handles Star/Watch events and formats golden star embed", async () => {
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

    const starPayload: GitHubStarPayload = {
      action: "started",
      repository: {
        full_name: "rakha/effect-workflow-engine",
        stargazers_count: 42
      },
      sender: {
        login: "octocat",
        avatar_url: "https://github.com/octocat.png"
      }
    };

    const program = githubMultiEventWorkflow
      .execute({ eventType: "star", payload: starPayload })
      .pipe(Effect.provide(testDiscordLayer));

    const result = await Effect.runPromise(program);

    expect(result.success).toBe(true);
    expect(capturedMessage.embeds[0].title).toBe("⭐ New Star on rakha/effect-workflow-engine!");
    expect(capturedMessage.embeds[0].description).toContain("@octocat");
    expect(capturedMessage.embeds[0].description).toContain("42");
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
      .execute(samplePushPayload)
      .pipe(Effect.provide(flakyDiscordLayer));

    const result = await Effect.runPromise(program);
    expect(result.success).toBe(true);
    expect(attempts).toBe(2);
  });
});

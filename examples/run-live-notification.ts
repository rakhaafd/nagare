import { Config, Effect, Layer } from "effect";
import {
  githubToDiscordWorkflow,
  GitHubPushPayload,
  DiscordService,
  DiscordDeliveryError
} from "./github-to-discord.js";

// Layer Discord langsung membaca dari .env (DISCORD_WEBHOOK_URL)
const LiveDiscordLayer = Layer.effect(
  DiscordService,
  Effect.gen(function* () {
    const webhookUrl = yield* Config.string("DISCORD_WEBHOOK_URL");

    return DiscordService.of({
      sendNotification: (msg) =>
        Effect.tryPromise({
          try: async () => {
            const res = await fetch(webhookUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(msg)
            });
            if (!res.ok) {
              const text = await res.text();
              throw new Error(`Discord Webhook HTTP ${res.status}: ${text}`);
            }
          },
          catch: (err) =>
            new DiscordDeliveryError({
              status: 500,
              message: String(err)
            })
        })
    });
  })
);

// Payload simulasi GitHub Push Event
const samplePayload: GitHubPushPayload = {
  repository: {
    full_name: "rakha/effect-workflow-engine"
  },
  sender: {
    login: "rakha"
  },
  commits: [
    {
      id: "7d8a9b0c1e2f",
      message: "feat: implement Nagare core workflow engine with Effect.ts",
      author: {
        name: "Rakha"
      }
    }
  ]
};

// Jalankan workflow
const main = Effect.gen(function* () {
  console.log("🚀 Menjalankan GitHub -> Discord workflow dengan live .env...");
  const result = yield* githubToDiscordWorkflow.execute(samplePayload);
  console.log("✅ Berhasil dikirim ke Discord!", result);
}).pipe(
  Effect.provide(LiveDiscordLayer),
  Effect.catchAll((err) =>
    Effect.sync(() => {
      console.error("❌ Gagal menjalankan workflow:", err);
    })
  )
);

Effect.runPromise(main);

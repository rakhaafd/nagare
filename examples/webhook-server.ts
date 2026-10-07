import http from "node:http";
import { Config, Effect, Layer } from "effect";
import {
  githubToDiscordWorkflow,
  GitHubPushPayload,
  DiscordService,
  DiscordDeliveryError
} from "./github-to-discord.js";

// Layer Discord membaca DISCORD_WEBHOOK_URL dari env
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

const PORT = Number(process.env.PORT || 3000);

const server = http.createServer((req, res) => {
  // Hanya proses endpoint POST /webhook
  if (req.method === "POST" && req.url === "/webhook") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });

    req.on("end", async () => {
      try {
        const payload = JSON.parse(body) as GitHubPushPayload;

        // Jalankan Nagare Workflow Engine
        const program = githubToDiscordWorkflow
          .execute(payload)
          .pipe(Effect.provide(LiveDiscordLayer));

        const result = await Effect.runPromise(program);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "success", result }));
      } catch (err) {
        console.error("Workflow Execution Error:", err);
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "error", error: String(err) }));
      }
    });
  } else {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Nagare GitHub Webhook Listener is active. Send POST requests to /webhook\n");
  }
});

server.listen(PORT, () => {
  console.log(`📡 GitHub Webhook listener running at http://localhost:${PORT}/webhook`);
  console.log(`👉 Siap menerima webhook dari GitHub dan meneruskannya ke Discord.`);
});

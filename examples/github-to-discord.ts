import { Context, Data, Effect, Layer, Match } from "effect";
import { Step, Workflow, RetryPolicy } from "../src/index.js";

// ==========================================
// 1. Domain Types (GitHub Multi-Event & Discord)
// ==========================================

export interface GitHubPushPayload {
  readonly repository: {
    readonly full_name: string;
  };
  readonly sender: {
    readonly login: string;
    readonly avatar_url?: string;
  };
  readonly commits: ReadonlyArray<{
    readonly id: string;
    readonly message: string;
    readonly author: {
      readonly name: string;
    };
  }>;
}

export interface GitHubStarPayload {
  readonly action: "created" | "deleted" | "started";
  readonly repository: {
    readonly full_name: string;
    readonly stargazers_count?: number;
  };
  readonly sender: {
    readonly login: string;
    readonly avatar_url?: string;
  };
}

export interface GitHubIssuePayload {
  readonly action: "opened" | "closed" | "reopened";
  readonly issue: {
    readonly number: number;
    readonly title: string;
    readonly html_url: string;
    readonly user: {
      readonly login: string;
    };
  };
  readonly repository: {
    readonly full_name: string;
  };
  readonly sender: {
    readonly login: string;
  };
}

export interface GitHubPRPayload {
  readonly action: "opened" | "closed" | "reopened";
  readonly pull_request: {
    readonly number: number;
    readonly title: string;
    readonly html_url: string;
    readonly merged?: boolean;
    readonly user: {
      readonly login: string;
    };
  };
  readonly repository: {
    readonly full_name: string;
  };
  readonly sender: {
    readonly login: string;
  };
}

export type GitHubWebhookEvent =
  | { readonly eventType: "push"; readonly payload: GitHubPushPayload }
  | { readonly eventType: "star" | "watch"; readonly payload: GitHubStarPayload }
  | { readonly eventType: "issues"; readonly payload: GitHubIssuePayload }
  | { readonly eventType: "pull_request"; readonly payload: GitHubPRPayload };

export interface DiscordEmbed {
  readonly title?: string;
  readonly description?: string;
  readonly url?: string;
  readonly color?: number;
  readonly author?: {
    readonly name: string;
    readonly icon_url?: string;
  };
  readonly footer?: {
    readonly text: string;
  };
}

export interface DiscordMessage {
  readonly content?: string;
  readonly embeds?: ReadonlyArray<DiscordEmbed>;
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

// Step 1: Format event GitHub menjadi pesan Discord Embed
export const formatGitHubToDiscordStep = Step.make({
  name: "format-github-to-discord",
  execute: (event: GitHubWebhookEvent) =>
    Effect.gen(function* () {
      switch (event.eventType) {
        case "star":
        case "watch": {
          const { repository, sender } = event.payload;
          const starsText =
            repository.stargazers_count !== undefined
              ? ` (Total ⭐: ${repository.stargazers_count})`
              : "";

          return {
            embeds: [
              {
                title: `⭐ New Star on ${repository.full_name}!`,
                description: `**@${sender.login}** baru saja memberikan star ke repositori **${repository.full_name}**${starsText}! 🎉`,
                color: 0xffac33,
                author: {
                  name: sender.login,
                  icon_url: sender.avatar_url
                }
              }
            ]
          } satisfies DiscordMessage;
        }

        case "push": {
          const { repository, sender, commits } = event.payload;
          const commitList = (commits || [])
            .map((c) => `• [\`${c.id.substring(0, 7)}\`] ${c.message} (${c.author.name})`)
            .join("\n");

          return {
            content: `🚀 **New Push to \`${repository.full_name}\`** by **@${sender.login}**`,
            embeds: [
              {
                title: `${commits?.length ?? 0} Commit(s) Pushed`,
                description: commitList || "No commit details available.",
                color: 0x5865f2
              }
            ]
          } satisfies DiscordMessage;
        }

        case "issues": {
          const { action, issue, repository, sender } = event.payload;
          return {
            embeds: [
              {
                title: `🐛 Issue #${issue.number} ${action}: ${issue.title}`,
                url: issue.html_url,
                description: `Aksi oleh **@${sender.login}** di repositori **${repository.full_name}**`,
                color: action === "opened" ? 0x2ecc71 : 0xe74c3c
              }
            ]
          } satisfies DiscordMessage;
        }

        case "pull_request": {
          const { action, pull_request, repository, sender } = event.payload;
          const statusText = pull_request.merged ? "merged" : action;
          return {
            embeds: [
              {
                title: `🔀 Pull Request #${pull_request.number} ${statusText}: ${pull_request.title}`,
                url: pull_request.html_url,
                description: `Aksi oleh **@${sender.login}** di repositori **${repository.full_name}**`,
                color: pull_request.merged ? 0x9b59b6 : 0x3498db
              }
            ]
          } satisfies DiscordMessage;
        }

        default:
          return {
            content: `📢 GitHub Event received from \`${(event as any).payload?.repository?.full_name || "GitHub"}\``
          } satisfies DiscordMessage;
      }
    })
});

// Step 2: Kirim ke Discord dengan Retry & Timeout
export const sendDiscordNotificationStep = Step.make({
  name: "send-discord-notification",
  timeout: "5 seconds",
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

export const githubMultiEventWorkflow = Workflow.define({
  name: "github-multi-event-to-discord",
  execute: (event: GitHubWebhookEvent) =>
    Effect.gen(function* () {
      const discordMsg = yield* formatGitHubToDiscordStep.execute(event);
      const result = yield* sendDiscordNotificationStep.execute(discordMsg);
      return result;
    })
});

// Alias untuk backwards-compatibility
export const githubToDiscordWorkflow = Workflow.define({
  name: "github-webhook-to-discord",
  execute: (payload: GitHubPushPayload) =>
    githubMultiEventWorkflow.execute({ eventType: "push", payload })
});

// ==========================================
// 6. Layer Implementations
// ==========================================

export const MockDiscordServiceLive = Layer.succeed(
  DiscordService,
  DiscordService.of({
    sendNotification: (msg) =>
      Effect.sync(() => {
        console.log("Mock Discord Message Sent:", JSON.stringify(msg, null, 2));
      })
  })
);

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
              const text = await res.text();
              throw new Error(`Discord API error (${res.status}): ${text}`);
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

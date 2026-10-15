import type { Request, Response } from "express";
import { z } from "zod";

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(8000)
});
const chatSchema = z.object({
  messages: z.array(messageSchema).min(1).max(20)
}).superRefine((value, ctx) => {
  const total = value.messages.reduce((sum, item) => sum + item.content.length, 0);
  if (total > 24000) ctx.addIssue({ code: "custom", message: "Conversation is too long." });
  if (value.messages[value.messages.length - 1]?.role !== "user") {
    ctx.addIssue({ code: "custom", message: "The latest message must be from the user." });
  }
});

const timeoutMs = 45_000;

export async function aiChat(req: Request, res: Response): Promise<void> {
  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Send 1–20 valid chat messages, with a maximum of 24,000 characters total." });
    return;
  }

  const apiKey = process.env.AI_API_KEY;
  const baseUrl = (process.env.AI_BASE_URL ?? "https://openrouter.ai/api/v1").replace(/\/+$/, "");
  const model = process.env.AI_MODEL ?? "openrouter/free";
  if (!apiKey) {
    res.status(503).json({
      error: "Monarch AI is not configured yet. Add AI_API_KEY, AI_BASE_URL, and AI_MODEL to the backend environment, then restart it."
    });
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const upstream = await fetch(baseUrl + "/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + apiKey,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.AI_SITE_URL ?? "https://arivyaaprince-lgtm.github.io/Prince/",
        "X-Title": "Monarch"
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: "You are Monarch, a helpful AI assistant and practical software-building partner. Be truthful about capabilities. For code tasks, provide complete, runnable examples when appropriate, explain where files belong, and prioritize safe, maintainable solutions. Never claim you deployed, executed, or tested code unless that actually happened. Do not reveal secrets or request users to paste API keys into chat."
          },
          ...parsed.data.messages
        ],
        temperature: 0.4,
        max_tokens: 1800
      }),
      signal: controller.signal
    });

    if (!upstream.ok) {
      const status = upstream.status;
      // Do not relay upstream response bodies; they can contain provider details.
      console.error("AI provider returned HTTP", status);
      res.status(status === 429 ? 429 : 502).json({
        error: status === 401 || status === 403
          ? "The AI provider rejected the server credentials. Check AI_API_KEY."
          : status === 429
            ? "The AI provider is busy or its free quota is exhausted. Try again later."
            : "The AI provider could not complete this request. Check AI_BASE_URL and AI_MODEL."
      });
      return;
    }

    const payload: unknown = await upstream.json();
    const responseSchema = z.object({
      choices: z.array(z.object({
        message: z.object({ content: z.union([z.string(), z.array(z.unknown())]) })
      })).min(1)
    });
    const result = responseSchema.safeParse(payload);
    if (!result.success) {
      res.status(502).json({ error: "The AI provider returned an unsupported response format." });
      return;
    }
    const raw = result.data.choices[0].message.content;
    const answer = typeof raw === "string"
      ? raw
      : raw.map((part) => typeof part === "object" && part !== null && "text" in part && typeof part.text === "string" ? part.text : "").join("");
    if (!answer.trim()) {
      res.status(502).json({ error: "The AI provider returned an empty response. Please try again." });
      return;
    }
    res.json({ answer: answer.slice(0, 16000), model });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    console.error("AI request failed", timedOut ? "timeout" : error instanceof Error ? error.message : "unknown error");
    res.status(timedOut ? 504 : 502).json({
      error: timedOut ? "The AI took too long to respond. Please try again." : "Could not reach the AI provider. Check backend network access and provider settings."
    });
  } finally {
    clearTimeout(timer);
  }
}

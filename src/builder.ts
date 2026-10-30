import type { Request, Response } from "express";
import { z } from "zod";

const buildSchema = z.object({
  name: z.string().trim().min(1).max(100),
  prompt: z.string().trim().min(20).max(20000)
});

export async function buildApp(req: Request, res: Response): Promise<void> {
  const parsed = buildSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Add an app name and a description between 20 and 20,000 characters." });
    return;
  }

  const apiKey = process.env.AI_API_KEY;
  const baseUrl = (process.env.AI_BASE_URL ?? "https://openrouter.ai/api/v1").replace(/\/+$/, "");
  const model = process.env.AI_MODEL ?? "openrouter/free";
  if (!apiKey) {
    res.status(503).json({ error: "Monarch AI is not configured yet. Add AI_API_KEY in the server's secret settings." });
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 110_000);
  try {
    const upstream = await fetch(baseUrl + "/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + apiKey,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.AI_SITE_URL ?? "https://arivyaaprince-lgtm.github.io/Prince/",
        "X-Title": "Monarch Sonic App Builder"
      },
      body: JSON.stringify({
        model,
        temperature: 0.25,
        max_tokens: 12000,
        messages: [
          {
            role: "system",
            content: "You are Monarch Sonic, a senior full-stack product engineer working inside the Monarch app builder. Turn the user's full specification into a polished, complete, responsive, self-contained single-file HTML application. Read and satisfy the entire specification, not just its first paragraph. Build real working interactions, validation, empty/loading/error states, accessible labels, mobile layouts, and sensible sample data. Use inline CSS and vanilla JavaScript; do not require a build step or external packages. Keep all code in one HTML document. Do not silently omit requested features: when something cannot safely or technically be implemented in this single-file environment, provide a clear in-app explanation and a working safe alternative. Never claim external services, payments, authentication, storage, or APIs are live unless configured; use clearly labelled demo mode for integrations that need credentials. Do not create real-money gambling, cash wagering, betting, or deposit/withdrawal flows; offer a non-cash demo alternative for such requests. Do not create credential theft, malware, covert tracking, or deceptive payment pages. Return ONLY a complete HTML document beginning with <!doctype html> and ending with </html>, with no Markdown fences."
          },
          {
            role: "user",
            content: "Application name: " + parsed.data.name + "\n\nFULL PRODUCT SPECIFICATION (follow all requirements):\n" + parsed.data.prompt
          }
        ]
      }),
      signal: controller.signal
    });

    if (!upstream.ok) {
      const status = upstream.status;
      console.error("Monarch builder provider returned HTTP", status);
      res.status(status === 429 ? 429 : 502).json({
        error: status === 429
          ? "The AI provider is busy or its quota is exhausted. Wait a moment and try again."
          : "The AI builder could not complete the request. Check the server's AI model and provider settings."
      });
      return;
    }

    const payload: unknown = await upstream.json();
    const responseSchema = z.object({
      choices: z.array(z.object({
        finish_reason: z.string().nullable().optional(),
        message: z.object({ content: z.union([z.string(), z.array(z.unknown())]) })
      })).min(1)
    });
    const result = responseSchema.safeParse(payload);
    if (!result.success) {
      res.status(502).json({ error: "The AI provider returned an unsupported response format." });
      return;
    }

    const choice = result.data.choices[0];
    const raw = choice.message.content;
    const answer = (typeof raw === "string" ? raw : raw.map((part) =>
      typeof part === "object" && part !== null && "text" in part && typeof part.text === "string" ? part.text : ""
    ).join("")).trim().replace(/^\x60{3}(?:html)?\s*/i, "").replace(/\s*\x60{3}$/, "");

    if (choice.finish_reason === "length" || !/^<!doctype html[\s>]/i.test(answer) || !/<\/html>\s*$/i.test(answer)) {
      res.status(502).json({ error: "The app draft was incomplete. Try again or split the specification into smaller sections; your original description is preserved." });
      return;
    }
    if (answer.length > 80000) {
      res.status(502).json({ error: "The generated app exceeded the safe size limit. Ask Monarch to simplify the implementation." });
      return;
    }
    res.json({ html: answer, model, characters: answer.length, complete: true });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
    console.error("Monarch builder request failed", timedOut ? "timeout" : error instanceof Error ? error.message : "unknown error");
    res.status(timedOut ? 504 : 502).json({
      error: timedOut ? "This build took too long. Your description is preserved; try again or split it into smaller sections." : "Could not reach the AI provider. Check server network access and AI configuration."
    });
  } finally {
    clearTimeout(timer);
  }
}

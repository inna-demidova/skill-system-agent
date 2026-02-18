import "dotenv/config";
import express from "express";
import cors from "cors";
import { randomUUID } from "crypto";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { parseCV } from "./.claude/skills/parse-cv/scripts/parse-cv";
import { skillsRouter } from "./src/skills-api";

process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
});
process.on("unhandledRejection", (err) => {
  console.error("Unhandled rejection:", err);
});

const app = express();
const PORT = parseInt(process.env.PORT || "3000", 10);
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";

app.use(express.json());
app.use(
  cors({
    origin: ALLOWED_ORIGIN,
    methods: ["GET", "POST"],
  })
);

const agentOptions = {
  allowedTools: ["Skill", "Bash", "Read"],
  settingSources: ["project" as const],
  cwd: process.cwd(),
  permissionMode: "bypassPermissions" as const,
  allowDangerouslySkipPermissions: true,
  includePartialMessages: true,
};

app.use(skillsRouter);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/debug", (_req, res) => {
  const { execSync } = require("child_process");
  const info: Record<string, unknown> = {
    cwd: process.cwd(),
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
    hasSupabaseUrl: !!process.env.SUPABASE_URL,
    envKeys: Object.keys(process.env).filter(k => !k.includes("KEY") && !k.includes("SECRET")),
  };
  try {
    info.sdkBinaryPath = execSync("ls -la node_modules/@anthropic-ai/claude-agent-sdk/vendor/ 2>&1 || echo 'no vendor dir'").toString();
  } catch (e) {
    info.sdkBinaryError = String(e);
  }
  res.json(info);
});

app.post("/api/chat", async (req, res) => {
  const { message, sessionId: clientSessionId } = req.body;

  if (!message || typeof message !== "string" || !message.trim()) {
    res.status(400).json({ error: "message is required" });
    return;
  }

  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const sessionId = clientSessionId || randomUUID();

  // Send sessionId as the first event so client can store it
  res.write(`event: session\ndata: ${JSON.stringify({ sessionId })}\n\n`);

  try {
    const queryOptions = {
      ...agentOptions,
      sessionId,
      ...(clientSessionId ? { resume: clientSessionId } : {}),
      stderr: (data: string) => console.error("[claude-cli stderr]", data),
      debug: true,
    };

    console.log("[chat] Starting query:", { message: message.trim().slice(0, 50), sessionId });

    let messageCount = 0;
    for await (const msg of query({ prompt: message.trim(), options: queryOptions })) {
      messageCount++;
      console.log("[chat] Message received:", { type: msg.type, subtype: "subtype" in msg ? msg.subtype : undefined });

      switch (msg.type) {
        case "stream_event": {
          // Partial streaming — extract text deltas
          const event = msg.event as { type: string; delta?: { type: string; text?: string } };
          if (event.type === "content_block_delta" && event.delta?.type === "text_delta" && event.delta.text) {
            res.write(`event: message\ndata: ${JSON.stringify({ text: event.delta.text })}\n\n`);
          }
          break;
        }

        case "result": {
          if (msg.subtype === "success") {
            res.write(`event: result\ndata: ${JSON.stringify({ text: msg.result, sessionId: msg.session_id })}\n\n`);
          } else {
            console.error("[chat] Result error:", msg);
            const errors = "errors" in msg ? msg.errors : [];
            res.write(`event: error\ndata: ${JSON.stringify({ error: msg.subtype, details: errors })}\n\n`);
          }
          break;
        }
      }
    }

    console.log("[chat] Query finished. Total messages:", messageCount);
  } catch (err) {
    console.error("[chat] Exception:", err);
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    res.write(`event: error\ndata: ${JSON.stringify({ error: errorMessage })}\n\n`);
  }

  res.write("event: done\ndata: {}\n\n");
  res.end();
});

// Direct action endpoint — no Agent SDK, just function calls
app.post("/api/action", async (req, res) => {
  const { action, payload } = req.body;

  if (!action || typeof action !== "string") {
    res.status(400).json({ error: "action is required" });
    return;
  }

  try {
    switch (action) {
      case "parse-cv": {
        const cvText = payload?.cvText;
        if (!cvText || typeof cvText !== "string") {
          res.status(400).json({ error: "payload.cvText is required" });
          return;
        }
        const result = await parseCV(cvText);
        res.json({ success: true, data: result });
        break;
      }
      default:
        res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (err) {
    console.error(`[action:${action}] Error:`, err);
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Agent server running on 0.0.0.0:${PORT}`);
});

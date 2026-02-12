import "dotenv/config";
import express from "express";
import cors from "cors";
import { randomUUID } from "crypto";
import { query } from "@anthropic-ai/claude-agent-sdk";

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

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
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
  const abortController = new AbortController();

  // Send sessionId as the first event so client can store it
  res.write(`event: session\ndata: ${JSON.stringify({ sessionId })}\n\n`);

  // Abort the query if the client disconnects
  req.on("close", () => {
    abortController.abort();
  });

  try {
    const queryOptions = {
      ...agentOptions,
      sessionId,
      ...(clientSessionId ? { resume: clientSessionId } : {}),
      abortController,
    };

    console.log("[chat] Starting query:", { message: message.trim().slice(0, 50), sessionId });

    let messageCount = 0;
    for await (const msg of query({ prompt: message.trim(), options: queryOptions })) {
      messageCount++;
      console.log("[chat] Message received:", { type: msg.type, subtype: "subtype" in msg ? msg.subtype : undefined });

      if (abortController.signal.aborted) break;

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
    if (!abortController.signal.aborted) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      res.write(`event: error\ndata: ${JSON.stringify({ error: errorMessage })}\n\n`);
    }
  }

  res.write("event: done\ndata: {}\n\n");
  res.end();
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Agent server running on 0.0.0.0:${PORT}`);
});

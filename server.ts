import express from "express";

const app = express();
const PORT = parseInt(process.env.PORT || "3000", 10);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", port: PORT });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Agent server running on 0.0.0.0:${PORT}`);
});

import express, { type Express, type Request, type Response } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Proxy /api/auth/* → game server /auth/* ──────────────────────────────────
// The Replit proxy routes all /api/* to this server. Auth lives on the game
// server (port 3000) under /auth. We forward here so both /api/auth/* (old
// cached pages) and /auth/* (new pages) always work.
const GAME_SERVER = `http://localhost:${process.env.GAME_PORT || 3000}`;

app.all(/^\/api\/auth(\/.*)?$/, async (req: Request, res: Response) => {
  const suffix = (req.params as Record<string, string>)[0] || "";
  const qs = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  const url = `${GAME_SERVER}/auth${suffix}${qs}`;

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (req.headers.authorization) {
      headers["Authorization"] = req.headers.authorization;
    }

    const init: RequestInit = { method: req.method, headers };
    if (req.method !== "GET" && req.method !== "HEAD" && req.body && Object.keys(req.body).length > 0) {
      init.body = JSON.stringify(req.body);
    }

    const upstream = await fetch(url, init);
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (e) {
    res.status(502).json({ error: "Auth service unavailable" });
  }
});

app.use("/api", router);

export default app;

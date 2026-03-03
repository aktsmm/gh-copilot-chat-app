/**
 * REST API routes — lightweight endpoints for non-streaming operations.
 */

import { Router } from "express";
import path from "node:path";
import { getClient } from "../copilot/client-manager.js";
import { cleanupSessionBindings } from "../socket/handlers.js";
import {
  listSessions,
  deleteSession,
  updateSessionTitle,
} from "../copilot/session-manager.js";

const router = Router();

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }
  return fallback;
}

// Health check
router.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: Date.now() });
});

// List sessions
router.get("/sessions", (_req, res) => {
  res.json(listSessions());
});

// Delete session
router.delete("/sessions/:id", async (req, res) => {
  const sessionId = req.params.id?.trim();
  if (!sessionId) {
    res.status(400).json({ ok: false, error: "Invalid sessionId" });
    return;
  }

  try {
    const client = await getClient();
    const ok = await deleteSession(client, sessionId);
    if (ok) {
      cleanupSessionBindings(sessionId);
    }
    res.json({ ok });
  } catch (err: unknown) {
    res.status(500).json({
      ok: false,
      error: getErrorMessage(err, "Failed to delete session"),
    });
  }
});

// Rename session
router.patch("/sessions/:id", (req, res) => {
  const sessionId = req.params.id?.trim();
  const title =
    typeof req.body?.title === "string" ? req.body.title.trim() : "";
  if (!sessionId || !title) {
    res.status(400).json({ ok: false, error: "Invalid sessionId or title" });
    return;
  }

  try {
    const ok = updateSessionTitle(sessionId, title);
    res.json({ ok });
  } catch (err: unknown) {
    res.status(500).json({
      ok: false,
      error: getErrorMessage(err, "Failed to rename session"),
    });
  }
});

// List models
router.get("/models", async (_req, res) => {
  try {
    const client = await getClient();
    const models = await client.listModels();
    res.json(models ?? []);
  } catch (err: unknown) {
    res
      .status(500)
      .json({ error: getErrorMessage(err, "Failed to list models") });
  }
});

// Auth status
router.get("/auth", async (_req, res) => {
  try {
    const client = await getClient();
    const auth = await client.getAuthStatus();
    res.json(auth);
  } catch (err: unknown) {
    res.status(503).json({
      isAuthenticated: false,
      statusMessage: getErrorMessage(err, "Failed to fetch auth status"),
    });
  }
});

// Server status
router.get("/status", async (_req, res) => {
  try {
    const client = await getClient();
    const state = client.getState();
    res.json({ state, sessions: listSessions().length });
  } catch (err: unknown) {
    res.status(503).json({
      state: "disconnected",
      sessions: 0,
      error: getErrorMessage(err, "Failed to fetch server status"),
    });
  }
});

// Workspace info
router.get("/workspace", (_req, res) => {
  const workspace = process.cwd();
  res.json({
    workspace,
    outputDir: path.join(workspace, "reports"),
  });
});

export { router as apiRouter };

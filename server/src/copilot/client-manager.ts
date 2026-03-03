/**
 * CopilotClientManager — Singleton that manages the CopilotClient lifecycle.
 *
 * Responsibilities:
 *  - Start / stop the Copilot CLI process
 *  - Create & resume sessions
 *  - List available models
 */

import {
  CopilotClient,
  type CopilotClientOptions,
  type SessionConfig,
} from "@github/copilot-sdk";
import { config } from "../config.js";

/** Provider config type extracted from SessionConfig */
type ProviderConfig = NonNullable<SessionConfig["provider"]>;

let clientInstance: CopilotClient | null = null;

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

/** Build a provider config for BYOK if env is set. */
export function buildProviderConfig(): ProviderConfig | undefined {
  if (!config.byok.provider || !config.byok.baseUrl) return undefined;
  return {
    type: config.byok.provider as "openai" | "azure" | "anthropic",
    baseUrl: config.byok.baseUrl,
    apiKey: config.byok.apiKey,
  };
}

export async function getClient(): Promise<CopilotClient> {
  if (clientInstance) {
    const state = clientInstance.getState();
    if (state === "connected") {
      return clientInstance;
    }

    try {
      const staleClient = clientInstance;
      clientInstance = null;
      const errors = await staleClient.stop();
      if (errors.length > 0) {
        console.warn("[copilot] Cleanup errors while reinitializing:", errors);
      }
    } catch {
      clientInstance = null;
    }
  }

  const opts: CopilotClientOptions = {
    autoStart: true,
    autoRestart: true,
  };

  if (config.copilot.cliPath) opts.cliPath = config.copilot.cliPath;
  if (config.copilot.logLevel) {
    opts.logLevel = config.copilot.logLevel as CopilotClientOptions["logLevel"];
  }
  if (config.github.token) opts.githubToken = config.github.token;

  const nextClient = new CopilotClient(opts);
  try {
    await nextClient.start();
    clientInstance = nextClient;
    console.log("[copilot] Client started — state:", clientInstance.getState());
    return clientInstance;
  } catch (error: unknown) {
    const errors = await nextClient.stop();
    if (errors.length > 0) {
      console.warn("[copilot] Cleanup errors after failed start:", errors);
    }
    const base = getErrorMessage(error, "Failed to start Copilot client");
    const cliHint = opts.cliPath ? ` (cliPath: ${opts.cliPath})` : "";
    if (error instanceof Error) {
      throw new Error(`${base}${cliHint}`, { cause: error });
    }
    throw new Error(`${base}${cliHint}`);
  }
}

export async function stopClient(): Promise<void> {
  if (!clientInstance) return;
  const errors = await clientInstance.stop();
  if (errors.length > 0) {
    console.warn("[copilot] Cleanup errors:", errors);
  }
  clientInstance = null;
  console.log("[copilot] Client stopped");
}

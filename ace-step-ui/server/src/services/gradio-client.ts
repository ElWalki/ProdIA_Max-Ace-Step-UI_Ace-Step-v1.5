import { Client } from "@gradio/client";
import { config } from '../config/index.js';

let clientInstance: Client | null = null;
let connectionPromise: Promise<Client> | null = null;
let lastConnectTime = 0;

// Max age for a cached client before we verify it's still alive (5 minutes)
const CLIENT_MAX_AGE_MS = 5 * 60 * 1000;

/**
 * Get a lazy-initialized Gradio client connected to the ACE-Step Gradio app.
 * Caches the connection for reuse across requests.
 * Auto-validates stale connections and reconnects if needed.
 */
export async function getGradioClient(): Promise<Client> {
  // If we have a cached client, check if it's potentially stale
  if (clientInstance) {
    const age = Date.now() - lastConnectTime;
    if (age > CLIENT_MAX_AGE_MS) {
      // Validate the connection is still alive
      const alive = await isGradioAvailable();
      if (!alive) {
        console.warn('[Gradio] Cached client appears stale, reconnecting...');
        clientInstance = null;
      }
    }
    if (clientInstance) return clientInstance;
  }

  if (connectionPromise) return connectionPromise;

  connectionPromise = (async () => {
    try {
      const client = await Client.connect(config.acestep.apiUrl, {
        events: ["data", "status"],
      });
      clientInstance = client;
      lastConnectTime = Date.now();
      console.log(`[Gradio] Connected to ${config.acestep.apiUrl}`);
      return client;
    } catch (error) {
      console.error(`[Gradio] Failed to connect to ${config.acestep.apiUrl}:`, error);
      throw error;
    } finally {
      connectionPromise = null;
    }
  })();

  return connectionPromise;
}

/**
 * Reset the cached Gradio client, forcing a new connection on next use.
 */
export function resetGradioClient(): void {
  clientInstance = null;
  connectionPromise = null;
  lastConnectTime = 0;
}

/**
 * Check if the Gradio app is reachable.
 */
export async function isGradioAvailable(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(`${config.acestep.apiUrl}/gradio_api/info`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
}

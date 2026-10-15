import { useState, useEffect, useRef, useCallback } from "react";

// ─── Configuration ────────────────────────────────────────────────────────────
// For Android emulator use: ws://10.0.2.2:3000
// For iOS simulator   use: ws://localhost:3000
// For physical device use: ws://<your-machine-local-ip>:3000
const WS_URL = "ws://10.0.2.2:3000";

const RECONNECT_INTERVAL_MS = 3000;

/**
 * useWebSocket
 * Connects to the backend WebSocket, receives lead events, and returns
 * the current leads list plus a connection status string.
 */
export default function useWebSocket() {
  const [leads, setLeads] = useState([]);
  const [status, setStatus] = useState("connecting"); // "connecting" | "connected" | "disconnected"
  const wsRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const mountedRef = useRef(true);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    console.log(`[WS] Connecting to ${WS_URL}…`);
    setStatus("connecting");

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) return;
      console.log("[WS] ✅ Connected");
      setStatus("connected");
      // Clear any pending reconnect timer
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };

    ws.onmessage = (event) => {
      if (!mountedRef.current) return;
      try {
        const message = JSON.parse(event.data);

        if (message.type === "init") {
          // Server sends all existing leads on connection
          console.log(`[WS] Init with ${message.data.length} leads`);
          setLeads(message.data);
        } else if (message.type === "new_lead") {
          // A new lead arrived – prepend it so it appears at top
          console.log("[WS] 🆕 New lead received:", message.data?.id);
          setLeads((prev) => [message.data, ...prev]);
        }
      } catch (err) {
        console.error("[WS] Failed to parse message:", err.message);
      }
    };

    ws.onclose = (event) => {
      if (!mountedRef.current) return;
      console.log(`[WS] ❌ Disconnected (code: ${event.code})`);
      setStatus("disconnected");
      // Auto-reconnect
      reconnectTimerRef.current = setTimeout(() => {
        if (mountedRef.current) connect();
      }, RECONNECT_INTERVAL_MS);
    };

    ws.onerror = (err) => {
      console.error("[WS] Error:", err.message);
    };
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  return { leads, status };
}

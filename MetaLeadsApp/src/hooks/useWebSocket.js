import { useState, useEffect, useRef, useCallback } from "react";
import { Platform } from "react-native";

// ─── Configuration ────────────────────────────────────────────────────────────
// Set EXPO_PUBLIC_WS_URL before starting Expo when using a physical phone or a
// hosted backend. Example: EXPO_PUBLIC_WS_URL=ws://192.168.1.20:3000.
// This LAN address preserves the existing device-demo setup; replace it only if
// the computer's address changes. Android emulators can instead use 10.0.2.2.
const LOCAL_IP = "192.168.1.6";
const defaultUrl =
  Platform.OS === "android"
    ? `ws://${LOCAL_IP}:3000`
    : Platform.OS === "ios"
    ? "ws://localhost:3000"
    : `ws://${LOCAL_IP}:3000`;
const WS_URL = process.env.EXPO_PUBLIC_WS_URL || defaultUrl;
const API_BASE_URL = WS_URL.replace(/^wss:/, "https:").replace(/^ws:/, "http:");

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
  const connectRef = useRef(null);

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
          setLeads((prev) => {
            if (prev.some((lead) => lead.id === message.data?.id)) {
              return prev;
            }
            return [message.data, ...prev];
          });
        } else if (message.type === "leads_cleared") {
          console.log("[WS] Demo leads cleared");
          setLeads([]);
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
        if (mountedRef.current) connectRef.current?.();
      }, RECONNECT_INTERVAL_MS);
    };

    ws.onerror = () => {
      // React Native's WebSocket error event usually has no message. The close
      // handler below updates the status and reconnects, so avoid triggering a
      // noisy LogBox error with an unhelpful "undefined" value.
      console.log("[WS] Connection issue; reconnecting…");
    };
  }, []);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

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

  const clearLeads = useCallback(async () => {
    const response = await fetch(`${API_BASE_URL}/leads`, { method: "DELETE" });
    if (!response.ok) {
      throw new Error("Could not clear demo leads");
    }
    setLeads([]);
  }, []);

  return { leads, status, clearLeads };
}

"use client";

// Asset + WebSocket test harness for backend/assets/
// --------------------------------------------------
// This page is a dedicated diagnostic surface for two things:
// 1. Verifying that file uploads reach the DRF endpoint served via Nginx.
// 2. Verifying that the Django Channels WebSocket endpoint remains reachable through the proxy.
// Each section below is heavily commented so that new team members can follow the flow and
// know exactly where to look when something fails.

import {JSX, useEffect, useMemo, useRef, useState } from "react";
import axios from "@/lib/axiosConfig";
import type { AxiosError } from "axios";
import { appendAuthHeaders } from "@/lib/authHelpers";

type UploadState = "idle" | "uploading" | "success" | "error";
type WebSocketState = "idle" | "connecting" | "open" | "closed" | "error";

type LogEntry = {
  timestamp: string;
  message: string;
};

const formatTimestamp = () => new Date().toLocaleTimeString();

export default function AssetTestPage(){
  // === Upload form state ===
  const [workspaceId, setWorkspaceId] = useState<string>("");
  const [token, setToken] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);

  // === Upload feedback state ===
  const [uploadStatus, setUploadStatus] = useState<UploadState>("idle");
  const [uploadMessage, setUploadMessage] = useState<string>("Waiting for input.");
  const [lastPendingId, setLastPendingId] = useState<string>("");

  // === WebSocket state ===
  const [wsStatus, setWsStatus] = useState<WebSocketState>("idle");
  const [wsLogs, setWsLogs] = useState<LogEntry[]>([]);
  const [wsPendingIdInput, setWsPendingIdInput] = useState<string>("");
  const [wsManualMessage, setWsManualMessage] = useState<string>("");
  const socketRef = useRef<WebSocket | null>(null);

  // === Compute base URLs from environment ===
  const apiBaseUrl = useMemo(() => {
    const fromEnv =
      process.env.NEXT_PUBLIC_ASSETS_API_URL || process.env.NEXT_PUBLIC_API_URL || "";
    if (fromEnv) {
      return fromEnv.replace(/\/+$/, "");
    }
    if (typeof window !== "undefined") {
      return window.location.origin.replace(/\/+$/, "");
    }
    return "";
  }, []);

  console.log("Assets API URL:", process.env.NEXT_PUBLIC_ASSETS_API_URL);
  console.log("Assets API URL (resolved):", apiBaseUrl);

  const wsBaseUrl = useMemo(() => {
    const fromEnv =
      process.env.NEXT_PUBLIC_ASSETS_WS_URL || process.env.NEXT_PUBLIC_WS_URL || "";
    if (fromEnv) {
      return fromEnv.replace(/\/+$/, "");
    }
    if (typeof window !== "undefined") {
      const origin = window.location.origin;
      return origin.replace(/^http/i, "ws").replace(/\/+$/, "");
    }
    return "";
  }, []);

  const appendWsLog = (message: string) => {
    setWsLogs((prev) => [...prev, { timestamp: formatTimestamp(), message }]);
  };

  // === Upload handler ===
  const handleUpload = async () => {
    // Basic validation before hitting the network.
    if (!file) {
      setUploadStatus("error");
      setUploadMessage("Select a file before uploading.");
      return;
    }
    if (!workspaceId.trim()) {
      setUploadStatus("error");
      setUploadMessage("Workspace ID is required.");
      return;
    }
    if (!token.trim()) {
      setUploadStatus("error");
      setUploadMessage("Token is required. Generate one with drf_create_token.");
      return;
    }

    const formData = new FormData();
    // DRF PendingAssetSerializer expects the file field to be named tmp_file.
    formData.append("tmp_file", file);
    // Backend expects workspace to match an existing workspace UUID the token owner can access.
    formData.append("workspace", workspaceId.trim());

    setUploadStatus("uploading");
    setUploadMessage("Uploading... check the browser network tab if this hangs.");

    try {
      const response = await axios.post(`${apiBaseUrl}/api/assets/`, formData, {
        headers: appendAuthHeaders(
          {
            // TokenAuthentication requires the exact prefix "Token ".
            Authorization: `Token ${token.trim()}`,
            Accept: "application/json",
          },
          { includeCsrf: true }
        ),
        timeout: 60000, // Generous timeout to account for large uploads or slow virus scanning.
        withCredentials: false, // Flip to true if testing cookie-based auth.
      });

      const pendingId = String(response.data?.pending_id ?? "");
      setUploadStatus("success");
      setUploadMessage(
        `Upload accepted (HTTP ${response.status}). Pending ID: ${pendingId || "not returned"}.`
      );

      if (pendingId) {
        setLastPendingId(pendingId);
        setWsPendingIdInput(pendingId);
        appendWsLog(`New pending asset ID ${pendingId} captured from upload response.`);
      }

      console.info("[AssetTest] Upload response", {
        status: response.status,
        headers: response.headers,
        data: response.data,
      });
    } catch (error) {
      setUploadStatus("error");

      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;

        if (axiosError.response) {
          const serverData = axiosError.response.data;
          let detail = "";

          if (serverData && typeof serverData === "object") {
            // Format to display all errors
            detail = JSON.stringify(serverData, null, 2);
          }

          setUploadMessage(
            `Upload failed: HTTP ${axiosError.response.status}.\nDetails: ${detail}`
          );

          console.error("[AssetTest] Upload HTTP error", {
            status: axiosError.response.status,
            headers: axiosError.response.headers,
            data: serverData,
          });
        } else if (axiosError.request) {
          // Request was sent but no response arrived.
          setUploadMessage(
            "Upload failed: request made but no response received. Possible CORS or proxy timeout."
          );
          console.error(
            "[AssetTest] Upload network issue — request sent, no response",
            axiosError.request,
            "Hints: look for CORS preflight failures or 502/504 responses in the network tab."
          );
        } else {
          // Something prevented Axios from sending the request.
          setUploadMessage(`Upload failed: ${axiosError.message}`);
          console.error(
            "[AssetTest] Upload configuration error",
            axiosError,
            "Hints: double-check environment variables and axios options."
          );
        }
      } else {
        setUploadMessage("Upload failed: unexpected error. Check console for details.");
        console.error("[AssetTest] Unknown upload error", error);
      }
    }
  };

  // === WebSocket helpers ===
  const connectWebSocket = (pendingId: string) => {
    const trimmed = pendingId.trim();
    if (!trimmed) {
      setWsStatus("error");
      appendWsLog("Cannot open WebSocket: pending ID is missing.");
      return;
    }

    // Close any existing connection before creating a new one.
    if (socketRef.current) {
      socketRef.current.close(1000, "Reconnecting");
      socketRef.current = null;
    }

    const socketUrl = `${wsBaseUrl}/ws/scan/${trimmed}/`;
    appendWsLog(`Attempting WebSocket connection to ${socketUrl}`);

    try {
      const socket = new WebSocket(socketUrl);
      socketRef.current = socket;
      setWsStatus("connecting");

      socket.onopen = () => {
        setWsStatus("open");
        appendWsLog("WebSocket connected. Awaiting scan updates from backend/assets.");
      };

      socket.onmessage = (event) => {
        appendWsLog(`Message received: ${event.data}`);

        try {
          const parsed = JSON.parse(event.data);
          console.info("[AssetTest] Parsed WS message", parsed);
        } catch (parseError) {
          console.error(
            "[AssetTest] Failed to parse WebSocket message as JSON",
            parseError,
            event.data,
            "Hints: backend/assets/comsumers.py sends JSON strings; ensure upstream proxy is not truncating."
          );
        }
      };

      socket.onerror = (event) => {
        setWsStatus("error");
        appendWsLog("WebSocket error event fired. Inspect console for details.");
        console.error(
          "[AssetTest] WebSocket error",
          event,
          "Hints: confirm Nginx passes Upgrade headers and redis/channels are running."
        );
      };

      socket.onclose = (event) => {
        setWsStatus("closed");
        appendWsLog(`WebSocket closed (code ${event.code}). Reason: ${event.reason || "n/a"}.`);
        socketRef.current = null;
      };
    } catch (connectionError) {
      setWsStatus("error");
      appendWsLog("Failed to construct WebSocket. See console for diagnostic info.");
      console.error(
        "[AssetTest] Exception while creating WebSocket",
        connectionError,
        "Hints: browsers block ws:// when the page is served over https without wss://."
      );
    }
  };

  const disconnectWebSocket = () => {
    if (socketRef.current) {
      socketRef.current.close(1000, "Manual disconnect");
      socketRef.current = null;
      setWsStatus("closed");
      appendWsLog("WebSocket closed by user.");
    } else {
      appendWsLog("No active WebSocket connection to close.");
    }
  };

  const sendManualMessage = () => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      appendWsLog("Cannot send message: WebSocket is not open.");
      return;
    }

    if (!wsManualMessage.trim()) {
      appendWsLog("Enter a message before sending over WebSocket.");
      return;
    }

    socketRef.current.send(wsManualMessage);
    appendWsLog(`Manual message sent: ${wsManualMessage}`);
    console.info("[AssetTest] Manual WebSocket message dispatched", wsManualMessage);
    setWsManualMessage("");
  };

  // Clean up the WebSocket connection if the user leaves the page.
  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.close(1000, "Component unmounted");
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold">Asset Upload &amp; WebSocket Tester</h1>
          <p className="text-sm text-slate-600">
            Use this page to debug API uploads and WebSocket connections that flow through your Nginx
            reverse proxy. Keep the browser console open: every request/response is logged with hints.
          </p>
        </header>

        {/* Environment summary so it is obvious which hosts are being targeted */}
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-lg font-medium">Environment</h2>
          <div className="mt-2 space-y-1 text-sm">
            <p>
              <span className="font-semibold">API base URL:</span> {apiBaseUrl}
            </p>
            <p>
              <span className="font-semibold">WebSocket base URL:</span> {wsBaseUrl}
            </p>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Adjust <code>NEXT_PUBLIC_ASSETS_API_URL</code> / <code>NEXT_PUBLIC_ASSETS_WS_URL</code> (or
            their generic counterparts) if these values look wrong.
          </p>
        </section>

        {/* Upload controls */}
        <section className="rounded-lg border border-slate-200 bg-white p-4 space-y-4">
          <h2 className="text-lg font-medium">1. Upload Asset</h2>
          <p className="text-sm text-slate-600">
            Sends <code>POST {apiBaseUrl}/api/assets/</code> with <code>workspace</code> and
            <code>tmp_file</code>. Successful uploads return a pending asset ID that can be monitored via
            WebSocket.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="font-semibold">Workspace ID (UUID)</span>
              <input
                value={workspaceId}
                onChange={(event) => setWorkspaceId(event.target.value)}
                placeholder="d50a8b1b-d0ae-4bbc-8d26-7c00fb95e2da"
                className="w-full rounded border border-slate-300 px-3 py-2 text-xs font-mono focus:outline-none focus:ring focus:ring-blue-200"
              />
            </label>

            <label className="space-y-1 text-sm">
              <span className="font-semibold">DRF Token</span>
              <input
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="Token generated via drf_create_token"
                className="w-full rounded border border-slate-300 px-3 py-2 text-xs focus:outline-none focus:ring focus:ring-blue-200"
              />
            </label>
          </div>

          <label className="block space-y-1 text-sm">
            <span className="font-semibold">Select asset file</span>
            <input
              type="file"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className="w-full rounded border border-slate-300 px-3 py-2 focus:outline-none focus:ring focus:ring-blue-200"
            />
            <span className="text-xs text-slate-500">
              Allowed formats per backend/assets/serializers.py: png, jpg, jpeg, webp, mp4, mov.
            </span>
          </label>

          <button
            type="button"
            onClick={handleUpload}
            disabled={uploadStatus === "uploading"}
            className="w-full rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring focus:ring-blue-200 disabled:bg-slate-400"
          >
            {uploadStatus === "uploading" ? "Uploading..." : "Upload File"}
          </button>

          <div className="rounded border border-dashed border-slate-300 p-3 text-sm">
            <p className="font-semibold">Status: {uploadStatus}</p>
            <p className="mt-1 whitespace-pre-wrap">{uploadMessage}</p>
            {lastPendingId && (
              <p className="mt-2 text-xs text-slate-500">
                Most recent pending ID: <code>{lastPendingId}</code>
              </p>
            )}
          </div>
        </section>

        {/* WebSocket controls */}
        <section className="rounded-lg border border-slate-200 bg-white p-4 space-y-4">
          <h2 className="text-lg font-medium">2. Monitor Scan WebSocket</h2>
          <p className="text-sm text-slate-600">
            Opens <code>{wsBaseUrl}/ws/scan/&lt;pending_id&gt;/</code>. If the socket never reaches
            "open", confirm that Nginx forwards Upgrade headers and that Redis/Channels are healthy.
          </p>

          <label className="block space-y-1 text-sm">
            <span className="font-semibold">Pending asset ID</span>
            <input
              value={wsPendingIdInput}
              onChange={(event) => setWsPendingIdInput(event.target.value)}
              placeholder="Paste the numeric ID returned from the upload"
              className="w-full rounded border border-slate-300 px-3 py-2 text-xs focus:outline-none focus:ring focus:ring-emerald-200"
            />
            <span className="text-xs text-slate-500">
              If the backend cannot find the pending ID, it may close the socket immediately without
              sending data.
            </span>
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => connectWebSocket(wsPendingIdInput || lastPendingId)}
              className="rounded bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 focus:outline-none focus:ring focus:ring-emerald-200"
            >
              Connect
            </button>
            <button
              type="button"
              onClick={disconnectWebSocket}
              className="rounded bg-slate-500 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-600 focus:outline-none focus:ring focus:ring-slate-200"
            >
              Disconnect
            </button>
          </div>

          <div className="space-y-2">
            <label className="block space-y-1 text-sm">
              <span className="font-semibold">Send manual WebSocket message</span>
              <input
                value={wsManualMessage}
                onChange={(event) => setWsManualMessage(event.target.value)}
                placeholder="Optional: send a test message (server may ignore it)"
                className="w-full rounded border border-slate-300 px-3 py-2 text-xs focus:outline-none focus:ring focus:ring-emerald-200"
              />
            </label>
            <button
              type="button"
              onClick={sendManualMessage}
              className="rounded bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700 focus:outline-none focus:ring focus:ring-purple-200"
            >
              Send Message
            </button>
          </div>

          <div className="rounded border border-dashed border-slate-300 p-3 text-sm">
            <p className="font-semibold">WebSocket status: {wsStatus}</p>
            <ul className="mt-2 space-y-1 text-xs font-mono text-slate-600">
              {wsLogs.length === 0 ? (
                <li>No WebSocket activity yet.</li>
              ) : (
                wsLogs.map((log, index) => (
                  <li key={`${log.timestamp}-${index}`}>
                    [{log.timestamp}] {log.message}
                  </li>
                ))
              )}
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}








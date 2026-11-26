import { useEffect, useRef, useState } from 'react';
import type { DashboardSnapshot } from '../types';

export interface RealtimeAlert {
  severity: 'info' | 'warning' | 'danger';
  message: string;
}

export function useDashboardRealtime(
  token: string | null,
  onSnapshot: (snapshot: DashboardSnapshot) => void,
  onAlert?: (alert: RealtimeAlert) => void
) {
  const [connected, setConnected] = useState(false);
  const onSnapshotRef = useRef(onSnapshot);
  const onAlertRef = useRef(onAlert);

  useEffect(() => {
    onSnapshotRef.current = onSnapshot;
    onAlertRef.current = onAlert;
  }, [onSnapshot, onAlert]);

  useEffect(() => {
    if (!token) {
      setConnected(false);
      return;
    }

    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let closedByUser = false;

    const connect = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${protocol}//${window.location.host}/ws`;
      ws = new WebSocket(url);

      ws.onopen = () => {
        ws?.send(JSON.stringify({ type: 'auth', token }));
        setConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(String(event.data)) as {
            type?: string;
            snapshot?: DashboardSnapshot;
            alert?: RealtimeAlert | null;
          };
          if ((msg.type === 'dashboard:init' || msg.type === 'dashboard:update') && msg.snapshot) {
            onSnapshotRef.current(msg.snapshot);
            if (msg.alert && onAlertRef.current) {
              onAlertRef.current(msg.alert);
            }
          }
        } catch {
          // Ignore invalid payloads
        }
      };

      ws.onclose = () => {
        setConnected(false);
        if (!closedByUser) {
          reconnectTimer = setTimeout(connect, 2500);
        }
      };

      ws.onerror = () => {
        ws?.close();
      };
    };

    connect();

    return () => {
      closedByUser = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [token]);

  return { connected };
}

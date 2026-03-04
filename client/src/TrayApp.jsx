import { useState, useEffect, useCallback } from 'react';

const RISK_WARN = 5.0;
const RISK_BLOCK = 7.0;

const ACTION_ICONS = {
  exec: '⚡',
  write: '📝',
  read: '📖',
  fetch: '🌐',
  web_fetch: '🌐',
  chat: '💬',
  delete: '🗑️',
  default: '•',
};

function riskColor(score) {
  if (score >= RISK_BLOCK) return 'bg-red-500';
  if (score >= RISK_WARN) return 'bg-yellow-400';
  return 'bg-green-500';
}

function riskLabel(score, blocked) {
  if (blocked) return 'BLOCK';
  if (score >= RISK_WARN) return 'WARN';
  return 'SAFE';
}

function formatTimeAgo(timestamp) {
  if (!timestamp) return '';
  const seconds = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h`;
}

function useTrayData() {
  const [status, setStatus] = useState(null);
  const [events, setEvents] = useState([]);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const [statusRes, eventsRes] = await Promise.all([
        fetch('/api/status'),
        fetch('/api/events/history?limit=5'),
      ]);

      if (statusRes.ok) {
        const s = await statusRes.json();
        setStatus(s);
      }

      if (eventsRes.ok) {
        const data = await eventsRes.json();
        setEvents(Array.isArray(data) ? data : (data.events || []));
      }

      setError(null);
    } catch {
      setError('Connection error');
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const stats = {
    safe: status?.stats?.safeCommands ?? 0,
    warn: status?.stats?.warnings ?? 0,
    block: status?.stats?.blocked ?? 0,
    connected: status?.connected ?? false,
    openclawConnected: status?.backends?.openclaw?.connected ?? false,
    nanobotConnected: status?.backends?.nanobot?.connected ?? false,
    blocking: status?.blocking?.active ?? false,
    hasOpenClaw: !!status?.backends?.openclaw,
    hasNanobot: !!status?.backends?.nanobot,
  };

  return { status, events, stats, error, refetch: fetchData };
}

function TrayHeader({ connected }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="text-lg">🛡️</span>
        <span className="text-white font-semibold text-sm">GuardClaw</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
        <span className="text-xs text-white/60">{connected ? 'live' : 'offline'}</span>
      </div>
    </div>
  );
}

function TrayStatCell({ value, label, color }) {
  return (
    <div className="flex flex-col items-center">
      <span className={`text-2xl font-bold tabular-nums ${color}`}>{value}</span>
      <span className="text-xs text-white/40 tracking-wider">{label}</span>
    </div>
  );
}

function TrayStats({ safe, warn, block }) {
  return (
    <div className="grid grid-cols-3 gap-0 px-3 py-3">
      <TrayStatCell value={safe} label="SAFE" color="text-green-400" />
      <TrayStatCell value={warn} label="WARN" color="text-yellow-400" />
      <TrayStatCell value={block} label="BLOCK" color="text-red-400" />
    </div>
  );
}

function TrayEventRow({ event, onClick }) {
  const score = event.safeguard?.riskScore ?? 0;
  const blocked = event.safeguard?.blocked ?? false;
  const action = event.action || event.type || 'default';
  const timeAgo = formatTimeAgo(event.timestamp);

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2 py-1.5 px-1 rounded hover:bg-white/5 transition-colors text-left"
    >
      <div className={`w-0.5 h-5 rounded-full flex-shrink-0 ${riskColor(score)}`} />
      <span className="text-sm w-5 text-center flex-shrink-0">
        {ACTION_ICONS[action] || ACTION_ICONS.default}
      </span>
      <span className="text-xs text-white/70 flex-1 truncate">{action}</span>
      <span className={`text-xs font-mono ${
        blocked ? 'text-red-400' : score >= RISK_WARN ? 'text-yellow-400' : 'text-green-400'
      }`}>
        {riskLabel(score, blocked)}
      </span>
      <span className="text-xs text-white/25 w-8 text-right flex-shrink-0">{timeAgo}</span>
    </button>
  );
}

function TrayEventList({ events, onOpenDashboard }) {
  return (
    <div className="flex-1 overflow-hidden px-3 py-2">
      <p className="text-xs text-white/40 uppercase tracking-wider mb-2">Recent Activity</p>
      <div className="space-y-1">
        {events.length === 0 ? (
          <p className="text-xs text-white/30 text-center py-4">No recent events</p>
        ) : (
          events.slice(0, 5).map((event, i) => (
            <TrayEventRow
              key={event.id || event.timestamp || i}
              event={event}
              onClick={onOpenDashboard}
            />
          ))
        )}
      </div>
    </div>
  );
}

function BackendDot({ label, connected }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-400' : 'bg-white/20'}`} />
      <span className="text-xs text-white/50">{label}</span>
    </div>
  );
}

function TrayBackends({ openclaw, nanobot, hasOpenClaw, hasNanobot }) {
  if (!hasOpenClaw && !hasNanobot) return null;
  return (
    <div className="flex items-center gap-4 px-4 py-2">
      <span className="text-xs text-white/40">Backends:</span>
      {hasOpenClaw && <BackendDot label="OpenClaw" connected={openclaw} />}
      {hasNanobot && <BackendDot label="Nanobot" connected={nanobot} />}
    </div>
  );
}

function TrayActions({ blocking, onOpenDashboard }) {
  return (
    <div className="flex gap-2 px-3 py-3">
      <div className={`flex-1 text-center text-xs py-1.5 rounded-lg border ${
        blocking
          ? 'border-red-500/30 text-red-400 bg-red-500/10'
          : 'border-white/10 text-white/40'
      }`}>
        {blocking ? '🚫 Blocking' : '👀 Monitor'}
      </div>
      <button
        onClick={onOpenDashboard}
        className="flex-1 text-center text-xs py-1.5 rounded-lg bg-blue-600/80 hover:bg-blue-600 text-white transition-colors font-medium"
      >
        Dashboard →
      </button>
    </div>
  );
}

export default function TrayApp() {
  const { events, stats } = useTrayData();

  const openDashboard = () => {
    if (window.electronAPI?.openDashboard) {
      window.electronAPI.openDashboard();
    } else {
      window.open('http://localhost:3002', '_blank');
    }
  };

  return (
    <div
      className="flex flex-col h-full rounded-xl overflow-hidden border border-white/10 shadow-2xl"
      style={{ background: 'rgba(15, 15, 30, 0.82)' }}
    >
      <TrayHeader connected={stats.connected} />
      <TrayStats safe={stats.safe} warn={stats.warn} block={stats.block} />
      <div className="h-px bg-white/10 mx-3" />
      <TrayEventList events={events} onOpenDashboard={openDashboard} />
      <div className="h-px bg-white/10 mx-3" />
      {(stats.hasOpenClaw || stats.hasNanobot) && (
        <>
          <TrayBackends
            openclaw={stats.openclawConnected}
            nanobot={stats.nanobotConnected}
            hasOpenClaw={stats.hasOpenClaw}
            hasNanobot={stats.hasNanobot}
          />
          <div className="h-px bg-white/10 mx-3" />
        </>
      )}
      <TrayActions blocking={stats.blocking} onOpenDashboard={openDashboard} />
    </div>
  );
}

import { useState, useEffect } from 'react';
import EventList from './components/EventList';
import ConnectionModal from './components/ConnectionModal';
import SettingsModal from './components/SettingsModal';
import BlockingModal from './components/BlockingModal';

function App() {
  const [connected, setConnected] = useState(false);
  const [llmStatus, setLlmStatus] = useState(null);
  const [connectionStats, setConnectionStats] = useState(null);
  const [backends, setBackends] = useState(null);
  const [daysSinceInstall, setDaysSinceInstall] = useState(0);
  const [stats, setStats] = useState({
    totalEvents: 0,
    safeCommands: 0,
    warnings: 0,
    blocked: 0,
  });
  const [events, setEvents] = useState([]);
  const [eventFilter, setEventFilter] = useState(null);
  const [backendFilter, setBackendFilter] = useState('all');
  const [showGatewayModal, setShowGatewayModal] = useState(false);
  const [showLlmModal, setShowLlmModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showBlockingModal, setShowBlockingModal] = useState(false);
  const [currentToken, setCurrentToken] = useState('');
  const [llmConfig, setLlmConfig] = useState(null);
  const [blockingStatus, setBlockingStatus] = useState(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    return saved !== null ? saved === 'true' : true;
  });

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('darkMode', darkMode);
  }, [darkMode]);

  useEffect(() => {
    const connectToBackend = async () => {
      try {
        const response = await fetch('/api/status');
        if (response.ok) {
          const data = await response.json();
          setConnected(data.connected);
          setLlmStatus(data.llmStatus);
          setConnectionStats(data.connectionStats);
          setBackends(data.backends || null);
          setDaysSinceInstall(data.install?.daysSinceInstall || 0);
          setLlmConfig(data.llmConfig || null);
          setBlockingStatus(data.blocking || null);
          fetchEvents();
        }
      } catch (error) {
        console.error('Failed to connect:', error);
        setConnected(false);
        setLlmStatus(null);
      }
    };

    const fetchEvents = async (filter = null, backend = 'all') => {
      try {
        const filterParam = filter ? `&filter=${filter}` : '';
        const backendParam = backend !== 'all' ? `&backend=${backend}` : '';
        const response = await fetch(`/api/events/history?limit=2000${filterParam}${backendParam}`);
        if (response.ok) {
          const data = await response.json();
          const filteredEvents = backend === 'all'
            ? data.events || []
            : (data.events || []).filter(e => {
                const sessionKey = e.sessionKey || e.payload?.sessionKey || '';
                if (backend === 'openclaw') return sessionKey.includes('agent:');
                if (backend === 'nanobot') return sessionKey.includes('nanobot');
                return true;
              });
          setEvents(filteredEvents);
          if (!filter) {
            updateStats(filteredEvents);
          }
        }
      } catch (error) {
        console.error('Failed to fetch events:', error);
      }
    };

    const updateStats = (eventList) => {
      const s = eventList.reduce(
        (acc, event) => {
          acc.totalEvents++;
          if (event.safeguard?.riskScore <= 3) {
            acc.safeCommands++;
          } else if (event.safeguard?.riskScore <= 7) {
            acc.warnings++;
          } else if (event.safeguard?.riskScore > 7) {
            acc.blocked++;
          }
          return acc;
        },
        { totalEvents: 0, safeCommands: 0, warnings: 0, blocked: 0 }
      );
      setStats(s);
    };

    connectToBackend();

    const eventSource = new EventSource('/api/events');
    eventSource.onmessage = (e) => {
      try {
        const newEvent = JSON.parse(e.data);
        setEvents((prev) => [newEvent, ...prev].slice(0, 100));
        setStats((prev) => ({
          totalEvents: prev.totalEvents + 1,
          safeCommands: newEvent.safeguard?.riskScore <= 3 ? prev.safeCommands + 1 : prev.safeCommands,
          warnings: newEvent.safeguard?.riskScore > 3 && newEvent.safeguard?.riskScore <= 7 ? prev.warnings + 1 : prev.warnings,
          blocked: newEvent.safeguard?.riskScore > 7 ? prev.blocked + 1 : prev.blocked,
        }));
      } catch (error) {
        console.error('Failed to parse event:', error);
      }
    };

    eventSource.onerror = () => {
      setConnected(false);
      eventSource.close();
      setTimeout(connectToBackend, 5000);
    };

    const refreshInterval = setInterval(() => {
      fetchEvents();
    }, 10000);

    return () => {
      eventSource.close();
      clearInterval(refreshInterval);
    };
  }, []);

  useEffect(() => {
    const refetchEvents = async () => {
      try {
        const filterParam = eventFilter ? `&filter=${eventFilter}` : '';
        const response = await fetch(`/api/events/history?limit=2000${filterParam}`);
        if (response.ok) {
          const data = await response.json();
          const filteredEvents = backendFilter === 'all'
            ? data.events || []
            : (data.events || []).filter(e => {
                const sessionKey = e.sessionKey || e.payload?.sessionKey || '';
                if (backendFilter === 'openclaw') return sessionKey.includes('agent:');
                if (backendFilter === 'nanobot') return sessionKey.includes('nanobot');
                return true;
              });
          setEvents(filteredEvents);
        }
      } catch (error) {
        console.error('Failed to fetch filtered events:', error);
      }
    };
    refetchEvents();
  }, [eventFilter, backendFilter]);

  const getGatewayDetails = () => {
    if (!connectionStats) return [];
    return [
      { label: 'Status', value: connected ? 'Connected' : 'Disconnected' },
      { label: 'URL', value: connectionStats.url || 'ws://127.0.0.1:18789' },
      { label: 'Connected Since', value: connectionStats.connectedAt ? new Date(connectionStats.connectedAt).toLocaleString() : 'N/A' },
      { label: 'Reconnect Attempts', value: connectionStats.reconnectAttempts || 0 },
      { label: 'Total Reconnects', value: connectionStats.totalReconnects || 0 },
    ];
  };

  const getLlmDetails = () => {
    if (!llmStatus) return { details: [], modelList: [] };
    const details = [
      { label: 'Backend', value: llmStatus.backend },
      { label: 'Status', value: llmStatus.connected ? 'Connected' : 'Disconnected' },
      { label: 'Message', value: llmStatus.message },
    ];
    if (llmStatus.url) details.push({ label: 'URL', value: llmStatus.url });
    if (llmStatus.models !== undefined) details.push({ label: 'Models Loaded', value: llmStatus.models });
    if (llmStatus.error) details.push({ label: 'Error', value: llmStatus.error });
    return { details, modelList: llmStatus.modelNames || [] };
  };

  const handleSaveToken = async (newToken) => {
    setCurrentToken(newToken);
    setTimeout(async () => {
      try {
        const response = await fetch('/api/status');
        if (response.ok) {
          const data = await response.json();
          setConnected(data.connected);
          setConnectionStats(data.connectionStats);
          setBackends(data.backends || null);
        }
      } catch (error) {
        console.error('Failed to refresh status:', error);
      }
    }, 2000);
  };

  // ─── derived helpers ───────────────────────────────────────────────────────
  const isDark = darkMode;
  const textPrimary   = isDark ? 'text-white/90'  : 'text-gray-800/90';
  const textSecondary = isDark ? 'text-white/45'  : 'text-gray-500';
  const textTertiary  = isDark ? 'text-white/28'  : 'text-gray-400';
  const divider       = isDark ? 'glass-divider-dark' : 'glass-divider-light';

  const backendButtons = [
    { key: 'all', label: 'All', dot: null },
    ...(backends?.openclaw ? [{ key: 'openclaw', label: 'OpenClaw', dot: backends.openclaw.connected }] : []),
    ...(backends?.nanobot  ? [{ key: 'nanobot',  label: 'Nanobot',  dot: backends.nanobot.connected  }] : []),
  ];

  const statRows = [
    { label: 'DAYS',  value: daysSinceInstall, color: 'text-blue-400',    filterKey: null,      noFilter: true },
    { label: 'TOTAL', value: stats.totalEvents,  color: isDark ? 'text-white/80' : 'text-gray-700', filterKey: null },
    { label: 'SAFE',  value: stats.safeCommands, color: 'text-emerald-400', filterKey: 'safe' },
    { label: 'WARN',  value: stats.warnings,     color: 'text-amber-400',   filterKey: 'warning' },
    { label: 'BLOCK', value: stats.blocked,      color: 'text-red-400',     filterKey: 'blocked' },
  ];

  return (
    <>
      {/* ── Modals ─────────────────────────────────────────────────────── */}
      <ConnectionModal
        isOpen={showGatewayModal}
        onClose={() => setShowGatewayModal(false)}
        title="Gateway Connection"
        details={getGatewayDetails()}
      />
      <ConnectionModal
        isOpen={showLlmModal}
        onClose={() => setShowLlmModal(false)}
        title="LLM Backend"
        details={getLlmDetails().details}
        modelList={getLlmDetails().modelList}
      />
      <SettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        currentToken={currentToken}
        currentLlmConfig={llmConfig}
        onSave={handleSaveToken}
      />
      <BlockingModal
        isOpen={showBlockingModal}
        onClose={() => {
          setShowBlockingModal(false);
          setTimeout(() => {
            fetch('/api/status').then(r => r.json()).then(data => {
              setBlockingStatus(data.blocking || null);
            });
          }, 100);
        }}
        currentStatus={blockingStatus}
      />

      {/* ── Glass Panel ─────────────────────────────────────────────────── */}
      <div
        className={`glass-panel fixed top-2 right-2 z-50 w-[440px] overflow-hidden ${isDark ? 'dark-glass' : 'light-glass'}`}
        style={{ maxWidth: 'calc(100vw - 16px)' }}
      >
        {/* ── Top bar (always visible) ──────────────────────────────────── */}
        <div
          className="flex items-center px-4 py-[11px] gap-2 cursor-pointer select-none"
          onClick={() => setIsExpanded(v => !v)}
        >
          {/* Logo + name */}
          <span className="text-[1.25rem] leading-none">🛡️</span>
          <span className={`text-[13px] font-semibold tracking-tight ${textPrimary}`}>
            GuardClaw
          </span>

          {/* Connection dot */}
          <div className={connected ? 'dot-connected' : 'dot-disconnected'} />

          <div className="flex-1" />

          {/* Mini stat pills */}
          <div className="flex items-center gap-[6px] text-[11px] font-semibold tabular-nums mr-1">
            <span className="text-emerald-400" title="Safe">✓{stats.safeCommands}</span>
            <span className="text-amber-400"   title="Warnings">⚠{stats.warnings}</span>
            <span className="text-red-400"     title="Blocked">✕{stats.blocked}</span>
          </div>

          {/* Action buttons – stop propagation so they don't toggle expand */}
          <div
            className="flex items-center gap-[2px]"
            onClick={e => e.stopPropagation()}
          >
            {blockingStatus && (
              <button
                className="glass-btn"
                onClick={() => setShowBlockingModal(true)}
                title={blockingStatus.active ? 'Blocking Active – click to configure' : 'Monitor Only – click to configure'}
              >
                {blockingStatus.active ? '🚫' : '👀'}
              </button>
            )}
            <button
              className="glass-btn"
              onClick={() => setShowSettingsModal(true)}
              title="Settings"
            >
              ⚙️
            </button>
            <button
              className="glass-btn"
              onClick={() => setDarkMode(d => !d)}
              title={isDark ? 'Light mode' : 'Dark mode'}
            >
              {isDark ? '☀️' : '🌙'}
            </button>
          </div>

          {/* Chevron */}
          <span
            className={`chevron text-[11px] ml-[2px] ${textTertiary} ${isExpanded ? 'open' : ''}`}
          >
            ▾
          </span>
        </div>

        {/* ── Expanded content ──────────────────────────────────────────── */}
        <div
          className="panel-content-open"
          style={{
            maxHeight: isExpanded ? '85vh' : '0px',
            opacity: isExpanded ? 1 : 0,
          }}
        >
          {/* Divider */}
          <div className={divider} />

          {/* Stats row */}
          <div className="grid grid-cols-5 gap-0 px-2 py-2">
            {statRows.map(({ label, value, color, filterKey, noFilter }) => {
              const isActive = !noFilter && eventFilter === filterKey;
              const isClickable = !noFilter;
              return (
                <div
                  key={label}
                  className={`stat-cell ${isClickable ? 'clickable' : ''} ${isActive ? 'active' : ''}`}
                  onClick={isClickable ? () => setEventFilter(isActive ? null : filterKey) : undefined}
                  title={isClickable ? (isActive ? 'Clear filter' : `Filter: ${label}`) : undefined}
                >
                  <span className={`text-[22px] font-bold tabular-nums leading-none ${color}`}>
                    {value}
                  </span>
                  <span className={`text-[9px] font-medium tracking-[0.08em] uppercase mt-[4px] ${textSecondary}`}>
                    {label}{isActive ? ' ✓' : ''}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Divider */}
          <div className={divider} />

          {/* Backend selector */}
          <div className="flex items-center gap-[6px] px-4 py-[8px] flex-wrap">
            <span className={`text-[11px] font-medium mr-1 ${textSecondary}`}>Backend</span>
            {backendButtons.map(({ key, label, dot }) => (
              <button
                key={key}
                onClick={() => setBackendFilter(key)}
                className={`flex items-center gap-[5px] px-[10px] py-[3px] rounded-full text-[11px] font-medium transition-all ${
                  backendFilter === key
                    ? 'bg-blue-500/25 text-blue-300 shadow-[inset_0_0_0_1px_rgba(96,165,250,0.4)]'
                    : `${textSecondary} hover:${isDark ? 'bg-white/8' : 'bg-black/5'}`
                }`}
              >
                {dot !== null && (
                  <span
                    className={`w-[6px] h-[6px] rounded-full flex-shrink-0 ${dot ? 'bg-emerald-400' : 'bg-red-400'}`}
                  />
                )}
                {label}
              </button>
            ))}
            <span className={`ml-auto text-[10px] tabular-nums ${textTertiary}`}>
              {events.length} event{events.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Divider */}
          <div className={divider} />

          {/* Events header */}
          <div className="flex items-center justify-between px-4 py-[7px]">
            <span className={`text-[11px] font-semibold tracking-wide uppercase ${textSecondary}`}>
              Real-time Events
            </span>
            {eventFilter && (
              <button
                onClick={() => setEventFilter(null)}
                className={`text-[10px] px-[8px] py-[2px] rounded-full transition-colors ${
                  isDark
                    ? 'bg-white/10 text-white/55 hover:bg-white/18'
                    : 'bg-black/6 text-gray-500 hover:bg-black/10'
                }`}
              >
                {eventFilter} ×
              </button>
            )}
          </div>

          {/* Events list */}
          <div
            className="glass-scroll overflow-y-auto"
            style={{ height: 'min(52vh, 460px)' }}
          >
            <EventList events={events} />
          </div>
        </div>
      </div>
    </>
  );
}

export default App;

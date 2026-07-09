const RUNTIME_LOG_KEY = 'pivi_runtime_logs_v1';
const MAX_LOG_ENTRIES = 200;

type RuntimeLogLevel = 'info' | 'warn' | 'error';

interface RuntimeLogEntry {
  timestamp: string;
  level: RuntimeLogLevel;
  scope: string;
  message: string;
}

const readRuntimeLogs = (): RuntimeLogEntry[] => {
  try {
    const raw = localStorage.getItem(RUNTIME_LOG_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as RuntimeLogEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeRuntimeLogs = (entries: RuntimeLogEntry[]) => {
  localStorage.setItem(RUNTIME_LOG_KEY, JSON.stringify(entries.slice(-MAX_LOG_ENTRIES)));
};

export const appendRuntimeLog = (
  level: RuntimeLogLevel,
  scope: string,
  message: string,
) => {
  const entry: RuntimeLogEntry = {
    timestamp: new Date().toISOString(),
    level,
    scope,
    message,
  };
  const nextEntries = [...readRuntimeLogs(), entry];
  writeRuntimeLogs(nextEntries);

  const rendered = `[${entry.timestamp}] [${level.toUpperCase()}] [${scope}] ${message}`;
  if (level === 'error') {
    console.error(rendered);
  } else if (level === 'warn') {
    console.warn(rendered);
  } else {
    console.info(rendered);
  }
};

export const buildRuntimeDiagnosticsText = () =>
  readRuntimeLogs()
    .map((entry) => `[${entry.timestamp}] [${entry.level.toUpperCase()}] [${entry.scope}] ${entry.message}`)
    .join('\n');

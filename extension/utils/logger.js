(() => {
  const EV = globalThis.EdenVoice ||= {};
  const parts = (date) => {
    const values = Object.fromEntries(new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    }).formatToParts(date).map(({ type, value }) => [type, value]));
    return {
      date: `${values.day}/${values.month}/${values.year}`,
      time: `${values.hour}:${values.minute}:${values.second}`,
    };
  };
  const timestamp = (date = new Date()) => {
    const pad = (value, length = 2) => String(value).padStart(length, "0");
    const offset = -date.getTimezoneOffset();
    const sign = offset >= 0 ? "+" : "-";
    const zone = `${sign}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`;
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}${zone}`;
  };
  const write = (method, message, ...details) => {
    const { date, time } = parts(new Date());
    const level = method === "warn" ? "WARN: " : method === "error" ? "ERROR: " : "";
    console[method](`[${date} ${time}] [Eden Voice] ${level}${message}`, ...details);
  };
  EV.Logger = Object.freeze({
    info: (message, ...details) => write("info", message, ...details),
    warn: (message, ...details) => write("warn", message, ...details),
    error: (message, ...details) => write("error", message, ...details),
    timestamp,
    formatDateTime: parts,
    text: (label, value) => {
      if (EV.LOG_CONFIG?.DEBUG_FULL_TEXT) write("info", `${label}: ${value}`);
      else write("info", `${label}: ${String(value || "").length} caracteres`);
    },
  });
})();

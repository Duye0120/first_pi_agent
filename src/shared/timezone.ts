export const SYSTEM_TIME_ZONE = "system";
const TIME_ZONE_FALLBACK = "UTC";

const COMMON_TIME_ZONE_ENTRIES = [
  { value: "UTC", label: "UTC · 协调世界时" },
  { value: "Asia/Shanghai", label: "Asia/Shanghai · 北京 / 上海" },
  { value: "Asia/Hong_Kong", label: "Asia/Hong_Kong · 香港" },
  { value: "Asia/Singapore", label: "Asia/Singapore · 新加坡" },
  { value: "Asia/Tokyo", label: "Asia/Tokyo · 东京" },
  { value: "Asia/Seoul", label: "Asia/Seoul · 首尔" },
  { value: "Asia/Bangkok", label: "Asia/Bangkok · 曼谷" },
  { value: "Asia/Dubai", label: "Asia/Dubai · 迪拜" },
  { value: "Europe/London", label: "Europe/London · 伦敦" },
  { value: "Europe/Paris", label: "Europe/Paris · 巴黎" },
  { value: "Europe/Berlin", label: "Europe/Berlin · 柏林" },
  { value: "America/New_York", label: "America/New_York · 纽约" },
  { value: "America/Chicago", label: "America/Chicago · 芝加哥" },
  { value: "America/Denver", label: "America/Denver · 丹佛" },
  { value: "America/Los_Angeles", label: "America/Los_Angeles · 洛杉矶" },
  { value: "America/Toronto", label: "America/Toronto · 多伦多" },
  { value: "Australia/Sydney", label: "Australia/Sydney · 悉尼" },
  { value: "Pacific/Auckland", label: "Pacific/Auckland · 奥克兰" },
] as const;

function asDate(value: Date | string | number): Date {
  return value instanceof Date ? value : new Date(value);
}

export function getSystemTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || TIME_ZONE_FALLBACK;
}

export function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) {
    return false;
  }

  try {
    new Intl.DateTimeFormat("zh-CN", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function normalizeTimeZoneSetting(value: unknown): string {
  if (value === SYSTEM_TIME_ZONE || value == null || value === "") {
    return SYSTEM_TIME_ZONE;
  }

  return isValidTimeZone(value) ? value : SYSTEM_TIME_ZONE;
}

export function resolveConfiguredTimeZone(value: unknown): string {
  const normalized = normalizeTimeZoneSetting(value);
  return normalized === SYSTEM_TIME_ZONE ? getSystemTimeZone() : normalized;
}

export function formatDateTimeInTimeZone(
  value: Date | string | number,
  timeZone: string,
  locale = "zh-CN",
): string {
  return formatTimeInZone(value, timeZone, locale, {
    hour12: false,
  });
}

export function formatTimeInZone(
  value: Date | string | number,
  timeZone: string,
  locale = "zh-CN",
  options: Intl.DateTimeFormatOptions = {},
): string {
  return asDate(value).toLocaleString(locale, {
    timeZone,
    ...options,
  });
}

export function getWeekdayLabelInTimeZone(
  value: Date | string | number,
  timeZone: string,
  locale = "zh-CN",
): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    timeZone,
  }).format(asDate(value));
}

export function getDateKeyInTimeZone(
  value: Date | string | number,
  timeZone: string,
): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).formatToParts(asDate(value));

  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";

  return `${year}-${month}-${day}`;
}

export function getClockTimeInTimeZone(
  value: Date | string | number,
  timeZone: string,
): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).formatToParts(asDate(value));

  const hour = parts.find((part) => part.type === "hour")?.value ?? "00";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00";

  return `${hour}:${minute}`;
}

export function getCommonTimeZoneOptions(
  systemTimeZone = getSystemTimeZone(),
  currentTimeZone?: string,
) {
  const options = [
    {
      value: SYSTEM_TIME_ZONE,
      label: `跟随系统 · ${systemTimeZone}`,
    },
    ...COMMON_TIME_ZONE_ENTRIES,
  ];

  if (
    currentTimeZone &&
    currentTimeZone !== SYSTEM_TIME_ZONE &&
    !options.some((option) => option.value === currentTimeZone)
  ) {
    options.splice(1, 0, {
      value: currentTimeZone,
      label: `${currentTimeZone} · 当前自定义`,
    });
  }

  return options;
}

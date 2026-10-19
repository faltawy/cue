const UNITS = ["byte", "kilobyte", "megabyte", "gigabyte", "terabyte"];

// A size in the largest unit that keeps it at or above 1, with the locale's
// separators: "1.3 TB", not "1330200.0 MB".
export function formatBytes(bytes: number, locale?: string): string {
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return new Intl.NumberFormat(locale, {
    style: "unit",
    unit: UNITS[unit],
    unitDisplay: unit === 0 ? "long" : "short",
    maximumFractionDigits: unit === 0 ? 0 : 1,
  }).format(value);
}

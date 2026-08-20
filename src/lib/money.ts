/**
 * One place that decides how money is written.
 *
 * The app had three answers at once: the pricing panel and costing section said
 * AED, the quotation PDF said DHS, and the job list printed a rupee symbol. They
 * all mean dirhams. AED is the ISO code and is what the screens where amounts are
 * entered and approved already used, so that is the one kept.
 */
export const CURRENCY = "AED";

/**
 * What to print when a job has no priced total yet.
 *
 * Deliberately not "AED 0.00": a job awaiting pricing has no amount, and printing
 * a zero would state a price nobody has set. "—" and "N/A" were the previous
 * spellings and said nothing about why the cell was empty.
 */
export const NOT_PRICED = "Not priced";

/**
 * Formats an amount as "AED 1890.00".
 *
 * Accepts strings because grand_total is a Postgres numeric and node-postgres
 * returns those as strings to preserve precision it cannot guarantee in a float.
 * Code that tested `typeof value === "number"` first therefore fell through to
 * printing the bare string, which is why real totals appeared with no currency at
 * all.
 */
export const formatMoney = (
  value: number | string | null | undefined,
  fallback: string = NOT_PRICED,
): string => {
  if (value === null || value === undefined || value === "") return fallback;

  const amount = Number(value);
  if (!Number.isFinite(amount)) return fallback;

  return `${CURRENCY} ${amount.toFixed(2)}`;
};

/** The amount alone, two places, no currency — for spreadsheet cells and PDF columns. */
export const formatAmount = (value: number | string | null | undefined, fallback = "0.00"): string => {
  if (value === null || value === undefined || value === "") return fallback;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount.toFixed(2) : fallback;
};

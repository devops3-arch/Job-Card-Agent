/**
 * Styling for job card form controls.
 *
 * Kept apart from the FieldLabel component so that file exports only a component
 * and Fast Refresh keeps working — the react-refresh rule flags a module that
 * mixes the two.
 */

/** Base styling every field control in the job card form shares. */
export const inputClass =
  "h-11 rounded-xl border-border/60 bg-background hover:border-primary/40 focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all duration-300";

/** Red outline for a compulsory control that is still empty. */
export const requiredBoxClass =
  "border-destructive/70 ring-1 ring-destructive/20 focus:border-destructive focus:ring-destructive/25";

/**
 * True when a field has been answered. A false checkbox counts as unanswered,
 * which is what makes the two compulsory closure tickboxes read as outstanding
 * until they are ticked.
 */
const isFilled = (value: unknown): boolean =>
  value !== undefined &&
  value !== null &&
  value !== false &&
  !(typeof value === "string" && value.trim() === "") &&
  !(Array.isArray(value) && value.length === 0);

/**
 * The class for a control, given whether it is compulsory and what it holds.
 *
 * The red outline clears once the field is answered, so the red on screen is
 * always the list of things still outstanding rather than a permanent alarm.
 */
export const controlClass = (required?: boolean, value?: unknown): string =>
  required && !isFilled(value) ? `${inputClass} ${requiredBoxClass}` : inputClass;

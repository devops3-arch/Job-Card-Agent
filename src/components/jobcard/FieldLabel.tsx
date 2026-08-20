/**
 * The label for a job card form field.
 *
 * Compulsory fields read bolder and darker than optional ones and carry a red
 * asterisk. Shared because the marking has to match what the form enforces, and
 * it previously did not: several fields were rejected when blank while showing no
 * marker at all. One definition means the two cannot drift apart per section.
 *
 * The matching control styling lives in @/lib/fieldStyles.
 */
export const FieldLabel = ({
  label,
  required,
}: {
  label: string;
  required?: boolean;
}) => (
  <label className={`field-label${required ? " field-label-required" : ""}`}>
    {label}
    {required && <span className="ml-1 text-destructive">*</span>}
  </label>
);

export default FieldLabel;

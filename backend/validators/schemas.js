import { z } from "zod";

const trimmedString = (maxLength = 255) =>
  z.string().trim().min(1, "Cannot be empty").max(maxLength);

const optionalTrimmedString = (maxLength = 255) =>
  trimmedString(maxLength).optional();

const optionalDateString = () =>
  z
    .string()
    .trim()
    .min(1, "Cannot be empty")
    .max(50)
    .refine((value) => !Number.isNaN(Date.parse(value)), {
      message: "Invalid date format",
    })
    .optional();

const numericNonNegative = () =>
  z.coerce
    .number({ invalid_type_error: "Must be a number" })
    .nonnegative({ message: "Must be zero or greater" });

const STATUS_VALUES = [
  "DRAFT",
  "SUBMITTED",
  "PENDING_APPROVAL",
  "APPROVED",
  "REJECTED",
  "DELETED",
  "COMPLETED",
];

const LEGACY_STATUS_VALUES = ["WAITING_PRICING", "WAITING_APPROVAL", "CLOSED"];
const ALL_STATUS_VALUES = [...STATUS_VALUES, ...LEGACY_STATUS_VALUES];

export const idParamSchema = z.object({
  id: z.coerce.number().int().positive({ message: "Id must be a positive integer" }),
});

export const loginSchema = z
  .object({
    email: z
      .string()
      .trim()
      .min(1, "Email is required")
      .email("Invalid email format")
      .max(320),
    password: z.string().trim().min(1, "Password is required").max(128),
  })
  .strict();

export const refreshTokenSchema = z
  .object({
    refreshToken: trimmedString(512),
  })
  .strict();

export const logoutSchema = z
  .object({
    refreshToken: trimmedString(512),
  })
  .strict();

export const userCreationSchema = z
  .object({
    name: trimmedString(100),
    email: z.string().trim().min(1).email("Invalid email format").max(320),
    password: z.string().trim().min(1, "Password is required").max(128),
    role: z.enum(["engineer", "manager", "admin"]),
    signature_url: optionalTrimmedString(500),
  })
  .strict();

export const jobCreationSchema = z
  .object({
    customer_name: trimmedString(255),
    equipment_name: trimmedString(255),
    job_card_no: optionalTrimmedString(100),
    job_date: optionalDateString(),
    ref_no: optionalTrimmedString(100),
    sales_area: optionalTrimmedString(100),
    service_type: optionalTrimmedString(100),
    under_warranty: z.boolean().optional(),
    customer_code: optionalTrimmedString(100),
    attention_of: optionalTrimmedString(255),
    email: z.string().trim().email("Invalid email format").max(320).optional(),
    contact_no: optionalTrimmedString(50),
    other_expenses: numericNonNegative().optional(),
    discount_percentage: numericNonNegative().optional(),
    manager_id: z.coerce.number().int().positive({ message: "manager_id must be a positive integer" }).optional(),
    engineer_id: z.coerce.number().int().positive({ message: "engineer_id must be a positive integer" }).optional(),
    parts: z.array(z.record(z.any())).optional(),
    labor: z.array(z.record(z.any())).optional(),
    job_data: z.record(z.any()).optional(),
  })
  .strict();

export const jobUpdateSchema = z
  .object({
    customer_name: optionalTrimmedString(255),
    equipment_name: optionalTrimmedString(255),
    job_card_no: optionalTrimmedString(100),
    job_date: optionalDateString(),
    ref_no: optionalTrimmedString(100),
    sales_area: optionalTrimmedString(100),
    service_type: optionalTrimmedString(100),
    under_warranty: z.boolean().optional(),
    customer_code: optionalTrimmedString(100),
    attention_of: optionalTrimmedString(255),
    email: z.string().trim().email("Invalid email format").max(320).optional(),
    contact_no: optionalTrimmedString(50),
    other_expenses: numericNonNegative().optional(),
    discount_percentage: numericNonNegative().optional(),
    manager_id: z.coerce.number().int().positive({ message: "manager_id must be a positive integer" }).optional(),
    engineer_id: z.coerce.number().int().positive({ message: "engineer_id must be a positive integer" }).optional(),
    parts: z.array(z.record(z.any())).optional(),
    labor: z.array(z.record(z.any())).optional(),
    job_data: z.record(z.any()).optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one job field must be provided",
  });

export const pricingSchema = z
  .object({
    labour_rate: numericNonNegative(),
    service_charge: numericNonNegative(),
    discount: numericNonNegative(),
    vat_percent: numericNonNegative(),
    parts_total: numericNonNegative(),
    labour_total: numericNonNegative(),
    taxable_amount: numericNonNegative(),
    vat_amount: numericNonNegative().optional(),
    grand_total: numericNonNegative().optional(),
  })
  .strict();

export const statusUpdateSchema = z
  .object({
    status: z
      .string()
      .trim()
      .min(1, "Status is required")
      .refine((value) => ALL_STATUS_VALUES.includes(value), {
        message: `Status must be one of: ${ALL_STATUS_VALUES.join(", ")}`,
      }),
  })
  .strict();

export const deleteJobSchema = z
  .object({
    delete_reason: z.string().trim().min(1, "Delete reason is required").max(500),
  })
  .strict();

export const signatureUploadSchema = z
  .object({
    signature_url: z.string().trim().min(1, "Signature URL is required").url("Invalid signature URL").max(1024),
    file_type: z.enum(["image/png", "image/jpeg", "image/svg+xml"]),
    file_name: optionalTrimmedString(200),
    file_size: z.coerce.number().int().positive({ message: "File size must be a positive integer" }).max(2 * 1024 * 1024, "Signature file must be smaller than 2MB"),
  })
  .strict();

export const aiDescriptionSchema = z
  .object({
    description: trimmedString(2000),
  })
  .strict();

export const pdfGenerationSchema = z
  .object({
    jobId: z.coerce.number().int().positive({ message: "jobId must be a positive integer" }),
    fileName: optionalTrimmedString(200),
    include_cost_breakdown: z.boolean().optional(),
  })
  .strict();

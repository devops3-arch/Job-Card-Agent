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

const passwordSchema = (fieldName = "Password") =>
  z
    .string()
    .trim()
    .min(8, `${fieldName} must be at least 8 characters`)
    .regex(/[A-Za-z]/, `${fieldName} must contain a letter`)
    .regex(/[0-9]/, `${fieldName} must contain a number`);

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

const newFormatJobFields = {
  customer_location: optionalTrimmedString(),
  site_contact: optionalTrimmedString(),
  time_in: optionalTrimmedString(20),
  time_out: optionalTrimmedString(20),
  report_date: optionalDateString(),
  customer_po_ref: optionalTrimmedString(),
  // complaint_issue_description is long text
  complaint_issue_description: z.string().trim().max(5000).optional(),
  customer_equipment_id: optionalTrimmedString(),
  equipment_type: optionalTrimmedString(),
  meter_reading: numericNonNegative().optional(),
  capacity_rating: optionalTrimmedString(),
  controller_panel_model: optionalTrimmedString(),
  alarm_fault_code: optionalTrimmedString(),
  last_service_date: optionalDateString(),
  last_service_hours: numericNonNegative().optional(),
  oil_refrigerant_fuel_type: optionalTrimmedString(),
  duty_cycle: optionalTrimmedString(),
  warranty_status: optionalTrimmedString(),
  warranty_claim_ref: optionalTrimmedString(),
  previous_job_ref: optionalTrimmedString(),
  customer_issues: z.array(z.record(z.any())).optional(),
  findings: z.record(z.any()).optional(),
  operating_data: z.array(z.record(z.any())).or(z.record(z.any())).optional(),
  evidence: z.record(z.any()).optional(),
  // Additional fields added in migration 013
  total_travel_hours: numericNonNegative().optional(),
  total_work_hours: numericNonNegative().optional(),
  no_of_visits_current: z.coerce.number().int().nonnegative().optional(),
  no_of_visits_total: z.coerce.number().int().nonnegative().optional(),
  charge_per_visit: numericNonNegative().optional(),
  next_visit_required: z.boolean().optional(),
  next_visit_notes: z.string().optional(),
  final_test_run_result: z.enum(['Pass', 'Fail', 'Temporary Fix', 'N/A']).optional(),
  final_equipment_status: z.enum(['Fully Operational', 'Temporarily Operational', 'Stopped', 'Pending Parts', 'Further Diagnosis Required']).optional(),
  quotation_required: z.boolean().optional(),
  safety_critical_issue: z.boolean().optional(),
  escalated_to: z.string().max(255).optional(),
  internal_checklist_completed: z.boolean().optional(),
  attachments_verified: z.boolean().optional(),
  job_ready_for_invoicing: z.boolean().optional(),
  brand_id: z.coerce.number().int().positive().optional(),
  photos_qty: z.coerce.number().int().nonnegative().optional(),
  sound_file_url: z.union([z.string().url(), z.string().max(500)]).optional(),
  alarm_fault_photo_url: z.string().max(500).optional(),
  vibration_report_url: z.string().max(500).optional(),
};

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
    password: passwordSchema("Password"),
    role: z.enum(["engineer", "manager", "admin"]),
    signature_url: optionalTrimmedString(500),
  })
  .strict();

export const userRoleSchema = z
  .object({
    role: z.enum(["engineer", "manager", "admin"]),
  })
  .strict();

export const adminCreateUserSchema = z
  .object({
    name: trimmedString(100),
    email: z.string().trim().min(1, "Email is required").email("Invalid email format").max(320),
    password: passwordSchema("Password"),
    role: z.enum(["engineer", "manager", "admin"]),
  })
  .strict();

export const adminUpdateUserSchema = z
  .object({
    name: optionalTrimmedString(100),
    email: z.string().trim().email("Invalid email format").max(320).optional(),
    role: z.enum(["engineer", "manager", "admin"]).optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided for update",
  });

export const profileUpdateSchema = z
  .object({
    fullName: optionalTrimmedString(100),
    phone: optionalTrimmedString(30),
    department: optionalTrimmedString(100),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided for update",
  });

export const adminSetPasswordSchema = z
  .object({
    newPassword: passwordSchema("Password"),
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
    equipment_model: optionalTrimmedString(255),
    equipment_brand_description: optionalTrimmedString(255),
    equipment_part_no: optionalTrimmedString(255),
    equipment_serial_no: optionalTrimmedString(255),
    equipment_year: optionalTrimmedString(50),
    other_expenses: numericNonNegative().optional(),
    discount_percentage: numericNonNegative().optional(),
    manager_id: z.coerce.number().int().positive({ message: "manager_id must be a positive integer" }).optional(),
    engineer_id: z.coerce.number().int().positive({ message: "engineer_id must be a positive integer" }).optional(),
    parts: z.array(z.record(z.any())).optional(),
    labor: z.array(z.record(z.any())).optional(),
    job_data: z.record(z.any()).optional(),
    ...newFormatJobFields,
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
    equipment_model: optionalTrimmedString(255),
    equipment_brand_description: optionalTrimmedString(255),
    equipment_part_no: optionalTrimmedString(255),
    equipment_serial_no: optionalTrimmedString(255),
    equipment_year: optionalTrimmedString(50),
    other_expenses: numericNonNegative().optional(),
    discount_percentage: numericNonNegative().optional(),
    manager_id: z.coerce.number().int().positive({ message: "manager_id must be a positive integer" }).optional(),
    engineer_id: z.coerce.number().int().positive({ message: "engineer_id must be a positive integer" }).optional(),
    parts: z.array(z.record(z.any())).optional(),
    labor: z.array(z.record(z.any())).optional(),
    job_data: z.record(z.any()).optional(),
    ...newFormatJobFields,
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

// Parts catalog schemas
export const partCreateSchema = z
  .object({
    name: trimmedString(50),
    unit_price: z.coerce.number({ invalid_type_error: "Must be a number" }).nonnegative(),
    restock_date: optionalDateString(),
    in_stock: z.boolean().optional(),
  })
  .strict();

export const partToggleSchema = z
  .object({
    in_stock: z.boolean(),
  })
  .strict();

export const partsListQuerySchema = z
  .object({
    q: z.string().trim().max(200).optional(),
    limit: z.coerce.number().int().positive().optional(),
    offset: z.coerce.number().int().nonnegative().optional(),
  })
  .strict();

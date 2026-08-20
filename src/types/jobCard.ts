export type SalesArea = 'Dubai' | 'Northern Emirates' | 'Abu Dhabi' | 'Abu Dhabi Variable' | '';

export const SERVICE_CHARGE_MAP: Record<string, number> = {
  'Dubai': 1200,
  'Northern Emirates': 1500,
  'Abu Dhabi': 2100,
  'Abu Dhabi Variable': 0,
};

export interface CustomerInfo {
  customerName: string;
  refNo: string;
  jobCardNo: string;
  date: string;
  customerCode: string;
  attentionOf: string;
  email: string;
  contactNo: string;
  salesArea: SalesArea;
  engineerName: string;
  equipmentModel: string;
  equipmentBrandDescription: string;
  equipmentPartNo: string;
  equipmentSerialNo: string;
  equipmentYear: string;
  customerLocation: string;
  siteContact: string;
  timeIn: string;
  timeOut: string;
  reportDate: string;
  customerPoRef: string;
  complaintIssueDescription: string;
  customerEquipmentId: string;
  equipmentType: string;
  meterReading: string;
  capacityRating: string;
  controllerPanelModel: string;
  alarmFaultCode: string;
  lastServiceDate: string;
  lastServiceHours: string;
  oilRefrigerantFuelType: string;
  dutyCycle: string;
  warrantyStatus: string;
  warrantyClaimRef: string;
  previousJobRef: string;
  nameplatePhotoRef: string;
  vibrationReportRef: string;
}

export type ServiceType = 'service_contract' | 'warranty' | 'customer_request' | 'breakdown_call';

export type BreakdownCallType = 'chargeable' | 'warranty_amc';

export const BREAKDOWN_CALL_TYPES: readonly BreakdownCallType[] = ['chargeable', 'warranty_amc'];

/**
 * Narrows a stored value to a BreakdownCallType, or undefined when it is anything
 * else. The value comes out of the job_data JSON, where nothing constrains it.
 */
export const toBreakdownCallType = (value: unknown): BreakdownCallType | undefined =>
  BREAKDOWN_CALL_TYPES.includes(value as BreakdownCallType) ? (value as BreakdownCallType) : undefined;

export type CheckStatus = 'done' | 'pending' | 'na';

export interface ChecklistItem {
  id: number;
  description: string;
  status: CheckStatus;
}

export interface PartItem {
  id: string;
  description: string;
  partNumber?: string;
  qty: number | string;
  unitPrice: number | string;
  totalPrice: number;
}

export interface LaborItem {
  id: string;
  description: string;
  hours: number | string;
  ratePerHour: number | string;
  totalCost: number;
}

export interface CostSummary {
  totalParts: number;
  totalLabor: number;
  otherExpenses: number;
  subtotal: number;
  vat: number;
  grandTotal: number;
}

export interface JobCardData {
  customerInfo: CustomerInfo;
  serviceType: ServiceType;
  breakdownCallType?: BreakdownCallType;
  compressorChecklist: ChecklistItem[];
  dryerChecklist: ChecklistItem[];
  parts: PartItem[];
  labor: LaborItem[];
  otherExpenses: number;
  discountPercentage: number;
  managerName?: string;
  managerId?: number;
  engineerId?: number;
  serviceCharge?: number;
}

/**
 * The job_data JSONB blob.
 *
 * Declared members are resolved before the index signature, so the fields the app
 * actually reads come back typed while anything else stays `unknown` rather than
 * being silently trusted. Reading it used to produce `unknown` for everything,
 * which is where a good share of the project's type errors came from.
 */
export interface JobData {
  engineer_name?: string;
  manager_name?: string;
  compressor_checklist?: ChecklistItem[];
  dryer_checklist?: ChecklistItem[];
  breakdown_call_type?: string;
  coverage_type?: string;
  service_charge?: number | string;
  equipment_model?: string;
  equipment_brand_description?: string;
  equipment_part_no?: string;
  equipment_serial_no?: string;
  equipment_year?: string;
  nameplatePhotoRef?: string;
  vibrationReportRef?: string;
  evidence?: Record<string, unknown>;
  findings?: Record<string, unknown>;
  customer_issues?: unknown;
  operating_data?: unknown;
  [key: string]: unknown;
}

/**
 * Reads job_data whichever way it arrives.
 *
 * The column is JSONB, so it is normally an object — but some routes hand it back
 * as a string, which is why `job.job_data?.manager_name` did not typecheck: the
 * property does not exist on the string branch.
 */
export const parseJobData = (value: JobData | string | null | undefined): JobData => {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" ? (parsed as JobData) : {};
    } catch {
      return {};
    }
  }
  return value;
};

/** Every value SalesArea allows, so an arbitrary string can be checked against it. */
export const SALES_AREAS: readonly SalesArea[] = [
  "Dubai",
  "Northern Emirates",
  "Abu Dhabi",
  "Abu Dhabi Variable",
  "",
];

/**
 * Narrows an arbitrary value to a SalesArea, falling back to "" — which the type
 * already treats as "not set". The service charge map is keyed by these, so an
 * unrecognised area would otherwise silently price at zero.
 */
export const toSalesArea = (value: unknown): SalesArea =>
  SALES_AREAS.includes(value as SalesArea) ? (value as SalesArea) : "";

/**
 * A job row as the API returns it — snake_case, straight from job_master, with
 * job_data carrying the free-form JSON the form stores. Distinct from JobCardData
 * above, which is the camelCase shape the PDF and Excel exporters consume.
 *
 * Fields are optional because the API selects different column sets per route.
 */
export interface ApiJob {
  id: number;
  status?: string;
  customer_name?: string;
  ref_no?: string;
  job_card_no?: string;
  job_date?: string;
  customer_code?: string;
  attention_of?: string;
  email?: string;
  contact_no?: string;
  sales_area?: string;
  service_type?: string;
  equipment_name?: string;
  equipment_model?: string;
  equipment_brand_description?: string;
  equipment_part_no?: string;
  equipment_serial_no?: string;
  equipment_year?: string;
  other_expenses?: number | string;
  discount_percentage?: number | string;
  /** Joined in from pricing_header on the routes that report totals. */
  grand_total?: number | string;
  /**
   * The field service report columns migration 012 added. Declared so the screens
   * that build a JobCardData from a job row can read them typed — PricingPanel was
   * filling in 15 of CustomerInfo's fields and leaving these out, so a PDF exported
   * from the pricing screen dropped the site and equipment detail the job held.
   */
  customer_location?: string;
  site_contact?: string;
  time_in?: string;
  time_out?: string;
  report_date?: string;
  customer_po_ref?: string;
  complaint_issue_description?: string;
  customer_equipment_id?: string;
  equipment_type?: string;
  meter_reading?: number | string;
  capacity_rating?: string;
  controller_panel_model?: string;
  alarm_fault_code?: string;
  last_service_date?: string;
  last_service_hours?: number | string;
  oil_refrigerant_fuel_type?: string;
  duty_cycle?: string;
  warranty_status?: string;
  warranty_claim_ref?: string;
  previous_job_ref?: string;
  engineer_id?: number | null;
  manager_id?: number | null;
  engineer_name?: string;
  manager_name?: string;
  /** camelCase spellings some routes and the local mock data use. */
  engineerName?: string;
  managerName?: string;
  /** Older rows and the mock data carry the job date under `date`. */
  date?: string;
  /** JSONB; arrives as an object, or as a string depending on the driver. Read it with parseJobData. */
  job_data?: JobData | string | null;
  [key: string]: unknown;
}

/** A job_parts row as the API returns it. */
export interface ApiPart {
  id: number;
  part_name: string;
  part_number?: string | null;
  quantity: number;
  unit_price: number;
  total: number;
}

/** A job_labor row as the API returns it. */
export interface ApiLabor {
  id: number;
  description: string;
  hours: number;
  rate: number;
  total: number;
}

/** One entry from an API error's details array. Schema failures key by `path`, thrown AppErrors by `field`. */
export interface ApiErrorDetail {
  field?: string;
  path?: string;
  message?: string;
  code?: string;
}

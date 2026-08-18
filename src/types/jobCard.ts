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
  engineer_id?: number | null;
  manager_id?: number | null;
  engineer_name?: string;
  manager_name?: string;
  /** JSONB; arrives as an object, or as a string depending on the driver. */
  job_data?: Record<string, unknown> | string | null;
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

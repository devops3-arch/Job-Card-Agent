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
  underWarranty: boolean;
}

export type ServiceType = 'service_contract' | 'warranty' | 'customer_request' | 'breakdown_call';

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

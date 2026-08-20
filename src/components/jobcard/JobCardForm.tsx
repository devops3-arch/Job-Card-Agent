import { useState, useEffect, useMemo, type ReactNode } from "react";
import type { ApiJob, ApiPart, ApiLabor, ApiErrorDetail } from "@/types/jobCard";
import type { Dispatch, SetStateAction } from "react";
import { apiFetch } from "@/lib/api";
import { normalizeApiError } from "@/lib/apiError";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, FileSpreadsheet, ClipboardList, Sparkles, ChevronUp, Zap, Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import FileUploadField from "./FileUploadField";
import { Button } from "@/components/ui/button";
import { SERVICE_CHARGE_MAP } from "@/types/jobCard";
import { computePricingSummary } from "@/lib/pricing";
import { toast } from "sonner";
import CustomerInfoSection from "./CustomerInfoSection";
import EquipmentDetailsSection from "./EquipmentDetailsSection";
import ChecklistSection from "./ChecklistSection";
import PartsLaborSection from "./PartsLaborSection";
import CostingSection from "./CostingSection";
import { defaultCompressorChecklist, defaultDryerChecklist } from "@/data/defaultChecklist";
import { generatePDF } from "@/utils/exportPdf";
import { generateExcel } from "@/utils/exportExcel";
import type { JobCardData, CustomerInfo, BreakdownCallType, ServiceType, ChecklistItem, PartItem, LaborItem } from "@/types/jobCard";

interface UserOption {
  id: number;
  name: string;
}

// Strip undefined values so JSON.stringify doesn't produce nulls for missing fields.
function removeUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj).filter(([_, v]) => v !== undefined)
  );
}

const defaultCustomerInfo: CustomerInfo = {
  customerName: "", refNo: "", jobCardNo: "", date: new Date().toISOString().split("T")[0],
  customerCode: "", attentionOf: "", email: "", contactNo: "", salesArea: "Dubai", engineerName: "",
  equipmentModel: "",
  equipmentBrandDescription: "",
  equipmentPartNo: "",
  equipmentSerialNo: "",
  equipmentYear: "",
  customerLocation: "", siteContact: "", timeIn: "", timeOut: "", reportDate: new Date().toISOString().split("T")[0], customerPoRef: "", complaintIssueDescription: "",
  customerEquipmentId: "", equipmentType: "", meterReading: "", capacityRating: "", controllerPanelModel: "", alarmFaultCode: "", lastServiceDate: "", lastServiceHours: "", oilRefrigerantFuelType: "", dutyCycle: "", warrantyStatus: "", warrantyClaimRef: "", previousJobRef: "", nameplatePhotoRef: "", vibrationReportRef: "",
};

const inputClass = "h-11 w-full rounded-xl";
type Issue = { description: string; symptom: string; occurrence: string; repeatFailure: boolean };
const emptyIssue = (): Issue => ({ description: "", symptom: "", occurrence: "", repeatFailure: false });
const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <details open className="section-card w-full [&_summary]:sticky [&_summary]:top-0 [&_summary]:z-10 [&_summary]:bg-background/95 [&_summary]:py-2">
    <summary className="section-title cursor-pointer list-none">{title}</summary>
    <div className="mt-4">{children}</div>
  </details>
);
const Field = ({ label, children }: { label: string; children: ReactNode }) => <label className="block space-y-1"><span className="field-label">{label}</span>{children}</label>;

// Sends a free-text field through /api/ai/clean-work-description and writes the
// tidied text back. Works with no OPENAI_API_KEY configured: the endpoint falls
// back to local clean-up and returns a note saying so, which we surface.
const AiTidyButton = ({ label, value, onChange }: { label: string; value: string; onChange: (next: string) => void }) => {
  const [busy, setBusy] = useState(false);

  const tidy = async () => {
    if (!value.trim()) {
      toast.info(`Write something in "${label}" first.`);
      return;
    }
    setBusy(true);
    try {
      const res = await apiFetch("/api/ai/clean-work-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: value }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error?.message || payload?.message || "Could not tidy the text");
      const cleaned = String(payload?.data?.cleaned ?? value);
      onChange(cleaned);
      toast.success(cleaned.trim() === value.trim() ? "Already tidy — no changes made." : `Tidied "${label}".`, {
        description: payload?.data?.note,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not tidy the text");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={tidy}
      disabled={busy}
      className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline disabled:opacity-50"
    >
      <Sparkles className="h-3 w-3" /> {busy ? "Tidying…" : "Tidy up"}
    </button>
  );
};

// A textarea with its own tidy-up action. The button sits outside the label so a
// label click focuses the textarea rather than firing the button.
const TidyableField = ({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (next: string) => void; placeholder?: string }) => (
  <div className="space-y-1">
    <Field label={label}>
      <Textarea placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
    </Field>
    <AiTidyButton label={label} value={value} onChange={onChange} />
  </div>
);

const sectionVariants = {
  hidden: { opacity: 0, y: 40, scale: 0.98 },
  visible: (i: number) => ({
    opacity: 1, y: 0, scale: 1,
    transition: { duration: 0.6, delay: i * 0.12, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }
  }),
};

interface JobCardFormProps {
  role?: 'engineer' | 'manager';
  jobId?: number;
  onClose?: () => void;
}

const JobCardForm = ({ role = 'engineer', jobId, onClose }: JobCardFormProps) => {
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo>(defaultCustomerInfo);
  const [serviceType, setServiceType] = useState<ServiceType>("service_contract");
  const [breakdownCallType, setBreakdownCallType] = useState<BreakdownCallType | "">("");
  const [compressorChecklist, setCompressorChecklist] = useState<ChecklistItem[]>(defaultCompressorChecklist);
  const [dryerChecklist, setDryerChecklist] = useState<ChecklistItem[]>(defaultDryerChecklist);
  const [parts, setParts] = useState<PartItem[]>([]);
  const [labor, setLabor] = useState<LaborItem[]>([]);
  const [otherExpenses, setOtherExpenses] = useState(0);
  const [discountPercentage, setDiscountPercentage] = useState(0);
  const [serviceCharge, setServiceCharge] = useState(0);
  const [customerIssues, setCustomerIssues] = useState<Issue[]>([emptyIssue()]);
  const [operatingData, setOperatingData] = useState<Record<string, { before: string; after: string; unit: string; remarks: string }>>({});
  const [findings, setFindings] = useState({ asFoundCondition: "", rootCauseDiagnosis: "", asLeftCondition: "", safetyPermitRef: "", nextVisitRequired: false, nextVisitNotes: "" });
  const [evidence, setEvidence] = useState({ soundFileReference: [] as string[], dbReading: "", photosReference: [] as string[], alarmFaultPhotoReference: "", partsReplaced: "", finalTestResult: "", finalEquipmentStatus: "", quotationRequired: false, safetyCriticalIssue: false, escalatedToTime: "", internalChecklistCompleted: false, mandatoryAttachmentsVerified: false, jobReadyForInvoicing: false });
  const [managerId, setManagerId] = useState<number | null>(null);
  const [managerName, setManagerName] = useState("");
  const [engineerId, setEngineerId] = useState<number | null>(null);
  const [checkingReadiness, setCheckingReadiness] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [isApproved, setIsApproved] = useState(false);
  const [loadingJob, setLoadingJob] = useState(!!jobId);
  const [managers, setManagers] = useState<UserOption[]>([]);
  const [engineers, setEngineers] = useState<UserOption[]>([]);
  const [loadingManagers, setLoadingManagers] = useState(true);
  const [loadingEngineers, setLoadingEngineers] = useState(true);
  const [managersError, setManagersError] = useState<string | null>(null);
  const [engineersError, setEngineersError] = useState<string | null>(null);
  const currentUser = (() => { try { return JSON.parse(localStorage.getItem("user") || "{}"); } catch { return {}; } })();
  const currentUserRole = currentUser?.role || '';
  const currentUserName = currentUser?.name || currentUser?.fullName || "";
  const currentUserId = currentUser?.id;

  // Load existing job data if editing
  useEffect(() => {
    if (jobId) {
      setLoadingJob(true);
      const fetchJobData = async () => {
        try {
          const res = await apiFetch(`/jobs/${jobId}`);
          if (res.ok) {
            const data = await res.json();
            if (data.success && data.data) {
              const jobData = data.data.job;
              const storedJson = (typeof jobData.job_data === 'string' ? JSON.parse(jobData.job_data) : jobData.job_data) || {};
              
              setCustomerInfo({
                customerName: jobData.customer_name || "",
                refNo: jobData.ref_no || "",
                jobCardNo: jobData.job_card_no || "",
                date: jobData.job_date || "",
                customerCode: jobData.customer_code || "",
                attentionOf: jobData.attention_of || "",
                email: jobData.email || "",
                contactNo: jobData.contact_no || "",
                salesArea: jobData.sales_area || "Dubai",
                engineerName: jobData.engineer_name || "",
                equipmentModel: jobData.equipment_model || storedJson.equipment_model || "",
                equipmentBrandDescription: jobData.equipment_brand_description || storedJson.equipment_brand_description || "",
                equipmentPartNo: jobData.equipment_part_no || storedJson.equipment_part_no || "",
                equipmentSerialNo: jobData.equipment_serial_no || storedJson.equipment_serial_no || "",
                equipmentYear: jobData.equipment_year || storedJson.equipment_year || "",
                customerLocation: jobData.customer_location || storedJson.customer_location || "", siteContact: jobData.site_contact || storedJson.site_contact || "", timeIn: jobData.time_in || storedJson.time_in || "", timeOut: jobData.time_out || storedJson.time_out || "", reportDate: jobData.report_date || storedJson.report_date || jobData.job_date || "", customerPoRef: jobData.customer_po_ref || storedJson.customer_po_ref || "", complaintIssueDescription: jobData.complaint_issue_description || storedJson.complaint_issue_description || "",
                customerEquipmentId: jobData.customer_equipment_id || storedJson.customer_equipment_id || "", equipmentType: jobData.equipment_type || storedJson.equipment_type || "", meterReading: String(jobData.meter_reading ?? storedJson.meter_reading ?? ""), capacityRating: jobData.capacity_rating || storedJson.capacity_rating || "", controllerPanelModel: jobData.controller_panel_model || storedJson.controller_panel_model || "", alarmFaultCode: jobData.alarm_fault_code || storedJson.alarm_fault_code || "", lastServiceDate: jobData.last_service_date || storedJson.last_service_date || "", lastServiceHours: String(jobData.last_service_hours ?? storedJson.last_service_hours ?? ""), oilRefrigerantFuelType: jobData.oil_refrigerant_fuel_type || storedJson.oil_refrigerant_fuel_type || "", dutyCycle: jobData.duty_cycle || storedJson.duty_cycle || "", warrantyStatus: jobData.warranty_status || storedJson.warranty_status || "", warrantyClaimRef: jobData.warranty_claim_ref || storedJson.warranty_claim_ref || "", previousJobRef: jobData.previous_job_ref || storedJson.previous_job_ref || "", nameplatePhotoRef: storedJson.nameplatePhotoRef || "", vibrationReportRef: storedJson.vibrationReportRef || "",
              });

              if (Array.isArray(jobData.customer_issues || storedJson.customer_issues)) setCustomerIssues(jobData.customer_issues || storedJson.customer_issues);
              if (jobData.operating_data || storedJson.operating_data) setOperatingData(jobData.operating_data || storedJson.operating_data);
              if (jobData.findings || storedJson.findings) setFindings({ ...findings, ...(jobData.findings || storedJson.findings) });
              if (jobData.evidence || storedJson.evidence) {
                const savedEvidence = jobData.evidence || storedJson.evidence;
                setEvidence({ ...evidence, ...savedEvidence, soundFileReference: Array.isArray(savedEvidence.soundFileReference) ? savedEvidence.soundFileReference : savedEvidence.soundFileReference ? [savedEvidence.soundFileReference] : [], photosReference: Array.isArray(savedEvidence.photosReference) ? savedEvidence.photosReference : savedEvidence.photosReference ? [savedEvidence.photosReference] : [] });
              }

              if (jobData.service_type) setServiceType(jobData.service_type);
              if (jobData.other_expenses) setOtherExpenses(Number(jobData.other_expenses));
              if (jobData.discount_percentage) setDiscountPercentage(Number(jobData.discount_percentage));
              if (jobData.manager_name) setManagerName(jobData.manager_name);
              if (storedJson.service_charge !== undefined && storedJson.service_charge !== null) {
                setServiceCharge(Number(storedJson.service_charge) || 0);
              }
              if (storedJson.breakdown_call_type === "warranty_amc" || storedJson.breakdown_call_type === "chargeable") {
                setBreakdownCallType(storedJson.breakdown_call_type);
              } else if (storedJson.coverage_type === "warranty_amc" || storedJson.coverage_type === "chargeable") {
                setBreakdownCallType(storedJson.coverage_type);
              } else if (jobData.service_type === "breakdown_call") {
                setBreakdownCallType("");
              }

              if (data.data.parts && data.data.parts.length > 0) {
                 setParts(data.data.parts.map((p: ApiPart) => ({
                    id: String(p.id),
                    description: p.part_name,
                    partNumber: p.part_number || "",
                    qty: Number(p.quantity) || 0,
                    unitPrice: Number(p.unit_price) || 0,
                    totalPrice: Number(p.total) || 0,
                 })));
              } else if (storedJson.parts) {
                 setParts(storedJson.parts.map((p: Record<string, unknown>) => ({
                    ...p,
                    qty: Number(p.qty) || 0,
                    unitPrice: Number(p.unitPrice) || 0,
                    totalPrice: Number(p.totalPrice) || 0,
                 })));
              }

              if (data.data.labor && data.data.labor.length > 0) {
                 setLabor(data.data.labor.map((l: ApiLabor) => ({
                    id: String(l.id),
                    description: l.description,
                    hours: Number(l.hours) || 0,
                    ratePerHour: Number(l.rate) || 0,
                    totalCost: Number(l.total) || 0,
                 })));
              } else if (storedJson.labor) {
                 setLabor(storedJson.labor.map((l: Record<string, unknown>) => ({
                    ...l,
                    hours: Number(l.hours) || 0,
                    ratePerHour: Number(l.ratePerHour) || 0,
                    totalCost: Number(l.totalCost) || 0,
                 })));
              }

              if (storedJson.compressor_checklist) setCompressorChecklist(storedJson.compressor_checklist);
              if (storedJson.dryer_checklist) setDryerChecklist(storedJson.dryer_checklist);
              
              if (jobData.status?.toUpperCase() === "APPROVED") setIsApproved(true);
              if (jobData.manager_id) setManagerId(Number(jobData.manager_id));
              if (jobData.engineer_id) setEngineerId(Number(jobData.engineer_id));
              if (jobData.manager_name) setManagerName(jobData.manager_name);
              setLoadingJob(false);
              return;
            }
          }
        } catch (e) {
          console.error("Failed to load from backend API, falling back to local storage:", e);
        }

        // Fallback to local mockJobs if API failed or no job found
        try {
          const jobs = JSON.parse(localStorage.getItem('mockJobs') || '[]');
          const existingJob = jobs.find((j: ApiJob) => String(j.id) === String(jobId));
          if (existingJob) {
            if (existingJob.customerInfo) setCustomerInfo(existingJob.customerInfo);
            else setCustomerInfo(prev => ({ 
              ...prev, 
              customerName: existingJob.customer_name || "",
              jobCardNo: existingJob.job_card_no || prev.jobCardNo,
              date: existingJob.job_date || prev.date
            }));

            if (existingJob.parts) setParts(existingJob.parts);
            if (existingJob.labor) setLabor(existingJob.labor);
            if (existingJob.compressorChecklist) setCompressorChecklist(existingJob.compressorChecklist);
            if (existingJob.dryerChecklist) setDryerChecklist(existingJob.dryerChecklist);
            if (existingJob.managerName) setManagerName(existingJob.managerName);
            if (existingJob.manager_name) setManagerName(existingJob.manager_name);
            if (existingJob.status?.toUpperCase() === "APPROVED") setIsApproved(true);
            if (existingJob.service_type) setServiceType(existingJob.service_type);
            else if (existingJob.serviceType) setServiceType(existingJob.serviceType);
            if (existingJob.breakdown_call_type) setBreakdownCallType(existingJob.breakdown_call_type);
            else if (existingJob.breakdownCallType) setBreakdownCallType(existingJob.breakdownCallType);
            else if (existingJob.coverage_type) setBreakdownCallType(existingJob.coverage_type);
            else if (existingJob.coverageType) setBreakdownCallType(existingJob.coverageType);
          }
        } catch (e) {
          console.error("Failed to load mock job", e);
        } finally {
          setLoadingJob(false);
        }
      };

      fetchJobData();
    }
    // Intentionally keyed on jobId alone. `findings` and `evidence` are read while
    // merging the fetched record; including them would refetch the job on every
    // keystroke in those fields.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  useEffect(() => {
    if (role === 'engineer' && currentUserRole === 'engineer') {
      setEngineerId(currentUserId ?? null);
      setCustomerInfo((prev) => ({
        ...prev,
        engineerName: prev.engineerName || currentUserName,
      }));
    }

    const fetchList = async (
      path: string,
      setItems: Dispatch<SetStateAction<UserOption[]>>,
      setLoading: Dispatch<SetStateAction<boolean>>,
      setError: Dispatch<SetStateAction<string | null>>
    ) => {
      setLoading(true);
      setError(null);

      try {
        const response = await apiFetch(path);
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.error?.message || data?.message || "Failed to load selection list");
        }
        const items = Array.isArray(data.data) ? data.data : [];
        const normalized = items.map((item: Record<string, unknown>) => ({
          id: Number(item?.id ?? item?.user_id ?? 0),
          name: String(item?.name ?? item?.full_name ?? item?.username ?? item?.email ?? item?.label ?? item?.title ?? "").trim(),
        })).filter((item: UserOption) => item.id > 0 && item.name);
        setItems(normalized);
      } catch (error) {
        console.error(`Failed to load ${path}:`, error);
        setItems([]);
        setError("Unable to load options");
      } finally {
        setLoading(false);
      }
    };

    fetchList("/users/managers", setManagers, setLoadingManagers, setManagersError);
    fetchList("/users/engineers", setEngineers, setLoadingEngineers, setEngineersError);
    // Mount-only by design: the manager and engineer lists do not change while the
    // form is open, and the current-user values are read once from localStorage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (managerId !== null && managers.length > 0) {
      const match = managers.find((item) => item.id === managerId);
      if (match) setManagerName(match.name);
    }
  }, [managerId, managers]);

  useEffect(() => {
    if (managerId === null && managerName && managers.length > 0) {
      const match = managers.find((item) => item.name === managerName);
      if (match) setManagerId(match.id);
    }
  }, [managerId, managerName, managers]);

  useEffect(() => {
    if (engineerId !== null && engineers.length > 0) {
      const match = engineers.find((item) => item.id === engineerId);
      if (match) setCustomerInfo((prev) => ({ ...prev, engineerName: match.name }));
    }
  }, [engineerId, engineers]);

  useEffect(() => {
    if (engineerId === null && customerInfo.engineerName && engineers.length > 0) {
      const match = engineers.find((item) => item.name === customerInfo.engineerName);
      if (match) setEngineerId(match.id);
    }
  }, [engineerId, customerInfo.engineerName, engineers]);



  // Track overall progress
  const totalChecklist = compressorChecklist.length + dryerChecklist.length;
  const doneChecklist = compressorChecklist.filter(i => i.status === 'done').length + dryerChecklist.filter(i => i.status === 'done').length;
  const overallProgress = totalChecklist > 0 ? Math.round((doneChecklist / totalChecklist) * 100) : 0;

  const completionSteps = useMemo(() => {
    let steps = 0;
    if (customerInfo.customerName) steps++;
    if (customerInfo.jobCardNo) steps++;
    if (customerInfo.date) steps++;
    if (doneChecklist > 0) steps++;
    if (parts.length > 0) steps++;
    return steps;
  }, [customerInfo, doneChecklist, parts.length]);

  const computedServiceCharge = serviceType === "warranty"
    ? 0
    : (serviceType === "breakdown_call" && breakdownCallType === "warranty_amc")
      ? 0
      : customerInfo.salesArea === "Abu Dhabi Variable"
        ? serviceCharge
        : SERVICE_CHARGE_MAP[customerInfo.salesArea] || 0;

  const getFormData = (): JobCardData => ({
    customerInfo,
    serviceType,
    breakdownCallType: serviceType === "breakdown_call" ? (breakdownCallType || undefined) : undefined,
    compressorChecklist,
    dryerChecklist,
    parts,
    labor,
    otherExpenses,
    discountPercentage,
    managerName,
    managerId: managerId ?? undefined,
    engineerId: engineerId ?? undefined,
    serviceCharge: computedServiceCharge,
  });

  // ─── MANDATORY CUSTOMER INFORMATION VALIDATION ───
  const validateCustomerInfo = (): boolean => {
    // Required fields: Customer Name, Ref No, Job Card No, Date, Purpose of Visit, Customer Code, 
    // Attention Of, Contact No, Engineer Name, Sales Area, Manager Name
    
    if (!customerInfo.customerName?.trim()) { 
      toast.error("Customer Name is required"); 
      return false; 
    }
    if (!customerInfo.refNo?.trim()) { 
      toast.error("Ref No is required"); 
      return false; 
    }
    if (!customerInfo.jobCardNo?.trim()) { 
      toast.error("Job Card No is required"); 
      return false; 
    }
    if (!customerInfo.date?.trim()) { 
      toast.error("Date is required"); 
      return false; 
    }
    if (!serviceType) { 
      toast.error("Purpose of Visit (Service Type) is required"); 
      return false; 
    }
    if (!customerInfo.customerCode?.trim()) { 
      toast.error("Customer Code is required"); 
      return false; 
    }
    if (!customerInfo.attentionOf?.trim()) { 
      toast.error("Attention Of is required"); 
      return false; 
    }
    if (!customerInfo.contactNo?.trim()) { 
      toast.error("Contact No is required"); 
      return false; 
    }
    if (!customerInfo.engineerName?.trim()) { 
      toast.error("Service Engineer is required"); 
      return false; 
    }
    if (!customerInfo.salesArea?.trim()) { 
      toast.error("Sales Area is required"); 
      return false; 
    }
    if (!managerName?.trim()) { 
      toast.error("Manager Name is required"); 
      return false; 
    }
    
    return true;
  };

  // ─── MANDATORY EQUIPMENT DETAILS VALIDATION ───
  const validateEquipment = (): boolean => {
    // Required: Equipment Model, Brand Description, Part No, Serial No, Year
    
    if (!customerInfo.equipmentModel?.trim()) { 
      toast.error("Equipment Model is required"); 
      return false; 
    }
    if (!customerInfo.equipmentBrandDescription?.trim()) { 
      toast.error("Brand Description is required"); 
      return false; 
    }
    if (!customerInfo.equipmentPartNo?.trim()) { 
      toast.error("Equipment Part No is required"); 
      return false; 
    }
    if (!customerInfo.equipmentSerialNo?.trim()) { 
      toast.error("Equipment Serial No is required"); 
      return false; 
    }
    if (!customerInfo.equipmentYear?.trim()) { 
      toast.error("Equipment Year is required"); 
      return false; 
    }
    
    return true;
  };

  // ─── CHECKLIST VALIDATION ───
  const validateChecklist = (): boolean => {
    const allowedStatuses = new Set(["done", "na", "pending"]);

    if (!Array.isArray(compressorChecklist) || compressorChecklist.length === 0) {
      toast.error("Checklist status is required for all compressor items.");
      return false;
    }
    if (!Array.isArray(dryerChecklist) || dryerChecklist.length === 0) {
      toast.error("Checklist status is required for all dryer items.");
      return false;
    }

    const invalidCompressor = compressorChecklist.filter(
      (item) => !allowedStatuses.has(String(item?.status ?? "").trim().toLowerCase())
    );
    const invalidDryer = dryerChecklist.filter(
      (item) => !allowedStatuses.has(String(item?.status ?? "").trim().toLowerCase())
    );

    if (invalidCompressor.length > 0 || invalidDryer.length > 0) {
      toast.error("Checklist contains invalid status values.");
      return false;
    }
    
    return true;
  };

  // ─── PARTS VALIDATION ───
  const validateParts = (): boolean => {
    if (!Array.isArray(parts) || parts.length === 0) {
      toast.error("At least one part is required.");
      return false;
    }

    // For each part: Description, Number, Quantity > 0
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!part.description?.trim()) {
        toast.error(`Part ${i + 1}: Description is required`);
        return false;
      }
      if (!part.partNumber?.trim()) {
        toast.error(`Part ${i + 1}: Part Number is required`);
        return false;
      }
      if (!part.qty || Number(part.qty) <= 0) {
        toast.error(`Part ${i + 1}: Quantity must be greater than 0`);
        return false;
      }
    }
    return true;
  };

  // ─── LABOR VALIDATION ───
  const validateLabor = (): boolean => {
    if (!Array.isArray(labor) || labor.length === 0) {
      toast.error("At least one labor entry is required.");
      return false;
    }

    // For each labor: Hours > 0 (Description is optional)
    for (let i = 0; i < labor.length; i++) {
      const item = labor[i];
      if (!item.hours || Number(item.hours) <= 0) {
        toast.error(`Labor ${i + 1}: Hours must be greater than 0`);
        return false;
      }
    }
    return true;
  };

  // ─── MAIN VALIDATION FUNCTION ───
  const validate = (): boolean => {
    // Validate customer info (all required)
    if (!validateCustomerInfo()) return false;
    
    // Validate equipment details (all required)
    if (!validateEquipment()) return false;
    
    // Validate checklists (all items must have status)
    if (!validateChecklist()) return false;
    
    // Validate parts (at least one row required)
    if (!validateParts()) return false;
    
    // Validate labor (at least one row required)
    if (!validateLabor()) return false;
    
    // Validate Service Type for breakdown calls
    if (serviceType === "breakdown_call" && !breakdownCallType) {
      toast.error("Breakdown Call Type is required for Breakdown Call.");
      return false;
    }
    
    // Validate Service Charge for Abu Dhabi Variable
    const isWarranty = serviceType === "warranty" || (serviceType === "breakdown_call" && breakdownCallType === "warranty_amc");
    const showManualServiceChargeOverride = role === "manager" && !isWarranty && customerInfo.salesArea === "Abu Dhabi Variable";
    if (showManualServiceChargeOverride) {
      if (Number.isNaN(serviceCharge) || serviceCharge < 0) {
        toast.error("Please enter a valid manual service charge.");
        return false;
      }
    }
    
    return true;
  };

  const validatePricing = (): boolean => {
    if (parts.length === 0 && labor.length === 0) {
      toast.error("Please add at least one part or labor entry with a price before approving.");
      return false;
    }
    const unpricedParts = parts.filter(p => !Number(p.unitPrice));
    if (unpricedParts.length > 0) {
      toast.error(`${unpricedParts.length} part(s) have no unit price set. Please fill in all highlighted price fields.`);
      return false;
    }
    const unpricedLabor = labor.filter(l => !Number(l.ratePerHour));
    if (unpricedLabor.length > 0) {
      toast.error(`${unpricedLabor.length} labor entr(ies) have no rate set. Please fill in all highlighted rate fields.`);
      return false;
    }
    if (serviceType === "breakdown_call" && !breakdownCallType) {
      toast.error("Breakdown Call Type is required for Breakdown Call.");
      return false;
    }
    const isWarranty = serviceType === "warranty" || (serviceType === "breakdown_call" && breakdownCallType === "warranty_amc");
    const showManualServiceChargeOverride = role === "manager" && !isWarranty && customerInfo.salesArea === "Abu Dhabi Variable";
    if (showManualServiceChargeOverride) {
      if (Number.isNaN(serviceCharge) || serviceCharge < 0) {
        toast.error("Please enter a valid manual service charge.");
        return false;
      }
    }
    return true;
  };

  const handleExportPDF = async () => {
    if (!validate()) return;
    if (!managerName) {
      toast.warning("No manager selected — please pick a Manager Name in the Customer Info section before exporting.");
      return;
    }
    toast.info("Generating PDF...", { icon: <Sparkles className="h-4 w-4 animate-spin" /> });
    try {
      await generatePDF(getFormData());
      toast.success("PDF report generated successfully!", { icon: <FileText className="h-4 w-4" /> });
    } catch (e) {
      console.error(e);
      toast.error("Failed to generate PDF");
    }
  };

  const handleExportExcel = () => {
    if (!validate()) return;
    generateExcel(getFormData());
    toast.success("Excel report exported successfully!", { icon: <FileSpreadsheet className="h-4 w-4" /> });
  };

  // Asks the server whether this job is ready for a signed PDF, and says what is
  // missing if not. Needs a saved job, since the check reads the stored record.
  const handleCheckReadiness = async () => {
    if (!jobId) {
      toast.info("Save the job first — the readiness check reads the saved record.");
      return;
    }
    setCheckingReadiness(true);
    try {
      const res = await apiFetch(`/api/ai/pdf-readiness/${jobId}`);
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error?.message || payload?.message || "Readiness check failed");
      const { ready, reason, recommendation, note } = payload.data ?? {};
      const description = [reason, recommendation, note].filter(Boolean).join(" ");
      if (ready) {
        toast.success("Ready for a signed PDF.", { description });
      } else {
        toast.warning("Not ready for a signed PDF yet.", { description });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Readiness check failed");
    } finally {
      setCheckingReadiness(false);
    }
  };

  // Save Function For Calling API
  const handleSaveJob = async () => {
    if (!validate()) return;
    if (role === 'manager' && !validatePricing()) return;

    // CALCULATE PRICING
    const computedServiceCharge = serviceType === "warranty"
      ? 0
      : (serviceType === "breakdown_call" && breakdownCallType === "warranty_amc")
        ? 0
        : customerInfo.salesArea === "Abu Dhabi Variable"
          ? serviceCharge
          : SERVICE_CHARGE_MAP[customerInfo.salesArea] || 0;

    const pricingSummary = computePricingSummary({
      parts: parts.map((item) => ({
        ...item,
        totalPrice: Number(item.qty || 0) * Number(item.unitPrice || 0),
      })),
      labor: labor.map((item) => ({
        ...item,
        totalCost: Number(item.hours || 0) * Number(item.ratePerHour || 0),
      })),
      otherExpenses: Number(otherExpenses) || 0,
      serviceCharge: computedServiceCharge,
      discountPercentage: Number(discountPercentage) || 0,
    });

    const { partsTotal, laborTotal, discount, totalAfterDiscount, vat, grandTotal } = pricingSummary;
    const vatPercent = 5;
    const taxableAmount = totalAfterDiscount;

    try {
      // IF job exists, skip POST /jobs and just trigger pricing and status,
      // as the backend handles upserting pricing and updating status safely
      let effectiveJobId = jobId;

      // Sanitize parts — coerce numerics, strip undefined
      const sanitizedParts = (parts || []).map((p) => removeUndefined({
        id: p.id,
        description: p.description || "",
        partNumber: p.partNumber || undefined,
        qty: Number(p.qty) || 0,
        unitPrice: Number(p.unitPrice) || 0,
        totalPrice: Number(p.qty || 0) * Number(p.unitPrice || 0),
      }));

      // Sanitize labor — coerce numerics, strip undefined
      const sanitizedLabor = (labor || []).map((l) => removeUndefined({
        id: l.id,
        description: l.description || "",
        hours: Number(l.hours) || 0,
        ratePerHour: Number(l.ratePerHour) || 0,
        totalCost: Number(l.hours || 0) * Number(l.ratePerHour || 0),
      }));

      // Build sanitized payload — strictly match Zod schema, put extras in job_data
      const jobPayload = removeUndefined({
        customer_name: customerInfo.customerName,
        equipment_name: "Compressor",
        equipment_model: customerInfo.equipmentModel || undefined,
        equipment_brand_description: customerInfo.equipmentBrandDescription || undefined,
        equipment_part_no: customerInfo.equipmentPartNo || undefined,
        equipment_serial_no: customerInfo.equipmentSerialNo || undefined,
        equipment_year: customerInfo.equipmentYear || undefined,
        job_card_no: customerInfo.jobCardNo || undefined,
        job_date: customerInfo.date || undefined,
        ref_no: customerInfo.refNo || undefined,
        sales_area: customerInfo.salesArea || undefined,
        service_type: serviceType || undefined,

        customer_code: customerInfo.customerCode || undefined,
        attention_of: customerInfo.attentionOf || undefined,
        email: customerInfo.email || undefined,
        contact_no: customerInfo.contactNo || undefined,
        customer_location: customerInfo.customerLocation || undefined, site_contact: customerInfo.siteContact || undefined, time_in: customerInfo.timeIn || undefined, time_out: customerInfo.timeOut || undefined, report_date: customerInfo.reportDate || undefined, customer_po_ref: customerInfo.customerPoRef || undefined, complaint_issue_description: customerInfo.complaintIssueDescription || undefined,
        customer_equipment_id: customerInfo.customerEquipmentId || undefined, equipment_type: customerInfo.equipmentType || undefined, meter_reading: customerInfo.meterReading ? Number(customerInfo.meterReading) : undefined, capacity_rating: customerInfo.capacityRating || undefined, controller_panel_model: customerInfo.controllerPanelModel || undefined, alarm_fault_code: customerInfo.alarmFaultCode || undefined, last_service_date: customerInfo.lastServiceDate || undefined, last_service_hours: customerInfo.lastServiceHours ? Number(customerInfo.lastServiceHours) : undefined, oil_refrigerant_fuel_type: customerInfo.oilRefrigerantFuelType || undefined, duty_cycle: customerInfo.dutyCycle || undefined, warranty_status: customerInfo.warrantyStatus || undefined, warranty_claim_ref: customerInfo.warrantyClaimRef || undefined, previous_job_ref: customerInfo.previousJobRef || undefined,
        customer_issues: customerIssues, operating_data: operatingData, findings, evidence,
        other_expenses: Number(otherExpenses) || 0,
        discount_percentage: Number(discountPercentage) || 0,
        manager_id: managerId ?? undefined,
        engineer_id: engineerId ?? undefined,
        parts: sanitizedParts,
        labor: sanitizedLabor,
        job_data: {
          engineer_name: customerInfo.engineerName || "",
          manager_name: managerName || "",
          compressor_checklist: compressorChecklist || [],
          dryer_checklist: dryerChecklist || [],
          breakdown_call_type: serviceType === "breakdown_call" ? breakdownCallType : undefined,
          service_charge: computedServiceCharge,
          customer_issues: customerIssues,
          operating_data: operatingData,
          findings,
          evidence,
          nameplatePhotoRef: customerInfo.nameplatePhotoRef,
          vibrationReportRef: customerInfo.vibrationReportRef,
        }
      });

      console.log("FINAL PAYLOAD:", JSON.stringify(jobPayload, null, 2));

      if (!effectiveJobId) {
        // CREATE NEW JOB
        const response = await apiFetch("/jobs", {
          method: "POST",
          body: JSON.stringify(jobPayload),
        });

        const resData = await response.json();
        console.log("Backend response (create):", resData);

        if (!response.ok) {
          if (resData?.error?.details) console.error("Validation details:", resData.error.details);
          toast.error(normalizeApiError(resData, "Failed to save job"));
          return;
        }

        effectiveJobId = resData.data?.job?.id || resData.data?.id || resData.id;
      } else {
        // UPDATE EXISTING JOB
        const response = await apiFetch(`/jobs/${effectiveJobId}`, {
          method: "PUT",
          body: JSON.stringify(jobPayload),
        });

        const resData = await response.json();
        console.log("Backend response (update):", resData);

        if (!response.ok) {
          if (resData?.error?.details) console.error("Validation details:", resData.error.details);
          toast.error(normalizeApiError(resData, "Failed to save job"));
          return;
        }
      }

      if (role !== 'manager') {
        toast.success("Job Card Saved Successfully and Submitted for Manager Review.");
        window.dispatchEvent(new Event('jobsUpdated'));
        return;
      }

      // SAVE PRICING
      const pricingRes = await apiFetch(`/jobs/${effectiveJobId}/pricing`, {
        method: "POST",
        body: JSON.stringify({
          labour_rate: 0,
          service_charge: computedServiceCharge,
          discount: discount,
          vat_percent: vatPercent,
          parts_total: partsTotal,
          labour_total: laborTotal,
          taxable_amount: taxableAmount,
          vat_amount: vat,
          grand_total: grandTotal
        }),
      });

      const pricingData = await pricingRes.json();
      console.log("Backend response (pricing):", pricingData);

      if (!pricingRes.ok) {
        if (pricingData?.error?.details) console.error("Pricing validation details:", pricingData.error.details);
        toast.error(normalizeApiError(pricingData));
        return;
      }

      if (role === 'manager' && !isApproved) {
          // UPDATE STATUS TO APPROVED IN BACKEND
          const statusRes = await apiFetch(`/jobs/${effectiveJobId}/status`, {
            method: "PUT",
            body: JSON.stringify({ status: "APPROVED" }),
          });

          const statusData = await statusRes.json();
          console.log("Backend response (status):", statusData);

          if (!statusRes.ok) {
            if (statusData?.error?.details) console.error("Status validation details:", statusData.error.details);
            toast.error(normalizeApiError(statusData));
            return;
          }

          setIsApproved(true);
      }

      toast.success("Job + Pricing saved to database ✅");
      window.dispatchEvent(new Event('jobsUpdated'));
    } catch (error) {
      console.error("Save failed:", error);
      const message = error instanceof Error ? error.message : "Failed to save job";
      toast.error(`Save failed: ${message}`);
    }
  };

  // Scroll handler
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setShowScrollTop(e.currentTarget.scrollTop > 400);
  };

  const scrollToTop = () => {
    document.querySelector('main')?.scrollIntoView({ behavior: 'smooth' });
  };

  if (loadingJob) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="h-10 w-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-muted-foreground font-medium text-sm">Loading job data...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" onScroll={handleScroll}>
      {/* Animated background orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="floating-orb w-[500px] h-[500px] -top-48 -right-48 opacity-[0.04]"
          style={{ background: "hsl(var(--primary))" }} />
        <div className="floating-orb w-[400px] h-[400px] top-1/3 -left-48 opacity-[0.03]"
          style={{ background: "hsl(var(--primary-glow))", animationDelay: "-7s" }} />
        <div className="floating-orb w-[300px] h-[300px] bottom-20 right-1/4 opacity-[0.025]"
          style={{ background: "hsl(var(--accent))", animationDelay: "-14s" }} />
      </div>

      {/* Header */}
      <header className="glass-header">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="flex items-center gap-3"
          >
            <motion.div
              className="h-10 w-10 sm:h-11 sm:w-11 rounded-2xl flex items-center justify-center btn-primary-gradient flex-shrink-0"
              whileHover={{ rotate: -5, scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
            >
              <ClipboardList className="h-5 w-5 text-primary-foreground" />
            </motion.div>
            <div>
              <h1 className="text-base sm:text-lg font-display font-extrabold tracking-tight whitespace-nowrap">Field Service Report</h1>
              <p className="text-[0.7rem] text-muted-foreground font-medium tracking-wide uppercase">Job Card Management</p>
            </div>
          </motion.div>

          {/* Progress indicator in header */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="hidden md:flex items-center gap-3"
          >
            <div className="flex items-center gap-1.5">
              {[0, 1, 2, 3, 4].map((step) => (
                <motion.div
                  key={step}
                  className={`h-2 rounded-full transition-all duration-500 ${step < completionSteps ? 'w-6' : 'w-2'}`}
                  style={{
                    background: step < completionSteps ? 'var(--gradient-primary)' : 'hsl(var(--muted))',
                  }}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.4 + step * 0.1 }}
                />
              ))}
            </div>
            <span className="text-[0.65rem] font-bold text-muted-foreground">{completionSteps}/5</span>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="flex gap-2.5 self-end sm:self-center"
          >
            {role === 'manager' && isApproved && (
              <>
                <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                  <Button onClick={handleExportPDF} className="gap-2 btn-primary-gradient border-0 rounded-xl px-5" size="sm">
                    <FileText className="h-4 w-4" /> Export PDF
                  </Button>
                </motion.div>
                <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                  <Button onClick={handleExportExcel} variant="outline" className="gap-2 rounded-xl px-5 border-border/80 hover:bg-secondary" size="sm">
                    <FileSpreadsheet className="h-4 w-4" /> Export Excel
                  </Button>
                </motion.div>
              </>
            )}
          </motion.div>
        </div>

        {/* Overall progress bar */}
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="h-0.5 bg-muted/50 rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              style={{ background: "var(--gradient-primary)" }}
              initial={{ width: 0 }}
              animate={{ width: `${overallProgress}%` }}
              transition={{ duration: 1, ease: "easeOut" }}
            />
          </div>
        </div>
      </header>

      {/* Form Content */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6 relative">
        <motion.div custom={0} variants={sectionVariants} initial="hidden" animate="visible">
          <CustomerInfoSection
            data={customerInfo}
            serviceType={serviceType}
            breakdownCallType={breakdownCallType}
            onChange={setCustomerInfo}
            onServiceTypeChange={(type) => {
              setServiceType(type);
              if (type !== "breakdown_call") {
                setBreakdownCallType("");
              }
            }}
            onBreakdownCallTypeChange={setBreakdownCallType}
            managerName={managerName}
            managerId={managerId}
            engineerId={engineerId}
            managerOptions={managers}
            engineerOptions={engineers}
            managersLoading={loadingManagers}
            engineersLoading={loadingEngineers}
            managersError={managersError}
            engineersError={engineersError}
            engineerReadOnly={currentUserRole === 'engineer' && role === 'engineer'}
            onManagerChange={(id, name) => {
              setManagerId(id);
              setManagerName(name);
            }}
            onEngineerChange={(id, name) => {
              if (currentUserRole === 'engineer' && role === 'engineer') return;
              setEngineerId(id);
              setCustomerInfo((prev) => ({ ...prev, engineerName: name }));
            }}
          />
        </motion.div>

        <motion.div custom={1} variants={sectionVariants} initial="hidden" animate="visible">
          <EquipmentDetailsSection
            data={customerInfo}
            onChange={setCustomerInfo}
          />
        </motion.div>

        <Section title="Customer Raised Issues">
          <div className="space-y-4">{customerIssues.map((issue, index) => <div key={index} className="rounded-xl border p-3 space-y-3">
            <div className="flex items-center justify-between"><strong className="text-sm">Issue {index + 1}</strong>{customerIssues.length > 1 && <Button type="button" variant="ghost" size="icon" onClick={() => setCustomerIssues(customerIssues.filter((_, i) => i !== index))}><Trash2 className="h-4 w-4" /></Button>}</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><Field label="Issue description"><Input className={inputClass} value={issue.description} onChange={(e) => setCustomerIssues(customerIssues.map((x, i) => i === index ? { ...x, description: e.target.value } : x))} /></Field><Field label="Observed Symptom"><Input className={inputClass} value={issue.symptom} onChange={(e) => setCustomerIssues(customerIssues.map((x, i) => i === index ? { ...x, symptom: e.target.value } : x))} /></Field><Field label="When does fault occur"><Input className={inputClass} value={issue.occurrence} onChange={(e) => setCustomerIssues(customerIssues.map((x, i) => i === index ? { ...x, occurrence: e.target.value } : x))} /></Field><label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5" checked={issue.repeatFailure} onChange={(e) => setCustomerIssues(customerIssues.map((x, i) => i === index ? { ...x, repeatFailure: e.target.checked } : x))} /> Repeat Failure: Yes</label></div>
          </div>)}{customerIssues.length < 3 && <Button type="button" variant="outline" className="min-h-11 w-full sm:w-auto" onClick={() => setCustomerIssues([...customerIssues, emptyIssue()])}><Plus className="h-4 w-4" /> Add Issue</Button>}</div>
        </Section>

        <motion.div custom={2} variants={sectionVariants} initial="hidden" animate="visible">
          <ChecklistSection
            title="Screw Air Compressor Checklist"
            items={compressorChecklist}
            onChange={setCompressorChecklist}
            delay={0.15}
          />
        </motion.div>

        <motion.div custom={3} variants={sectionVariants} initial="hidden" animate="visible">
          <ChecklistSection
            title="Air Dryer Checklist"
            items={dryerChecklist}
            onChange={setDryerChecklist}
            delay={0.2}
          />
        </motion.div>

        <Section title="Job Findings & Diagnosis"><div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><TidyableField label="As Found Condition / Complaint" value={findings.asFoundCondition} onChange={(next) => setFindings({ ...findings, asFoundCondition: next })} /><TidyableField label="Root Cause / Diagnosis" value={findings.rootCauseDiagnosis} onChange={(next) => setFindings({ ...findings, rootCauseDiagnosis: next })} /><TidyableField label="As Left Condition" value={findings.asLeftCondition} onChange={(next) => setFindings({ ...findings, asLeftCondition: next })} /><Field label="Safety / Permit Ref — LOTO or Hot Work Permit No."><Input className={inputClass} value={findings.safetyPermitRef} onChange={(e) => setFindings({ ...findings, safetyPermitRef: e.target.value })} /></Field><label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5" checked={findings.nextVisitRequired} onChange={(e) => setFindings({ ...findings, nextVisitRequired: e.target.checked })} /> Next Visit Required: Yes</label>{findings.nextVisitRequired && <Field label="Next Visit Notes"><Textarea placeholder="Notes for the next visit" value={findings.nextVisitNotes} onChange={(e) => setFindings({ ...findings, nextVisitNotes: e.target.value })} /></Field>}</div></Section>

        <Section title="Operating Data"><div className="space-y-3">{["Running Hours", "Load Hours / Duty Cycle", "Discharge Pressure", "Discharge Temperature", "Voltage L1 / L2 / L3", "Current L1 / L2 / L3"].map((parameter) => { const row = operatingData[parameter] || { before: "", after: "", unit: "", remarks: "" }; const setRow = (key: keyof typeof row, value: string) => setOperatingData({ ...operatingData, [parameter]: { ...row, [key]: value } }); return <div key={parameter} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 rounded-lg border p-3"><strong className="text-sm lg:col-span-1">{parameter}</strong><Input className={inputClass} type="number" inputMode="decimal" min={0} step={0.01} placeholder="Before" value={row.before} onChange={(e) => setRow("before", e.target.value)} /><Input className={inputClass} type="number" inputMode="decimal" min={0} step={0.01} placeholder="After" value={row.after} onChange={(e) => setRow("after", e.target.value)} /><Input className={inputClass} placeholder="Unit / N/A" value={row.unit} onChange={(e) => setRow("unit", e.target.value)} /><Input className={inputClass} placeholder="Remarks" value={row.remarks} onChange={(e) => setRow("remarks", e.target.value)} /></div>; })}</div></Section>

        <motion.div custom={4} variants={sectionVariants} initial="hidden" animate="visible">
          <PartsLaborSection
            parts={parts}
            labor={labor}
            onPartsChange={setParts}
            onLaborChange={setLabor}
            role={role}
          />
        </motion.div>

        {role === 'manager' && (
          <motion.div custom={5} variants={sectionVariants} initial="hidden" animate="visible">
            <CostingSection
              parts={parts}
              labor={labor}
              otherExpenses={otherExpenses}
              onOtherExpensesChange={setOtherExpenses}
              discountPercentage={discountPercentage}
              onDiscountChange={setDiscountPercentage}
              salesArea={customerInfo.salesArea}
              serviceType={serviceType}
              breakdownCallType={breakdownCallType || undefined}
              serviceCharge={computedServiceCharge}
              onServiceChargeChange={setServiceCharge}
              role={role}
            />
          </motion.div>
        )}

        <Section title="Mandatory Evidence & Job Closure"><div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><FileUploadField label="Sound File" accept="audio/*" value={evidence.soundFileReference} onChange={(files) => setEvidence({ ...evidence, soundFileReference: files })} /><Field label="dB Reading"><Input className={inputClass} type="number" inputMode="numeric" min={0} step={1} value={evidence.dbReading} onChange={(e) => setEvidence({ ...evidence, dbReading: e.target.value })} /></Field><FileUploadField label={`Before, After & Nameplate Photos (Mandatory) — ${evidence.photosReference.length} photos uploaded`} accept="image/*" multiple value={evidence.photosReference} onChange={(files) => setEvidence({ ...evidence, photosReference: files })} /><Field label="Parts Replaced"><Textarea value={evidence.partsReplaced} onChange={(e) => setEvidence({ ...evidence, partsReplaced: e.target.value })} /></Field><Field label="Final Test Run result"><Select value={evidence.finalTestResult} onValueChange={(v) => setEvidence({ ...evidence, finalTestResult: v })}><SelectTrigger className={inputClass}><SelectValue placeholder="Select result" /></SelectTrigger><SelectContent>{["Pass", "Fail", "Temporary Fix", "N/A"].map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select></Field><Field label="Final Equipment Status"><Select value={evidence.finalEquipmentStatus} onValueChange={(v) => setEvidence({ ...evidence, finalEquipmentStatus: v })}><SelectTrigger className={inputClass}><SelectValue placeholder="Select status" /></SelectTrigger><SelectContent>{["Fully Operational", "Temporarily Operational", "Stopped", "Pending Parts", "Further Diagnosis Required"].map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select></Field><label className="flex min-h-11 items-center gap-2"><input type="checkbox" className="h-5 w-5" checked={evidence.quotationRequired} onChange={(e) => setEvidence({ ...evidence, quotationRequired: e.target.checked })} /> Quotation Required: Yes</label><label className="flex min-h-11 items-center gap-2"><input type="checkbox" className="h-5 w-5" checked={evidence.safetyCriticalIssue} onChange={(e) => setEvidence({ ...evidence, safetyCriticalIssue: e.target.checked })} /> Safety Critical Issue Found: Yes</label>{evidence.safetyCriticalIssue && <Field label="Escalated To / Time"><Input className={inputClass} value={evidence.escalatedToTime} onChange={(e) => setEvidence({ ...evidence, escalatedToTime: e.target.value })} /></Field>}</div><div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">{([["internalChecklistCompleted", "Internal checklist completed"], ["mandatoryAttachmentsVerified", "Mandatory attachments verified"], ["jobReadyForInvoicing", "Job ready for invoicing"]] as const).map(([key, label]) => <label key={key} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5" checked={evidence[key]} onChange={(e) => setEvidence({ ...evidence, [key]: e.target.checked })} /> {label}</label>)}</div></Section>

        <div className="section-card -mt-4">
          <FileUploadField label="Alarm / Fault Code Photo" accept="image/*" value={evidence.alarmFaultPhotoReference ? [evidence.alarmFaultPhotoReference] : []} onChange={(files) => setEvidence({ ...evidence, alarmFaultPhotoReference: files[0] || "" })} />
        </div>

        {/* Bottom Actions */}
        <motion.div
          custom={6}
          variants={sectionVariants}
          initial="hidden"
          animate="visible"
          className="flex flex-col sm:flex-row gap-3 justify-center pb-12 pt-4"
        >
          {onClose && (
            <motion.div whileHover={{ scale: 1.04, y: -2 }} whileTap={{ scale: 0.97 }}>
              <Button onClick={onClose} variant="ghost" size="lg" className="rounded-2xl px-6 h-12 text-sm font-bold w-full sm:w-auto border border-border/60 hover:bg-slate-100">
                ← Back to List
              </Button>
            </motion.div>
          )}

          {/* Engineers: always show Save to Database */}
          {role !== 'manager' && (
            <motion.div whileHover={{ scale: 1.04, y: -2 }} whileTap={{ scale: 0.97 }}>
              <Button
                onClick={handleSaveJob}
                size="lg"
                className="gap-2.5 rounded-2xl px-8 h-12 text-sm font-bold bg-green-600 text-white hover:bg-green-700 w-full sm:w-auto"
              >
                Save to Database
              </Button>
            </motion.div>
          )}

          {/* Managers: always show a save button */}
          {role === 'manager' && (
            <motion.div whileHover={{ scale: 1.04, y: -2 }} whileTap={{ scale: 0.97 }}>
              <Button
                onClick={handleSaveJob}
                size="lg"
                className="gap-2.5 rounded-2xl px-8 h-12 text-sm font-bold bg-green-600 text-white hover:bg-green-700 w-full sm:w-auto"
              >
                {isApproved ? 'Save Pricing' : 'Save & Approve Job'}
              </Button>
            </motion.div>
          )}

          {/* Readiness check — available on any saved job */}
          {jobId && (
            <motion.div whileHover={{ scale: 1.04, y: -2 }} whileTap={{ scale: 0.97 }}>
              <Button onClick={handleCheckReadiness} disabled={checkingReadiness} variant="outline" size="lg" className="gap-2.5 rounded-2xl px-8 h-12 text-sm font-bold border-border/80 hover:bg-secondary w-full sm:w-auto">
                <ClipboardList className="h-5 w-5" /> {checkingReadiness ? "Checking…" : "Check PDF Readiness"}
              </Button>
            </motion.div>
          )}

          {/* PDF and Excel — only after approval */}
          {role === 'manager' && isApproved && (
            <>
              <motion.div whileHover={{ scale: 1.04, y: -2 }} whileTap={{ scale: 0.97 }}>
                <Button onClick={handleExportPDF} size="lg" className="gap-2.5 btn-primary-gradient border-0 rounded-2xl px-8 h-12 text-sm font-bold w-full sm:w-auto">
                  <Sparkles className="h-4 w-4" /> Generate PDF
                </Button>
              </motion.div>
              <motion.div whileHover={{ scale: 1.04, y: -2 }} whileTap={{ scale: 0.97 }}>
                <Button onClick={handleExportExcel} variant="outline" size="lg" className="gap-2.5 rounded-2xl px-8 h-12 text-sm font-bold border-border/80 hover:bg-secondary w-full sm:w-auto">
                  <FileSpreadsheet className="h-5 w-5" /> Export Excel
                </Button>
              </motion.div>
            </>
          )}
        </motion.div>

        {/* Quick stats bar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
          className="flex items-center justify-center gap-3 sm:gap-6 pb-8 text-xs text-muted-foreground flex-wrap"
        >
          <div className="flex items-center gap-1.5">
            <Zap className="h-3 w-3 text-primary" />
            <span><strong className="text-foreground">{doneChecklist}</strong>/{totalChecklist} tasks done</span>
          </div>
          <div className="w-px h-3 bg-border" />
          <div className="flex items-center gap-1.5">
            <span><strong className="text-foreground">{parts.length}</strong> parts</span>
          </div>
          <div className="w-px h-3 bg-border" />
          <div className="flex items-center gap-1.5">
            <span><strong className="text-foreground">{labor.length}</strong> labor entries</span>
          </div>
        </motion.div>
      </main>

      {/* Scroll to top button */}
      <AnimatePresence>
        {showScrollTop && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={scrollToTop}
            className="fixed bottom-6 right-6 h-10 w-10 rounded-full flex items-center justify-center btn-primary-gradient z-50"
          >
            <ChevronUp className="h-5 w-5 text-primary-foreground" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
};

export default JobCardForm;
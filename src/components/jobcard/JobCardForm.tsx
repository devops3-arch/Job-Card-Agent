import { useState, useEffect, useMemo } from "react";
import type { Dispatch, SetStateAction } from "react";
import { apiFetch } from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, FileSpreadsheet, ClipboardList, Sparkles, ChevronUp, Zap } from "lucide-react";
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
import type { JobCardData, CustomerInfo, CoverageType, ServiceType, ChecklistItem, PartItem, LaborItem } from "@/types/jobCard";

interface UserOption {
  id: number;
  name: string;
}

// Safely extract a readable string from any backend error shape.
function normalizeApiError(data: any): string {
  const err = data?.error;
  if (typeof err === "string") return err;
  if (typeof data?.message === "string") return data.message;
  if (typeof err?.message === "string") return err.message;
  if (typeof err?.code === "string") return err.code;
  if (typeof err?.details === "string") return err.details;
  if (Array.isArray(err?.details)) {
    return err.details.map((d: any) => d?.message || String(d)).join(", ");
  }
  return "Failed to save job";
}

// Strip undefined values so JSON.stringify doesn't produce nulls for missing fields.
function removeUndefined(obj: Record<string, any>): Record<string, any> {
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
  underWarranty: false
};

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
  const [coverageType, setCoverageType] = useState<CoverageType>("chargeable");
  const [compressorChecklist, setCompressorChecklist] = useState<ChecklistItem[]>(defaultCompressorChecklist);
  const [dryerChecklist, setDryerChecklist] = useState<ChecklistItem[]>(defaultDryerChecklist);
  const [parts, setParts] = useState<PartItem[]>([]);
  const [labor, setLabor] = useState<LaborItem[]>([]);
  const [otherExpenses, setOtherExpenses] = useState(0);
  const [discountPercentage, setDiscountPercentage] = useState(0);
  const [serviceCharge, setServiceCharge] = useState(0);
  const [managerId, setManagerId] = useState<number | null>(null);
  const [managerName, setManagerName] = useState("");
  const [engineerId, setEngineerId] = useState<number | null>(null);
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
                underWarranty: jobData.under_warranty || false
              });

              if (jobData.service_type) setServiceType(jobData.service_type);
              if (jobData.other_expenses) setOtherExpenses(Number(jobData.other_expenses));
              if (jobData.discount_percentage) setDiscountPercentage(Number(jobData.discount_percentage));
              if (jobData.manager_name) setManagerName(jobData.manager_name);
              if (storedJson.service_charge !== undefined && storedJson.service_charge !== null) {
                setServiceCharge(Number(storedJson.service_charge) || 0);
              }
              if (storedJson.coverage_type === "warranty_amc" || storedJson.coverage_type === "chargeable") {
                setCoverageType(storedJson.coverage_type);
              } else if (jobData.service_type === "breakdown_call") {
                setCoverageType("chargeable");
              }

              if (data.data.parts && data.data.parts.length > 0) {
                 setParts(data.data.parts.map((p: any) => ({
                    id: String(p.id),
                    description: p.part_name,
                    partNumber: p.part_number || "",
                    qty: Number(p.quantity) || 0,
                    unitPrice: Number(p.unit_price) || 0,
                    totalPrice: Number(p.total) || 0,
                 })));
              } else if (storedJson.parts) {
                 setParts(storedJson.parts.map((p: any) => ({
                    ...p,
                    qty: Number(p.qty) || 0,
                    unitPrice: Number(p.unitPrice) || 0,
                    totalPrice: Number(p.totalPrice) || 0,
                 })));
              }

              if (data.data.labor && data.data.labor.length > 0) {
                 setLabor(data.data.labor.map((l: any) => ({
                    id: String(l.id),
                    description: l.description,
                    hours: Number(l.hours) || 0,
                    ratePerHour: Number(l.rate) || 0,
                    totalCost: Number(l.total) || 0,
                 })));
              } else if (storedJson.labor) {
                 setLabor(storedJson.labor.map((l: any) => ({
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
          const existingJob = jobs.find((j: any) => String(j.id) === String(jobId));
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
          }
        } catch (e) {
          console.error("Failed to load mock job", e);
        } finally {
          setLoadingJob(false);
        }
      };

      fetchJobData();
    }
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
        setItems(Array.isArray(data.data) ? data.data : []);
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

  const computedServiceCharge = serviceType === "breakdown_call" && coverageType === "warranty_amc"
    ? 0
    : customerInfo.salesArea === "Abu Dhabi Variable"
      ? serviceCharge
      : SERVICE_CHARGE_MAP[customerInfo.salesArea] || 0;

  const getFormData = (): JobCardData => ({
    customerInfo,
    serviceType,
    coverageType,
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

  const validate = (): boolean => {
    if (!customerInfo.customerName) { toast.error("Please select a customer"); return false; }
    if (!customerInfo.jobCardNo) { toast.error("Please enter a job card number"); return false; }
    if (!customerInfo.date) { toast.error("Please select a date"); return false; }
    if (serviceType === "breakdown_call" && !coverageType) {
      toast.error("Coverage Type is required for Breakdown Call.");
      return false;
    }
    if (serviceType === "breakdown_call" && coverageType === "chargeable" && customerInfo.salesArea === "Abu Dhabi Variable") {
      if (Number.isNaN(serviceCharge) || serviceCharge <= 0) {
        toast.error("Service Charge is required and must be greater than 0 for Abu Dhabi Variable.");
        return false;
      }
    }
    if (customerInfo.salesArea === "Abu Dhabi Variable" && serviceType !== "breakdown_call") {
      if (Number.isNaN(serviceCharge) || serviceCharge <= 0) {
        toast.error("Service Charge is required and must be greater than 0 for Abu Dhabi Variable.");
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
    if (serviceType === "breakdown_call" && !coverageType) {
      toast.error("Coverage Type is required for Breakdown Call.");
      return false;
    }
    if (serviceType === "breakdown_call" && coverageType === "chargeable" && customerInfo.salesArea === "Abu Dhabi Variable") {
      if (Number.isNaN(serviceCharge) || serviceCharge <= 0) {
        toast.error("Service Charge is required and must be greater than 0 for Abu Dhabi Variable.");
        return false;
      }
    }
    if (customerInfo.salesArea === "Abu Dhabi Variable" && serviceType !== "breakdown_call") {
      if (Number.isNaN(serviceCharge) || serviceCharge <= 0) {
        toast.error("Service Charge is required and must be greater than 0 for Abu Dhabi Variable.");
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

  // Save Function For Calling API
  const handleSaveJob = async () => {
    if (!validate()) return;
    if (role === 'manager' && !validatePricing()) return;

    // CALCULATE PRICING
    const computedServiceCharge = customerInfo.salesArea === "Abu Dhabi Variable"
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
        under_warranty: Boolean(customerInfo.underWarranty),
        customer_code: customerInfo.customerCode || undefined,
        attention_of: customerInfo.attentionOf || undefined,
        email: customerInfo.email || undefined,
        contact_no: customerInfo.contactNo || undefined,
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
          coverage_type: serviceType === "breakdown_call" ? coverageType : undefined,
          service_charge: computedServiceCharge,
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
          toast.error(normalizeApiError(resData));
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
          toast.error(normalizeApiError(resData));
          return;
        }
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
            coverageType={coverageType}
            onChange={setCustomerInfo}
            onServiceTypeChange={(type) => {
              setServiceType(type);
              if (type !== "breakdown_call") {
                setCoverageType("chargeable");
              }
            }}
            onCoverageTypeChange={setCoverageType}
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
              underWarranty={customerInfo.underWarranty}
              serviceType={serviceType}
              coverageType={coverageType}
              serviceCharge={computedServiceCharge}
              onServiceChargeChange={setServiceCharge}
            />
          </motion.div>
        )}

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
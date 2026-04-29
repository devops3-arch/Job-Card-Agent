import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, FileSpreadsheet, ClipboardList, Sparkles, ChevronUp, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import CustomerInfoSection from "./CustomerInfoSection";
import ChecklistSection from "./ChecklistSection";
import PartsLaborSection from "./PartsLaborSection";
import CostingSection from "./CostingSection";
import { defaultCompressorChecklist, defaultDryerChecklist } from "@/data/defaultChecklist";
import { generatePDF } from "@/utils/exportPdf";
import { generateExcel } from "@/utils/exportExcel";
import type { JobCardData, CustomerInfo, ServiceType, ChecklistItem, PartItem, LaborItem } from "@/types/jobCard";

const initialCustomer: CustomerInfo = {
  customerName: "", refNo: "", jobCardNo: "", date: new Date().toISOString().split("T")[0],
  customerCode: "", attentionOf: "", email: "", contactNo: "", salesArea: "", underWarranty: false,
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
}

const JobCardForm = ({ role = 'engineer', jobId }: JobCardFormProps) => {
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo>(initialCustomer);
  const [serviceType, setServiceType] = useState<ServiceType>("service_contract");
  const [compressorChecklist, setCompressorChecklist] = useState<ChecklistItem[]>(defaultCompressorChecklist);
  const [dryerChecklist, setDryerChecklist] = useState<ChecklistItem[]>(defaultDryerChecklist);
  const [parts, setParts] = useState<PartItem[]>([]);
  const [labor, setLabor] = useState<LaborItem[]>([]);
  const [otherExpenses, setOtherExpenses] = useState(0);
  const [discountPercentage, setDiscountPercentage] = useState(0);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [isApproved, setIsApproved] = useState(false);

  // Load existing job data if editing
  useMemo(() => {
    if (jobId) {
      try {
        const jobs = JSON.parse(localStorage.getItem('mockJobs') || '[]');
        const existingJob = jobs.find((j: any) => String(j.id) === String(jobId));
        if (existingJob) {
          if (existingJob.customerInfo) setCustomerInfo(existingJob.customerInfo);
          else setCustomerInfo(prev => ({ ...prev, customerName: existingJob.customer_name || "" }));
          
          if (existingJob.parts) setParts(existingJob.parts);
          if (existingJob.labor) setLabor(existingJob.labor);
          if (existingJob.compressorChecklist) setCompressorChecklist(existingJob.compressorChecklist);
          if (existingJob.dryerChecklist) setDryerChecklist(existingJob.dryerChecklist);
          if (existingJob.status === "APPROVED") setIsApproved(true);
        }
      } catch (e) {
        console.error("Failed to load mock job", e);
      }
    }
  }, [jobId]);

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

  const getFormData = (): JobCardData => ({
    customerInfo, serviceType, compressorChecklist, dryerChecklist, parts, labor, otherExpenses, discountPercentage,
  });

  const validate = (): boolean => {
    if (!customerInfo.customerName) { toast.error("Please select a customer"); return false; }
    if (!customerInfo.jobCardNo) { toast.error("Please enter a job card number"); return false; }
    if (!customerInfo.date) { toast.error("Please select a date"); return false; }
    return true;
  };

  const handleExportPDF = async () => {
    if (!validate()) return;
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

    // CALCULATE PRICING
    const partsTotal = parts.reduce(
      (sum, item) => sum + (item.quantity || 0) * (item.unitPrice || 0),
      0
    );

    const labourTotal = labor.reduce(
      (sum, item) => sum + (item.hours || 0) * (item.rate || 0),
      0
    );

    const serviceCharge = 0;
    const discount = (partsTotal + labourTotal) * (discountPercentage / 100);

    const taxableAmount =
      partsTotal + labourTotal + otherExpenses + serviceCharge - discount;

    const vatPercent = 5;
    const vatAmount = taxableAmount * (vatPercent / 100);

    const grandTotal = taxableAmount + vatAmount;

    try {
      // SAVE JOB
      const response = await fetch("http://localhost:5000/jobs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          // Customer Info (flat columns)
          customer_name: customerInfo.customerName,
          ref_no: customerInfo.refNo,
          job_card_no: customerInfo.jobCardNo,
          job_date: customerInfo.date,
          customer_code: customerInfo.customerCode,
          attention_of: customerInfo.attentionOf,
          email: customerInfo.email,
          contact_no: customerInfo.contactNo,
          sales_area: customerInfo.salesArea,
          under_warranty: customerInfo.underWarranty,
          // Job Info
          equipment_name: "Compressor",
          service_type: serviceType,
          other_expenses: otherExpenses,
          discount_percentage: discountPercentage,
          // Nested arrays stored in job_data JSONB
          parts,
          labor,
          compressor_checklist: compressorChecklist,
          dryer_checklist: dryerChecklist,
        }),
      });

      if (!response.ok) throw new Error("Backend response failed");
      
      const job = await response.json();

      console.log("Saved Job:", job);

      // SAVE PRICING
      await fetch(`http://localhost:5000/jobs/${job.id}/pricing`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          labour_rate: 0,
          service_charge: serviceCharge,
          discount: discount,
          vat_percent: vatPercent,
          parts_total: partsTotal,
          labour_total: labourTotal,
          taxable_amount: taxableAmount,
          vat_amount: vatAmount,
          grand_total: grandTotal
        }),
      });

      toast.success("Job + Pricing saved successfully ✅");
      if (role === 'manager') setIsApproved(true);
    } catch (error) {
      console.error(error);
      // Fallback: save to localStorage for demo
      try {
        const jobs = JSON.parse(localStorage.getItem('mockJobs') || '[]');
        const existingIndex = jobs.findIndex((j: any) => String(j.id) === String(jobId));
        
        const jobRecord = {
            id: jobId || Date.now(),
            customer_name: customerInfo.customerName,
            equipment_name: "Compressor",
            status: role === 'manager' ? "APPROVED" : "Submitted",
            grand_total: grandTotal,
            // Store full details for the mock!
            customerInfo,
            parts,
            labor,
            compressorChecklist,
            dryerChecklist
        };

        if (existingIndex >= 0) {
           jobs[existingIndex] = { ...jobs[existingIndex], ...jobRecord };
        } else {
           jobs.push(jobRecord);
        }
        
        localStorage.setItem('mockJobs', JSON.stringify(jobs));
        toast.success("Job saved locally (Demo Mode) ✅");
        window.dispatchEvent(new Event('jobsUpdated'));
        if (role === 'manager') setIsApproved(true);
      } catch (localError) {
        toast.error("Failed to save job ❌");
      }
    }
  };

  // Scroll handler
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setShowScrollTop(e.currentTarget.scrollTop > 400);
  };

  const scrollToTop = () => {
    document.querySelector('main')?.scrollIntoView({ behavior: 'smooth' });
  };

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
            className="flex items-center gap-3.5"
          >
            <motion.div
              className="h-11 w-11 rounded-2xl flex items-center justify-center btn-primary-gradient"
              whileHover={{ rotate: -5, scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
            >
              <ClipboardList className="h-5 w-5 text-primary-foreground" />
            </motion.div>
            <div>
              <h1 className="text-lg font-display font-extrabold tracking-tight">Field Service Report</h1>
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
            className="flex gap-2.5"
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
            onChange={setCustomerInfo}
            onServiceTypeChange={setServiceType}
          />
        </motion.div>

        <motion.div custom={1} variants={sectionVariants} initial="hidden" animate="visible">
          <ChecklistSection
            title="Screw Air Compressor Checklist"
            items={compressorChecklist}
            onChange={setCompressorChecklist}
            delay={0.15}
          />
        </motion.div>

        <motion.div custom={2} variants={sectionVariants} initial="hidden" animate="visible">
          <ChecklistSection
            title="Air Dryer Checklist"
            items={dryerChecklist}
            onChange={setDryerChecklist}
            delay={0.2}
          />
        </motion.div>

        <motion.div custom={3} variants={sectionVariants} initial="hidden" animate="visible">
          <PartsLaborSection
            parts={parts}
            labor={labor}
            onPartsChange={setParts}
            onLaborChange={setLabor}
            role={role}
          />
        </motion.div>

        {role === 'manager' && (
          <motion.div custom={4} variants={sectionVariants} initial="hidden" animate="visible">
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
            />
          </motion.div>
        )}

        {/* Bottom Actions */}
        <motion.div
          custom={5}
          variants={sectionVariants}
          initial="hidden"
          animate="visible"
          className="flex flex-col sm:flex-row gap-3 justify-center pb-12 pt-4"
        >
          {role === 'manager' && isApproved && (
            <motion.div whileHover={{ scale: 1.04, y: -2 }} whileTap={{ scale: 0.97 }}>
              <Button onClick={handleExportPDF} size="lg" className="gap-2.5 btn-primary-gradient border-0 rounded-2xl px-8 h-12 text-sm font-bold w-full sm:w-auto">
                <Sparkles className="h-4 w-4" /> Generate PDF Report
              </Button>
            </motion.div>
          )}
          
          {!isApproved && (
            <motion.div whileHover={{ scale: 1.04, y: -2 }} whileTap={{ scale: 0.97 }}>
              <Button
                onClick={handleSaveJob}
                size="lg"
                className="gap-2.5 rounded-2xl px-8 h-12 text-sm font-bold bg-green-600 text-white hover:bg-green-700 w-full sm:w-auto"
              >
                {role === 'manager' ? 'Save & Approve Job' : 'Save to Database'}
              </Button>
            </motion.div>
          )}

          {role === 'manager' && isApproved && (
            <motion.div whileHover={{ scale: 1.04, y: -2 }} whileTap={{ scale: 0.97 }}>
              <Button onClick={handleExportExcel} variant="outline" size="lg" className="gap-2.5 rounded-2xl px-8 h-12 text-sm font-bold border-border/80 hover:bg-secondary w-full sm:w-auto">
                <FileSpreadsheet className="h-5 w-5" /> Export to Excel
              </Button>
            </motion.div>
          )}
        </motion.div>

        {/* Quick stats bar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
          className="flex items-center justify-center gap-6 pb-8 text-xs text-muted-foreground"
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
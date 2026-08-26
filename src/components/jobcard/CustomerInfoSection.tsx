import { motion } from "framer-motion";
import { Building2, Calendar, Hash, Mail, Phone, User } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BreakdownCallType, CustomerInfo, ServiceType, SalesArea } from "@/types/jobCard";
import { sampleCustomers } from "@/data/defaultChecklist";
import { apiFetch } from "@/lib/api";
import { useEffect, useState } from "react";

interface UserOption {
  id: number;
  name: string;
}

interface Props {
  data: CustomerInfo;
  serviceType: ServiceType;
  onChange: (data: CustomerInfo) => void;
  onServiceTypeChange: (type: ServiceType) => void;
  managerName: string;
  managerId: number | null;
  engineerId: number | null;
  managerOptions: UserOption[];
  engineerOptions: UserOption[];
  managersLoading: boolean;
  engineersLoading: boolean;
  managersError?: string | null;
  engineersError?: string | null;
  engineerReadOnly?: boolean;
  breakdownCallType: BreakdownCallType | "";
  onBreakdownCallTypeChange: (type: BreakdownCallType) => void;
  onManagerChange: (id: number | null, name: string) => void;
  onEngineerChange: (id: number | null, name: string) => void;
}

const serviceTypes: { value: ServiceType; label: string; emoji: string }[] = [
  { value: "service_contract", label: "Service Contract", emoji: "📋" },
  { value: "warranty", label: "Under Warranty / AMC", emoji: "🛡️" },
  { value: "customer_request", label: "Customer Request", emoji: "📞" },
  { value: "breakdown_call", label: "Breakdown Call", emoji: "🔧" },
];

const salesAreaOptions: { value: SalesArea; label: string }[] = [
  { value: "Dubai", label: "Dubai" },
  { value: "Northern Emirates", label: "Northern Emirates" },
  { value: "Abu Dhabi", label: "Abu Dhabi" },
  { value: "Abu Dhabi Variable", label: "Abu Dhabi Variable" },
];

const fieldVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: 0.1 + i * 0.04, duration: 0.4, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }
  }),
};

const inputClass = "h-11 rounded-xl border-border/60 bg-background hover:border-primary/40 focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all duration-300";

const CustomerInfoSection = ({
  data,
  serviceType,
  onChange,
  onServiceTypeChange,
  managerName,
  managerId,
  engineerId,
  managerOptions,
  engineerOptions,
  managersLoading,
  engineersLoading,
  managersError,
  engineersError,
  engineerReadOnly,
  breakdownCallType,
  onBreakdownCallTypeChange,
  onManagerChange,
  onEngineerChange,
}: Props) => {
  const [customerQuery, setCustomerQuery] = useState(data.customerName);
  const [customerMatches, setCustomerMatches] = useState<Array<{ id: number; name: string; code?: string; email?: string; contact?: string }>>([]);
  const [showCustomerMatches, setShowCustomerMatches] = useState(false);
  useEffect(() => {
    if (customerQuery.trim().length < 2) { setCustomerMatches([]); return; }
    const timer = window.setTimeout(async () => {
      try {
        const response = await apiFetch(`/api/customers/search?q=${encodeURIComponent(customerQuery.trim())}`);
        const result = await response.json();
        setCustomerMatches(Array.isArray(result.data) ? result.data : Array.isArray(result) ? result : []);
        setShowCustomerMatches(true);
      } catch { setCustomerMatches([]); }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [customerQuery]);
  const update = (field: keyof CustomerInfo, value: string) => {
    onChange({ ...data, [field]: value });
  };

  const fields = [
    { label: "Customer Name *", field: "customerName", placeholder: "Search customer name" },
    { label: "Customer Location / Site", field: "customerLocation", placeholder: "Site / location" },
    { label: "Site Contact / Representative", field: "siteContact", placeholder: "Representative" },
    { label: "Time IN", field: "timeIn", placeholder: "HH:MM", inputType: "time" },
    { label: "Time OUT", field: "timeOut", placeholder: "HH:MM", inputType: "time" },
    { label: "Report Date", field: "reportDate", placeholder: "Report date", inputType: "date" },
    { label: "Customer P.O. Ref", field: "customerPoRef", placeholder: "P.O. reference" },
    { label: "Ref No.", field: "refNo", placeholder: "XXXXXXX" },
    { label: "Job Card No. *", field: "jobCardNo", placeholder: "05", icon: Hash },
    { label: "Date *", field: "date", inputType: "date", icon: Calendar },
    { label: "Purpose of Visit *", type: "serviceType" },
    { label: "Breakdown Call Type *", type: "breakdownCallType" },
    { label: "Customer Code", field: "customerCode", placeholder: "Code" },
    { label: "Attention Of", field: "attentionOf", placeholder: "Contact person", icon: User, helper: "Customer's main point of contact for this report" },
    { label: "Email", field: "email", placeholder: "email@example.com", icon: Mail, inputType: "email" },
    { label: "Contact No.", field: "contactNo", placeholder: "+971-XX-XXXXXXX", icon: Phone },
    { label: "Site Contact / Representative", field: "siteContact", placeholder: "Representative", helper: "Person present at the site during this visit" },
    { label: "Service Engineer *", type: "engineerName", helper: "Our technician assigned to this job" },
    { label: "Sales Area *", type: "salesArea" },
    { label: "Manager Name", type: "managerName" },
  ];

  const visibleFields = fields.filter((f) => f.type !== "breakdownCallType" || serviceType === "breakdown_call");

  return (
    <div className="section-card">
      <h2 className="section-title">
        <span className="section-title-icon">
          <Building2 className="h-4 w-4 text-primary-foreground" />
        </span>
        Customer Information
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-5 gap-y-4">
        {visibleFields.map((f, i) => {
          if (f.type === "breakdownCallType") {
            return (
              <motion.div key={f.label} custom={i} variants={fieldVariants} initial="hidden" animate="visible">
                <label className="field-label">{f.label}</label>
                <Select value={breakdownCallType} onValueChange={(v) => onBreakdownCallTypeChange(v as BreakdownCallType)}>
                  <SelectTrigger className={inputClass}>
                    <SelectValue placeholder="Select breakdown call type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="chargeable">Chargeable</SelectItem>
                    <SelectItem value="warranty_amc">Under Warranty / AMC</SelectItem>
                  </SelectContent>
                </Select>
              </motion.div>
            );
          }

          return (
            <motion.div key={f.label} custom={i} variants={fieldVariants} initial="hidden" animate="visible">
              <label className="field-label">{f.label}</label>
              {f.field === "customerName" ? (
                <div className="relative">
                  <Input className={inputClass} placeholder={f.placeholder} value={data.customerName} onChange={(e) => { setCustomerQuery(e.target.value); update("customerName", e.target.value); }} onFocus={() => customerMatches.length > 0 && setShowCustomerMatches(true)} />
                  {showCustomerMatches && customerMatches.length > 0 && <div className="absolute left-0 right-0 top-full z-20 max-h-60 overflow-auto rounded-lg border bg-background shadow-lg">
                    {customerMatches.map((customer) => <button type="button" key={customer.id} className="block min-h-11 w-full border-b px-3 py-2 text-left hover:bg-muted" onMouseDown={(e) => e.preventDefault()} onClick={() => { update("customerName", customer.name); update("customerCode", customer.code || ""); update("email", customer.email || ""); update("contactNo", customer.contact || ""); setCustomerQuery(customer.name); setShowCustomerMatches(false); }}>{customer.name}{customer.code ? ` (${customer.code})` : ""}</button>)}
                  </div>}
                </div>
              ) : f.type === "select" ? (
                <Select value={data.customerName} onValueChange={(v) => update("customerName", v)}>
                  <SelectTrigger className={inputClass}>
                    <SelectValue placeholder="Select customer" />
                  </SelectTrigger>
                  <SelectContent>
                    {sampleCustomers.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : f.type === "serviceType" ? (
                <Select value={serviceType} onValueChange={(v) => onServiceTypeChange(v as ServiceType)}>
                  <SelectTrigger className={inputClass}>
                    <SelectValue placeholder="Select service type" />
                  </SelectTrigger>
                  <SelectContent>
                    {serviceTypes.map((st) => (
                      <SelectItem key={st.value} value={st.value}>{st.emoji} {st.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : f.type === "salesArea" ? (
                <Select value={data.salesArea} onValueChange={(v) => update("salesArea", v)}>
                  <SelectTrigger className={inputClass}>
                    <SelectValue placeholder="Select location" />
                  </SelectTrigger>
                  <SelectContent>
                    {salesAreaOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : f.type === "engineerName" ? (
                engineerReadOnly ? (
                  <Input
                    className={inputClass}
                    value={data.engineerName || ""}
                    disabled
                    placeholder="Engineer assigned"
                  />
                ) : (
                  <Select value={engineerId ? String(engineerId) : ""} onValueChange={(value) => {
                    const selected = engineerOptions.find((item) => String(item.id) === value);
                    onEngineerChange(selected?.id ?? null, (selected?.name ?? data.engineerName) || "");
                  }}>
                    <SelectTrigger className={inputClass}>
                      <SelectValue placeholder={data.engineerName ? data.engineerName : "Select engineer"} />
                    </SelectTrigger>
                    <SelectContent>
                      {engineersLoading ? (
                        <SelectItem value="unassigned" disabled>Loading engineers...</SelectItem>
                      ) : engineersError ? (
                        <SelectItem value="unassigned" disabled>Failed to load engineers</SelectItem>
                      ) : engineerOptions.length === 0 ? (
                        <SelectItem value="unassigned" disabled>No engineers available</SelectItem>
                      ) : (
                        engineerOptions.map((engineer) => (
                          <SelectItem key={engineer.id} value={String(engineer.id)}>{engineer.name}</SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                )
              ) : f.type === "managerName" ? (
                <Select value={managerId ? String(managerId) : ""} onValueChange={(value) => {
                  const selected = managerOptions.find((item) => String(item.id) === value);
                  onManagerChange(selected?.id ?? null, (selected?.name ?? managerName) || "");
                }}>
                  <SelectTrigger className={inputClass}>
                    <SelectValue placeholder={managerName ? managerName : "Select manager"} />
                  </SelectTrigger>
                  <SelectContent>
                    {managersLoading ? (
                      <SelectItem value="unassigned" disabled>Loading managers...</SelectItem>
                    ) : managersError ? (
                      <SelectItem value="unassigned" disabled>Failed to load managers</SelectItem>
                    ) : managerOptions.length === 0 ? (
                      <SelectItem value="unassigned" disabled>No managers available</SelectItem>
                    ) : (
                      managerOptions.map((manager) => (
                        <SelectItem key={manager.id} value={String(manager.id)}>{manager.name}</SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              ) : f.icon ? (
                <div className="relative group">
                  <f.icon className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors duration-300" />
                  <Input
                    className={`pl-10 ${inputClass}`}
                    type={f.inputType || "text"}
                    placeholder={f.placeholder}
                    value={(data as any)[f.field!] || ""}
                    onChange={(e) => update(f.field as keyof CustomerInfo, e.target.value)}
                  />
                </div>
              ) : (
                <Input
                  className={inputClass}
                  placeholder={f.placeholder}
                  value={(data as any)[f.field!] || ""}
                  onChange={(e) => update(f.field as keyof CustomerInfo, e.target.value)}
                />
              )}
              {f.helper && <p className="mt-1 text-xs text-muted-foreground">{f.helper}</p>}
            </motion.div>
          );
        })}
      </div>
      {(serviceType === "breakdown_call" || serviceType === "customer_request") && (
        <div className="mt-4">
          <label className="field-label">Complaint / Issue Description</label>
          <textarea className="min-h-24 w-full rounded-xl border border-border/60 bg-background p-3" value={data.complaintIssueDescription} onChange={(e) => update("complaintIssueDescription", e.target.value)} />
        </div>
      )}
    </div>
  );
};

export default CustomerInfoSection;
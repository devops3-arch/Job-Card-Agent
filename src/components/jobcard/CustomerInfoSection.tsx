import { motion } from "framer-motion";
import { Building2, Calendar, Hash, Mail, Phone, User } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CustomerInfo, ServiceType, SalesArea } from "@/types/jobCard";
import { Checkbox } from "@/components/ui/checkbox";
import { sampleCustomers } from "@/data/defaultChecklist";

interface Props {
  data: CustomerInfo;
  serviceType: ServiceType;
  onChange: (data: CustomerInfo) => void;
  onServiceTypeChange: (type: ServiceType) => void;
}

const serviceTypes: { value: ServiceType; label: string; emoji: string }[] = [
  { value: "service_contract", label: "Service Contract", emoji: "📋" },
  { value: "warranty", label: "Warranty", emoji: "🛡️" },
  { value: "customer_request", label: "Customer Request", emoji: "📞" },
  { value: "breakdown_call", label: "Breakdown Call", emoji: "🔧" },
];

const fieldVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: 0.1 + i * 0.04, duration: 0.4, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }
  }),
};

const inputClass = "h-11 rounded-xl border-border/60 bg-background hover:border-primary/40 focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all duration-300";

const CustomerInfoSection = ({ data, serviceType, onChange, onServiceTypeChange }: Props) => {
  const update = (field: keyof CustomerInfo, value: string) => {
    onChange({ ...data, [field]: value });
  };

  const fields = [
    { label: "Customer Name *", field: "customerName", placeholder: "Enter customer name" },
    { label: "Ref No.", field: "refNo", placeholder: "XXXXXXX" },
    { label: "Equipment Name", field: "equipmentName", placeholder: "Enter equipment name" },
    { label: "Job Card No. *", field: "jobCardNo", placeholder: "05", icon: Hash },
    { label: "Date *", field: "date", inputType: "date", icon: Calendar },
    { label: "Purpose of Visit *", type: "serviceType" },
    { label: "Customer Code", field: "customerCode", placeholder: "Code" },
    { label: "Attention Of", field: "attentionOf", placeholder: "Contact person", icon: User },
    { label: "Email", field: "email", placeholder: "email@example.com", icon: Mail, inputType: "email" },
    { label: "Contact No.", field: "contactNo", placeholder: "+971-XX-XXXXXXX", icon: Phone },
    { label: "Sales Area *", type: "salesArea" },
  ];

  return (
    <div className="section-card">
      <h2 className="section-title">
        <span className="section-title-icon">
          <Building2 className="h-4 w-4 text-primary-foreground" />
        </span>
        Customer Information
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-5 gap-y-4">
        {fields.map((f, i) => (
          <motion.div key={f.label} custom={i} variants={fieldVariants} initial="hidden" animate="visible">
            <label className="field-label">{f.label}</label>
            {f.type === "select" ? (
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
                  {(['Dubai', 'Northern Emirates', 'Abu Dhabi', 'Abu Dhabi Variable'] as SalesArea[]).map((loc) => (
                    <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                  ))}
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
          </motion.div>
        ))}

        <motion.div custom={10} variants={fieldVariants} initial="hidden" animate="visible" className="flex items-center gap-3 pt-6">
          <Checkbox
            id="underWarranty"
            checked={data.underWarranty}
            onCheckedChange={(checked) => onChange({ ...data, underWarranty: checked === true })}
            className="h-5 w-5 transition-all duration-300 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
          />
          <label htmlFor="underWarranty" className="field-label cursor-pointer !mb-0 hover:text-foreground transition-colors">Under Warranty / AMC</label>
        </motion.div>
      </div>
    </div>
  );
};

export default CustomerInfoSection;
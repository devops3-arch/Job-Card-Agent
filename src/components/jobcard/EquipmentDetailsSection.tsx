import { motion } from "framer-motion";
import { Wrench } from "lucide-react";
import { Input } from "@/components/ui/input";
import { CustomerInfo } from "@/types/jobCard";

interface Props {
  data: CustomerInfo;
  onChange: (data: CustomerInfo) => void;
}

const fieldVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: 0.1 + i * 0.04, duration: 0.4, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }
  }),
};

const inputClass = "h-11 rounded-xl border-border/60 bg-background hover:border-primary/40 focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all duration-300";

const EquipmentDetailsSection = ({ data, onChange }: Props) => {
  const update = (field: keyof CustomerInfo, value: string) => {
    onChange({ ...data, [field]: value });
  };

  const fields = [
    { label: "Equipment Model", field: "equipmentModel", placeholder: "Enter equipment model" },
    { label: "Brand Description", field: "equipmentBrandDescription", placeholder: "Brand / description" },
    { label: "Part No", field: "equipmentPartNo", placeholder: "Part number" },
    { label: "Serial No", field: "equipmentSerialNo", placeholder: "Serial number" },
    { label: "Year", field: "equipmentYear", placeholder: "Year" },
  ];

  return (
    <div className="section-card">
      <h2 className="section-title">
        <span className="section-title-icon">
          <Wrench className="h-4 w-4 text-primary-foreground" />
        </span>
        Equipment Details
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-5 gap-y-4">
        {fields.map((field, index) => (
          <motion.div key={field.field} custom={index} variants={fieldVariants} initial="hidden" animate="visible">
            <label className="field-label">{field.label}</label>
            <Input
              className={inputClass}
              placeholder={field.placeholder}
              value={(data as any)[field.field] || ""}
              onChange={(event) => update(field.field as keyof CustomerInfo, event.target.value)}
            />
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default EquipmentDetailsSection;

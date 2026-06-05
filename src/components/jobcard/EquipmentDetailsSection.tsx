import { useState } from "react";
import { motion } from "framer-motion";
import { Wrench, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { CustomerInfo } from "@/types/jobCard";
import { equipmentMasterList, searchEquipment } from "@/data/equipmentMaster";

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
  const [equipmentSuggestions, setEquipmentSuggestions] = useState<typeof equipmentMasterList>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const handleBrandDescriptionChange = (value: string) => {
    onChange({ ...data, equipmentBrandDescription: value });
    if (value.trim()) {
      setEquipmentSuggestions(searchEquipment(value));
      setShowSuggestions(true);
    } else {
      setShowSuggestions(false);
    }
  };

  const selectEquipment = (equipment: typeof equipmentMasterList[0]) => {
    onChange({
      ...data,
      equipmentModel: "Kaeser",
      equipmentBrandDescription: equipment.model,
    });
    setShowSuggestions(false);
  };

  const update = (field: keyof CustomerInfo, value: string) => {
    onChange({ ...data, [field]: value });
  };

  const fields = [
    { label: "Equipment Model", field: "equipmentModel", placeholder: "Kaeser", readOnly: true },
    { label: "Brand Description", field: "equipmentBrandDescription", placeholder: "Select compressor model" },
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
        {fields.map((field, index) => {
          // Equipment Model field - read-only
          if (field.field === "equipmentModel") {
            return (
              <motion.div key={field.field} custom={index} variants={fieldVariants} initial="hidden" animate="visible">
                <label className="field-label">{field.label}</label>
                <Input
                  className={inputClass}
                  placeholder={field.placeholder}
                  value="Kaeser"
                  readOnly
                />
              </motion.div>
            );
          }

          // Brand Description field with autocomplete
          if (field.field === "equipmentBrandDescription") {
            return (
              <motion.div key={field.field} custom={index} variants={fieldVariants} initial="hidden" animate="visible" className="relative">
                <label className="field-label">{field.label}</label>
                <Input
                  className={inputClass}
                  placeholder={field.placeholder}
                  value={(data as any)[field.field] || ""}
                  onChange={(event) => handleBrandDescriptionChange(event.target.value)}
                  onFocus={() => (data as any)[field.field] && setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 100)}
                />
                {showSuggestions && equipmentSuggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-background border border-border rounded-lg shadow-lg max-h-96 overflow-y-auto z-10">
                    {equipmentSuggestions.map((eq, idx) => (
                      <div
                        key={idx}
                        className="p-3 hover:bg-muted cursor-pointer border-b last:border-b-0"
                        onClick={() => selectEquipment(eq)}
                      >
                        <div className="font-medium text-sm">{eq.model}</div>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            );
          }

          return (
            <motion.div key={field.field} custom={index} variants={fieldVariants} initial="hidden" animate="visible">
              <label className="field-label">{field.label}</label>
              <Input
                className={inputClass}
                placeholder={field.placeholder}
                value={(data as any)[field.field] || ""}
                onChange={(event) => update(field.field as keyof CustomerInfo, event.target.value)}
              />
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};

export default EquipmentDetailsSection;

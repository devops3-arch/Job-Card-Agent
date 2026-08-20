import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Wrench, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { CustomerInfo } from "@/types/jobCard";
import { equipmentMasterList, searchEquipment } from "@/data/equipmentMaster";
import { apiFetch } from "@/lib/api";
import FieldLabel from "./FieldLabel";
import { controlClass } from "@/lib/fieldStyles";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import FileUploadField from "./FileUploadField";

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

/** The house brand. The model field is fixed to it and cannot be typed into. */
export const DEFAULT_EQUIPMENT_MODEL = "Kaeser";

const EquipmentDetailsSection = ({ data, onChange }: Props) => {
  const [equipmentSuggestions, setEquipmentSuggestions] = useState<typeof equipmentMasterList>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [brands, setBrands] = useState<Array<{ id: number; name: string }>>([]);
  useEffect(() => { apiFetch("/api/brands").then((r) => r.json()).then((r) => setBrands(Array.isArray(r.data) ? r.data : Array.isArray(r) ? r : [])).catch(() => setBrands([])); }, []);

  // Seed the read-only model into state so what is displayed is what gets
  // validated and saved. Without this the field showed a value the user could not
  // edit while validateEquipment rejected it as empty, which made the form
  // unsubmittable. Also repairs an existing job card loaded with no model.
  // Guarded on the value, so the write happens once and does not loop.
  useEffect(() => {
    if (!data.equipmentModel?.trim()) {
      onChange({ ...data, equipmentModel: DEFAULT_EQUIPMENT_MODEL });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.equipmentModel]);

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
    { label: "Brand Description", field: "equipmentBrandDescription", placeholder: "Select compressor model" , required: true },
    { label: "Part No", field: "equipmentPartNo", placeholder: "Part number" , required: true },
    { label: "Serial No", field: "equipmentSerialNo", placeholder: "Serial number" , required: true },
    { label: "Year", field: "equipmentYear", placeholder: "Year" , required: true },
    { label: "Customer Equipment ID", field: "customerEquipmentId", placeholder: "Equipment ID" },
    { label: "Equipment Type", field: "equipmentType", placeholder: "Screw Compressor, Rotary..." },
    { label: "Meter Reading / Running Hours", field: "meterReading", placeholder: "Hours", inputType: "number" },
    { label: "Capacity / Rating", field: "capacityRating", placeholder: "Capacity" },
    { label: "Controller / Panel Model", field: "controllerPanelModel", placeholder: "Controller model" },
    { label: "Alarm / Fault Code", field: "alarmFaultCode", placeholder: "Fault code" },
    { label: "Last Service Date", field: "lastServiceDate", placeholder: "Last service", inputType: "date" },
    { label: "Last Service Hours", field: "lastServiceHours", placeholder: "Hours", inputType: "number" },
    { label: "Oil / Refrigerant / Fuel Type", field: "oilRefrigerantFuelType", placeholder: "Type" },
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
          // Equipment Model — fixed to the house brand and read-only, so it renders
          // from state rather than from a literal. It used to render the string
          // "Kaeser" while customerInfo.equipmentModel stayed empty, and
          // validateEquipment reads the state: the form reported "Equipment Model
          // is required" for a field showing a value that nobody could edit, so a
          // job card could not be submitted at all unless the engineer happened to
          // pick from the equipment suggestion list, which is the only other code
          // that sets it.
          if (field.field === "equipmentModel") {
            return (
              <motion.div key={field.field} custom={index} variants={fieldVariants} initial="hidden" animate="visible">
                <FieldLabel label={field.label} required={field.required} />
                <Input
                  className={inputClass}
                  placeholder={field.placeholder}
                  value={data.equipmentModel || DEFAULT_EQUIPMENT_MODEL}
                  readOnly
                />
              </motion.div>
            );
          }

          // Brand Description field with autocomplete
          if (field.field === "equipmentBrandDescription") {
            return (
              <motion.div key={field.field} custom={index} variants={fieldVariants} initial="hidden" animate="visible" className="relative">
                <FieldLabel label={field.label} required={field.required} />
                <Input className={controlClass(field.required, (data as unknown as Record<string, string>)[field.field])} placeholder={field.placeholder} value={(data as unknown as Record<string, string>)[field.field] || ""} onChange={(event) => handleBrandDescriptionChange(event.target.value)} onFocus={() => (data as unknown as Record<string, string>)[field.field] && setShowSuggestions(true)} onBlur={() => setTimeout(() => setShowSuggestions(false), 100)} />
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
                {brands.length > 0 && <Select value={data.equipmentBrandDescription && brands.some((b) => b.name === data.equipmentBrandDescription) ? data.equipmentBrandDescription : ""} onValueChange={(value) => update("equipmentBrandDescription", value)}>
                  <SelectTrigger className={`${inputClass} mt-2`}><SelectValue placeholder="Choose a brand or type a custom name above" /></SelectTrigger>
                  <SelectContent>{brands.filter((b) => b.name.toLowerCase().includes(String(data.equipmentBrandDescription || "").toLowerCase())).map((brand) => <SelectItem key={brand.id} value={brand.name}>{brand.name}</SelectItem>)}</SelectContent>
                </Select>}
              </motion.div>
            );
          }

          return (
            <motion.div key={field.field} custom={index} variants={fieldVariants} initial="hidden" animate="visible">
              <FieldLabel label={field.label} required={field.required} />
              <Input
                className={controlClass(field.required, (data as unknown as Record<string, string>)[field.field])}
                placeholder={field.placeholder}
                type={field.inputType || "text"}
                inputMode={field.inputType === "number" ? "numeric" : undefined}
                min={field.inputType === "number" ? 0 : undefined}
                step={field.field === "meterReading" || field.field === "lastServiceHours" ? 1 : undefined}
                value={(data as unknown as Record<string, string>)[field.field] || ""}
                onChange={(event) => update(field.field as keyof CustomerInfo, event.target.value)}
              />
            </motion.div>
          );
        })}
      </div>
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div><label className="field-label">Duty Cycle</label><Select value={data.dutyCycle} onValueChange={(v) => update("dutyCycle", v)}><SelectTrigger className={inputClass}><SelectValue placeholder="Select duty cycle" /></SelectTrigger><SelectContent><SelectItem value="Continuous">Continuous</SelectItem><SelectItem value="Standby">Standby</SelectItem><SelectItem value="Intermittent">Intermittent</SelectItem></SelectContent></Select></div>
        <div><label className="field-label">Warranty Status</label><Select value={data.warrantyStatus} onValueChange={(v) => update("warrantyStatus", v)}><SelectTrigger className={inputClass}><SelectValue placeholder="Select warranty status" /></SelectTrigger><SelectContent><SelectItem value="In Warranty">In Warranty</SelectItem><SelectItem value="Out of Warranty">Out of Warranty</SelectItem><SelectItem value="AMC">AMC</SelectItem><SelectItem value="Unknown">Unknown</SelectItem></SelectContent></Select></div>
        {data.warrantyStatus === "In Warranty" && <div><label className="field-label">Warranty Claim Ref</label><Input className={inputClass} value={data.warrantyClaimRef} onChange={(e) => update("warrantyClaimRef", e.target.value)} /></div>}
        <div><label className="field-label">Previous Job Ref</label><Input className={inputClass} value={data.previousJobRef} onChange={(e) => update("previousJobRef", e.target.value)} /></div>
      </div>
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FileUploadField label="Nameplate Photo" accept="image/*" value={data.nameplatePhotoRef ? [data.nameplatePhotoRef] : []} onChange={(files) => update("nameplatePhotoRef", files[0] || "")} />
        <FileUploadField label="Vibration Report" accept="image/*" value={data.vibrationReportRef ? [data.vibrationReportRef] : []} onChange={(files) => update("vibrationReportRef", files[0] || "")} />
      </div>
    </div>
  );
};

export default EquipmentDetailsSection;

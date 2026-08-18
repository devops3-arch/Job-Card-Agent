import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import { Loader2, CheckCircle2, Package, Wrench, FileText, FileSpreadsheet, Pencil } from "lucide-react";
import { generatePDF } from "@/utils/exportPdf";
import { generateExcel } from "@/utils/exportExcel";
import { SERVICE_CHARGE_MAP } from "@/types/jobCard";
import type { JobCardData, ApiJob, ApiErrorDetail, ServiceType } from "@/types/jobCard";

interface Part {
    id: number;
    part_name: string;
    part_number?: string | null;
    quantity: number;
    unit_price: number;
    total: number;
}

interface Labor {
    id: number;
    description: string;
    hours: number;
    rate: number;
    total: number;
}

interface Props {
    jobId: number;
    onClose: () => void;
    onApproved: () => void;
}

const PricingPanel = ({ jobId, onClose, onApproved }: Props) => {
    const [job, setJob]         = useState<ApiJob | null>(null);
    const [parts, setParts]     = useState<Part[]>([]);
    const [labor, setLabor]     = useState<Labor[]>([]);
    const [prices, setPrices]   = useState<Record<number, string>>({});
    const [rates, setRates]     = useState<Record<number, string>>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving]   = useState(false);
    const [approved, setApproved] = useState(false);

    useEffect(() => {
        apiFetch(`/jobs/${jobId}`)
            .then(r => r.json())
            .then(d => {
                if (d.success && d.data) {
                    setJob(d.data.job);
                    const p: Part[] = d.data.parts || [];
                    setParts(p);
                    const init: Record<number, string> = {};
                    p.forEach(pt => { init[pt.id] = Number(pt.unit_price) > 0 ? String(pt.unit_price) : ""; });
                    setPrices(init);

                    // Engineer submissions are stored with labour rates zeroed, so the
                    // manager prices labour here alongside parts.
                    const l: Labor[] = d.data.labor || [];
                    setLabor(l);
                    const initRates: Record<number, string> = {};
                    l.forEach(row => { initRates[row.id] = Number(row.rate) > 0 ? String(row.rate) : ""; });
                    setRates(initRates);

                    if (d.data.job?.status === "APPROVED") setApproved(true);
                }
            })
            .catch(() => toast.error("Failed to load job details"))
            .finally(() => setLoading(false));
    }, [jobId]);

    const setPrice = (id: number, val: string) => {
        setPrices(prev => ({ ...prev, [id]: val }));
    };

    const setRate = (id: number, val: string) => {
        setRates(prev => ({ ...prev, [id]: val }));
    };

    // job_data is JSONB but can arrive as a string depending on the driver.
    const storedJson: Record<string, unknown> = (() => {
        try {
            return (typeof job?.job_data === "string" ? JSON.parse(job.job_data) : job?.job_data) || {};
        } catch {
            return {};
        }
    })();

    // Mirrors the server's service-charge rules so the totals shown here match the stored ones.
    const serviceCharge = job?.service_type === "warranty"
        ? 0
        : (job?.service_type === "breakdown_call" && (storedJson.breakdown_call_type === "warranty_amc" || storedJson.coverage_type === "warranty_amc"))
            ? 0
            : job?.sales_area === "Abu Dhabi Variable"
                ? Number(storedJson.service_charge ?? 0)
                : SERVICE_CHARGE_MAP[job?.sales_area || ""] || 0;

    // Same formula as pricingService.calculatePricingTotals on the server.
    const VAT_PERCENT = 5;
    const partsTotal  = parts.reduce((s, p) => s + (Number(p.quantity) || 0) * (Number(prices[p.id]) || 0), 0);
    const labourTotal = labor.reduce((s, l) => s + (Number(l.hours) || 0) * (Number(rates[l.id]) || 0), 0);
    const taxable     = partsTotal + labourTotal + serviceCharge;
    const vatAmount   = taxable * (VAT_PERCENT / 100);
    const grandTotal  = taxable + vatAmount;

    // Two error shapes come back: schema failures put the text at the top level with
    // details keyed by "path", while thrown AppErrors nest the message and key by "field".
    const readApiError = async (res: Response, fallback: string) => {
        try {
            const payload = await res.json();
            const message = payload?.error?.message || payload?.message || fallback;
            const details = (Array.isArray(payload?.error?.details) ? payload.error.details : [])
                .map((d: ApiErrorDetail) => {
                    const key = String(d?.field ?? d?.path ?? "").trim();
                    const text = String(d?.message ?? "").trim();
                    return key ? `${key}: ${text}`.trim() : text;
                })
                .filter(Boolean);
            if (!details.length) return message;
            const shown = details.slice(0, 3).join("; ");
            return `${message} — ${shown}${details.length > 3 ? ` (+${details.length - 3} more)` : ""}`;
        } catch {
            return fallback;
        }
    };

    const buildJobCardData = (): JobCardData => {
        const compressorChecklist = Array.isArray(storedJson.compressor_checklist) ? storedJson.compressor_checklist : [];
        const dryerChecklist      = Array.isArray(storedJson.dryer_checklist)      ? storedJson.dryer_checklist      : [];

        return {
            customerInfo: {
                customerName: job?.customer_name || "",
                refNo:        job?.ref_no || "",
                jobCardNo:    job?.job_card_no || "",
                date:         job?.job_date || "",
                customerCode: job?.customer_code || "",
                attentionOf:  job?.attention_of || "",
                email:        job?.email || "",
                contactNo:    job?.contact_no || "",
                salesArea:    job?.sales_area || "",
                engineerName: job?.engineer_name || "",
                equipmentModel: job?.equipment_model || storedJson.equipment_model || "",
                equipmentBrandDescription: job?.equipment_brand_description || storedJson.equipment_brand_description || "",
                equipmentPartNo: job?.equipment_part_no || storedJson.equipment_part_no || "",
                equipmentSerialNo: job?.equipment_serial_no || storedJson.equipment_serial_no || "",
                equipmentYear: job?.equipment_year || storedJson.equipment_year || "",
            },
            serviceType:         (job?.service_type || "service_contract") as ServiceType,
            breakdownCallType:   job?.service_type === "breakdown_call" ? (storedJson.breakdown_call_type || storedJson.coverage_type) : undefined,
            compressorChecklist,
            dryerChecklist,
            parts: parts.map(p => {
                const qty   = Number(p.quantity) || 0;
                const price = Number(prices[p.id]) || Number(p.unit_price) || 0;
                return {
                    id:          String(p.id),
                    description: p.part_name || "",
                    qty,
                    unitPrice:   price,
                    totalPrice:  qty * price,
                };
            }),
            labor: labor.map(l => {
                const hours = Number(l.hours) || 0;
                const rate  = Number(rates[l.id]) || Number(l.rate) || 0;
                return {
                    id:          String(l.id),
                    description: l.description || "",
                    hours,
                    ratePerHour: rate,
                    totalCost:   hours * rate,
                };
            }),
            otherExpenses:      Number(job?.other_expenses) || 0,
            discountPercentage: Number(job?.discount_percentage) || 0,
            managerName:        job?.manager_name || "",
            serviceCharge:      serviceCharge,
        };
    };

    // PUT /jobs/:id validates a flat snake_case body against a strict schema, so every
    // key here must exist in jobUpdateSchema and every mandatory field must be present.
    const buildUpdatePayload = () => {
        const payload: Record<string, unknown> = {
            customer_name:               job?.customer_name ?? "",
            ref_no:                      job?.ref_no ?? "",
            job_card_no:                 job?.job_card_no ?? "",
            job_date:                    job?.job_date ?? "",
            service_type:                job?.service_type ?? "",
            customer_code:               job?.customer_code ?? "",
            attention_of:                job?.attention_of ?? "",
            contact_no:                  job?.contact_no ?? "",
            sales_area:                  job?.sales_area ?? "",
            equipment_model:             job?.equipment_model ?? "",
            equipment_brand_description: job?.equipment_brand_description ?? "",
            equipment_part_no:           job?.equipment_part_no ?? "",
            equipment_serial_no:         job?.equipment_serial_no ?? "",
            equipment_year:              job?.equipment_year ?? "",
            other_expenses:              Number(job?.other_expenses) || 0,
            discount_percentage:         Number(job?.discount_percentage) || 0,
            job_data:                    storedJson,
            parts: parts.map(p => {
                const qty   = Number(p.quantity) || 0;
                const price = Number(prices[p.id]) || 0;
                return {
                    part_name:   p.part_name || "",
                    part_number: p.part_number ?? "",
                    quantity:    qty,
                    unit_price:  price,
                    total:       qty * price,
                };
            }),
            labor: labor.map(l => {
                const hours = Number(l.hours) || 0;
                const rate  = Number(rates[l.id]) || 0;
                return {
                    description: l.description || "",
                    hours,
                    rate,
                    total: hours * rate,
                };
            }),
        };

        // manager_id is what the strict schema accepts; manager_name only travels inside job_data.
        if (job?.manager_id) payload.manager_id = Number(job.manager_id);
        // email must be a valid address when present, so omit it rather than send "".
        if (job?.email && String(job.email).trim()) payload.email = String(job.email).trim();

        return payload;
    };

    // Approval requires every part price and every labour rate to be greater than zero,
    // so both are checked here rather than letting the server reject the job later.
    const findBlockingIssue = (): string | null => {
        if (parts.length === 0) {
            return "This job has no parts. The engineer must add at least one part before it can be approved.";
        }
        if (parts.some(p => !(Number(prices[p.id]) > 0))) {
            return "Enter a price greater than 0 for every part before approving.";
        }
        const noPartNumber = parts.find(p => !String(p.part_number ?? "").trim());
        if (noPartNumber) {
            return `"${noPartNumber.part_name}" has no part number. The engineer must add one before this job can be saved.`;
        }
        if (labor.length === 0) {
            return "This job has no labour lines. The engineer must add at least one before it can be approved.";
        }
        if (labor.some(l => !(Number(l.hours) > 0))) {
            return "Every labour line needs hours greater than 0. Ask the engineer to correct the job card.";
        }
        if (labor.some(l => !(Number(rates[l.id]) > 0))) {
            return "Enter an hourly rate greater than 0 for every labour line before approving.";
        }
        if (!String(storedJson.engineer_name ?? "").trim()) {
            return "This job has no engineer name recorded, which the server requires. Ask the engineer to resubmit it.";
        }
        const checklistComplete = (items: unknown) =>
            Array.isArray(items) &&
            items.length > 0 &&
            items.every((item) => ["done", "na", "pending"].includes(String((item as { status?: unknown })?.status ?? "").trim().toLowerCase()));
        if (!checklistComplete(storedJson.compressor_checklist) || !checklistComplete(storedJson.dryer_checklist)) {
            return "The compressor and dryer checklists are incomplete. The engineer must finish them before approval.";
        }
        return null;
    };

    const handleSave = async () => {
        const issue = findBlockingIssue();
        if (issue) {
            toast.error(issue);
            return;
        }
        setSaving(true);
        try {
            // 1. Persist the prices. Without this the parts and labour rows keep the zeros
            //    the engineer's submission wrote, and the approval check below always fails.
            const jobRes = await apiFetch(`/jobs/${jobId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(buildUpdatePayload()),
            });
            if (!jobRes.ok) throw new Error(await readApiError(jobRes, "Failed to save prices"));

            // 2. Submit pricing. The server recomputes the totals from the rows just saved
            //    and ignores the ones sent here, so these are for the stored pricing record.
            const pricingRes = await apiFetch(`/jobs/${jobId}/pricing`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    labour_rate: Number(rates[labor[0].id]) || 0,
                    service_charge: serviceCharge,
                    discount: 0,
                    vat_percent: VAT_PERCENT,
                    parts_total: partsTotal,
                    labour_total: labourTotal,
                    taxable_amount: taxable,
                    vat_amount: vatAmount,
                    grand_total: grandTotal,
                }),
            });
            if (!pricingRes.ok) throw new Error(await readApiError(pricingRes, "Failed to save pricing"));

            // 3. Approve.
            const statusRes = await apiFetch(`/jobs/${jobId}/status`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "APPROVED" }),
            });
            if (!statusRes.ok) throw new Error(await readApiError(statusRes, "Failed to approve"));

            setApproved(true);
            toast.success("Prices saved and job approved!");
            window.dispatchEvent(new Event('jobsUpdated'));
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Something went wrong");
        } finally {
            setSaving(false);
        }
    };

    const handlePDF = async () => {
        if (!job?.manager_name) {
            toast.warning("No Manager Name on this job — PDF may be missing manager info.");
        }
        try {
            const data = buildJobCardData();
            console.log("PDF data:", data);
            await generatePDF(data);
            toast.success("PDF downloaded!");
        } catch (err) {
            console.error("PDF generation error:", err);
            toast.error(`Failed to generate PDF: ${err instanceof Error ? err.message : "unknown error"}`);
        }
    };

    const handleExcel = () => {
        try {
            const data = buildJobCardData();
            console.log("Excel data:", data);
            generateExcel(data);
            toast.success("Excel downloaded!");
        } catch (err) {
            console.error("Excel generation error:", err);
            toast.error(`Failed to generate Excel: ${err instanceof Error ? err.message : "unknown error"}`);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
                <span className="ml-3 text-slate-500 font-medium">Loading job details...</span>
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex flex-wrap justify-between items-center gap-3 bg-white/80 p-5 rounded-2xl border border-slate-200 shadow-sm">
                <div>
                    <h2 className="text-xl font-bold text-slate-800">
                        {approved ? "Job Approved" : "Set Part Prices"}
                    </h2>
                    <p className="text-sm text-slate-500 mt-0.5">
                        Job <span className="font-semibold text-slate-700">{job?.job_card_no}</span>
                        {" · "}{job?.customer_name}
                        {" · "}{job?.engineer_name || "—"}
                    </p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => {
                            window.dispatchEvent(new CustomEvent('openEditJob', { detail: { jobId } }));
                        }}
                        className="flex items-center gap-1.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-xl transition-colors"
                    >
                        <Pencil size={14} /> Edit Job
                    </button>
                    <button
                        onClick={onClose}
                        className="text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 px-4 py-2 rounded-xl transition-colors"
                    >
                        ← Back
                    </button>
                </div>
            </div>

            {/* Parts Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
                    <Package size={18} className="text-slate-500" />
                    <h3 className="font-bold text-slate-700">Parts</h3>
                </div>

                {parts.length === 0 ? (
                    <div className="py-14 text-center text-slate-400">
                        <Package size={36} className="mx-auto mb-3 opacity-30" />
                        <p className="font-medium">No parts were added by the engineer.</p>
                    </div>
                ) : (
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 font-bold">
                            <tr>
                                <th className="px-6 py-3 text-left">Part Description</th>
                                <th className="px-6 py-3 text-center w-20">Qty</th>
                                <th className="px-6 py-3 text-left w-44">Unit Price (AED)</th>
                                <th className="px-6 py-3 text-right w-32">Total</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {parts.map(part => {
                                const price   = Number(prices[part.id]) || 0;
                                const total   = Number(part.quantity) * price;
                                const missing = !prices[part.id] || Number(prices[part.id]) <= 0;
                                return (
                                    <tr key={part.id} className="hover:bg-slate-50/60 transition-colors">
                                        <td className="px-6 py-4 font-semibold text-slate-800">{part.part_name}</td>
                                        <td className="px-6 py-4 text-center text-slate-600">{part.quantity}</td>
                                        <td className="px-6 py-4">
                                            <input
                                                type="number"
                                                inputMode="decimal"
                                                min="0"
                                                step="0.01"
                                                placeholder="Enter price"
                                                value={prices[part.id] ?? ""}
                                                onChange={e => setPrice(part.id, e.target.value)}
                                                className={`w-full h-10 px-3 rounded-xl border-2 text-sm font-bold outline-none transition-all
                                                    ${missing
                                                        ? 'border-amber-400 bg-amber-50 placeholder:text-amber-400 focus:border-amber-500'
                                                        : 'border-emerald-400 bg-emerald-50 text-emerald-800 focus:border-emerald-500'
                                                    }`}
                                            />
                                        </td>
                                        <td className="px-6 py-4 text-right font-bold text-slate-800">
                                            AED {total.toFixed(2)}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        <tfoot className="bg-slate-50 font-bold text-slate-700 text-sm">
                            <tr>
                                <td colSpan={3} className="px-6 py-3 text-right">Parts Total:</td>
                                <td className="px-6 py-3 text-right">
                                    AED {partsTotal.toFixed(2)}
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                )}
            </div>

            {/* Labour Table — rates are zeroed on submission, so the manager sets them here */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
                    <Wrench size={18} className="text-slate-500" />
                    <h3 className="font-bold text-slate-700">Labour</h3>
                </div>

                {labor.length === 0 ? (
                    <div className="py-14 text-center text-slate-400">
                        <Wrench size={36} className="mx-auto mb-3 opacity-30" />
                        <p className="font-medium">No labour lines were added by the engineer.</p>
                        <p className="text-sm mt-1">At least one is required before this job can be approved.</p>
                    </div>
                ) : (
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 font-bold">
                            <tr>
                                <th className="px-6 py-3 text-left">Description</th>
                                <th className="px-6 py-3 text-center w-20">Hours</th>
                                <th className="px-6 py-3 text-left w-44">Rate / Hour (AED)</th>
                                <th className="px-6 py-3 text-right w-32">Total</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {labor.map(row => {
                                const rate    = Number(rates[row.id]) || 0;
                                const total   = (Number(row.hours) || 0) * rate;
                                const missing = !(rate > 0);
                                return (
                                    <tr key={row.id} className="hover:bg-slate-50/60 transition-colors">
                                        <td className="px-6 py-4 font-semibold text-slate-800">{row.description}</td>
                                        <td className="px-6 py-4 text-center text-slate-600">{row.hours}</td>
                                        <td className="px-6 py-4">
                                            <input
                                                type="number"
                                                inputMode="decimal"
                                                min="0"
                                                step="0.01"
                                                placeholder="Enter rate"
                                                value={rates[row.id] ?? ""}
                                                onChange={e => setRate(row.id, e.target.value)}
                                                className={`w-full h-10 px-3 rounded-xl border-2 text-sm font-bold outline-none transition-all
                                                    ${missing
                                                        ? 'border-amber-400 bg-amber-50 placeholder:text-amber-400 focus:border-amber-500'
                                                        : 'border-emerald-400 bg-emerald-50 text-emerald-800 focus:border-emerald-500'
                                                    }`}
                                            />
                                        </td>
                                        <td className="px-6 py-4 text-right font-bold text-slate-800">
                                            AED {total.toFixed(2)}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        <tfoot className="bg-slate-50 font-bold text-slate-700 text-sm">
                            <tr>
                                <td colSpan={3} className="px-6 py-3 text-right">Labour Total:</td>
                                <td className="px-6 py-3 text-right">
                                    AED {labourTotal.toFixed(2)}
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                )}
            </div>

            {/* Totals — same formula the server applies when it stores the pricing record */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                    <tbody className="divide-y divide-slate-100 text-slate-700 font-semibold">
                        <tr>
                            <td className="px-6 py-3">Parts</td>
                            <td className="px-6 py-3 text-right">AED {partsTotal.toFixed(2)}</td>
                        </tr>
                        <tr>
                            <td className="px-6 py-3">Labour</td>
                            <td className="px-6 py-3 text-right">AED {labourTotal.toFixed(2)}</td>
                        </tr>
                        <tr>
                            <td className="px-6 py-3">Service Charge</td>
                            <td className="px-6 py-3 text-right">AED {serviceCharge.toFixed(2)}</td>
                        </tr>
                        <tr>
                            <td className="px-6 py-3">VAT ({VAT_PERCENT}%)</td>
                            <td className="px-6 py-3 text-right">AED {vatAmount.toFixed(2)}</td>
                        </tr>
                    </tbody>
                    <tfoot className="bg-slate-50">
                        <tr className="text-base">
                            <td className="px-6 py-4 font-extrabold text-slate-900">Grand Total</td>
                            <td className="px-6 py-4 text-right font-extrabold text-slate-900">
                                AED {grandTotal.toFixed(2)}
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap justify-end gap-3 pb-8">
                <button
                    onClick={onClose}
                    className="px-6 py-3 rounded-xl border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50 transition-colors"
                >
                    Cancel
                </button>

                {!approved && (
                    <button
                        onClick={handleSave}
                        disabled={saving || parts.length === 0}
                        className="flex items-center gap-2 px-8 py-3 rounded-xl bg-green-600 hover:bg-green-700 text-white font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {saving
                            ? <><Loader2 size={18} className="animate-spin" /> Saving...</>
                            : <><CheckCircle2 size={18} /> Save Prices & Approve</>
                        }
                    </button>
                )}

                {approved && (
                    <>
                        <button
                            onClick={handlePDF}
                            className="flex items-center gap-2 px-8 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition-colors"
                        >
                            <FileText size={18} />
                            Download PDF
                        </button>
                        <button
                            onClick={handleExcel}
                            className="flex items-center gap-2 px-8 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition-colors"
                        >
                            <FileSpreadsheet size={18} />
                            Download Excel
                        </button>
                    </>
                )}
            </div>
        </div>
    );
};

export default PricingPanel;

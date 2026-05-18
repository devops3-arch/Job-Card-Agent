import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import { Loader2, CheckCircle2, Package, FileText, FileSpreadsheet, Pencil } from "lucide-react";
import { generatePDF } from "@/utils/exportPdf";
import { generateExcel } from "@/utils/exportExcel";
import type { JobCardData } from "@/types/jobCard";

interface Part {
    id: number;
    part_name: string;
    quantity: number;
    unit_price: number;
    total: number;
}

interface Props {
    jobId: number;
    onClose: () => void;
    onApproved: () => void;
}

const PricingPanel = ({ jobId, onClose, onApproved }: Props) => {
    const [job, setJob]         = useState<any>(null);
    const [parts, setParts]     = useState<Part[]>([]);
    const [rawData, setRawData] = useState<any>(null);
    const [prices, setPrices]   = useState<Record<number, string>>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving]   = useState(false);
    const [approved, setApproved] = useState(false);

    useEffect(() => {
        apiFetch(`/jobs/${jobId}`)
            .then(r => r.json())
            .then(d => {
                if (d.success && d.data) {
                    setJob(d.data.job);
                    setRawData(d.data);
                    const p: Part[] = d.data.parts || [];
                    setParts(p);
                    const init: Record<number, string> = {};
                    p.forEach(pt => { init[pt.id] = Number(pt.unit_price) > 0 ? String(pt.unit_price) : ""; });
                    setPrices(init);
                    if (d.data.job?.status === "APPROVED") setApproved(true);
                }
            })
            .catch(() => toast.error("Failed to load job details"))
            .finally(() => setLoading(false));
    }, [jobId]);

    const setPrice = (id: number, val: string) => {
        setPrices(prev => ({ ...prev, [id]: val }));
    };

    const buildJobCardData = (): JobCardData => {
        let storedJson: any = {};
        try {
            storedJson = (typeof job?.job_data === 'string' ? JSON.parse(job.job_data) : job?.job_data) || {};
        } catch { storedJson = {}; }

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
                underWarranty: !!job?.under_warranty,
            },
            serviceType:         (job?.service_type || "service_contract") as any,
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
            labor: (rawData?.labor || []).map((l: any) => {
                const hours = Number(l.hours) || 0;
                const rate  = Number(l.rate) || 0;
                return {
                    id:          String(l.id),
                    description: l.description || "",
                    hours,
                    ratePerHour: rate,
                    totalCost:   Number(l.total) || (hours * rate),
                };
            }),
            otherExpenses:      Number(job?.other_expenses) || 0,
            discountPercentage: Number(job?.discount_percentage) || 0,
            managerName:        job?.manager_name || "",
        };
    };

    const handleSave = async () => {
        const anyMissing = parts.some(p => !prices[p.id] || Number(prices[p.id]) <= 0);
        if (anyMissing) {
            toast.error("Please enter a price greater than 0 for all parts before approving.");
            return;
        }
        setSaving(true);
        try {
            const partsTotal = parts.reduce((s, p) => s + Number(p.quantity) * Number(prices[p.id]), 0);
            const taxable    = partsTotal;
            const vatAmount  = taxable * 0.05;
            const grandTotal = taxable + vatAmount;

            const pricingRes = await apiFetch(`/jobs/${jobId}/pricing`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    parts_total: partsTotal, labour_total: 0,
                    taxable_amount: taxable, vat_amount: vatAmount,
                    grand_total: grandTotal, vat_percent: 5,
                    discount: 0, service_charge: 0, labour_rate: 0,
                }),
            });
            if (!pricingRes.ok) throw new Error("Failed to save pricing");

            const statusRes = await apiFetch(`/jobs/${jobId}/status`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "APPROVED" }),
            });
            if (!statusRes.ok) {
                const err = await statusRes.json();
                throw new Error(err.message || "Failed to approve");
            }

            setApproved(true);
            toast.success("Prices saved and job approved!");
            window.dispatchEvent(new Event('jobsUpdated'));
        } catch (err: any) {
            toast.error(err.message || "Something went wrong");
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
        } catch (err: any) {
            console.error("PDF generation error:", err);
            toast.error(`Failed to generate PDF: ${err?.message || "unknown error"}`);
        }
    };

    const handleExcel = () => {
        try {
            const data = buildJobCardData();
            console.log("Excel data:", data);
            generateExcel(data);
            toast.success("Excel downloaded!");
        } catch (err: any) {
            console.error("Excel generation error:", err);
            toast.error(`Failed to generate Excel: ${err?.message || "unknown error"}`);
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

    const grandTotal = parts.reduce((s, p) => s + Number(p.quantity) * (Number(prices[p.id]) || 0), 0) * 1.05;

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
                                    AED {(grandTotal / 1.05).toFixed(2)}
                                </td>
                            </tr>
                            <tr>
                                <td colSpan={3} className="px-6 py-3 text-right">VAT (5%):</td>
                                <td className="px-6 py-3 text-right">
                                    AED {(grandTotal - grandTotal / 1.05).toFixed(2)}
                                </td>
                            </tr>
                            <tr className="text-base">
                                <td colSpan={3} className="px-6 py-3 text-right font-extrabold text-slate-900">Grand Total:</td>
                                <td className="px-6 py-3 text-right font-extrabold text-slate-900">
                                    AED {grandTotal.toFixed(2)}
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                )}
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

export interface EquipmentMaster {
  model: string;
  brandDescription: string;
}

export const equipmentMasterList: EquipmentMaster[] = [
  { model: "SX 3/4/6/8", brandDescription: "Kaeser Compressors" },
  { model: "SM 10/13/16", brandDescription: "Kaeser Compressors" },
  { model: "SM 13 SFC AIRCENTER", brandDescription: "Kaeser Compressors" },
  { model: "SK 22/25", brandDescription: "Kaeser Compressors" },
  { model: "ASK 28/34/40", brandDescription: "Kaeser Compressors" },
  { model: "ASK 34/40 SFC", brandDescription: "Kaeser Compressors" },
  { model: "ASD 35/40/50/60", brandDescription: "Kaeser Compressors" },
  { model: "BSD 65/75/83", brandDescription: "Kaeser Compressors" },
  { model: "CSD 85/105/125", brandDescription: "Kaeser Compressors" },
  { model: "CSDX 140/165", brandDescription: "Kaeser Compressors" },
  { model: "DSD 145", brandDescription: "Kaeser Compressors" },
  { model: "DSD 175", brandDescription: "Kaeser Compressors" },
  { model: "DSD 205", brandDescription: "Kaeser Compressors" },
  { model: "DSD 240", brandDescription: "Kaeser Compressors" },
  { model: "DSDX 245/305", brandDescription: "Kaeser Compressors" },
  { model: "ESD 375/445", brandDescription: "Kaeser Compressors" },
  { model: "FSD 475/575", brandDescription: "Kaeser Compressors" },
  { model: "HSD 662", brandDescription: "Kaeser Compressors" },
  { model: "HSD 722", brandDescription: "Kaeser Compressors" },
  { model: "HSD 782", brandDescription: "Kaeser Compressors" },
  { model: "HSD 842", brandDescription: "Kaeser Compressors" },
  { model: "Kaeser Sigma Control", brandDescription: "Kaeser Compressors" },
  { model: "Kaeser Sigma Comfort", brandDescription: "Kaeser Compressors" },
];

export function searchEquipment(query: string): EquipmentMaster[] {
  if (!query.trim()) return equipmentMasterList;

  const lower = query.toLowerCase();
  return equipmentMasterList.filter(
    (eq) =>
      eq.model.toLowerCase().includes(lower) ||
      eq.brandDescription.toLowerCase().includes(lower)
  );
}

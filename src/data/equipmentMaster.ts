export const equipmentMasterList = [
  // Compressors
  { model: "Kaeser Sigma Control", brand: "Kaeser Compressors", type: "Screw Compressor" },
  { model: "Kaeser Sigma Comfort", brand: "Kaeser Compressors", type: "Screw Compressor" },
  { model: "Atlas Copco GA", brand: "Atlas Copco", type: "Screw Compressor" },
  { model: "Atlas Copco GX", brand: "Atlas Copco", type: "Screw Compressor" },
  { model: "Ingersoll Rand R-Series", brand: "Ingersoll Rand", type: "Screw Compressor" },
  { model: "Sullair LS-Series", brand: "Sullair", type: "Screw Compressor" },

  // Dryers
  { model: "Kaeser Dryer TD", brand: "Kaeser Compressors", type: "Refrigerated Dryer" },
  { model: "Atlas Copco Dry-Air", brand: "Atlas Copco", type: "Refrigerated Dryer" },
  { model: "Ingersoll Rand D-Series", brand: "Ingersoll Rand", type: "Desiccant Dryer" },

  // Blowers
  { model: "Hanwha Blower Series", brand: "Hanwha", type: "Rotary Blower" },
  { model: "Clivet Air Handler", brand: "Clivet", type: "Air Handling Unit" },

  // Chillers
  { model: "Clivet Chiller", brand: "Clivet", type: "Water Chiller" },

  // Filters & Separators
  { model: "Kaeser Filter Element", brand: "Kaeser Compressors", type: "Air Filter" },
  { model: "Oil Separator", brand: "Various", type: "Separator" },
];

export function searchEquipment(query: string): typeof equipmentMasterList {
  if (!query.trim()) return equipmentMasterList;
  
  const lower = query.toLowerCase();
  return equipmentMasterList.filter(
    (eq) =>
      eq.model.toLowerCase().includes(lower) ||
      eq.brand.toLowerCase().includes(lower) ||
      eq.type.toLowerCase().includes(lower)
  );
}

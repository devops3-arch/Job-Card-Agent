const toNumber = (value, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

export const calculatePricingTotals = ({
  parts = [],
  labour = [],
  serviceCharge = 0,
  discountAmount = 0,
  vatPercent = 5,
}) => {
  const parts_total = parts.reduce((sum, item) => {
    const quantity = toNumber(item.quantity);
    const unit_price = toNumber(item.unit_price);
    const explicit_total = toNumber(item.total);
    const lineTotal = quantity || unit_price ? quantity * unit_price : explicit_total;
    return sum + lineTotal;
  }, 0);

  const labour_total = labour.reduce((sum, item) => {
    const hours = toNumber(item.hours);
    const rate = toNumber(item.rate);
    const explicit_total = toNumber(item.total);
    const lineTotal = hours || rate ? hours * rate : explicit_total;
    return sum + lineTotal;
  }, 0);

  const subtotal = parts_total + labour_total + toNumber(serviceCharge);
  const discount_amount = toNumber(discountAmount);
  const taxable_amount = subtotal - discount_amount;
  const vat_amount = taxable_amount * (toNumber(vatPercent) / 100);
  const grand_total = taxable_amount + vat_amount;

  return {
    parts_total,
    labour_total,
    subtotal,
    discount_amount,
    taxable_amount,
    vat_amount,
    grand_total,
    vat_percent: toNumber(vatPercent, 5),
  };
};

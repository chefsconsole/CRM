import { describe, expect, it } from "vitest";
import { calculateCommission, CommissionError, isTransactionCommissionable, outstanding, statusAfterPayment, summarizeCommissions, validatePayment } from "@/lib/domain/commission";

describe("commission calculation", () => {
  it("2% of ₹2,00,00,000 agreement value is ₹4,00,000", () => {
    expect(calculateCommission({ basis: "AGREEMENT_VALUE", rate: 2, transactionValue: 2e7 })).toEqual({ applicableValue: 2e7, amount: 4e5 });
  });
  it("uses the basic sale price when the agreement says so", () => {
    expect(calculateCommission({ basis: "BASIC_SALE_PRICE", rate: 1.75, transactionValue: 2e7, basicSalePrice: 1.8e7 }).amount).toBe(315000);
  });
  it("requires a basic sale price for that basis", () => {
    expect(() => calculateCommission({ basis: "BASIC_SALE_PRICE", rate: 2, transactionValue: 2e7 })).toThrow(CommissionError);
  });
  it("supports fixed amounts", () => {
    expect(calculateCommission({ basis: "FIXED_AMOUNT", fixedAmount: 150000, transactionValue: 2e7 }).amount).toBe(150000);
  });
  it("never assumes a rate", () => {
    expect(() => calculateCommission({ basis: "AGREEMENT_VALUE", transactionValue: 2e7 })).toThrow(/rate is required/);
    expect(() => calculateCommission({ basis: "AGREEMENT_VALUE", rate: 25, transactionValue: 2e7 })).toThrow(/above 10%/);
  });
  it("rounds to paise", () => {
    expect(calculateCommission({ basis: "AGREEMENT_VALUE", rate: 1.5, transactionValue: 12345679 }).amount).toBe(185185.19);
  });
  it("cancelled transactions are never commissionable", () => {
    expect(isTransactionCommissionable("CANCELLED")).toBe(false);
    expect(isTransactionCommissionable("BOOKED")).toBe(true);
  });
});

describe("payments", () => {
  it("rejects overpayment and non-positive amounts", () => {
    expect(validatePayment(400000, 300000, 150000)).toMatch(/exceed/);
    expect(validatePayment(400000, 0, 0)).toMatch(/greater than zero/);
    expect(validatePayment(400000, 300000, 100000)).toBeNull();
  });
  it("derives status from amounts received", () => {
    expect(statusAfterPayment("INVOICED", 400000, 100000)).toBe("PARTIALLY_PAID");
    expect(statusAfterPayment("INVOICED", 400000, 400000)).toBe("PAID");
    expect(statusAfterPayment("DISPUTED", 400000, 400000)).toBe("DISPUTED");
  });
  it("computes outstanding without going negative", () => {
    expect(outstanding(100, 150)).toBe(0);
  });
});

describe("summary", () => {
  it("never double counts a transaction and excludes cancelled/not eligible", () => {
    const s = summarizeCommissions([
      { id: "a", transactionId: "t1", status: "INVOICED", amountEarned: 400000, received: 100000 },
      { id: "a-dupe", transactionId: "t1", status: "INVOICED", amountEarned: 400000, received: 100000 },
      { id: "b", transactionId: "t2", status: "CANCELLED", amountEarned: 300000, received: 0 },
      { id: "c", transactionId: "t3", status: "DISPUTED", amountEarned: 200000, received: 0 },
    ]);
    expect(s).toEqual({ expected: 600000, received: 100000, outstanding: 500000, disputed: 200000 });
  });
});

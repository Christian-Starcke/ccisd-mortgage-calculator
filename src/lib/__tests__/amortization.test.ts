import { describe, expect, it } from "vitest";
import {
  buildAmortizationSchedule,
  monthlyPrincipalAndInterest,
  monthReachingLtv,
  principalFromPayment,
} from "../amortization";

describe("monthlyPrincipalAndInterest", () => {
  it("matches the textbook figure for a 30-year loan", () => {
    // $300,000 at 6.5% for 30 years is a widely published $1,896.20.
    const payment = monthlyPrincipalAndInterest(300_000, 0.065, 360);
    expect(payment).toBeCloseTo(1_896.2, 1);
  });

  it("handles a zero interest rate as simple division", () => {
    expect(monthlyPrincipalAndInterest(120_000, 0, 360)).toBeCloseTo(333.33, 2);
  });

  it("returns zero for a zero principal", () => {
    expect(monthlyPrincipalAndInterest(0, 0.065, 360)).toBe(0);
  });

  it("is the exact inverse of principalFromPayment", () => {
    const payment = monthlyPrincipalAndInterest(425_000, 0.0625, 360);
    expect(principalFromPayment(payment, 0.0625, 360)).toBeCloseTo(425_000, 2);
  });
});

describe("buildAmortizationSchedule", () => {
  const base = {
    loanAmount: 300_000,
    annualRate: 0.065,
    termMonths: 360,
    propertyValue: 310_000,
  };

  it("amortizes to zero over the full term", () => {
    const result = buildAmortizationSchedule(base);
    expect(result.schedule).toHaveLength(360);
    const final = result.schedule[result.schedule.length - 1];
    expect(final.closingBalance).toBeLessThan(1);
  });

  it("splits the first payment correctly between interest and principal", () => {
    const result = buildAmortizationSchedule(base);
    const first = result.schedule[0];
    // First month interest is simply balance times the monthly rate.
    expect(first.interest).toBeCloseTo((300_000 * 0.065) / 12, 2);
    expect(first.principal + first.interest).toBeCloseTo(
      result.monthlyPrincipalAndInterest,
      1,
    );
  });

  it("shifts the interest/principal mix toward principal over time", () => {
    const result = buildAmortizationSchedule(base);
    const first = result.schedule[0];
    const late = result.schedule[300];
    expect(late.principal).toBeGreaterThan(first.principal);
    expect(late.interest).toBeLessThan(first.interest);
  });

  it("shortens the payoff when extra principal is applied", () => {
    const withExtra = buildAmortizationSchedule({
      ...base,
      extraMonthlyPrincipal: 300,
    });
    expect(withExtra.monthsToPayoff).toBeLessThan(360);
    expect(withExtra.totalInterest).toBeLessThan(
      buildAmortizationSchedule(base).totalInterest,
    );
  });

  it("never overpays the final balance when extra principal is large", () => {
    const result = buildAmortizationSchedule({
      ...base,
      extraMonthlyPrincipal: 5_000,
    });
    const final = result.schedule[result.schedule.length - 1];
    expect(final.closingBalance).toBe(0);
    expect(final.closingBalance).not.toBeLessThan(0);
  });

  describe("mortgage insurance termination", () => {
    it("drops conventional PMI at 78% loan-to-value", () => {
      const result = buildAmortizationSchedule({
        loanAmount: 291_000, // 97% of 300,000
        annualRate: 0.065,
        termMonths: 360,
        propertyValue: 300_000,
        mortgageInsurance: {
          annualRate: 0.0055,
          terminationLtv: 0.78,
          maxMonths: null,
          basis: "declining-balance",
        },
      });

      expect(result.mortgageInsuranceEndsMonth).not.toBeNull();
      const endMonth = result.mortgageInsuranceEndsMonth as number;

      // The month after termination should carry no premium.
      expect(result.schedule[endMonth].mortgageInsurance).toBe(0);
      // And the balance at that point should be at or under 78% of value.
      expect(result.schedule[endMonth].openingBalance / 300_000).toBeLessThanOrEqual(
        0.78,
      );
    });

    it("keeps FHA MIP for the whole term when it starts above 90% LTV", () => {
      const result = buildAmortizationSchedule({
        loanAmount: 289_500,
        annualRate: 0.065,
        termMonths: 360,
        propertyValue: 300_000,
        mortgageInsurance: {
          annualRate: 0.0055,
          terminationLtv: null,
          maxMonths: null,
          basis: "declining-balance",
        },
      });

      expect(result.mortgageInsuranceEndsMonth).toBe(360);
      expect(result.schedule[359].mortgageInsurance).toBeGreaterThan(0);
    });

    it("caps FHA MIP at 132 months when it starts at or below 90% LTV", () => {
      const result = buildAmortizationSchedule({
        loanAmount: 270_000,
        annualRate: 0.065,
        termMonths: 360,
        propertyValue: 300_000,
        mortgageInsurance: {
          annualRate: 0.005,
          terminationLtv: null,
          maxMonths: 132,
          basis: "declining-balance",
        },
      });

      expect(result.mortgageInsuranceEndsMonth).toBe(132);
      expect(result.schedule[132].mortgageInsurance).toBe(0);
    });

    it("charges no premium when the rule is absent", () => {
      const result = buildAmortizationSchedule(base);
      expect(result.totalMortgageInsurance).toBe(0);
      expect(result.mortgageInsuranceEndsMonth).toBeNull();
    });
  });
});

describe("monthReachingLtv", () => {
  it("finds 80% before 78%", () => {
    const result = buildAmortizationSchedule({
      loanAmount: 291_000,
      annualRate: 0.065,
      termMonths: 360,
      propertyValue: 300_000,
    });

    const at80 = monthReachingLtv(result.schedule, 0.8, 300_000);
    const at78 = monthReachingLtv(result.schedule, 0.78, 300_000);

    expect(at80).not.toBeNull();
    expect(at78).not.toBeNull();
    expect(at80 as number).toBeLessThan(at78 as number);
  });
});

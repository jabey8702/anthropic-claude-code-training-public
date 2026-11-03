import { describe, expect, it } from "vitest"
import { Payment } from "@/data/types"
import {
  DEFAULT_EXPORT_COLUMNS,
  EXPORT_COLUMNS,
  exportFilename,
  exportLabel,
  parseExportColumns,
  parseExportScope,
  toCsv,
} from "./csv"

/**
 * The export is the file ops hands to a merchant, so a broken cell is a
 * support ticket rather than a stack trace. These tests pin the escaping and
 * the column contract; NWP-101 changes which columns ship, not how a cell is
 * written, and these should still pass afterwards.
 */

const payment: Payment = {
  id: "pay_0001",
  merchantId: "mch_01",
  amount: 25000,
  currency: "USD",
  status: "captured",
  method: "card",
  cardBrand: "visa",
  last4: "4242",
  createdAt: "2026-03-14T10:15:00.000Z",
  description: "Order 1180",
}

describe("toCsv", () => {
  it("writes a header row followed by one row per payment", () => {
    const lines = toCsv([payment]).split("\n")
    expect(lines).toHaveLength(2)
    expect(lines[0]).toBe(EXPORT_COLUMNS.join(","))
  })

  it("writes only the requested columns, in the order given", () => {
    expect(toCsv([payment], ["id", "amount"])).toBe(
      ["id,amount", "pay_0001,$250.00"].join("\n"),
    )
  })

  it("quotes cells containing a comma, so amounts do not split", () => {
    const large = { ...payment, amount: 123456789 }
    expect(toCsv([large], ["amount"])).toBe(['amount', '"$1,234,567.89"'].join("\n"))
  })

  it("doubles embedded quotes rather than dropping them", () => {
    const quoted = { ...payment, description: 'Order "rush"' }
    expect(toCsv([quoted], ["description"])).toBe(
      ["description", '"Order ""rush"""'].join("\n"),
    )
  })

  it("keeps a newline inside a description in one quoted cell", () => {
    const multiline = { ...payment, description: "Order 1180\nsecond line" }
    const body = toCsv([multiline], ["description"]).split("\n").slice(1).join("\n")
    expect(body).toBe('"Order 1180\nsecond line"')
  })

  it("resolves the merchant name, and falls back to the id when unknown", () => {
    expect(toCsv([payment], ["merchant"])).toContain("Lumen Coffee Roasters")
    const orphan = { ...payment, merchantId: "mch_missing" }
    expect(toCsv([orphan], ["merchant"])).toContain("mch_missing")
  })

  it("writes an empty cell for a payment with no card", () => {
    const bank: Payment = {
      ...payment,
      method: "bank_transfer",
      cardBrand: null,
      last4: null,
    }
    expect(toCsv([bank], ["card_brand", "last4"])).toBe(
      ["card_brand,last4", ","].join("\n"),
    )
  })

  it("emits a header even with no rows", () => {
    expect(toCsv([], ["id"])).toBe("id")
  })
})

describe("exportFilename", () => {
  it("stamps the UTC date, so two exports on the same day collide by design", () => {
    expect(exportFilename(new Date("2026-03-14T23:00:00.000Z"))).toBe(
      "payments-2026-03-14.csv",
    )
  })

  it("puts the scope label before the date", () => {
    const date = new Date("2026-08-13T09:00:00.000Z")
    expect(exportFilename(date, "disputed")).toBe("payments-disputed-2026-08-13.csv")
    expect(exportFilename(date, "all")).toBe("payments-all-2026-08-13.csv")
  })
})

describe("parseExportColumns", () => {
  it("defaults to every column except the card last four", () => {
    expect(parseExportColumns(null)).toEqual([...DEFAULT_EXPORT_COLUMNS])
    expect(DEFAULT_EXPORT_COLUMNS).not.toContain("last4")
    expect(DEFAULT_EXPORT_COLUMNS).toContain("currency")
  })

  it("keeps the requested columns in the order given", () => {
    expect(parseExportColumns("amount,id,last4")).toEqual(["amount", "id", "last4"])
  })

  it("drops duplicates and stray whitespace", () => {
    expect(parseExportColumns(" id, id ,amount")).toEqual(["id", "amount"])
  })

  it("rejects an unknown column rather than skipping it", () => {
    expect(parseExportColumns("id,card_number")).toBeNull()
    expect(parseExportColumns("id;DROP TABLE payments")).toBeNull()
  })

  it("rejects an empty selection, so there is never a file with no columns", () => {
    expect(parseExportColumns("")).toBeNull()
    expect(parseExportColumns(" , ")).toBeNull()
  })

  it("feeds toCsv a header that matches the selection", () => {
    const columns = parseExportColumns("id,amount,currency")!
    expect(toCsv([payment], columns)).toBe(
      ["id,amount,currency", "pay_0001,$250.00,USD"].join("\n"),
    )
  })
})

describe("parseExportScope", () => {
  it("defaults to the current filter", () => {
    expect(parseExportScope(null)).toBe("filter")
  })

  it("accepts the two known scopes and nothing else", () => {
    expect(parseExportScope("all")).toBe("all")
    expect(parseExportScope("filter")).toBe("filter")
    expect(parseExportScope("everything")).toBeNull()
  })
})

describe("exportLabel", () => {
  it("names the status when the filter has one", () => {
    expect(exportLabel("filter", { status: "disputed" })).toBe("disputed")
  })

  it("says all for the all scope, whatever the filter", () => {
    expect(exportLabel("all", { status: "disputed" })).toBe("all")
  })

  it("never puts search text or a merchant id in the filename", () => {
    expect(exportLabel("filter", { search: "../../etc", merchantId: "mch_01" })).toBe(
      "filtered",
    )
  })

  it("says all when the current filter is empty", () => {
    expect(exportLabel("filter", { status: "all" })).toBe("all")
  })
})

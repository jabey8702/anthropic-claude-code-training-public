import { merchantById } from "@/data/merchants"
import { Payment, PaymentFilters, PaymentStatus } from "@/data/types"
import { formatMoney } from "./money"

/**
 * CSV export for the payments table.
 *
 * Ops chooses the columns and the scope (NWP-101). Both arrive from the
 * client, so the route validates them here against these allowlists before
 * they reach the serializer or the filename.
 */

export const EXPORT_COLUMNS = [
  "id",
  "created_at",
  "merchant",
  "description",
  "status",
  "method",
  "card_brand",
  "last4",
  "amount",
  "currency",
] as const

export type ExportColumn = (typeof EXPORT_COLUMNS)[number]

/** Card last four stays out unless someone asks for it. */
export const DEFAULT_EXPORT_COLUMNS: readonly ExportColumn[] =
  EXPORT_COLUMNS.filter((column) => column !== "last4")

export const EXPORT_SCOPES = ["filter", "all"] as const

export type ExportScope = (typeof EXPORT_SCOPES)[number]

/**
 * Parse the `columns` param: a comma-separated list, kept in the order given.
 * Absent means the default set. Returns null for an unknown name or an empty
 * selection, so the route can reject rather than write an empty file.
 */
export function parseExportColumns(param: string | null): ExportColumn[] | null {
  if (param === null) return [...DEFAULT_EXPORT_COLUMNS]

  const names = param
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean)
  if (names.length === 0) return null

  const columns: ExportColumn[] = []
  for (const name of names) {
    if (!(EXPORT_COLUMNS as readonly string[]).includes(name)) return null
    const column = name as ExportColumn
    if (!columns.includes(column)) columns.push(column)
  }
  return columns
}

/** Parse the `scope` param. Absent means the current filter; anything unknown is null. */
export function parseExportScope(param: string | null): ExportScope | null {
  if (param === null) return "filter"
  return (EXPORT_SCOPES as readonly string[]).includes(param)
    ? (param as ExportScope)
    : null
}

export type ExportLabel = PaymentStatus | "all" | "filtered"

/**
 * The scope part of the filename. Built only from allowlisted values, never
 * from search text or a merchant id, so client input cannot reach the header.
 */
export function exportLabel(
  scope: ExportScope,
  filters: PaymentFilters,
): ExportLabel {
  if (scope === "all") return "all"
  if (filters.status && filters.status !== "all") return filters.status
  if (filters.merchantId || filters.search || filters.from || filters.to) {
    return "filtered"
  }
  return "all"
}

function escapeCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

function cell(payment: Payment, column: ExportColumn): string {
  switch (column) {
    case "id":
      return payment.id
    case "created_at":
      return payment.createdAt
    case "merchant":
      return merchantById(payment.merchantId)?.name ?? payment.merchantId
    case "description":
      return payment.description
    case "status":
      return payment.status
    case "method":
      return payment.method
    case "card_brand":
      return payment.cardBrand ?? ""
    case "last4":
      return payment.last4 ?? ""
    case "amount":
      return formatMoney(payment.amount, payment.currency)
    case "currency":
      return payment.currency
  }
}

export function toCsv(
  payments: Payment[],
  columns: readonly ExportColumn[] = EXPORT_COLUMNS,
): string {
  const header = columns.join(",")
  const rows = payments.map((payment) =>
    columns.map((column) => escapeCell(cell(payment, column))).join(","),
  )
  return [header, ...rows].join("\n")
}

export function exportFilename(date = new Date(), label?: ExportLabel): string {
  const scope = label ? `${label}-` : ""
  return `payments-${scope}${date.toISOString().slice(0, 10)}.csv`
}

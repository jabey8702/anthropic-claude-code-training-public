"use client"

import { Button } from "@/components/Button"
import {
  Drawer,
  DrawerBody,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/Drawer"
import type { ExportColumn, ExportScope } from "@/lib/csv"
import { Download } from "lucide-react"
import { useEffect, useState } from "react"

const LABELS: Record<ExportColumn, string> = {
  id: "Payment ID",
  created_at: "Created at (UTC)",
  merchant: "Merchant",
  description: "Description",
  status: "Status",
  method: "Method",
  card_brand: "Card brand",
  last4: "Card last four",
  amount: "Amount",
  currency: "Currency",
}

type Count =
  | { state: "loading" }
  | { state: "ready"; total: number }
  | { state: "error" }

/**
 * Export options for the payments table (NWP-101).
 *
 * The browser only chooses. The file is built by `/api/payments/export`, which
 * validates the columns and scope again, and the row count comes from
 * `/api/payments` so both use the same query builder.
 */
export function ExportDialog({
  query,
  columns,
  defaultColumns,
}: {
  /** The current filter as a query string, without the page. */
  query: string
  columns: readonly ExportColumn[]
  defaultColumns: readonly ExportColumn[]
}) {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<ExportColumn[]>([...defaultColumns])
  const [scope, setScope] = useState<ExportScope>("filter")
  const [count, setCount] = useState<Count>({ state: "loading" })

  const scopeQuery = scope === "all" ? "" : query

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setCount({ state: "loading" })
    fetch(`/api/payments?${scopeQuery}`)
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status))
        return response.json() as Promise<{ total: number }>
      })
      .then(({ total }) => {
        if (!cancelled) setCount({ state: "ready", total })
      })
      .catch(() => {
        if (!cancelled) setCount({ state: "error" })
      })
    return () => {
      cancelled = true
    }
  }, [open, scopeQuery])

  const toggle = (column: ExportColumn) => {
    setSelected((current) =>
      current.includes(column)
        ? current.filter((c) => c !== column)
        : columns.filter((c) => c === column || current.includes(c)),
    )
  }

  const downloadParams = new URLSearchParams(scopeQuery)
  downloadParams.set("scope", scope)
  downloadParams.set("columns", selected.join(","))
  const downloadHref = `/api/payments/export?${downloadParams.toString()}`

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Button variant="secondary" className="w-full gap-2 py-1.5 sm:w-fit">
          <Download
            className="-ml-0.5 size-4 shrink-0 text-gray-400 dark:text-gray-600"
            aria-hidden="true"
          />
          Export
        </Button>
      </DrawerTrigger>
      <DrawerContent className="sm:max-w-md">
        <DrawerHeader>
          <DrawerTitle>Export payments</DrawerTitle>
          <DrawerDescription className="text-sm">
            Choose what goes in the CSV before it leaves the console.
          </DrawerDescription>
        </DrawerHeader>

        <DrawerBody className="space-y-6">
          <fieldset>
            <legend className="text-sm font-medium text-gray-900 dark:text-gray-50">
              Scope
            </legend>
            <div className="mt-2 space-y-2">
              {(
                [
                  ["filter", "Current filter"],
                  ["all", "All payments"],
                ] as const
              ).map(([value, label]) => (
                <label
                  key={value}
                  className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"
                >
                  <input
                    type="radio"
                    name="export-scope"
                    value={value}
                    checked={scope === value}
                    onChange={() => setScope(value)}
                    className="size-4 accent-blue-600"
                  />
                  {label}
                </label>
              ))}
            </div>
            <p className="mt-2 text-sm text-gray-500" aria-live="polite">
              {count.state === "loading" && "Counting payments…"}
              {count.state === "error" && "Could not count payments. The export may still work."}
              {count.state === "ready" &&
                `${count.total.toLocaleString()} ${count.total === 1 ? "payment" : "payments"} will be exported.`}
            </p>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-medium text-gray-900 dark:text-gray-50">
              Columns
            </legend>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {columns.map((column) => (
                <label
                  key={column}
                  className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(column)}
                    onChange={() => toggle(column)}
                    className="size-4 accent-blue-600"
                  />
                  {LABELS[column]}
                </label>
              ))}
            </div>
            {selected.length === 0 && (
              <p className="mt-2 text-sm text-gray-500">
                Choose at least one column to download.
              </p>
            )}
          </fieldset>
        </DrawerBody>

        <DrawerFooter className="gap-2 sm:gap-0">
          <DrawerClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DrawerClose>
          {selected.length === 0 ? (
            <Button disabled>Download</Button>
          ) : (
            <Button asChild>
              <a href={downloadHref} onClick={() => setOpen(false)}>
                Download
              </a>
            </Button>
          )}
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}

import { filterPayments, parseFilters, sortPayments } from "@/data/queries"
import {
  exportFilename,
  exportLabel,
  parseExportColumns,
  parseExportScope,
  toCsv,
} from "@/lib/csv"
import { NextRequest, NextResponse } from "next/server"

/**
 * Exports the payments table as CSV.
 *
 * Columns and scope come from the client and are checked against the
 * allowlists in `@/lib/csv` before anything is read. Rows always come from the
 * query builder, unpaginated, so the file holds every match rather than the
 * page on screen.
 */
export function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams

  const columns = parseExportColumns(params.get("columns"))
  if (!columns) {
    return NextResponse.json(
      { message: "Choose at least one column, from the columns the export offers." },
      { status: 400 },
    )
  }

  const scope = parseExportScope(params.get("scope"))
  if (!scope) {
    return NextResponse.json(
      { message: 'Scope must be "filter" or "all".' },
      { status: 400 },
    )
  }

  const requested = parseFilters(params)
  const filters =
    scope === "all"
      ? {
          ...parseFilters(new URLSearchParams()),
          sort: requested.sort,
          direction: requested.direction,
        }
      : requested

  const rows = sortPayments(
    filterPayments(filters),
    filters.sort,
    filters.direction,
  )
  const filename = exportFilename(new Date(), exportLabel(scope, filters))

  return new Response(toCsv(rows, columns), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  })
}

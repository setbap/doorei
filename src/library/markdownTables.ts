const SEPARATOR = /(\|(?:[ \t]*:?-{3,}:?[ \t]*\|)+)/

export function repairMarkdownTables(text: string): string {
  return text
    .replace(/<br\s*\/?>/gi, "\n")
    .split("\n")
    .map(repairTableLine)
    .join("\n")
}

function repairTableLine(line: string): string {
  const match = SEPARATOR.exec(line)
  if (!match || match.index == null) return line
  const before = line.slice(0, match.index).trim()
  const after = line.slice(match.index + match[0].length).trim()
  if (!before && !after) return line
  const columns = columnCount(match[0])
  const rows: string[] = []
  if (before) rows.push(ensureRow(before, columns))
  rows.push(match[0].trim())
  if (after) rows.push(...dataRows(after, columns))
  return rows.join("\n")
}

function columnCount(separator: string): number {
  return separator.match(/-{3,}/g)?.length ?? 0
}

function dataRows(after: string, columns: number): string[] {
  const cells = after
    .split("|")
    .map((cell) => cell.trim())
    .filter((cell) => cell.length > 0)
  if (columns < 1) return [ensureRow(after, 0)]
  const rows: string[] = []
  for (let index = 0; index < cells.length; index += columns) {
    rows.push(pipeRow(cells.slice(index, index + columns)))
  }
  return rows
}

function ensureRow(part: string, columns: number): string {
  const cells = part
    .split("|")
    .map((cell) => cell.trim())
    .filter((cell) => cell.length > 0)
  if (columns > 0 && cells.length > 0) return pipeRow(cells.slice(0, columns))
  return pipeRow(cells)
}

function pipeRow(cells: string[]): string {
  return `| ${cells.join(" | ")} |`
}

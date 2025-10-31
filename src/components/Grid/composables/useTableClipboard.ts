import type { SelectionRange } from "./useTableSelection"

// Handles clipboard serialization for UiTable ranges (copy/paste/CSV).

interface UseTableClipboardOptions {
  getActiveRange: () => SelectionRange | null
  buildSelectionMatrix: (range: SelectionRange | null, options?: { includeHeaders?: boolean; fallbackToAll?: boolean }) => string[][]
  applyMatrixToSelection: (matrix: string[][], baseOverride?: { rowIndex: number; colIndex: number } | null) => void
}

/**
 * Exposes clipboard helpers that convert selections to tabular text and vice versa.
 */
export function useTableClipboard({ getActiveRange, buildSelectionMatrix, applyMatrixToSelection }: UseTableClipboardOptions) {
  /**
   * Copies text to the clipboard, falling back to a hidden textarea when the Clipboard API is unavailable.
   */
  async function writeTextToClipboard(text: string) {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return
    }
    if (typeof document === "undefined") return
    const textarea = document.createElement("textarea")
    textarea.value = text
    textarea.setAttribute("readonly", "")
    textarea.style.position = "fixed"
    textarea.style.opacity = "0"
    document.body.appendChild(textarea)
    textarea.select()
    try {
      const execCommand = (document as any).execCommand as ((command: string) => unknown) | undefined
      if (typeof execCommand === "function") {
        execCommand.call(document, "copy")
      }
    } finally {
      document.body.removeChild(textarea)
    }
  }

  /**
   * Reads text from the clipboard when permitted; returns null otherwise.
   */
  async function readTextFromClipboard(): Promise<string | null> {
    if (typeof navigator !== "undefined" && navigator.clipboard?.readText) {
      try {
        return await navigator.clipboard.readText()
      } catch {
        return null
      }
    }
    return null
  }

  /**
   * Copies the active selection matrix into the clipboard using tab-delimited text.
   */
  async function copySelectionToClipboard() {
    const range = getActiveRange()
    if (!range) return
    const matrix = buildSelectionMatrix(range, { includeHeaders: false })
    if (!matrix.length) return
    const payload = matrix.map(row => row.join("\t")).join("\n")
    if (!payload.length) return
    await writeTextToClipboard(payload)
  }

  /**
   * Parses clipboard text into a 2D matrix using newlines and tab delimiters.
   */
  function parseClipboardMatrix(text: string): string[][] {
    return text
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .split("\n")
      .filter((line, index, arr) => !(line === "" && index === arr.length - 1))
      .map(line => line.split("\t"))
  }

  /**
   * Pulls clipboard text and pushes it through the standard apply path.
   */
  async function pasteClipboardData() {
    const text = await readTextFromClipboard()
    if (!text) return
    applyClipboardText(text)
  }

  /**
   * Applies parsed clipboard text to the current selection.
   */
  function applyClipboardText(text: string) {
    const matrix = parseClipboardMatrix(text)
    if (!matrix.length || !matrix[0]?.length) return
    applyMatrixToSelection(matrix)
  }

  /**
   * Parses CSV into a 2D matrix, supporting quoted cells.
   */
  function parseCsv(text: string): string[][] {
    const rows: string[][] = []
    let currentRow: string[] = []
    let currentValue = ""
    let inQuotes = false
    for (let i = 0; i < text.length; i += 1) {
      const char = text[i]
      if (inQuotes) {
        if (char === "\"") {
          if (text[i + 1] === "\"") {
            currentValue += "\""
            i += 1
          } else {
            inQuotes = false
          }
        } else {
          currentValue += char
        }
        continue
      }
      if (char === "\"") {
        inQuotes = true
        continue
      }
      if (char === ",") {
        currentRow.push(currentValue)
        currentValue = ""
        continue
      }
      if (char === "\r") {
        continue
      }
      if (char === "\n") {
        currentRow.push(currentValue)
        rows.push(currentRow)
        currentRow = []
        currentValue = ""
        continue
      }
      currentValue += char
    }
    currentRow.push(currentValue)
    rows.push(currentRow)
    return rows.filter((row, index) => !(row.length === 1 && row[0] === "" && index === rows.length - 1))
  }

  /**
   * Escapes CSV values with quotes when needed.
   */
  function escapeCsvValue(value: string): string {
    if (value.includes("\"")) {
      value = value.replace(/\"/g, "\"\"")
    }
    if (/[\",\n]/.test(value)) {
      return `"${value}"`
    }
    return value
  }

  /**
   * Converts a matrix into CSV text.
   */
  function matrixToCsv(matrix: string[][]): string {
    return matrix.map(row => row.map(cell => escapeCsvValue(cell ?? "")).join(",")).join("\n")
  }

  /**
   * Serializes selection data into CSV, optionally including headers or a custom range.
   */
  function exportCSV(options?: { includeHeaders?: boolean; range?: SelectionRange | null }) {
    const matrix = buildSelectionMatrix(options?.range ?? getActiveRange(), {
      includeHeaders: options?.includeHeaders ?? true,
      fallbackToAll: true,
    })
    if (!matrix.length) return ""
    return matrixToCsv(matrix)
  }

  /**
   * Imports CSV text into the grid, optionally overriding the anchor cell.
   */
  function importCSV(text: string, options?: { base?: { rowIndex: number; colIndex: number } | null }) {
    const matrix = parseCsv(text)
    if (!matrix.length || !matrix[0]?.length) return false
    applyMatrixToSelection(matrix, options?.base ?? null)
    return true
  }

  return {
    copySelectionToClipboard,
    pasteClipboardData,
    applyClipboardText,
    parseClipboardMatrix,
    parseCsv,
    exportCSV,
    importCSV,
  }
}

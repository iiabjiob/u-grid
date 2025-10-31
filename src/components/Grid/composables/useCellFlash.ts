// Provides flash feedback utilities for UiTable cells.
// Usage: useCellFlash().flash(cells, 'copy' | 'paste' | 'fill' | 'undo' | 'redo')

type FlashType = 'copy' | 'paste' | 'fill' | 'undo' | 'redo';

export function useCellFlash() {
  /**
   * Applies a transient CSS class to each cell to re-run the related flash animation.
   * The same animation can be triggered multiple times by forcing a reflow.
   */
  function flash(cellElements: HTMLElement[], type: FlashType) {
    const classMap: Record<FlashType, string> = {
      copy: 'cell-flash-copy',
      paste: 'cell-flash-paste',
      fill: 'cell-flash-fill',
      undo: 'cell-flash-undo',
      redo: 'cell-flash-redo',
    };
    const className = classMap[type];
    if (!className) return;
    cellElements.forEach((cell: HTMLElement) => {
      cell.classList.remove(className);
      // Trigger a reflow so the animation can run again on subsequent calls.
      void cell.offsetWidth;
      cell.classList.add(className);
      // Clean up the class once the animation completes.
      setTimeout(() => cell.classList.remove(className), 500);
    });
  }
  return { flash };
}

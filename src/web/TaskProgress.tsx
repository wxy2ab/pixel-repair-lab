/** The count is readable as text. The bar shows the same checked tasks filling in. */
export function TaskProgress({ done, total, label }: { done: number; total: number; label: string }) {
  if (total < 2) return null
  return <span className="task-progress">
    <span>{label} <strong>{done}/{total}</strong></span>
    <span className="task-progress__track" aria-hidden="true"><i style={{ width: done / total * 100 + '%' }} /></span>
  </span>
}

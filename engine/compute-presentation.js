/** Honest UI projection of computation receipts. No inference from a URL. */
export function describeComputeReceipt(receipt) {
  const status = receipt?.status || 'not_requested';
  const summary = receipt?.summary;
  const nearest = summary?.nearest_km;
  const labels = {
    not_requested: 'Grid calculation not requested', requested: 'Grid calculation queued',
    started: 'Calculating nearest mapped substations', completed_empty: 'Search completed: no mapped substations returned',
    unsupported: 'Grid calculation unavailable', failed: 'Grid calculation failed',
  };
  if (status === 'completed' && Number.isFinite(nearest) && nearest >= 0) {
    return { status, text: `Nearest mapped substation: ${nearest.toFixed(2)} km`,
      distance_km: nearest, unit: 'km', scope: 'Geometric screening only; not an electrical connection, capacity or offer.' };
  }
  return { status, text: labels[status] || 'Grid calculation result unavailable',
    reason: receipt?.reason || null, distance_km: null, unit: null,
    scope: 'Geometric screening only; not an electrical connection, capacity or offer.' };
}

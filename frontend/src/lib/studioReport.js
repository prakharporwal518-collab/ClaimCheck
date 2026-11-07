// Pre-built AG Studio dashboard, so merchants see a finished report on first load.
// Field ids are "<source id>.<field>" (from the data engine's schema).
const f = (id, aggregation) => (aggregation ? { id: `disputes.${id}`, aggregation } : { id: `disputes.${id}` })
const title = (text) => ({ title: { enabled: true, text } })

export function buildReport() {
  const widgets = {
    risk: { type: 'value', dataMapping: { value: [f('money_at_risk', 'sum')] }, format: title('Money at risk (USD)') },
    avg: { type: 'value', dataMapping: { value: [f('score', 'avg')] }, format: title('Average evidence strength (0-10)') },
    count: { type: 'value', dataMapping: { value: [f('dispute_id', 'count')] }, format: title('Disputes handled') },
    status: {
      type: 'donut-chart',
      dataMapping: { categoryKey: [f('status')], valueKey: [f('dispute_id', 'count')] },
      format: title('Disputes by status'),
    },
    decision: {
      type: 'pie-chart',
      dataMapping: { categoryKey: [f('decision')], valueKey: [f('dispute_id', 'count')] },
      format: title('Fight vs refund'),
    },
    strength: {
      type: 'column-chart-grouped',
      dataMapping: { categoryKey: [f('strength')], valueKey: [f('amount', 'sum')] },
      format: title('Disputed amount by evidence strength'),
    },
    outcome: {
      type: 'bar-chart-grouped',
      dataMapping: { categoryKey: [f('outcome')], valueKey: [f('dispute_id', 'count')] },
      format: title('Outcomes'),
    },
    grid: {
      type: 'grid',
      dataMapping: {
        cols: [f('dispute_id'), f('buyer'), f('amount'), f('status'), f('strength'), f('score'), f('days_left'), f('due_date'), f('outcome')],
      },
      format: title('All disputes'),
    },
  }
  const widgetLayout = {
    risk: { xTrack: 0, yTrack: 0, xSpan: 4, ySpan: 2 },
    avg: { xTrack: 4, yTrack: 0, xSpan: 4, ySpan: 2 },
    count: { xTrack: 8, yTrack: 0, xSpan: 4, ySpan: 2 },
    status: { xTrack: 0, yTrack: 2, xSpan: 4, ySpan: 5 },
    decision: { xTrack: 4, yTrack: 2, xSpan: 4, ySpan: 5 },
    strength: { xTrack: 8, yTrack: 2, xSpan: 4, ySpan: 5 },
    outcome: { xTrack: 0, yTrack: 7, xSpan: 4, ySpan: 5 },
    grid: { xTrack: 4, yTrack: 7, xSpan: 8, ySpan: 5 },
  }
  return {
    pages: [{ id: 'overview', widgets, widgetLayout, layout: { columns: 12, rowHeight: 64 } }],
    selectedPageId: 'overview',
  }
}

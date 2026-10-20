export function buildReport(results, fixtureSummary) {
  const compatibilityFindings = results.filter(
    (result) => result.type === 'compatibility',
  );
  const outcome =
    fixtureSummary.failedFixtures ||
    fixtureSummary.failedConsumers ||
    compatibilityFindings.some((item) =>
      ['breaking', 'error'].includes(item.severity),
    )
      ? 'fail'
      : compatibilityFindings.length
        ? 'warning'
        : 'pass';
  return {
    outcome,
    summary: {
      ...fixtureSummary,
      compatibilityFindings: compatibilityFindings.length,
    },
    results,
  };
}

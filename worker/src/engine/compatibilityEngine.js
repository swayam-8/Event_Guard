import { analyzeCompatibility as analyzeSchemas } from '../../../shared/src/compatibility.js';

export function analyzeCompatibility({ oldSchema, oldVersion = null, newSchema, newVersion = null, policy }) {
  const result = analyzeSchemas(oldSchema, newSchema, { oldVersion, newVersion });
  if (policy?.removedPropertySeverity === 'error') {
    result.findings = result.findings.map((finding) =>
      finding.code === 'REMOVED_PROPERTY' ? { ...finding, severity: 'error' } : finding,
    );
    result.compatible = result.findings.length === 0;
  }
  return result;
}

import type { GroundedAnswer, RagEvidence } from "./contracts.ts";
import { GroundedAnswerSchema } from "./contracts.ts";

export interface GroundingValidation { valid: boolean; errors: string[]; citationCoverage: number; groundingSupport: number; claimSupport: Array<{ claim: string; score: number }> }
function normalized(value: string): string { return value.normalize("NFKC").toLocaleLowerCase("zh-CN").replace(/[^\p{L}\p{N}]+/gu, ""); }
function shingles(value: string): Set<string> {
  const text = normalized(value); const result = new Set<string>();
  if (text.length < 2) { if (text) result.add(text); return result; }
  for (let index = 0; index < text.length - 1; index += 1) result.add(text.slice(index, index + 2));
  return result;
}
function supportScore(claim: string, evidence: readonly RagEvidence[]): number {
  const expected = shingles(claim); if (!expected.size) return 0;
  const actual = shingles(evidence.map((item) => `${item.chunkId}\n${item.documentId}\n${item.title}\n${item.content}`).join("\n"));
  return [...expected].filter((item) => actual.has(item)).length / expected.size;
}
function criticalTokens(value: string): string[] { return value.match(/\d+(?:\.\d+)?%?|[a-z][a-z0-9._/-]{1,}/giu) ?? []; }
export function validateGroundedAnswer(rawAnswer: GroundedAnswer, evidence: readonly RagEvidence[]): GroundingValidation {
  const answer = GroundedAnswerSchema.parse(rawAnswer); const allowed = new Set(evidence.map((item) => item.chunkId)); const errors: string[] = [];
  let citedClaims = 0; const claimSupport: Array<{ claim: string; score: number }> = [];
  for (const claim of answer.claims) {
    const invalid = claim.evidenceChunkIds.filter((id) => !allowed.has(id));
    if (invalid.length) { errors.push(`Claim cites unavailable chunks: ${invalid.join(", ")}`); claimSupport.push({ claim: claim.text, score: 0 }); continue; }
    citedClaims += 1;
    const citedEvidence = evidence.filter((item) => claim.evidenceChunkIds.includes(item.chunkId)); const score = supportScore(claim.text, citedEvidence); claimSupport.push({ claim: claim.text, score });
    const evidenceText = normalized(citedEvidence.map((item) => `${item.chunkId} ${item.documentId} ${item.title} ${item.content}`).join(" "));
    const unsupportedCritical = criticalTokens(claim.text).filter((token) => !evidenceText.includes(normalized(token)));
    if (unsupportedCritical.length) errors.push(`Claim contains unsupported critical values: ${unsupportedCritical.join(", ")}`);
    if (score < 0.08) errors.push(`Claim is not sufficiently supported by its cited evidence (score ${score.toFixed(3)})`);
  }
  const citationCoverage = answer.claims.length ? citedClaims / answer.claims.length : answer.summary.trim() ? 0 : 1;
  const groundingSupport = claimSupport.length ? claimSupport.reduce((sum, item) => sum + item.score, 0) / claimSupport.length : 0;
  if (citationCoverage < 1) errors.push("Every claim must cite available evidence");
  return { valid: errors.length === 0, errors, citationCoverage, groundingSupport, claimSupport };
}

export function evidenceRequiresReview(evidence: readonly RagEvidence[]): boolean {
  const highRisk = new Set(["safety", "policy", "compliance", "contract", "insurance", "credit", "qualification"]);
  return evidence.some((item) => item.riskTags.some((tag) => highRisk.has(tag)));
}

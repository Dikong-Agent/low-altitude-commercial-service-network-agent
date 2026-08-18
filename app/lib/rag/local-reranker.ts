import type { RagEvidence, RerankPort } from "./contracts.ts";
import { termFrequency, tokenize } from "./text.ts";

export class LocalLexicalReranker implements RerankPort {
  readonly provider = "local"; readonly model = "deterministic-token-coverage-v1";
  async rerank(query: string, evidence: readonly RagEvidence[]): Promise<Array<{ chunkId: string; score: number }>> {
    const queryTerms = [...new Set(tokenize(query))];
    return evidence.map((item) => {
      const frequencies = termFrequency(tokenize(`${item.title} ${item.content}`));
      const coverage = queryTerms.length ? queryTerms.filter((term) => frequencies.has(term)).length / queryTerms.length : 0;
      const retrievalStrength = Math.max(item.scores.vector ?? 0, Math.min(item.scores.fused, 1));
      return { chunkId: item.chunkId, score: coverage * 0.7 + retrievalStrength * 0.3 };
    }).sort((left, right) => right.score - left.score);
  }
}

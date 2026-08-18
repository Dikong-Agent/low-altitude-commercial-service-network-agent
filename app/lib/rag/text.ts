const TOKEN_PATTERN = /[\p{Script=Han}]|[\p{L}\p{N}][\p{L}\p{N}._/-]*/gu;
export function normalizeSearchText(value: string): string { return value.normalize("NFKC").toLocaleLowerCase("zh-CN").replace(/\s+/g, " ").trim(); }
export function tokenize(value: string): string[] { return normalizeSearchText(value).match(TOKEN_PATTERN) ?? []; }
export function termFrequency(tokens: readonly string[]): Map<string, number> { const frequencies = new Map<string, number>(); for (const token of tokens) frequencies.set(token, (frequencies.get(token) ?? 0) + 1); return frequencies; }
export function cosineSimilarity(left: readonly number[], right: readonly number[]): number {
  if (left.length === 0 || left.length !== right.length) return 0;
  let dot = 0; let leftNorm = 0; let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) { dot += left[index]! * right[index]!; leftNorm += left[index]! ** 2; rightNorm += right[index]! ** 2; }
  return leftNorm === 0 || rightNorm === 0 ? 0 : dot / Math.sqrt(leftNorm * rightNorm);
}
export async function sha256(value: string): Promise<string> { const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(""); }

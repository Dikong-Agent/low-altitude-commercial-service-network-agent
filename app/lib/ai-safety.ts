import type { AgentInvokeResponse } from "./contracts";

export const AI_SAFETY_POLICY_VERSION = "2026-07-27.v1";

export class AISafetyError extends Error {
  constructor(
    public readonly code: "PROMPT_INJECTION_DETECTED" | "UPSTREAM_OUTPUT_BLOCKED",
    message: string,
  ) {
    super(message);
    this.name = "AISafetyError";
  }
}

const highConfidenceInjectionPatterns = [
  /(?:ignore|disregard|forget)\s+(?:all\s+)?(?:previous|prior|system|developer)\s+(?:instructions?|prompts?)/i,
  /(?:reveal|print|show|return|extract)\s+(?:the\s+)?(?:system|developer)\s+(?:prompt|message|instructions?)/i,
  /(?:忽略|无视|忘记|绕过).{0,12}(?:此前|之前|以上|系统|开发者).{0,8}(?:指令|提示词|规则|限制)/,
  /(?:输出|展示|泄露|返回|提取).{0,10}(?:系统提示词|开发者指令|内部提示词|密钥|访问令牌)/,
  /(?:jailbreak|DAN\s+mode|developer\s+mode)/i,
];

const secretPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bsk-[A-Za-z0-9_-]{20,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bBearer\s+[A-Za-z0-9._~+/-]{24,}=*\b/i,
];

function luhnValid(value: string): boolean {
  let sum = 0;
  let double = false;
  for (let index = value.length - 1; index >= 0; index -= 1) {
    let digit = Number(value[index]);
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

function containsSensitiveNumber(value: string): boolean {
  if (/(?:phone|mobile|手机号|联系电话|联系方式)[^\d]{0,30}1[3-9]\d{9}/i.test(value)) return true;
  if (/(?:id[_ -]?card|身份证|证件号码)[^\d]{0,30}\d{17}[\dXx]/i.test(value)) return true;
  const paymentFields = Array.from(value.matchAll(/(?:bank[_ -]?card|银行卡|支付卡)[^\d]{0,30}((?:\d[ -]?){15,18}\d)/gi));
  return paymentFields.some((match) => luhnValid(match[1].replaceAll(/[ -]/g, "")));
}

export function assertSafeAgentInput(input: string): void {
  if (highConfidenceInjectionPatterns.some((pattern) => pattern.test(input))) {
    throw new AISafetyError("PROMPT_INJECTION_DETECTED", "The request contains instructions that attempt to override Agent security controls");
  }
}

export function assertSafeAgentOutput(response: AgentInvokeResponse): void {
  const serialized = JSON.stringify(response);
  if (serialized.length > 1_000_000) {
    throw new AISafetyError("UPSTREAM_OUTPUT_BLOCKED", "The Agent output exceeds the safe response size");
  }
  if (secretPatterns.some((pattern) => pattern.test(serialized))) {
    throw new AISafetyError("UPSTREAM_OUTPUT_BLOCKED", "The Agent output may contain a credential or secret");
  }
  if (containsSensitiveNumber(serialized)) {
    throw new AISafetyError("UPSTREAM_OUTPUT_BLOCKED", "The Agent output may contain unapproved sensitive personal data");
  }
}

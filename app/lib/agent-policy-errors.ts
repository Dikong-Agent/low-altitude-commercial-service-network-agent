export class AgentPolicyError extends Error {
  constructor(
    public readonly status: 400 | 403,
    public readonly code: "ACCESS_DENIED" | "CONSENT_REQUIRED" | "SENSITIVE_INFERENCE_BLOCKED" | "OUT_OF_SCOPE" | "SENSITIVE_ATTRIBUTE_NOT_ALLOWED",
    message: string,
  ) {
    super(message);
    this.name = "AgentPolicyError";
  }
}

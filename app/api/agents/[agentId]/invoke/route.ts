import { AGENTS, type AgentId, type AgentInvokeRequest, type AgentInvokeResponse } from "../../../../lib/contracts";
import { invokeAg001 } from "../../../../lib/agents/ag001/workflow";

const demoOutputs: Record<AgentId, Omit<AgentInvokeResponse["output"], "summary">> = {
  "AG-001": { title: "候选产品选型比较", points: ["已将续航、有效载荷与环境适应性统一为可比较口径。", "候选方案分别适合长航时覆盖与复杂点位精细作业，两者侧重点不同。", "建议结合实际航线、风场和载荷清单完成最终选型复核。"], evidence: ["样例产品参数表", "场景适配规则 v1.0"] },
  "AG-002": { title: "说明书要点解读", points: ["已定位与问题最相关的操作、安全和故障处理章节。", "建议按环境确认、设备自检、定位状态和任务载荷的顺序进行检查。", "若关键状态异常，应停止任务并按照原厂流程处理，不以演示结果替代安全规范。"], evidence: ["样例说明书 · 安全章节", "样例说明书 · 故障处理"] },
  "AG-003": { title: "场景化产品推荐建议", points: ["已识别预算、使用场景、环境条件和关键性能约束。", "先以硬条件排除不满足载荷、续航或环境要求的候选产品。", "推荐结果同时给出匹配理由和取舍因素，便于进一步比较。"], evidence: ["样例产品目录", "导购规则与标签库"] },
  "AG-012": { title: "政策与标准要点解读", points: ["样例材料重点强调主体责任、活动过程管理和安全保障要求。", "政策理解需要同时关注适用对象、执行条件及配套细则。", "正式业务判断应回到最新有效文件，并由相关专业人员复核。"], evidence: ["样例政策材料 · 第一章", "样例政策材料 · 管理要求"] },
  "AG-025": { title: "客服意图识别与服务建议", points: ["已识别当前问题的业务意图与期望结果。", "可进入知识咨询或业务工具查询路径；正式数据接入后将返回实时结果。", "复杂、低置信度或涉及权益的事项将保留转人工协同入口。"], evidence: ["演示 FAQ", "客服路由规则 v1.0"] },
};

export async function POST(request: Request, context: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await context.params;
  const agent = AGENTS.find((item) => item.id === agentId);
  if (!agent) return Response.json({ message: "Agent not found" }, { status: 404 });
  let body: AgentInvokeRequest;
  try {
    body = await request.json() as AgentInvokeRequest;
  } catch {
    return Response.json({ message: "Invalid JSON body" }, { status: 400 });
  }
  if (body.agent_id !== agent.id) return Response.json({ message: "agent_id does not match route" }, { status: 400 });
  if (typeof body.input !== "string" || !body.input.trim()) return Response.json({ message: "input is required" }, { status: 400 });

  if (agent.id === "AG-001") {
    try {
      const response = await invokeAg001({ ...body, input: body.input.trim() });
      return Response.json(response, { headers: { "X-Agent-Interface-Version": "v1", "X-Agent-Engine": "langgraph-demo" } });
    } catch (error) {
      console.error("AG-001 workflow failed", error);
      return Response.json({ message: "AG-001 workflow failed safely" }, { status: 500 });
    }
  }

  const demo = demoOutputs[agent.id];
  const response: AgentInvokeResponse = {
    request_id: `DEMO-${Date.now().toString().slice(-8)}`,
    agent_id: agent.id, status: "completed", environment: "demo",
    output: { ...demo, summary: `已围绕“${body.input}”完成一次演示分析。以下结果用于展示 Agent 的理解、调用与解释能力。` },
    trace: agent.trace.map((name, index) => ({ name, detail: agent.traceNotes[index] })),
  };
  return Response.json(response, { headers: { "X-Agent-Interface-Version": "v1" } });
}

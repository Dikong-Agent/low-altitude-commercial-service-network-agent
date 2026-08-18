# R0标准Agent模块模板

复制本目录时将`AG-XXX`、`agxxx`和占位业务语义替换为真实Agent信息。实现顺序固定为：需求追溯、Schema、Provider端口、适配器、LangGraph工作流、测试、黄金评测、Runtime注册。

模板只定义业务Agent应用模块，不得在Agent目录中实现通用模型平台、主数据维护或业务动作执行系统。

必需文件：

- `types.ts.template`：请求上下文、意图、业务数据与输出Schema。
- `config.ts.template`：工作流、Prompt、规则版本及可靠性策略。
- `providers.ts.template`：Mock/正式Provider装配。
- `adapters.ts.template`：业务所需最小端口与确定性Mock。
- `workflow.ts.template`：显式LangGraph节点、条件路由、证据和人工复核。
- `tests.test.mjs.template`：正常、缺数、冲突、越权、外部失败、复核和注入用例。
- `evals.json.template`：黄金评测用例。

注册时必须使用`defineAgentModule`，并通过`pnpm run check`和`pnpm run test:r0`。


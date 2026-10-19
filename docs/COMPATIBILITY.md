# 源码接口核对与验收边界

初次核对日期：2026-10-17；2026-10-19 补充 Desktop `0.2.1-rc.2` ASAR 静态核对。目标基线为官方 `dsh-v0.2.0-rc.2` 及声明范围内的后续 0.2 线版本，固定提交 `639ed015397290b3745d163aafe02ffee4aa3f84`，提交时间 2026-09-29 17:21:31 +08:00。官方项目为 MIT；上游许可证副本见 `UPSTREAM-LICENSE.txt`。

## 版本确认与上一版差异

- 官方 [rc.2 Release](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.0-rc.2) 与 git tag 指向上述提交；该提交的 CLI 和 Desktop package.json 都是 `0.2.0-rc.2`。npm registry 的 `@deepseek-ai/dsh/0.2.0-rc.2` 元数据独立确认此版本已发布，但没有 gitHead，不能单凭 registry 推断 commit。发布 tarball 的 registry 声明完整性摘要记录在 `UPSTREAM-RC2.json`；没有安装运行该 tarball。
- 旧插件 `0.1.0` 核对的是 `0.2.1-alpha.5` 提交 `1517a4dbca0a2789ff1d41ba439600f8547d23fa`。本次逐项对比后，`ModelDirectory` 的目录与 resolver 源文件、`SessionSnapshot` 源文件、CLI plugin 命令源文件与两份官方输入扩展 fixture 完全相同。模型/推理能力类型、`selectModel` 方法、session binding/subagentAddress 消费接口、`conversation.input.left` 插槽和惰性 factory 协议保持相同。session service/class 的其他代码确有差异，不能说整个会话实现相同。
- **必须修正的版本闸门**：rc.2 的 [plugin-compatibility.ts](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/boot/app-boot/src/plugin-compatibility.ts) 只检查 DSH peerDependencies，忽略 engines.dsh；后续核对的 alpha.5 已优先读 engines.dsh。因此从 `0.1.1` 起同时声明 `engines.dsh` 和可选的 `@deepseek-ai/dsh` peer。optional 只避免包管理器自动补装 CLI，宿主兼容检查仍读取该声明，不构成绕过。服务依赖仍由 dsh.client.inject / Cordis inject 等待，不自动补装缺失服务。
- **声明范围**：两者均为 `^0.2.0-rc.2`。桌面版实际运行 `0.2.1-rc.2`，而 `engines.dsh: "0.2.0-rc.2"` 会让它按不兼容拒绝安装；放宽到 0.2 线是安装进真实 profile 的前提。上界保持 `<0.3.0`，0.3.0 及以后的接口尚未核对。`semver.satisfies` 在宿主侧使用 `includePrerelease: true`，故 0.2.x 的预发布版本也被接受。
- rc.2 Plugins 页只有直接 **Add plugin** 入口；后续 alpha 才有分体箭头和 **Install a third-party plugin** 菜单。安装文档已按 rc.2 改写。rc.2 Desktop 自带的配套 CLI 可以通过 **Manage dsh command** 管理。
- 后续 alpha 新增模型名称子插槽、boot release metadata 和 factory 样式归属修复。本插件不消费这些新增接口；样式由自己的 Cordis effect 管理。无需为 rc.2 编造替代模型 API 或修改银河/鲸鱼女孩 UI。
- `src/adapter/host-contract.ts` 更新为 rc.2 核对基线。保留原适配器调用，因为消费的调用契约一致；没有通过扩大版本范围掩盖不兼容。

`UPSTREAM-RC2.json` 记录 20 个源文件的 SHA-256 及与旧基线是否完全相同。`npm run check:upstream -- <rc.2源码目录>` 只读比较这些哈希，不导入、不执行上游代码，不运行任何上游安装脚本。

## 核对的真实接口

1. **发现与加载**：包声明 `dsh.client.platform: web`，导出 `./client`，Host Loader 条目使其参与扫描。浏览器产物执行 `window.__ModuleLoader__.load({ id, factory })`，factory 接收 require 并返回模块导出。这里不是 DOM 注入脚本，也不是一个假模型 API。来源：[Client Modules](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/docs/subsystems/client-modules.md)、[官方构建封装](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/client/tsdown.client.ts)。
2. **可安装 bundle**：`dsh.bundle.patch` 指向 `cordis.patch.yml`，使用 `insert` 注册 Host 空 `apply` 入口。来源：[官方扩展 fixture 清单](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/apps/web/tests/fixtures/plugins/fixture-input-extension/package.json)、[对应 patch](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/apps/web/tests/fixtures/plugins/fixture-input-extension/cordis.patch.yml)。
3. **位置**：已发布的 v0.1.4 在 `conversation.input.left` session-scope list 插槽增加额外入口；这是 rc.2 官方[插槽声明](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/client/ui-conversation/src/client/contract/slots.ts)所确认的旧行为。当前工作树改为注册组合模型与推理力度的 `conversation.input.model` 单实例插槽。对 Desktop `0.2.1-rc.2` ASAR 的静态检查确认宿主优先级为 0、插件为 -1，较低值优先；插件停用时，作用域释放器恢复原生注册。该证据仅覆盖这一版本的包内插槽、优先级和释放路径，未在实际运行的应用界面中验证替换效果。
4. **模型服务**：`ctx.modelDirectories.directoryFor(sessionId)` 返回原生共享 `ModelDirectory`；`store.subscribe/getSnapshot`、`load()`、`select({provider,model,reasoningEffort})`。来源：[服务](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/client/ui-model-selection/src/client/service.ts)、[目录](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/client/ui-model-selection/src/client/directory.ts)。
5. **真实能力**：按 provider id + model id 匹配，读取 `reasoning.efforts[{id,name}]` 和可选 `defaultEffort`。选择态来自当前完整 selection；不假设 off/low/high/max 永远齐全。来源：[模型数据类型](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/api/session-controller/src/types.ts)。
6. **会话生命周期**：`ctx.sessions.binding(sessionId).session` 提供 subscribe/getSnapshot；使用 running、removed、openState、pendingSubmissions、awaitingFirstTurn、subagent。来源：[Session 类](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/api/session-controller/src/client/sessions/session.ts)、[快照](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/api/session-controller/src/client/contract/snapshot.ts)。
7. **提交结果与副作用**：native `select` 返回 `RemoteResult`；成功后目录跟随持久投影更新。`selectModel` 将完整选择用于后续请求并异步调用 `agentDefaultModel.saveSelection`，后者失败只记录警告。来源：[Host command](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/api/session-controller/src/commands.ts)。
8. **共享运行时**：React、react-dom、react/jsx-runtime 都在宿主平台表里，插件保持外部引用以免出现两套 React。来源：[平台表](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/client/web/src/platform.ts)。
9. **安装/移除**：CLI `dsh plugin --profile <profile> add|remove ...` 透传 profile 包管理操作，新添加 bundle 被协调到 profile。Desktop 要求先初始化 profile、退出应用并使用配套 CLI。来源：[CLI](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/apps/cli/src/plugin.ts)、[包管理操作](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/boot/plugin-manager/src/operations.ts)。

## 类型与测试说明

`src/adapter/host-contract.ts` 是根据上述固定源码建立的最小结构类型，不是完整上游类型定义，也没有把官方 Host 实现复制或打包。这样插件运行时复用现有服务，构建不需要安装整个 DSH 依赖树。未来上游变更需要重新核对这些结构，不能靠 TypeScript 本地通过推断跨版本兼容。

`npm run check` 覆盖：类型检查、声明范围与 lockfile 回归测试、纯适配器测试、UI 交互测试（随测试目录执行）、原生产物构建、模拟 ModuleLoader 验收。bundle 验收检查惰性注册、允许的外部模块、插槽声明先于注册、共享目录引用、内嵌角色素材、样式卸载与 bundle 配置。

独立浏览器验收使用真实适配器与 UI，但 Host 是明确标注的模拟 observable store；没有向实际 DeepSeek 发起模型请求。已发布的 v0.1.4 附加入口包曾在 Desktop `0.2.1-rc.2` profile 中安装并启用，这不代表当前选择器替换改动已在真实应用界面中验收。替换行为目前只有该版本 ASAR 的静态证据。真实网络断线/重连、Host 默认值落盘与官方客户端完整回归仍需在目标安装中验证。第三方重打包即便显示相同版本，也不自动视为已验证。

## 运行时风险边界

- 客户端“运行中禁用”是防误操作保护，无法对远端并发开始任务作原子承诺。真实请求边界仍由 Host 管理。
- 插件读取共享 `ModelDirectory` 中的当前选择。提交前再次核对当前 route，防止旧手势写入新的模型。
- 远端成功并不等于下一条模型请求已经开始，更不等于异步默认持久化成功。
- 当前模型未声明 `defaultEffort` 时，选择器提供“跟随默认”以清除显式档位，不会选中第一档。
- 不自动安装依赖插件、不自动修改权限、不绕过 compatibility 检查、不写入 credentials。

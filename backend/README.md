# 在线英语解释：Cloudflare Worker + 百炼北京地域

默认模型 `qwen3.8-flash`；手动备用 `qwen3.7-flash`。原有离线听写、Apple Pencil 画布、基础词库、Noema 复制功能继续使用。GitHub Pages 只发布网页，**不会自动部署这个 Worker**。

## 浏览器部署

1. Cloudflare → Workers & Pages → Create application → Connect GitHub。由账户持有人确认 GitHub 授权；如需安装应用，仅选择 `JamLeung122/design-listening-lab`。遇到付费升级或额外权限，先停下确认。
2. 配置 Worker：名称 `design-listening-lab-ai`，生产分支 `main`，根目录 `backend`，构建命令留空，部署命令 `npm run deploy`（或 `npx wrangler deploy`）。依赖版本已固定，有锁文件。只使用免费计划。
3. 首次部署后，Worker → Settings → Variables and Secrets → Add，由用户自行录入下面两项，类型均为 **Secret**：
   - `DASHSCOPE_API_KEY`：百炼**北京地域** API Key。
   - `APP_ACCESS_TOKEN`：独立、随机的长访问口令（建议密码管理器生成至少 32 个随机字符），不能复用百炼 Key。
   完成保存和部署。这里是 Worker **运行时** Secrets，不是 Builds 的构建变量。不在聊天、源码、日志中输入或展示密钥。
4. `wrangler.toml` 固定 `QWEN_REGION = "beijing"`、`QWEN_MODEL = "qwen3.8-flash"`。只接受已确认额度的两个 Flash 模型；不自动切换模型、地域或供应商。若需要改用备用模型，先在百炼核实它的免费额度及“用完即停”，再修改配置重新部署。
5. 将实际 Worker HTTPS 地址加 `/explain`。在 iPad 的 https://jamleung122.github.io/design-listening-lab/ → **在线 AI 设置**填写该地址及 `APP_ACCESS_TOKEN`，不要填写百炼 API Key。访问口令只在当前页面内存中保存，刷新需重新输入。
6. 更新后联网重开页面，确认顶部版本 **4.2**，再测试。无需清除 Safari 网站数据；清除可能损失笔迹。已有离线页面可能需要关闭并重开一次，才能使用新缓存。

## 接入及安全边界

- 北京 OpenAI 兼容地址固定为 `https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions`。不接受客户端指定上游、模型或地域，并拒绝重定向。新工作空间若要求专属域名，需要按官方文档单独配置并审查；不会自动猜测域名。
- `enable_thinking: false`、`stream: false`，快速/详细回复最多 360/600 输出 Token；25 秒超时。只发送用户点击解释时选中的最多 1200 个字符，不发送全文、音频和手写。
- `/explain` 只接受来自 `https://jamleung122.github.io` 的 POST/预检。Origin 可伪造，不能替代访问口令。所有模型调用必须通过独立 Bearer 口令验证。
- 读取实际请求流并限制为 8192 字节，即使缺少或伪造 Content-Length 也生效。JSON 类型、文本长度、空响应、超时均有检查；上游原始错误和密钥不回传、不记录，响应不缓存。
- Cloudflare rate-limit binding 每个边缘节点约 10 次/分钟，所有已认证请求共享键。它是防突发措施，**不是严格全局额度或费用上限**；绑定缺失时不调用模型。账户内 namespace `1457516941` 应专用于本服务。
- 关闭 Worker observability 日志。百炼自身的数据处理政策独立于 Worker；不要选中机密材料发给在线模型。
- “免费额度用完即停”由百炼控制台执行，Worker 无法代替这个开关或确认剩余额度。额度/权限错误直接返回，不重试、不自动使用备用模型或 OpenAI。Cloudflare 自身额度与百炼额度互相独立，不自动升级付费计划。

## 验证

在项目根目录执行 `node --test tests/*.test.mjs`；在 `backend` 执行 `npm ci && npm run check` 检查部署包。测试使用假口令和模拟模型，不使用任何真实密钥或模型额度。

部署后：
- 无访问口令的 POST 应为 401（Secrets 未完成时为 503）；陌生 Origin 为 403；允许的 OPTIONS 为 204。
- 用户自行在 PWA 输入访问口令，选择 `visual language`，点击在线解释，应显示中文释义、英文改写及设计例句。
- 飞行模式：原文、基础词库、画布、Noema 提示词复制可用；在线按钮提示离线。检查笔迹保存、重开、阅读模式、音频本地文件选择。
- iPad Safari 主屏幕 PWA、真实 Apple Pencil 书写和飞行模式必须在实际设备验收；桌面测试不能代替。

官方资料：[北京地域](https://www.alibabacloud.com/help/en/model-studio/beijing-access-information)、[思考模式](https://help.aliyun.com/en/model-studio/deep-thinking)、[Cloudflare Git 集成](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/)、[Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)、[限流](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)。

# TypeChat

<p align="center">
  <a href="README.md">English</a> · <b>简体中文</b>
</p>

TypeChat 是一个通过类型系统轻松构建自然语言交互界面的核心库。

构建自然语言交互界面历来是一项极具挑战的任务。传统应用往往依赖复杂的决策树来判定用户意图并收集执行操作所需的输入参数。大语言模型（LLM）的出现降低了这一门槛，使我们能够直接接收用户的自然语言输入并匹配其意图。然而，这同时也带来了新的挑战，包括：需要约束模型的回复以确保安全性、将模型的响应结构化以便后续程序处理，以及确保模型返回的内容切实合法有效。提示词工程（Prompt Engineering）旨在解决这些问题，但伴随着陡峭的学习曲线，且随着提示词规模的膨胀，系统脆弱性会显著增加。

TypeChat 提出了革新理念：用**模式工程（Schema Engineering）**替代**提示词工程（Prompt Engineering）**。

您只需定义表示自然语言应用所支持意图的类型（Types）。它可以简单到一个用于情感分类的接口，也可以复杂到面向购物车或音乐流媒体应用的完整类型定义。例如，若要在模式（Schema）中追加新的意图，开发者只需向可辨识联合类型（Discriminated Union）中添加类型定义即可。若要构建分层模式，开发者可以通过“元模式（Meta-schema）”根据用户输入动态选择一个或多个子模式。

在定义好类型之后，TypeChat 会自动处理后续所有复杂流程：

1. 利用类型定义自动为 LLM 构建提示词（Prompt）。
2. 严格校验 LLM 的响应是否符合类型模式（Schema）。若校验失败，通过与语言模型进一步交互自动修复不合规的输出。
3. （无需再次调用 LLM）对生成的实例进行简洁摘要，并确认其符合用户意图。

类型定义即是一切（Types are all you need）！

# 快速入门 (Getting Started)

通过 npm 安装适用于 TypeScript/JavaScript 的 TypeChat：

```
npm install typechat
```

<!--

Or from PyPI:

...

Or NuGet

...

-->

您也可以直接通过源码体验 TypeChat：

* [Python 实现](./python/README.md)
* [TypeScript 实现](./typescript/README.md)
* [C#/.NET 实现](https://github.com/microsoft/TypeChat.net)

若想直观查看 TypeChat 的实际运行效果，建议探索 [TypeChat 示例项目](./typescript/examples)。您可以在本地机器或 GitHub Codespaces 中直接运行它们。

欲了解有关 TypeChat 的更多信息，欢迎访问[官方文档站点](https://microsoft.github.io/TypeChat)，其中包含更详尽的技术指南与入门教程。

## 参与贡献 (Contributing)

本项目诚挚欢迎社区贡献与建议。绝大多数贡献都需要您签署一份贡献者许可协议（CLA），声明您有权且确实授予我们使用您所贡献内容的权利。详情请访问 https://cla.opensource.microsoft.com。

当您提交拉取请求（PR）时，CLA 机器人会自动判断您是否需要签署 CLA，并在 PR 上标注适当状态（例如状态检查或留言）。只需按照机器人的指引操作即可。对于使用微软 CLA 的所有代码库，您只需签署一次。

本项目已采纳 [Microsoft 开源行为准则](https://opensource.microsoft.com/codeofconduct/)。如需了解更多信息，请参阅[行为准则常见问题解答](https://opensource.microsoft.com/codeofconduct/faq/)，如有其他疑问或意见，亦可联系 [opencode@microsoft.com](mailto:opencode@microsoft.com) 获取更多支持。

## 商标声明 (Trademarks)

本项目可能包含项目、产品或服务的商标或徽标。对微软商标或徽标的授权使用受制于且必须遵循 [微软商标与品牌使用指南](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general)。在对本项目修改后的衍生版本中使用微软商标或徽标时，绝不得引起混淆或暗示获得微软的赞助与背书。对第三方商标或徽标的任何使用均须遵守相应第三方的各项品牌政策。

---

> **翻译说明（Translation Disclaimer）**
> 本文档由社区志愿者（[@JasonYeYuhe](https://github.com/JasonYeYuhe)）人工翻译并维护，旨在降低中文开发者的阅读门槛。最后同步日期：2026年10月18日。若译文与英文原版存在任何出入或滞后，请以 [英文原版 (README.md)](README.md) 为准。欢迎通过 PR 协助改进译文！

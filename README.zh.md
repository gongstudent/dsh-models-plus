# dsh-models-plus

[English](README.md) | 中文

DeepSeek Harness **模型**设置页的替代实现，打包成可安装的 profile bundle。

之所以采取 fork 而非扩展：它携带的两处改动位于出厂页面的对话框和本地路由控件**内部**，
没有任何扩展点能够触及。

## 改动内容

| 改动 | 出厂行为 | 本包行为 |
|---|---|---|
| 模型发现搜索 | 候选列表很长，无法过滤 | 搜索框按 id 过滤候选；**全不选**清除所有勾选，包括被过滤器隐藏的那些 |
| 本地路由开关 | 每次 settings revision 变化都重新挂载（`key={revision}`），乐观状态随之丢失 | 保持挂载，显示乐观的开/关状态，且仅在存储的端口确实变化时才重同步端口输入框 |
| 搜索无结果 | — | 显示"无匹配"提示，而不是空白列表 |

## 安装

```sh
dsh plugin --profile web add github:gongstudent/dsh-models-plus
dsh web
```

等价地也可以写成完整 URL，或锁定到某个发布版本：

```sh
dsh plugin --profile web add https://github.com/gongstudent/dsh-models-plus.git
dsh plugin --profile web add github:gongstudent/dsh-models-plus#v1.0.0
```

发布版本都有 tag；锁定之前先看一眼[所有 tag](https://github.com/gongstudent/dsh-models-plus/tags)确认最新版。

`dsh plugin` 会在 profile 目录内转发给 pnpm，然后按实际安装状态重新核对 profile 的
bundle 列表。由于本包声明了 `dsh.bundle.patch`，它会自动加入层叠列表 —— 无需编辑任何文件。

执行安装的机器需要：`pnpm` 在 `PATH` 上（否则命令会报 `pnpm not found on PATH`），
以及 `git`（`github:` 规格通过 git 拉取）。Windows 上两者都成立；`dsh plugin` 在那里
已经通过 shell 调用 pnpm。

`github:` 安装拉取的是已发布的仓库，因此包必须**公开**，且 `lib/` 必须已提交。安装时
没有构建步骤 —— 仓库没有 `prepare` 脚本，pnpm 不会触发构建。

卸载：

```sh
dsh plugin --profile web remove dsh-models-plus
```

出厂的 `ui-settings-models` 行只是被**禁用**，从未被就地替换，因此卸载本 bundle 即可恢复。

## 不启动服务也能验证组合结果

```sh
dsh --profile web --dump-config | grep -A2 'models-plus'
```

## 接线方式

三处必须一致，且都在 `package.json` 里：

1. `dsh.bundle.patch` —— 把包标记为 profile bundle，使 `dsh plugin add` 能激活它。
2. `cordis.patch.yml` —— 禁用出厂的 `ui-settings-models` 行，并插入本包这一行。
3. `dsh.client` + `exports["./client"]` —— 宿主侧的客户端模块注册表扫描加载器条目寻找前者，
   并把后者指向的文件发布在 `/plugins/dsh-models-plus/client.js`。浏览器在运行时拉取它，
   因此**不需要重新构建前端**。

## 开发

`src/` 由一个 DeepSeek Harness 检出生成，再构建到 `lib/`。

```sh
node scripts/prepare-src.mjs /path/to/deepseek-harness-fork   # 复制 + 改名
pnpm install
pnpm run build                                                # 产出 lib/index.js、lib/invariant.js、lib/client.js
```

`prepare-src` 刻意保持机械：对着更新的检出重新同步就是跑一次，再加一次 diff 审阅。

**`prepare-src` 复制的是已经带有本地改动的检出。** 本仓库的 `patches/` 把这些改动存成了
独立补丁，因此也可以改用不带这些改动的检出。请在**复制之前、在检出里**应用补丁 —— 补丁携带的是
相对于 harness 根目录的路径，而且顺序有影响，因为两个补丁都会改 `ModelsSection.module.css`：

```sh
cd /path/to/harness-checkout
git apply --3way /path/to/dsh-models-plus/patches/0002-local-route-switch.patch
git apply --3way /path/to/dsh-models-plus/patches/0001-picker-search.patch
node /path/to/dsh-models-plus/scripts/prepare-src.mjs .
```

该基线必须已经包含上游的本地路由功能（`feat(llm-pi-ai): add configurable local route proxy`）；
`0002` 修改的正是那个提交引入的控件。把两个补丁应用到 `0e635bf^`，得到的 `src/` 与本包
逐字节一致，唯一差异是 `src/invariant.ts` 里的改名。

本 bundle 装好之后，harness 检出里的那两个本地提交就冗余了 —— 行为由本 bundle 提供，出厂那行
已被禁用。请在那里把它们 revert 掉，让改动只存在于一处。

`lib/` 是提交进仓库的。宿主发布的是构建产物，而 git 安装不会执行构建。

## 兼容性

**本包要求所运行的 DeepSeek Harness 本身已经带有本地路由。** 路由本身 —— `@deepseek-ai/dsh-llm-pi-ai`
里的 loopback 监听器 —— 属于宿主侧，不在本包内，且**不存在于 npm 已发布的版本里**：
`@deepseek-ai/dsh-llm-pi-ai` 的 `0.1.5-rc.2` 与 `0.1.6-alpha.2` 都没有导出 `LocalRouteServer`，
也不含监听器代码。在这类构建上，模型设置页仍会渲染本地路由开关，但它是**失效**的 ——
那边的 `llm-pi-ai` section schema 没有 `localRoute` 字段，写入会被丢弃。页面其余部分正常。

DeepSeek Harness 处于预发布阶段，不作任何兼容承诺。本 bundle 按名字替换一个出厂包，因此某个版本
若重命名 `ui-settings-models`、重构 `settings.section` 槽位、或改变槽位 props，都会让它失效 ——
启动时会对未匹配上的补丁 id 发出警告，而不是静默地什么都不做，随后该页面直接不渲染。
对着更新的检出重跑 `prepare-src` 即可恢复。

## 已知限制

- **这是整体 fork。** 上游对模型设置页自身的改动，在重跑 `prepare-src` 之前不会进入本包；
  不存在部分覆盖。
- **宿主侧是空的。** `src/index.ts` 不注册任何东西 —— 全部行为都在浏览器侧。
- **不发布类型声明。** `exports` 只解析到构建后的 JavaScript。

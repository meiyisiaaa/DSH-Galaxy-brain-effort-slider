# Galaxy Effort Slider v0.1.4

English · [简体中文](#简体中文)

A flowing pixel galaxy and an original chibi whale-girl reasoning picker for **DeepSeek Harness 0.2.0-rc.2**.

## Highlights

- Seamless pixel-nebula flow and independent star twinkles keep the rail alive even when the character is resting.
- Gradual star density follows the real effort options; actual `off`/`none` values leave a clean rail.
- A three-expression character tracks the pointer, leans smoothly, and settles onto the selected level.
- Native model-menu synchronization, commit-on-release, keyboard controls, interrupted-gesture cancellation, and truthful error handling.
- Reduced-motion support, hidden/offscreen animation pausing, and light/dark themes.

## Install

Use `dsh-galaxy-effort-slider-0.1.4.tgz` when provided with the release, or build it from source. In the rc.2 **Plugins** page, select **Add plugin**, enter the package path, choose **Install**, then **Enable now**.

Web CLI alternative, using the CLI supplied with your existing rc.2 installation:

```sh
dsh --version
dsh plugin --profile web add "/absolute/path/dsh-galaxy-effort-slider-0.1.4.tgz"
```

For Desktop, initialize the profile by opening the app once, fully quit it, and replace `web` with `desktop`. Restart the relevant profile afterward. See the [English README](../README.md#installation) for the full flow and backups.

npm publication is pending. Once `dsh-galaxy-effort-slider@0.1.4` is available in the registry, that package specifier can replace the tarball path. The presence of these release notes does not confirm registry publication.

## Compatibility and verification

- Exact target: official `dsh-v0.2.0-rc.2`, commit `639ed015397290b3745d163aafe02ffee4aa3f84`.
- 62 tests pass, with TypeScript validation, production build, and simulated native-loader checks.
- Browser preview uses the actual adapter/UI with a simulated host. Real profile installation and Desktop distribution testing remain unverified.
- Selection uses native `ModelDirectory.select`. The host also tries to persist the full selection as a default for new sessions; successful session selection does not guarantee background persistence.

Independent third-party project. No affiliation with or endorsement by DeepSeek. Licensed under [MIT](../LICENSE); the [upstream notice](UPSTREAM-LICENSE.txt) is retained.

## 简体中文

为 **DeepSeek Harness 0.2.0-rc.2** 带来流动的像素银河，以及原创 Q 版鲸鱼女孩推理档位滑块。

### 本版亮点

- 无缝像素星流与独立闪烁的星点，让角色静止时的轨道依然保持流动。
- 星点密度随真实档位逐渐丰富；模型实际提供的 `off` / `none` 档位保持轨道清爽。
- 三表情角色跟手移动、平滑倾斜，并在松手后自然归位。
- 与原生模型菜单同步，松手提交，支持键盘、手势中断取消和真实错误反馈。
- 支持减少动态效果、隐藏或离屏暂停动画，以及深浅色主题。

### 安装

使用发布附件提供的 `dsh-galaxy-effort-slider-0.1.4.tgz`，或从源码打包。在 rc.2 的 **Plugins** 页点击 **Add plugin**，填入安装包路径，点击 **Install**，完成后点击 **Enable now**。

Web CLI 替代方式如下，须使用现有 rc.2 安装配套的 CLI：

```sh
dsh --version
dsh plugin --profile web add "/绝对路径/dsh-galaxy-effort-slider-0.1.4.tgz"
```

Desktop 用户先打开应用一次以初始化 profile，完整退出后将命令中的 `web` 替换为 `desktop`，完成后重新启动。备份要求及完整步骤见[中文 README](../README.zh-CN.md#安装)。

npm 发布尚待完成。确认 registry 中已有 `dsh-galaxy-effort-slider@0.1.4` 后，才可用该包名与版本替换 tarball 路径。本发布说明本身不代表 npm 已发布。

### 兼容与验收

- 精确目标：官方 `dsh-v0.2.0-rc.2`，提交 `639ed015397290b3745d163aafe02ffee4aa3f84`。
- 62 项测试通过，另通过 TypeScript 检查、生产构建和模拟原生加载器验收。
- 浏览器预览使用真实适配器/UI 与模拟宿主；真实 profile 安装及 Desktop 分发包仍未验证。
- 选择通过原生 `ModelDirectory.select` 提交。宿主还会尝试将完整选择保存为新会话默认值；当前会话切换成功不代表后台持久化一定成功。

独立第三方项目，与 DeepSeek 官方没有隶属或背书关系。采用 [MIT 许可证](../LICENSE)，并保留[上游许可证](UPSTREAM-LICENSE.txt)。

<div align="center">

# 正反馈楼上楼下好邻居

### Noise Watch Desktop

一个面向 **Windows / macOS** 的本地监听提醒桌面应用。
当前 `v1.0.0` 聚焦 **设备选择、频段监听、阈值判定、本机提醒、内置默认提示音、提醒音停止控制、JSON 实时写入、CSV 周期导出**。

[![Release](https://img.shields.io/github/v/release/learner20230724/noise-watch-desktop?style=for-the-badge)](https://github.com/learner20230724/noise-watch-desktop/releases/tag/v1.0.0)
[![Platforms](https://img.shields.io/badge/platform-Windows%20%7C%20macOS-4c8eda?style=for-the-badge)](https://github.com/learner20230724/noise-watch-desktop/releases/tag/v1.0.0)
[![License](https://img.shields.io/github/license/learner20230724/noise-watch-desktop?style=for-the-badge)](./LICENSE)

[下载 Windows 版](https://github.com/learner20230724/noise-watch-desktop/releases/download/v1.0.0/%E6%AD%A3%E5%8F%8D%E9%A6%88%E6%A5%BC%E4%B8%8A%E6%A5%BC%E4%B8%8B%E5%A5%BD%E9%82%BB%E5%B1%85%20Setup%201.0.0.exe) · macOS 安装包稍后补充 · [查看 Releases](https://github.com/learner20230724/noise-watch-desktop/releases/tag/v1.0.0)

</div>

---

## 项目简介

**正反馈楼上楼下好邻居（Noise Watch Desktop）** 是一个用于本机提醒与记录的跨平台桌面工具。

它会持续监听你选择的输入设备，并在指定频段上按照：

- **阈值（Threshold）**
- **触发次数（Impact Count）**
- **时间窗口（Time Window）**
- **冷却时间（Cooldown）**

来判断是否发生了目标事件。触发后，应用会：

- 在**本机**播放你选择的提醒音，或在未选择文件时播放内置默认提示音
- 支持在界面中一键停止当前提醒音播放
- 实时覆盖写入一份 JSON 快照
- 每 5 分钟覆盖导出一份 CSV 文件

> 本项目仅用于本机提醒与本地记录，不提供远程上传或云端分析。

---

## 下载与发布

### 当前可用安装包

| 平台 | 类型 | 状态 | 下载 |
| --- | --- | --- | --- |
| Windows x64 | NSIS 安装包 | `v1.0.0` 已可直接下载安装 | [正反馈楼上楼下好邻居 Setup 1.0.0.exe](https://github.com/learner20230724/noise-watch-desktop/releases/download/v1.0.0/%E6%AD%A3%E5%8F%8D%E9%A6%88%E6%A5%BC%E4%B8%8A%E6%A5%BC%E4%B8%8B%E5%A5%BD%E9%82%BB%E5%B1%85%20Setup%201.0.0.exe) |
| macOS arm64 | DMG 安装包 | 本次 Release 暂未附带，稍后补充 | — |

### 当前发布说明

- **v1.0.0**：首个稳定 Windows 发布版本。
- 新增提醒音**停止按钮**，歌曲类提醒音触发后可随时手动停止。
- 未选择自定义提醒音时，会自动使用内置默认提示音，避免没有声音反馈。
- 提醒音文件选择与播放稳定性已提升，坏文件不会反复重试。
- 实时监测左侧图表已改为真实历史滚动时间流效果。
- **Windows x64**：本次 Release 已附带安装包。
- **macOS arm64**：安装包稍后补充。
- 完整发布页：<https://github.com/learner20230724/noise-watch-desktop/releases/tag/v1.0.0>

---

## 功能概览

| 能力 | 状态 | 说明 |
| --- | --- | --- |
| 桌面界面 | 已支持 | Electron + React 桌面应用 |
| 输入设备选择与刷新 | 已支持 | 选择麦克风输入设备并刷新列表 |
| 频段选择 | 已支持 | 低频 / 中频 / 高频 |
| 阈值判定 | 已支持 | 支持阈值、次数、时间窗口、冷却时间组合规则 |
| 本机提醒 | 已支持 | 触发后播放自定义本地音频，未选择时回退到内置提示音 |
| 提醒音停止控制 | 已支持 | 可在提醒音区域一键停止当前播放 |
| JSON 实时写入 | 已支持 | 持续覆盖写入最新事件快照 |
| CSV 周期导出 | 已支持 | 每 5 分钟自动覆盖导出 |
| 双语界面 | 已支持 | 中文 / English |
| 打包平台 | 已支持 | Windows，macOS 安装包稍后补充 |

---

## 项目截图

### 界面上半部分

![界面上半部分](./docs/top.png)

### 界面下半部分

![界面下半部分](./docs/bottom.png)

---

## 使用方式

### 1. 下载并安装

从上面的发布链接下载对应平台的安装包并安装。

### 2. 首次启动授权

首次启动时，系统可能会请求：

- 麦克风权限
- 文件访问权限（选择提醒音频时）

请按系统提示允许。

### 3. 选择输入设备

在界面中选择你要监听的麦克风输入设备。

### 4. 选择监听频段

当前支持：

- 低频
- 中频
- 高频

### 5. 配置判定规则

你可以组合调整：

- **Threshold**：达到多大强度才算一次有效命中
- **Impact Count**：在窗口内累计命中多少次才触发
- **Time Window**：统计命中的时间范围
- **Cooldown**：两次触发之间的最小间隔

### 6. 设置提醒音

触发后会在**本机**播放你选择的本地音频文件。
如果你暂时没有选择文件，应用会自动播放一个内置默认提示音。
播放较长歌曲时，也可以在提醒音区域直接点击“停止提醒音”。

### 7. 查看本地记录

应用运行中会持续写入：

- JSON 最新快照
- CSV 周期导出文件

界面中也会显示这些文件的实际路径。

---

## 数据输出

应用运行时会写入 Electron 标准 `userData` 目录。

### 文件位置

- 实时 JSON：`events/latest-events.json`
- 周期 CSV：`exports/latest-events.csv`

### 输出策略

- JSON：持续覆盖写入最新状态
- CSV：每 5 分钟自动覆盖导出

这使它既适合日常提醒，也适合保留一份结构化的本地记录。

---

## 本地开发

### 环境要求

- **Node.js 22 LTS 推荐**
- 最低建议：**Node.js 20.19+** 或 **22.12+**
- npm
- macOS / Windows

### 安装依赖

```bash
npm install
```

### 启动开发模式

```bash
npm run dev
```

会启动：

- Vite 开发服务器
- Electron 桌面窗口

### 构建前端产物

```bash
npm run build
```

### 打包桌面应用

```bash
npm run dist
```

打包完成后，常见产物包括：

- `dist/renderer/`：前端构建产物
- `dist/win-unpacked/`：Windows 解包目录
- `dist/*.exe`：Windows 安装包
- `dist/*.dmg`：macOS 安装包（在 macOS 上打包时生成）

---

## 为什么现在看起来更稳定了？

项目当前已经把构建输出和打包输出拆开：

- 前端构建输出：`dist/renderer/`
- 安装包输出：`dist/`

这意味着之后再次执行 `npm run build` 时，不会再把已有的安装包产物误清掉。

---

## 常见问题

### 1）macOS 提示“无法打开”或“来自未知开发者”

这是未签名应用的常见提示。可以按这个路径处理：

- 系统设置 → 隐私与安全性
- 找到被拦截的应用提示
- 点击“仍要打开”

### 2）设备名称为空，或者监听不到输入设备

浏览器 / 系统通常需要先拿到一次麦克风权限，设备 label 才会显示完整。

### 3）为什么界面显示的是负数 dB？

当前界面显示的是 **dBFS**，不是现实世界校准后的 **dB SPL**。

- `0 dBFS`：数字系统允许的最大值
- `-70 dBFS`：表示当前输入很弱，但这是正常现象
- 数值越接近 `0`，说明当前输入越强

### 4）为什么开发模式启动失败并提示 5173 端口被占用？

开发模式默认使用 `5173` 端口启动 Vite。
如果本机已经有其他进程占用了这个端口，Vite 会直接退出。

此时可以：

- 结束已经占用 `5173` 的进程
- 或改用其他端口后再启动（脚本会读取 `VITE_PORT`）

### 5）Windows 和 macOS 的功能是否一致？

当前主线功能一致，差异主要在：

- 安装包格式不同
- 系统权限弹窗不同
- 未签名应用在不同平台的提示方式不同

---

## 项目结构

```text
electron/        Electron 主进程与 preload
src/             React UI 与监听/判定逻辑
scripts/         开发辅助脚本
docs/            README 截图等文档资源
dist/renderer/   前端构建产物
dist/            electron-builder 打包输出
```

---

## 反馈与贡献

如果你发现问题，或者想补充功能、改进文档，欢迎：

- 提交 Issue
- 发起 Pull Request
- 为项目点一个 Star

仓库地址：<https://github.com/learner20230724/noise-watch-desktop>

---

## License

本项目使用 **MIT License**。

详见 [LICENSE](./LICENSE)。

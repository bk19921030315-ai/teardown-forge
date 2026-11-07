# teardown-forge

[中文使用流程 ↓](#中文使用流程)

A Claude Code skill that turns any machine into a 3D simulator you can take apart, and records it as a 60 fps film with its own score.

Ask for a machine in one sentence. Claude builds it as one offline HTML page on a dark lime console: the machine runs in the middle, every panel around it reads the real numbers, a button opens the part doing the work, and when nobody touches it the page tours itself.

![Hierodula HX-6 robotic mantis, 356 moving parts](docs/mantis.gif)

**Hierodula HX-6**, a robotic praying mantis with 356 moving parts: [watch the 27 s film (1080p60, with sound)](docs/mantis-hx6.mp4) · source in `sims/mantis-*`

![Callinectes CB-9 robotic blue crab, 500 moving parts](docs/crab.gif)

**Callinectes CB-9**, a robotic blue crab with 500 moving parts: [watch the 28 s film (1080p60, with sound)](docs/crab-cb9.mp4) · source in `sims/crab-*`

## Install

```
npx skills add bk19921030315-ai/teardown-forge -g -a claude-code
```

Then, once, in the installed folder:

```
npm install && npx playwright install chromium
```

You need Node.js 20 or newer. For the video you also need `ffmpeg`, and for the sound Python 3.

## Use

One line is enough; the house style (dark console, lime accent, panels, auto tour, film, score) is the default:

> Use teardown to build a robotic dragonfly with 300 moving parts.

> Teardown a hydraulic excavator arm and record the film.

Open a machine locally:

```
node sims/build.mjs mantis-live      # → teardown-out/dist/mantis-live.html
node sims/build.mjs crab-live        # → teardown-out/dist/crab-live.html
```

## What is inside

| | |
|---|---|
| `SKILL.md` | What Claude reads: the house style, how a machine is built, the rules that make it look right, the review loop. |
| `sims/mantis-*`, `sims/crab-*` | Hierodula HX-6 and Callinectes CB-9. `-shared` is the machine, `-live` the page you drive, `-film` the recorded tour. New machines go next to them. |
| `sims/kit/` | Runtime, stage, shader warm-up. |
| `sims/build.mjs` | Bundles a machine into one HTML file, three.js and fonts inlined. |
| `sims/capture.mjs` | Renders the film frame by frame to a 60 fps mp4, or to review sheets of stills. |
| `sfx/`, `run_sfx.py` | Procedural sound on the film's timeline, mastered to −14 LUFS. |
| `docs/` | Preview GIFs and films of each machine. |

---

## 中文使用流程

### 1. 安装（只做一次）

在终端运行，把技能装进 Claude Code：

```
npx skills add bk19921030315-ai/teardown-forge -g -a claude-code
```

再进入安装好的技能文件夹，装依赖和录屏用的浏览器：

```
npm install && npx playwright install chromium
```

需要 Node.js 20 以上；录视频要有 `ffmpeg`，配乐要有 Python 3。在 Claude Code 网页版（云端会话）里，Claude 会自己装好这些依赖。

### 2. 做一台新机器（一句话）

对 Claude Code 说一句话就够，风格会自动沿用螳螂这套：深色背景、荧光绿、左右六个面板、底部操作日志、右下角 𝕏 @BKBKkwu3 徽章。

> 用 teardown 做一只机械蜻蜓，300 个运动零件

> 用 teardown 做一个液压挖掘机臂，录成片

> 用 teardown 做一台机械蝎子，参考附件图片

可以附参考图片或视频；写了零件数就会精确对上，并按子系统说明零件分布。

### 3. Claude 会做什么

1. 在 `sims/` 下新建 `<名字>-shared`（机器本身）、`<名字>-film`（成片）、`<名字>-live`（可交互页面）。
2. 按真实尺寸建模，每个运动零件登记一次，面板上的零件数就是登记数。
3. 编排 10–13 个阶段、约 25–30 秒的影片：开场就在动，有主动作、内部展示、拆解和重装，最后离场。
4. 逐个阶段截图检查，修到没有问题为止。
5. 录成 1920×1080、60 fps 的视频，配上同步生成的音乐。

### 4. 成果在哪里

| 成果 | 位置 |
|---|---|
| 可交互网页（离线可开） | `teardown-out/dist/<名字>-live.html` |
| 成片视频 | `teardown-out/<名字>.mp4` |
| 源代码 | `sims/<名字>-*` |

网页没人操作时会自动导览；点右侧子系统或显示按钮就由你接管，可以拖动旋转、滚轮缩放；安静 25 秒后自动回到导览。

### 5. 存到 GitHub

做完后对 Claude 说：

> 提交并推送到 teardown-forge，视频放进 docs，README 加上预览

Claude 会把代码提交到 `main`，把视频和预览动图放进 `docs/`，并在 README 顶部加上这台机器。

### 6. 常用修改

| 想改什么 | 改哪里 |
|---|---|
| 徽章上的账号 | `sims/mantis-shared/console.js` 里的 `HANDLE` |
| 主色（荧光绿） | `sims/mantis-shared/mantis.js` 里的 `ACCENT` |
| 影片的阶段、时间、字幕 | `sims/mantis-shared/kin.js` 里的 `SCRIPT` |
| 镜头角度和远近 | `sims/mantis-shared/film.js` 里的 `VIEW_FN` |

直接对 Claude 说要改的效果也可以，比如「把主色换成橙色」「拆解那段再慢一点」。

### 7. 本地打开已有的机器

```
node sims/build.mjs mantis-live      # 机械螳螂 HX-6，356 个零件
node sims/build.mjs crab-live        # 机械蓝蟹 CB-9，500 个零件
```

然后用浏览器打开 `teardown-out/dist/` 里对应的 `.html` 文件。

## License

MIT, see [LICENSE](LICENSE).

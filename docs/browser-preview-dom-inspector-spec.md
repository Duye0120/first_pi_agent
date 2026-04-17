# Chela UI 升级方案：左侧栏重构 + Browser Preview

> 2026-04-17 15:30 | 作者：蟹蟹 | 状态：方案评审中

---

## 需求概述

1. **左侧栏布局重构**：参考 OpenClaw 设计，将项目管理与聊天列表上下分区放在同一侧边栏，取消独立工作区切换器
2. **Browser Preview 内嵌**：在 Diff Panel 中嵌入浏览器预览，支持 Inspector 模式选中页面 DOM 元素，将元素信息以 tag 形式发送到聊天输入框

---

## 整体布局

```
┌──────────────────────────────────────────────────────────┐
│                     Chela Main Window                    │
│  ┌────────────────────┬─────────────────────────────────┐ │
│  │   LEFT SIDEBAR     │        RIGHT MAIN AREA          │ │
│  │  (280-320px)       │                                 │ │
│  │ ┌────────────────┐ │ ┌─────────────────────────────┐ │ │
│  │ │ 📁 项目         │ │ │ Chat Area / Diff Panel      │ │ │
│  │ │ first_pi_agent  │ │ │ + Browser Preview Tab       │ │ │
│  │ │ └─ commit 1    │ │ │                             │ │ │
│  │ │ └─ commit 2    │ │ │                             │ │ │
│  │ │ └─ commit 3    │ │ │                             │ │ │
│  │ │ ...            │ │ │                             │ │ │
│  │ │ [展开显示]      │ │ │                             │ │ │
│  │ ├────────────────┤ │ │                             │ │ │
│  │ │ 💬 聊天         │ │ │                             │ │ │
│  │ │ session 1      │ │ │                             │ │ │
│  │ │ session 2      │ │ │                             │ │ │
│  │ │ session 3      │ │ │                             │ │ │
│  │ │ ...            │ │ │                             │ │ │
│  │ └────────────────┘ │ └─────────────────────────────┘ │ │
│  └────────────────────┴─────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

---

## Phase 0: 左侧栏布局重构（项目 + 聊天分区）

**目标：** 将工作区管理与聊天会话整合到左侧栏上下分区，取消独立的左上角工作区切换器。

**核心组件：**
- `ProjectSection.tsx` — 顶部项目区，显示当前工作区、最近提交/活动、切换/添加文件夹入口
- `ChatSection.tsx` — 底部聊天区，已有的 session list 组件平移至此
- `SidebarLayout.tsx` — 容器组件，管理上下分区的分割线和折叠状态

**数据流：**
- Zustand store 维护 `activeWorkspace`
- `ProjectSection` 点击切换 → 更新 store → 右侧面板（Diff Panel、文件树、聊天上下文）自动刷新
- 解决之前"diff-panel 需要识别当前工作区上下文"的问题：activeWorkspace 始终是全局单一状态

**关键设计点：**
- 项目区顶部：当前文件夹名 + 机器人/项目图标 + 操作菜单（...）
- 项目区列表：最近的 commit/activity（调用 git log / worker model 生成摘要）
- 分割线：可拖拽调整上下区域高度比例
- 切换工作区：点击项目名下拉或 `+` 按钮弹出文件夹选择器

**参考 OpenClaw 结构：**
```
📁 项目
  first_pi_agent
    ├─ 添加 skills 设置... (3h)
    ├─ 查找并继续 diff-plan... (4h)
    └─ ... (展开显示)
─────────────────────
💬 聊天
  session 1
  session 2
  ...
```

---

## Phase 1: Browser Preview Panel

| 层级 | 选择 | 理由 |
|------|------|------|
| 浏览器容器 | Electron `<webview>` | 已有 Electron 环境，webview 支持注入脚本、postMessage 通信 |
| Inspector 注入 | 原生 JS content script | 零依赖，直接操作 DOM，通过 postMessage 回传数据 |
| 输入框 tag | Tiptap Mention Extension | Chela 已使用 Tiptap，直接复用 Mention 体系 |
| 状态管理 | Zustand | Chela 已有，无需新增依赖 |

---

## 架构概览

```
┌─────────────────────────────────────────────────┐
│                   Chela Main App                │
│  ┌──────────────┐    ┌────────────────────────┐ │
│  │  Diff Panel   │    │     Chat Area          │ │
│  │  ┌──────────┐ │    │  ┌──────────────────┐  │ │
│  │  │ Browser  │ │    │  │ Tiptap Input     │  │ │
│  │  │ Preview  │◄├────┤  │ [🏷 Button] hello │  │ │
│  │  │ <webview>│ │post│  └──────────────────┘  │ │
│  │  │          │ │Msg │                        │ │
│  │  └──────────┘ │    └────────────────────────┘ │
│  │  [🔍 Inspector] [📐 Info Panel]               │
│  └──────────────┘                                │
└─────────────────────────────────────────────────┘
```

**数据流：**
1. 用户点击 Inspector 按钮 → 注入脚本到 webview
2. 用户在 webview 中 hover/click 页面元素 → 高亮 + 阻止默认行为
3. 点击确认后 → 脚本收集 DOM 信息 → postMessage 回主进程
4. React 收到消息 → 创建 Tiptap Mention node → 渲染为 tag

---

## 实现细节

### Phase 1: Browser Preview Panel

**目标：** 在 Diff Panel 中渲染 `<webview>`，支持加载用户指定的 URL。

**核心组件：** `BrowserPreviewPanel.tsx`

```tsx
// 关键结构
<webview
  ref={webviewRef}
  src={url}
  preload={INSPECTOR_PRELOAD_JS_PATH}  // 注入脚本路径
  style={{ width: '100%', height: '100%' }}
  onDOMReady={() => {
    // DOM 就绪后注入 inspector 脚本
    webviewRef.current?.executeJavaScript(inspectorScript);
  }}
/>
```

**URL 管理：**
- Zustand store 维护 `browserUrl`
- 默认显示 Chela 本地 dev server（如 `http://localhost:5173`）
- 支持用户手动输入任意 URL

**注意事项：**
- webview 需要在 Electron 的 webPreferences 中开启 `webviewTag: true`
- preload 脚本路径使用 `require()` 格式，因为 preload 运行在独立 context
- 跨域问题：localhost 开发场景基本不存在，但需处理 CORS header

---

### Phase 2: Inspector Content Script

**目标：** 注入页面，实现 hover 高亮、click 选择、postMessage 回传。

**核心逻辑：**

```javascript
// inspector-injected.js
(function() {
  let inspectorMode = false;
  let currentHighlight = null;
  let currentHovered = null;

  // 创建高亮覆盖层
  function createHighlightOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'chela-inspector-highlight';
    overlay.style.cssText = `
      position: fixed !important;
      pointer-events: none !important;
      z-index: 999999 !important;
      outline: 2px solid #3b82f6 !important;
      outline-offset: -2px !important;
      background: rgba(59, 130, 246, 0.08) !important;
      transition: all 0.1s ease !important;
    `;
    document.body.appendChild(overlay);
    return overlay;
  }

  // 创建标签 tooltip
  function createLabel() {
    const label = document.createElement('div');
    label.id = 'chela-inspector-label';
    label.style.cssText = `
      position: fixed !important;
      pointer-events: none !important;
      z-index: 1000000 !important;
      background: #1e293b !important;
      color: #f1f5f9 !important;
      padding: 4px 8px !important;
      border-radius: 4px !important;
      font-size: 12px !important;
      font-family: monospace !important;
      white-space: nowrap !important;
      transform: translateY(-100%) !important;
      margin-top: -8px !important;
    `;
    document.body.appendChild(label);
    return label;
  }

  // 更新高亮位置
  function updateHighlight(el) {
    const rect = el.getBoundingClientRect();
    const overlay = currentHighlight;
    overlay.style.left = rect.left + 'px';
    overlay.style.top = rect.top + 'px';
    overlay.style.width = rect.width + 'px';
    overlay.style.height = rect.height + 'px';
  }

  // 生成 CSS Selector
  function getCSSSelector(el) {
    const parts = [];
    let current = el;
    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();
      if (current.id) {
        selector += '#' + current.id;
        parts.unshift(selector);
        break;
      }
      if (current.className && typeof current.className === 'string') {
        selector += '.' + current.className.trim().split(/\s+/).join('.');
      }
      // 添加 nth-child 确保唯一性
      if (current.parentElement) {
        const siblings = Array.from(current.parentElement.children)
          .filter(c => c.tagName === current.tagName);
        if (siblings.length > 1) {
          selector += `:nth-child(${siblings.indexOf(current) + 1})`;
        }
      }
      parts.unshift(selector);
      current = current.parentElement;
    }
    return parts.join(' > ');
  }

  // 收集元素信息
  function collectElementInfo(el) {
    const rect = el.getBoundingClientRect();
    const styles = window.getComputedStyle(el);
    
    return {
      selector: getCSSSelector(el),
      tagName: el.tagName.toLowerCase(),
      id: el.id || null,
      className: el.className || null,
      textContent: el.textContent?.trim()?.substring(0, 200) || null,
      outerHTML: el.outerHTML?.substring(0, 1000) || null,
      boundingRect: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
      styles: {
        display: styles.display,
        position: styles.position,
        width: styles.width,
        height: styles.height,
        backgroundColor: styles.backgroundColor,
        color: styles.color,
        fontSize: styles.fontSize,
        padding: styles.padding,
        margin: styles.margin,
      },
      // 截图需要 Electron 主进程配合，此处先传坐标
      screenshotCoords: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
    };
  }

  // 事件监听
  function onMouseMove(e) {
    if (!inspectorMode) return;
    e.stopPropagation();
    
    const target = e.target;
    if (target === currentHovered) return;
    currentHovered = target;
    updateHighlight(target);
    
    // 更新标签
    const label = document.getElementById('chela-inspector-label');
    if (label) {
      const rect = target.getBoundingClientRect();
      const name = target.tagName.toLowerCase();
      const cls = target.className && typeof target.className === 'string' 
        ? '.' + target.className.trim().split(/\s+/).slice(0, 2).join('.') 
        : '';
      label.textContent = `${name}${cls} (${Math.round(rect.width)}×${Math.round(rect.height)})`;
      label.style.left = rect.left + 'px';
      label.style.top = rect.top + 'px';
      label.style.display = 'block';
    }
  }

  function onClick(e) {
    if (!inspectorMode) return;
    e.preventDefault();
    e.stopPropagation();
    
    const info = collectElementInfo(e.target);
    window.parent.postMessage({
      type: 'chela:element-selected',
      data: info,
    }, '*');
  }

  // Inspector 模式开关（通过 webview.executeJavaScript 调用）
  window.__chelaInspector = {
    enable() {
      inspectorMode = true;
      if (!currentHighlight) currentHighlight = createHighlightOverlay();
      if (!document.getElementById('chela-inspector-label')) createLabel();
      document.addEventListener('mousemove', onMouseMove, true);
      document.addEventListener('click', onClick, true);
      document.body.style.cursor = 'crosshair !important';
    },
    disable() {
      inspectorMode = false;
      document.removeEventListener('mousemove', onMouseMove, true);
      document.removeEventListener('click', onClick, true);
      if (currentHighlight) currentHighlight.style.display = 'none';
      const label = document.getElementById('chela-inspector-label');
      if (label) label.style.display = 'none';
      document.body.style.cursor = '';
    },
  };
})();
```

**通信方式：**
- webview 内脚本 → `window.parent.postMessage({ type: 'chela:element-selected', data }, '*')`
- 主进程监听 → `window.addEventListener('message', handleMessage)`

---

### Phase 3: Tiptap Tag/Mention Integration

**目标：** 收到 DOM 元素信息后，在输入框中渲染为可视化 tag。

**Tiptap Extension：** `DomElementMention.ts`

```typescript
// 基于 Tiptap Mention 的自定义扩展
import { Mention } from '@tiptap/extension-mention';

export const DomElementMention = Mention.configure({
  HTMLAttributes: {
    class: 'chela-dom-tag',
  },
  suggestion: {
    // 不需要 @ 触发，改为程序化插入
    char: '',
    command: ({ editor, range, props }) => {
      // 程序化插入，不通过键盘触发
    },
    items: ({ query }) => [],
    render: () => null,
  },
});
```

**程序化插入方式：**

```typescript
// 收到 postMessage 后调用
function insertDomTag(editor: Editor, elementInfo: DomElementInfo) {
  const { chain } = editor;
  
  chain()
    .insertContent({
      type: 'mention',
      attrs: {
        id: `dom-${Date.now()}`,
        label: `<${elementInfo.tagName}${elementInfo.id ? '#' + elementInfo.id : ''}${
          elementInfo.className ? '.' + (elementInfo.className as string).split(/\s+/)[0] : ''
        }>`,
        data: elementInfo, // 完整 DOM 信息存在 attr 里
      },
    })
    .run();
}
```

**Tag 渲染样式：**

```tsx
// 自定义 Mention node view
function DomTagNodeView({ node, getPos, editor }) {
  const { label, data } = node.attrs;
  
  return (
    <span className="chela-dom-tag" contentEditable={false}>
      <span className="tag-icon">🎯</span>
      <span className="tag-label">{label}</span>
      <span className="tag-dims">{data.boundingRect?.width}×{data.boundingRect?.height}</span>
    </span>
  );
}
```

```css
.chela-dom-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.3);
  border-radius: 6px;
  font-size: 12px;
  color: #3b82f6;
  cursor: default;
  user-select: none;
}
```

---

### Phase 4: AI 消息上下文组装

**目标：** 发送消息时，将 tag 中的 DOM 信息组装为 AI 可理解的文本。

```typescript
// 从 Tiptap 文档中提取 DOM tags
function extractDomTags(doc: ProseMirrorNode): DomElementInfo[] {
  const tags: DomElementInfo[] = [];
  doc.descendants((node) => {
    if (node.type.name === 'mention' && node.attrs.id?.startsWith('dom-')) {
      tags.push(node.attrs.data);
    }
  });
  return tags;
}

// 组装发送给 AI 的消息
function buildMessageWithDomTags(text: string, tags: DomElementInfo[]): string {
  if (tags.length === 0) return text;
  
  const tagContext = tags.map((tag, i) => {
    return `【选中元素 ${i + 1}】
- Selector: ${tag.selector}
- Tag: <${tag.tagName}>
- ID: ${tag.id || '(无)'}
- Class: ${tag.className || '(无)'}
- 尺寸: ${tag.boundingRect?.width}×${tag.boundingRect?.height}
- 文本内容: ${tag.textContent || '(空)'}
- 样式: display=${tag.styles?.display}, position=${tag.styles?.position}, 
  width=${tag.styles?.width}, height=${tag.styles?.height}, 
  bg=${tag.styles?.backgroundColor}, color=${tag.styles?.color}
- HTML 片段: \n${tag.outerHTML}`;
  }).join('\n\n');
  
  return `[DOM Context]\n${tagContext}\n\n[用户指令]\n${text}`;
}
```

---

## 文件结构

```
src/renderer/
├── components/
│   ├── browser-preview/
│   │   ├── BrowserPreviewPanel.tsx      # 主面板
│   │   ├── InspectorControls.tsx        # Inspector 开关/工具栏
│   │   └── UrlInput.tsx                  # URL 输入栏
│   └── chat/
│       └── input/
│           ├── ChatInput.tsx             # 已有，需修改
│           └── DomTagNodeView.tsx        # 新增 tag 渲染
├── extensions/
│   └── DomElementMention.ts              # Tiptap 扩展
├── store/
│   └── browserStore.ts                   # Zustand store
├── utils/
│   ├── inspector-injected.js             # 注入脚本（作为静态资源）
│   └── domTagContext.ts                  # DOM tag → 消息文本转换
```

---

## 已知坑 & 解决方案

| 问题 | 解决方案 |
|------|----------|
| webview 内页面刷新后注入脚本丢失 | 监听 `dom-ready` 事件，每次导航后重新注入 |
| Shadow DOM 内元素无法选择 | Inspector 脚本需支持 `shadowRoot` 递归遍历 |
| iframe 内元素跨域无法访问 | 仅限 localhost 场景，外部 iframe 跳过 |
| Tiptap Mention 和键盘 @ 触发冲突 | 使用独立的 `domMention` 类型，不复用 mention 的 trigger |
| 大页面 hover 性能差 | debounce mousemove 到 16ms（约 60fps） |
| React 19 StrictMode 双重渲染 | webview ref 初始化做幂等处理 |

---

## 实施顺序（Codex AI Agent 估算）

> 以下时间为 Codex AI Agent 估算，非人工开发时间。Codex 已熟悉 Chela 代码库，各 Phase 可串行推进。

0. **Phase 0** — 左侧栏布局重构（~30-45 分钟）
   - 项目区 + 聊天区上下分区容器
   - 现有 session list 迁移至下半区
   - Zustand `activeWorkspace` 状态打通
1. **Phase 1** — Browser Preview Panel（~15-30 分钟）
   - webview 渲染、URL 输入、基础布局
2. **Phase 2** — Inspector Script（~30-45 分钟）
   - hover 高亮、click 选择、postMessage 回传
   - 脚本逻辑已在本方案中给出，Codex 直接改写为 TS 注入即可
3. **Phase 3** — Tiptap Tag（~15-30 分钟）
   - 自定义 Mention 类型、tag 渲染样式
   - Chela 已有 Tiptap 依赖，直接扩展即可
4. **Phase 4** — AI Context 组装（~10-15 分钟）
   - 消息格式转换、发送到 AI

**预估总工期：** 1.5-2.5 小时（Codex 串行执行）
**建议执行策略：** 拆成 5 个独立任务依次交给 Codex（Phase 0→1→2→3→4），每个 Phase 完成后人工验证一次，再继续下一个

---

## 参考资源

- [Electron webview tag](https://www.electronjs.org/docs/latest/api/webview-tag)
- [Tiptap Mention Extension](https://tiptap.dev/docs/editor/extensions/nodes/mention)
- [AgentDeskAI/browser-tools-mcp](https://github.com/AgentDeskAI/browser-tools-mcp) — DOM 选择器参考
- [serkan-ozal/browser-devtools-mcp](https://github.com/serkan-ozal/browser-devtools-mcp) — CDP inspector 参考

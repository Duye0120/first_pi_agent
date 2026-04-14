# 优化聊天区信息的排版间距与可读性

**时间**: 2026-04-14 16:03:04

## 变更记录

为了解决当聊天区信息密度过高时用户的阅读压力，对聊天界面的文本样式、段落间距、消息外边距进行了重新调整。

### 修改文件
- `src/renderer/src/components/ui/markdown-text.tsx`
- `src/renderer/src/components/assistant-ui/thread.tsx`

### 具体调整
1. **全局行高**：把对话框内段落的基准行高统一调高，使用 `leading-7` （或在局部设定具体像素行高）来提供更好的纵向呼吸感。
2. **段落与列表间距**：优化 `<p>` 以及无序/有序列表 `<ul>`/`<ol>`、`<li>` 中的间距，如扩大上下的 margin，并让文本显得更舒展。
3. **代码块相关**：
    - `CodeHeader` （代码块头部区域）增加上方 `mt-4` 外边距，隔离跟上一段文字的粘连问题。
    - `<pre>` 代码区内部 padding 加大到 `p-4`，字号设置为 `text-[13px]` 增加识别度。
4. **气泡消息容器**：
    - 添加了对 User 和 Assistant 容器的额外 padding，对 AssistantMessage 和 UserMessage 的上下左右空间也做了等比放宽，避免文字直接贴边。

整体改善了文字块扎堆的现象，提高了长文本与复杂 markdown 内容输出时的可读性。

export const SETTINGS_SECTIONS = [
  {
    id: "general",
    label: "通用",
    description: "配置应用的默认行为、聊天模型路由与时区。",
  },
  {
    id: "network",
    label: "网络",
    description: "单独管理代理与运行时网络超时。",
  },
  {
    id: "ai_model",
    label: "模型",
    description: "配置提供商鉴权、Base URL 与模型目录配置。",
  },
  {
    id: "workspace",
    label: "工作区",
    description: "集中管理多个工作区项目、默认目录和规则文件状态。",
  },
  {
    id: "memory",
    label: "记忆",
    description: "管理本地记忆检索、索引模型和向量重建状态。",
  },
  {
    id: "mcp",
    label: "MCP",
    description: "管理当前 workspace 的 MCP server 连接、重载、重启和断开。",
  },
  {
    id: "plugins",
    label: "插件",
    description: "管理当前 workspace 的 Chela 插件清单、权限摘要和启停状态。",
  },
  {
    id: "skills",
    label: "Skills",
    description: "管理项目内与用户级 skills，顺手发现可安装的新能力。",
  },
  {
    id: "interface",
    label: "界面与终端",
    description: "应用视觉偏好、代码字号以及终端默认表现。",
  },
  {
    id: "archived",
    label: "已归档会话",
    description: "集中查看、恢复或删除已经归档的聊天记录。",
  },
  {
    id: "system",
    label: "系统",
    description: "查看日志、程序信息和本地系统状态。",
  },
] as const;

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]["id"];


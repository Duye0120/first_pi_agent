export type ChatRunStage =
  | "idle"
  | "sending"
  | "connecting"
  | "thinking"
  | "tool"
  | "responding"
  | "cancelling";

type RunStatusLabelOptions = {
  isSlowConnection?: boolean;
};

export function getRunStatusLabel(
  stage: ChatRunStage,
  options: RunStatusLabelOptions = {},
) {
  const { isSlowConnection = false } = options;

  switch (stage) {
    case "sending":
      return "发送中…";
    case "connecting":
      return isSlowConnection
        ? "正在连接模型…响应有点慢，你可以停止这次请求。"
        : "正在连接模型…";
    case "thinking":
      return "正在思考…";
    case "tool":
      return "正在调用工具…";
    case "responding":
      return "正在生成回复…";
    case "cancelling":
      return "正在停止…";
    default:
      return "";
  }
}

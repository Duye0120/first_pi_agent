import { useCallback, useRef, useState } from "react";

type Axis = "horizontal" | "vertical";

type UseResizableOptions = {
  axis?: Axis;
  initial: number;
  min: number;
  max: number;
  invert?: boolean; // 如果拖动方向与坐标轴相反（如右边缘往左拖）
};

export function useResizable({
  axis = "horizontal",
  initial,
  min,
  max,
  invert = false,
}: UseResizableOptions) {
  const [size, setSize] = useState(initial);
  const draggingRef = useRef(false);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      draggingRef.current = true;
      document.body.style.cursor = axis === "horizontal" ? "col-resize" : "row-resize";

      const startPos = axis === "horizontal" ? e.clientX : e.clientY;
      const startSize = size;

      const handleMouseMove = (ev: MouseEvent) => {
        if (!draggingRef.current) return;
        const pos = axis === "horizontal" ? ev.clientX : ev.clientY;
        const delta = invert ? startPos - pos : pos - startPos;
        setSize(Math.max(min, Math.min(max, startSize + delta)));
      };

      const handleMouseUp = () => {
        if (!draggingRef.current) return;
        draggingRef.current = false;
        document.body.style.cursor = "";
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [axis, invert, max, min, size],
  );

  return { size, handleMouseDown };
}

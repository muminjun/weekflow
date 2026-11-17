import { useEffect, useState } from "react";
function measure() {
  const viewport = window.visualViewport;
  return {
    height: viewport?.height ?? innerHeight,
    bottom: Math.max(
      0,
      innerHeight -
        (viewport?.offsetTop ?? 0) -
        (viewport?.height ?? innerHeight),
    ),
  };
}
/** iOS keyboards shrink the visual viewport without resizing the layout viewport. */
export function useVisualViewport() {
  const [size, setSize] = useState(measure);
  useEffect(() => {
    const viewport = window.visualViewport;
    const update = () => setSize(measure());
    window.addEventListener("resize", update);
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    return () => {
      window.removeEventListener("resize", update);
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
    };
  }, []);
  return {
    "--dialog-height": `${size.height}px`,
    "--dialog-bottom": `${size.bottom}px`,
  } as React.CSSProperties;
}

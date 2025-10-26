export function applyCustomCss(css: string) {
  if (typeof document === "undefined") return;
  let styleElement = document.getElementById("custom-css-style");
  if (!styleElement) {
    styleElement = document.createElement("style");
    styleElement.id = "custom-css-style";
    document.head.appendChild(styleElement);
  }
  styleElement.textContent = css;
}

export function clearCustomCss() {
  if (typeof document === "undefined") return;
  const styleElement = document.getElementById("custom-css-style");
  if (styleElement) {
    styleElement.textContent = "";
  }
}



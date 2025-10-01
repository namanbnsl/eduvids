declare module "react-syntax-highlighter" {
  import * as React from "react";
  export interface PrismProps {
    children?: React.ReactNode;
    className?: string;
    codeTagProps?: Record<string, unknown>;
    customStyle?: Record<string, string | number>;
    language?: string;
    lineNumberStyle?: Record<string, string | number>;
    showLineNumbers?: boolean;
    style?: unknown;
    [key: string]: unknown;
  }

  export const Prism: React.ComponentType<PrismProps>;
}

declare module "react-syntax-highlighter/dist/esm/styles/prism" {
  export const oneDark: Record<string, unknown>;
  export const oneLight: Record<string, unknown>;
  const _default: Record<string, Record<string, unknown>>;
  export default _default;
  export default styles;
}

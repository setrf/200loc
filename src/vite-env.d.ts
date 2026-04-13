/// <reference types="vite/client" />
/// <reference types="@webgpu/types" />

declare module '*.module.scss' {
  const classes: Record<string, string>
  export default classes
}

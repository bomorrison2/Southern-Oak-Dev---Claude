/// <reference types="vite/client" />

declare module '*?worker' {
  const workerConstructor: new () => Worker;
  export default workerConstructor;
}

interface ImportMetaEnv {
  readonly VITE_VIZ_PROVIDER?: string;
  readonly VITE_VIZ_ENDPOINT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

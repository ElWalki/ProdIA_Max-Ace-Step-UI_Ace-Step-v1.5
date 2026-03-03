/// <reference types="vite/client" />

// Declare .txt file imports as raw text
declare module '*.txt' {
  const content: string;
  export default content;
}

declare module '*.txt?raw' {
  const content: string;
  export default content;
}

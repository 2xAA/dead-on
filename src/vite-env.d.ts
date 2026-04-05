declare module "*?worker-inline" {
  const source: string;
  export default source;
}

declare module "*?worklet-inline" {
  const dataUrl: string;
  export default dataUrl;
}

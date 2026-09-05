export {};

declare global {
  interface Window {
    talentumWindow?: {
      minimize: () => void;
      toggleMaximize: () => void;
      close: () => void;
    };
  }
}

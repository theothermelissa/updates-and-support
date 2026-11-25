// exifr's small build (JPEG and HEIC) ships without its own types; they're the main build's.
declare module "exifr/dist/lite.esm.mjs" {
  export { parse, default } from "exifr";
}

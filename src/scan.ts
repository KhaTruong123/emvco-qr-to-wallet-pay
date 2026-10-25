import { readFile, readdir, stat } from "node:fs/promises";
import { extname, join } from "node:path";
import jpeg from "jpeg-js";
import jsQRModule from "jsqr";
import { PNG } from "pngjs";

// jsqr is CommonJS with an `exports.default`; depending on the build target the default import is
// either the function or the module object, so take `.default` when it exists.
type JsQr = (data: Uint8ClampedArray, width: number, height: number, options?: { inversionAttempts?: "dontInvert" | "onlyInvert" | "attemptBoth" | "invertFirst" }) => { data: string } | null;
const jsQR = ((jsQRModule as unknown as { default?: JsQr }).default ?? jsQRModule) as JsQr;

export const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg"];

interface Rgba {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** Decodes a PNG or JPEG file into RGBA pixels. */
export async function readImage(file: string): Promise<Rgba> {
  const bytes = await readFile(file);
  const ext = extname(file).toLowerCase();
  if (ext === ".png") {
    const png = PNG.sync.read(bytes);
    return { data: new Uint8ClampedArray(png.data.buffer, png.data.byteOffset, png.data.length), width: png.width, height: png.height };
  }
  if (ext === ".jpg" || ext === ".jpeg") {
    const img = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 512 });
    return { data: new Uint8ClampedArray(img.data.buffer, img.data.byteOffset, img.data.length), width: img.width, height: img.height };
  }
  throw new Error(`Unsupported image type "${ext}"; use PNG or JPEG`);
}

/** Nearest-neighbour downscale. jsQR misses codes in some large photos that it finds at lower resolution. */
function downscale(img: Rgba, maxSide: number): Rgba {
  const scale = maxSide / Math.max(img.width, img.height);
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const sy = Math.min(img.height - 1, Math.floor(y / scale));
    for (let x = 0; x < width; x++) {
      const sx = Math.min(img.width - 1, Math.floor(x / scale));
      const s = (sy * img.width + sx) * 4;
      data.set(img.data.subarray(s, s + 4), (y * width + x) * 4);
    }
  }
  return { data, width, height };
}

/** Returns the text of the first QR code found in the image, or undefined. */
export async function decodeQrImage(file: string): Promise<string | undefined> {
  const img = await readImage(file);
  const attempts: Rgba[] = [img];
  for (const side of [1600, 1000, 600]) {
    if (Math.max(img.width, img.height) > side) attempts.push(downscale(img, side));
  }
  for (const a of attempts) {
    const code = jsQR(a.data, a.width, a.height, { inversionAttempts: "attemptBoth" });
    if (code) return code.data;
  }
  return undefined;
}

/** Lists image files: the path itself if it is a file, or all images in a folder (recursive), sorted. */
export async function listImages(path: string): Promise<string[]> {
  const info = await stat(path);
  if (info.isFile()) return [path];
  const out: string[] = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const full = join(path, entry.name);
    if (entry.isDirectory()) out.push(...(await listImages(full)));
    else if (IMAGE_EXTENSIONS.includes(extname(entry.name).toLowerCase())) out.push(full);
  }
  return out.sort();
}

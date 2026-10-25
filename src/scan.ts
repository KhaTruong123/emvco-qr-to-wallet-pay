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

/**
 * Box-filter downscale: each output pixel is the average of its source block.
 * jsQR misses codes in some large photos that it finds at lower resolution, and averaging
 * keeps module edges cleaner than nearest-neighbour sampling.
 */
function downscale(img: Rgba, maxSide: number): Rgba {
  const scale = maxSide / Math.max(img.width, img.height);
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const y0 = Math.floor(y / scale);
    const y1 = Math.min(img.height, Math.max(y0 + 1, Math.floor((y + 1) / scale)));
    for (let x = 0; x < width; x++) {
      const x0 = Math.floor(x / scale);
      const x1 = Math.min(img.width, Math.max(x0 + 1, Math.floor((x + 1) / scale)));
      const sum = [0, 0, 0, 0];
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const s = (sy * img.width + sx) * 4;
          for (let c = 0; c < 4; c++) sum[c]! += img.data[s + c]!;
        }
      }
      const n = (y1 - y0) * (x1 - x0);
      const d = (y * width + x) * 4;
      for (let c = 0; c < 4; c++) data[d + c] = sum[c]! / n;
    }
  }
  return { data, width, height };
}

/** Returns the text of the first QR code found in the image, or undefined. */
export async function decodeQrImage(file: string): Promise<string | undefined> {
  const img = await readImage(file);
  const attempts: Rgba[] = [img];
  for (const side of [2400, 1600, 1200, 800, 600]) {
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

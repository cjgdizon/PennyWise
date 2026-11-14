import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

function crc32(buffer) {
  let crc = -1;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ -1) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}
for (const [size, filename] of [
  [192, "pwa-192.png"],
  [512, "pwa-512.png"],
  [180, "apple-touch-icon.png"],
]) {
  const data = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = x / size,
        py = y / size;
      const stem = px > 0.32 && px < 0.42 && py > 0.28 && py < 0.74;
      const bowl =
        px >= 0.42 &&
        px < 0.69 &&
        py > 0.28 &&
        py < 0.57 &&
        !(px < 0.58 && py > 0.38 && py < 0.47);
      const color = stem || bowl ? [255, 255, 255] : [4, 120, 87];
      const offset = y * (size * 3 + 1) + 1 + x * 3;
      data.set(color, offset);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 2;
  writeFileSync(
    new URL(`../public/${filename}`, import.meta.url),
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk("IHDR", header),
      chunk("IDAT", deflateSync(data)),
      chunk("IEND", Buffer.alloc(0)),
    ]),
  );
}

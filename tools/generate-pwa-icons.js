const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const outputDirectory = path.join(__dirname, "..", "icons");
fs.mkdirSync(outputDirectory, { recursive: true });

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function pointInPolygon(x, y, points) {
  let inside = false;
  for (let current = 0, previous = points.length - 1; current < points.length; previous = current, current += 1) {
    const [x1, y1] = points[current];
    const [x2, y2] = points[previous];
    if ((y1 > y) !== (y2 > y) && x < ((x2 - x1) * (y - y1)) / (y2 - y1) + x1) inside = !inside;
  }
  return inside;
}

function distanceToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;
  const position = lengthSquared ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSquared)) : 0;
  return Math.hypot(px - (x1 + position * dx), py - (y1 + position * dy));
}

function makeIcon(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const shield = [[0.5, 0.18], [0.75, 0.27], [0.75, 0.49], [0.71, 0.63], [0.62, 0.74], [0.5, 0.82], [0.38, 0.74], [0.29, 0.63], [0.25, 0.49], [0.25, 0.27]];
  const samples = 3;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const position = (y * size + x) * 4;
      const shade = y / Math.max(size - 1, 1);
      const background = [Math.round(18 - shade * 6), Math.round(107 - shade * 22), Math.round(99 - shade * 20)];
      let shieldCoverage = 0;
      let checkCoverage = 0;
      for (let sampleY = 0; sampleY < samples; sampleY += 1) {
        for (let sampleX = 0; sampleX < samples; sampleX += 1) {
          const nx = (x + (sampleX + 0.5) / samples) / size;
          const ny = (y + (sampleY + 0.5) / samples) / size;
          if (pointInPolygon(nx, ny, shield)) shieldCoverage += 1;
          const onCheck = Math.min(
            distanceToSegment(nx, ny, 0.355, 0.50, 0.465, 0.61),
            distanceToSegment(nx, ny, 0.465, 0.61, 0.66, 0.40)
          ) < 0.032;
          if (onCheck) checkCoverage += 1;
        }
      }
      shieldCoverage /= samples * samples;
      checkCoverage /= samples * samples;
      const cream = [248, 248, 244];
      const check = [18, 107, 99];
      let color = background.map((channel, index) => Math.round(channel * (1 - shieldCoverage) + cream[index] * shieldCoverage));
      color = color.map((channel, index) => Math.round(channel * (1 - checkCoverage) + check[index] * checkCoverage));
      pixels[position] = color[0];
      pixels[position + 1] = color[1];
      pixels[position + 2] = color[2];
      pixels[position + 3] = 255;
    }
  }

  const rawRows = [];
  for (let y = 0; y < size; y += 1) rawRows.push(Buffer.concat([Buffer.from([0]), pixels.subarray(y * size * 4, (y + 1) * size * 4)]));
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([signature, chunk("IHDR", header), chunk("IDAT", zlib.deflateSync(Buffer.concat(rawRows), { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

for (const size of [180, 192, 512]) {
  fs.writeFileSync(path.join(outputDirectory, `icon-${size}.png`), makeIcon(size));
}

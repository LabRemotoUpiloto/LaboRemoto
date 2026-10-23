// utils/resizeImage.ts
// Redimensiona/comprime una imagen del lado del cliente antes de subirla --
// Keycloak guarda esto como atributo de usuario (texto), asi que tiene que
// quedar chico. Recorta a cuadrado (cover) y reescala a `size`x`size`,
// exportando JPEG a la calidad dada.
export async function resizeImageToDataUrl(file: File, size = 160, quality = 0.75): Promise<string> {
  const bitmap = await createImageBitmap(file);

  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo procesar la imagen');
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size);

  return canvas.toDataURL('image/jpeg', quality);
}

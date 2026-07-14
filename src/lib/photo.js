// Browser-side photo preparation for the recipe scanner: read the selected file,
// downscale it on a canvas, and return a compressed JPEG data URL to send to the
// vision endpoint. Depends on DOM APIs (FileReader, Image, canvas).

function readPhotoFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read the selected photo"));
    reader.readAsDataURL(file);
  });
}

function loadPhoto(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not prepare the selected photo"));
    image.src = dataUrl;
  });
}

export async function preparePhotoForScan(file) {
  const originalDataUrl = await readPhotoFile(file);
  const image = await loadPhoto(originalDataUrl);
  const maxDimension = 1280;
  const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", 0.82);
}

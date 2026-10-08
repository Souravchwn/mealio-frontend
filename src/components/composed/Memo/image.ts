/**
 * Shrinks a photo in the browser before upload. Phone cameras produce 3 to 8 MB
 * files; a memo only needs to stay readable, so we scale the long edge down and
 * re-encode as JPEG until it fits well under the server limit.
 */

const MAX_EDGE = 1600;
/** Server accepts 1.5 MB; stay clear of it */
const TARGET_BYTES = 1_000_000;

export interface MemoDraft {
    id: string;
    /** Object URL for the preview thumbnail */
    previewUrl: string;
    /** Plain base64 of the JPEG, without the data: prefix */
    data: string;
    sizeBytes: number;
}

async function decode(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
    // createImageBitmap applies the camera's rotation flag, so upright photos stay upright
    if (typeof createImageBitmap === "function") {
        try {
            const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
            return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
        } catch {
            /* fall through to <img> */
        }
    }
    const url = URL.createObjectURL(file);
    try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const el = new Image();
            el.onload = () => resolve(el);
            el.onerror = () => reject(new Error("decode"));
            el.src = url;
        });
        return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => {} };
    } finally {
        URL.revokeObjectURL(url);
    }
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
    return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}

/** Throws Error("decode") when the browser cannot read the file as an image (for example HEIC on Chrome). */
export async function prepareMemo(file: File): Promise<MemoDraft> {
    const img = await decode(file);
    try {
        let edge = MAX_EDGE;
        for (let attempt = 0; attempt < 4; attempt++) {
            const scale = Math.min(1, edge / Math.max(img.width, img.height));
            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.round(img.width * scale));
            canvas.height = Math.max(1, Math.round(img.height * scale));
            const ctx = canvas.getContext("2d");
            if (!ctx) throw new Error("decode");
            // White behind transparent PNGs, otherwise JPEG turns them black
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img.source, 0, 0, canvas.width, canvas.height);

            for (const quality of [0.82, 0.7, 0.55]) {
                const blob = await toBlob(canvas, quality);
                if (blob && blob.size <= TARGET_BYTES) {
                    return {
                        id: crypto.randomUUID(),
                        previewUrl: URL.createObjectURL(blob),
                        data: await blobToBase64(blob),
                        sizeBytes: blob.size,
                    };
                }
            }
            edge = Math.round(edge * 0.75);
        }
        throw new Error("too-large");
    } finally {
        img.close();
    }
}

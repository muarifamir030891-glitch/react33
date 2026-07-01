/**
 * Utility for client-side image compression using HTML5 Canvas.
 * Targets highly optimized file sizes (approx. 15-45KB) for bank transfer/payment proofs,
 * ensuring maximum clarity for text legibility while avoiding heavy egress loads.
 */
export const compressImage = (file: File, maxDimension: number = 800, quality: number = 0.65): Promise<Blob> => {
    return new Promise((resolve, reject) => {
        // Validate that it is indeed an image file
        if (!file.type.startsWith('image/')) {
            return reject(new Error('Selected file is not an image.'));
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                // Scale down if dimensions exceed the maximum
                if (width > maxDimension || height > maxDimension) {
                    if (width > height) {
                        height = Math.round((height * maxDimension) / width);
                        width = maxDimension;
                    } else {
                        width = Math.round((width * maxDimension) / height);
                        height = maxDimension;
                    }
                }

                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    return reject(new Error('Failed to get canvas 2D context.'));
                }

                // Draw image on canvas
                ctx.drawImage(img, 0, 0, width, height);

                // Attempt WebP compression
                canvas.toBlob(
                    (blob) => {
                        if (blob) {
                            console.log(`Image compressed successfully: Original = ${(file.size / 1024).toFixed(1)}KB, Compressed = ${(blob.size / 1024).toFixed(1)}KB (WebP)`);
                            resolve(blob);
                        } else {
                            // Fallback to JPEG if canvas.toBlob fails or is unsupported
                            canvas.toBlob(
                                (jpegBlob) => {
                                    if (jpegBlob) {
                                        console.log(`Image compressed successfully: Original = ${(file.size / 1024).toFixed(1)}KB, Compressed = ${(jpegBlob.size / 1024).toFixed(1)}KB (JPEG Fallback)`);
                                        resolve(jpegBlob);
                                    } else {
                                        reject(new Error('Failed to compress image.'));
                                    }
                                },
                                'image/jpeg',
                                quality
                            );
                        }
                    },
                    'image/webp',
                    quality
                );
            };

            img.onerror = () => reject(new Error('Failed to load image file.'));
            img.src = event.target?.result as string;
        };

        reader.onerror = () => reject(new Error('Failed to read image file.'));
        reader.readAsDataURL(file);
    });
};

"use client";

import { useEffect, useRef, useImperativeHandle, forwardRef, useState } from "react";
import QRCodeStyling, { Options } from "qr-code-styling";

export interface DynamicQRCodeRef {
  download: (filename?: string, extension?: "png" | "svg" | "jpeg" | "webp") => void;
}

interface DynamicQRCodeProps {
  url: string;
  width?: number;
  height?: number;
  logo?: string;
  dotsColor?: string;
  cornersColor?: string;
  className?: string;
}

const logoCache = new Map<string, string>();

const DynamicQRCode = forwardRef<DynamicQRCodeRef, DynamicQRCodeProps>(
  ({ url, width = 300, height = 300, logo, dotsColor = "#000000", cornersColor = "#000000", className }, ref) => {
    const qrRef = useRef<HTMLDivElement>(null);
    const qrCode = useRef<QRCodeStyling | null>(null);
    
    // Initialize with cached composite logo if available, for instant rendering
    const [finalImage, setFinalImage] = useState<string>(() => {
      const baseLogo = logo || "/icon.png";
      return logoCache.get(baseLogo) || baseLogo;
    });

    // 1. Asynchronously build the composite logo
    useEffect(() => {
      let isMounted = true;
      const logoUrl = logo || "/icon.png";

      const applyCompositeLogo = async () => {
        if (logoCache.has(logoUrl)) {
          if (isMounted) setFinalImage(logoCache.get(logoUrl)!);
          return;
        }

        try {
          const generatedLogo = await new Promise<string>((resolve) => {
            const img = new Image();
            if (logoUrl.startsWith("http")) img.crossOrigin = "anonymous";
            
            const timer = setTimeout(() => resolve(logoUrl), 3000);

            img.onload = () => {
              clearTimeout(timer);
              try {
                const canvas = document.createElement("canvas");
                const ctx = canvas.getContext("2d");
                if (!ctx) return resolve(logoUrl);

                // Make canvas perfectly square for QR Code center hole
                const size = 300;
                canvas.width = size;
                canvas.height = size;
                ctx.clearRect(0, 0, size, size);

                // Draw logo in the top portion
                const logoSize = 200;
                const logoX = (size - logoSize) / 2;
                const logoY = 10;

                ctx.save();
                ctx.beginPath();
                ctx.arc(logoX + logoSize / 2, logoY + logoSize / 2, logoSize / 2, 0, Math.PI * 2);
                ctx.closePath();
                ctx.clip();
                
                // Fill background white so transparent logos don't blend weirdly
                ctx.fillStyle = "#FFFFFF";
                ctx.fill();
                
                ctx.drawImage(img, logoX, logoY, logoSize, logoSize);
                ctx.restore();

                // Draw "Powered by QR Dine" text in the bottom portion
                ctx.font = "bold 26px sans-serif";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillStyle = "#334155"; // Slate 700
                ctx.fillText("Powered by", size / 2, size - 45);
                
                ctx.fillStyle = "#f97316"; // Brand orange
                ctx.fillText("QR Dine Cloud", size / 2, size - 15);

                resolve(canvas.toDataURL("image/png"));
              } catch (e) {
                resolve(logoUrl);
              }
            };
            img.onerror = () => {
              clearTimeout(timer);
              resolve(logoUrl);
            };
            img.src = logoUrl;
          });

          logoCache.set(logoUrl, generatedLogo);

          if (isMounted) {
            setFinalImage(generatedLogo);
          }
        } catch (e) {
          if (isMounted) setFinalImage(logoUrl);
        }
      };

      applyCompositeLogo();

      return () => {
        isMounted = false;
      };
    }, [logo]);

    // 2. Initialize QR Code safely when URL is ready
    useEffect(() => {
      if (typeof window === "undefined" || !url || !qrRef.current) return;

      if (!qrCode.current) {
        try {
          qrCode.current = new QRCodeStyling({
            width,
            height,
            type: "svg", // Keep SVG, it is reliable and scalable
            data: url,
            image: finalImage,
            qrOptions: { errorCorrectionLevel: "H" },
            dotsOptions: {
              color: dotsColor,
              type: "dots"
            },
            backgroundOptions: {
              color: "transparent",
            },
            imageOptions: {
              crossOrigin: "anonymous",
              margin: 4,
              imageSize: 0.5 // Larger logo
            },
            cornersSquareOptions: {
              color: cornersColor,
              type: "extra-rounded"
            },
            cornersDotOptions: {
              color: cornersColor,
              type: "dot"
            }
          });

          qrRef.current.innerHTML = "";
          qrCode.current.append(qrRef.current);
        } catch (e) {
          console.error("Failed to initialize QR code", e);
          qrCode.current = null;
        }
      } else {
        try {
          qrCode.current.update({
            data: url,
            image: finalImage
          });
        } catch (e) {
          console.error("Failed to update QR code", e);
        }
      }
    }, [url, finalImage, width, height, dotsColor, cornersColor]); // Run whenever url or finalImage changes

    useImperativeHandle(ref, () => ({
      download: (filename = "qr-code", extension = "png") => {
        if (qrCode.current) {
          qrCode.current.download({ name: filename, extension });
        }
      }
    }));

    return <div ref={qrRef} className={className} />;
  }
);

DynamicQRCode.displayName = "DynamicQRCode";

export default DynamicQRCode;

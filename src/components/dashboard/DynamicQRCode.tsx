"use client";

import { useEffect, useRef, useImperativeHandle, forwardRef } from "react";
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

const DynamicQRCode = forwardRef<DynamicQRCodeRef, DynamicQRCodeProps>(
  ({ url, width = 300, height = 300, logo, dotsColor = "#000000", cornersColor = "#000000", className }, ref) => {
    const qrRef = useRef<HTMLDivElement>(null);
    const qrCode = useRef<QRCodeStyling | null>(null);

    useEffect(() => {
      if (typeof window === "undefined") return;

      // Safe initialization function
      const initQr = (finalImage: string) => {
        if (!qrCode.current) {
          qrCode.current = new QRCodeStyling({
            width,
            height,
            type: "canvas",
            data: url,
            image: finalImage,
            qrOptions: { errorCorrectionLevel: "H" },
            dotsOptions: { color: dotsColor, type: "dots" },
            backgroundOptions: { color: "transparent" },
            imageOptions: { margin: 8, imageSize: 0.5, crossOrigin: "anonymous" },
            cornersSquareOptions: { color: cornersColor, type: "extra-rounded" },
            cornersDotOptions: { color: cornersColor, type: "dot" }
          });
          if (qrRef.current) {
            qrRef.current.innerHTML = "";
            qrCode.current.append(qrRef.current);
          }
        } else {
          qrCode.current.update({
            data: url,
            width,
            height,
            image: finalImage,
            qrOptions: { errorCorrectionLevel: "H" },
            dotsOptions: { color: dotsColor, type: "dots" },
            imageOptions: { margin: 8, imageSize: 0.5, crossOrigin: "anonymous" },
            cornersSquareOptions: { color: cornersColor, type: "extra-rounded" },
            cornersDotOptions: { color: cornersColor, type: "dot" }
          });
          if (qrRef.current && qrRef.current.innerHTML === "") {
            qrCode.current.append(qrRef.current);
          }
        }
      };

      let isMounted = true;
      const logoUrl = logo || "/icon.png";

      // 1. Immediately render the safe default QR code to prevent blanking
      initQr(logoUrl);

      // 2. Asynchronously build and apply the composite logo
      const applyCompositeLogo = async () => {
        try {
          const finalLogo = await new Promise<string>((resolve) => {
            const img = new Image();
            if (logoUrl.startsWith("http")) img.crossOrigin = "anonymous";
            
            const timer = setTimeout(() => resolve(logoUrl), 3000);

            img.onload = () => {
              clearTimeout(timer);
              try {
                const canvas = document.createElement("canvas");
                const ctx = canvas.getContext("2d");
                if (!ctx) return resolve(logoUrl);

                const size = 300;
                const textHeight = 60;
                canvas.width = size;
                canvas.height = size + textHeight;
                ctx.clearRect(0, 0, canvas.width, canvas.height);

                ctx.save();
                ctx.beginPath();
                ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
                ctx.closePath();
                ctx.clip();
                ctx.drawImage(img, 0, 0, size, size);
                ctx.restore();

                ctx.font = "bold 32px sans-serif";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillStyle = "#000000";
                ctx.fillText("Powered by QR Dine", size / 2, size + (textHeight / 2));

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

          if (isMounted && qrCode.current) {
            qrCode.current.update({ image: finalLogo });
          }
        } catch (e) {
          // Fallback handled
        }
      };

      applyCompositeLogo();

      return () => {
        isMounted = false;
      };
    }, [url, width, height, logo, dotsColor, cornersColor]);

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

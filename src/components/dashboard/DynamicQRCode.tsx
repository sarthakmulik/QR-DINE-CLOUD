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

      const generateCompositeLogo = (logoUrl: string): Promise<string> => {
        return new Promise((resolve) => {
          let resolved = false;
          const finish = (res: string) => {
            if (resolved) return;
            resolved = true;
            resolve(res);
          };

          // Fallback timeout in case image takes too long to load or hangs
          setTimeout(() => finish(logoUrl), 3000);

          const img = new Image();
          if (logoUrl.startsWith("http")) {
            img.crossOrigin = "anonymous";
          }
          
          img.onload = () => {
            try {
              const canvas = document.createElement("canvas");
              const ctx = canvas.getContext("2d");
              if (!ctx) return finish(logoUrl);

              const size = 300;
              const textHeight = 60;
              canvas.width = size;
              canvas.height = size + textHeight;

              ctx.clearRect(0, 0, canvas.width, canvas.height);

              // Draw logo image (with circular crop)
              ctx.save();
              ctx.beginPath();
              ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
              ctx.closePath();
              ctx.clip();
              ctx.drawImage(img, 0, 0, size, size);
              ctx.restore();

              // Draw text
              ctx.font = "bold 32px sans-serif";
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.fillStyle = "#000000";
              ctx.fillText("Powered by QR Dine", size / 2, size + (textHeight / 2));

              finish(canvas.toDataURL("image/png"));
            } catch (err) {
              console.error("Canvas taint error:", err);
              finish(logoUrl); // Fallback to raw logo
            }
          };
          img.onerror = () => {
            finish(logoUrl);
          };
          img.src = logoUrl;
        });
      };

      let isMounted = true;

      const initQRCode = async () => {
        const finalLogo = await generateCompositeLogo(logo || "/icon.png");
        
        if (!isMounted) return;

        if (!qrCode.current) {
          qrCode.current = new QRCodeStyling({
            width,
            height,
            type: "svg",
            data: url,
            image: finalLogo,
            qrOptions: {
              errorCorrectionLevel: "H"
            },
            dotsOptions: {
              color: dotsColor,
              type: "dots"
            },
            backgroundOptions: {
              color: "transparent",
            },
            imageOptions: {
              crossOrigin: "anonymous",
              margin: 8,
              imageSize: 0.4
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

          if (qrRef.current) {
            qrRef.current.innerHTML = "";
            qrCode.current.append(qrRef.current);
          }
        } else {
          qrCode.current.update({
            image: finalLogo,
            data: url,
            width,
            height
          });
        }
      };

      initQRCode();
      
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

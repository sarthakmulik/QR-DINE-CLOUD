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
      if (typeof window !== "undefined" && !qrCode.current) {
        qrCode.current = new QRCodeStyling({
          width,
          height,
          type: "svg",
          data: url,
          image: logo || "/icon.png",
          dotsOptions: {
            color: dotsColor,
            type: "dots"
          },
          backgroundOptions: {
            color: "transparent",
          },
          imageOptions: {
            crossOrigin: "anonymous",
            margin: 10
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
      }
    }, [url, width, height, logo, dotsColor, cornersColor]);

    useEffect(() => {
      if (qrCode.current) {
        qrCode.current.update({
          data: url,
          width,
          height
        });
      }
    }, [url, width, height]);

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

import { serve, type RequestHandler } from "inngest/next";
import type { NextRequest } from "next/server";
import { inngest } from "@/lib/inngest";
import {
  generateVideo,
  uploadVideoToYouTube,
  uploadVideoToX,
} from "@/lib/inngest-functions";

const handlers = serve({
  client: inngest,
  functions: [generateVideo, uploadVideoToYouTube, uploadVideoToX],
  streaming: "force",
});

const createSafeRequestProxy = (request: NextRequest): NextRequest => {
  return new Proxy(request, {
    get(target, prop, receiver) {
      if (prop === "json") {
        return async () => ({});
      }
      if (prop === "text") {
        return async () => "";
      }
      if (prop === "arrayBuffer") {
        return async () => new ArrayBuffer(0);
      }
      if (prop === "formData") {
        return async () => new FormData();
      }
      if (prop === "clone") {
        return () => createSafeRequestProxy(target.clone() as NextRequest);
      }
      return Reflect.get(target as object, prop, receiver);
    },
  }) as NextRequest;
};

const withSafeJsonBody = (handler: RequestHandler): RequestHandler => {
  return async (request: NextRequest, context: unknown) => {
    if (request.method?.toUpperCase() === "PUT") {
      const contentLength = request.headers.get("content-length");
      const transferEncoding = request.headers.get("transfer-encoding");
      const parsedLength = contentLength
        ? Number.parseInt(contentLength, 10)
        : 0;
      const hasBody =
        (Number.isFinite(parsedLength) && parsedLength > 0) ||
        (transferEncoding !== null && transferEncoding.length > 0);

      if (!hasBody) {
        const safeRequest = createSafeRequestProxy(request);
        return handler(safeRequest, context);
      }
    }

    return handler(request, context);
  };
};

export const GET = handlers.GET;
export const POST = handlers.POST;
export const PUT = withSafeJsonBody(handlers.PUT);

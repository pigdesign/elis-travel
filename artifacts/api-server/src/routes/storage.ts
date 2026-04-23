import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import {
  ObjectStorageService,
  ObjectNotFoundError,
} from "../lib/objectStorage";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

router.post(
  "/storage/uploads/request-url",
  requireAuth,
  async (req: Request, res: Response) => {
    const body = req.body as Record<string, unknown> | undefined;
    const name = typeof body?.name === "string" ? body.name : null;
    const size = typeof body?.size === "number" ? body.size : null;
    const contentType =
      typeof body?.contentType === "string" ? body.contentType : null;

    if (!name || size == null || !contentType) {
      res.status(400).json({ error: "Missing or invalid required fields" });
      return;
    }
    if (size <= 0 || size > MAX_UPLOAD_BYTES) {
      res.status(400).json({ error: "File size out of allowed range" });
      return;
    }
    if (!contentType.startsWith("image/")) {
      res.status(400).json({ error: "Only image uploads are allowed" });
      return;
    }

    try {
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const objectPath =
        objectStorageService.normalizeObjectEntityPath(uploadURL);

      res.json({
        uploadURL,
        objectPath,
        metadata: { name, size, contentType },
      });
    } catch (error) {
      req.log.error({ err: error }, "Error generating upload URL");
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  },
);

router.get(
  "/storage/objects/*path",
  async (req: Request, res: Response) => {
    try {
      const raw = (req.params as Record<string, string | string[]>).path;
      const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
      const objectPath = `/objects/${wildcardPath}`;
      const objectFile =
        await objectStorageService.getObjectEntityFile(objectPath);

      const response = await objectStorageService.downloadObject(objectFile);

      res.status(response.status);
      response.headers.forEach((value, key) => res.setHeader(key, value));

      if (response.body) {
        const nodeStream = Readable.fromWeb(
          response.body as unknown as import("stream/web").ReadableStream<Uint8Array>,
        );
        nodeStream.pipe(res);
      } else {
        res.end();
      }
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        res.status(404).json({ error: "Object not found" });
        return;
      }
      req.log.error({ err: error }, "Error serving object");
      res.status(500).json({ error: "Failed to serve object" });
    }
  },
);

export default router;

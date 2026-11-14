import { Router } from "express";
import { Readable } from "stream";
import {
  getObjectStream,
  verifyObjectSignature,
} from "../lib/object-storage";

const publicObjectsRouter = Router();

publicObjectsRouter.get("/objects", async (req, res, next) => {
  try {
    const key = typeof req.query.key === "string" ? req.query.key : "";
    const sig = typeof req.query.sig === "string" ? req.query.sig : "";
    if (!key || !sig || !verifyObjectSignature(key, sig)) {
      res.status(403).json({ success: false, message: "Invalid media signature" });
      return;
    }

    const object = await getObjectStream(key);
    res.setHeader("Content-Type", object.contentType);
    if (object.contentLength != null) {
      res.setHeader("Content-Length", String(object.contentLength));
    }
    res.setHeader("Cache-Control", "private, max-age=3600");

    const body = object.body as {
      transformToWebStream?: () => ReadableStream;
      pipe?: (dest: NodeJS.WritableStream) => void;
    };

    if (typeof body.pipe === "function") {
      body.pipe(res);
      return;
    }
    if (typeof body.transformToWebStream === "function") {
      Readable.fromWeb(body.transformToWebStream() as never).pipe(res);
      return;
    }

    const bytes = await (object.body as { transformToByteArray: () => Promise<Uint8Array> })
      .transformToByteArray();
    res.end(Buffer.from(bytes));
  } catch (error) {
    next(error);
  }
});

export default publicObjectsRouter;

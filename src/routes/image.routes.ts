import { Router } from "express";
import multer from "multer";
import { imageController } from "../controllers/image.controller.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024,
    files: 20,
  },
});

const router = Router();

router.post("/upload", upload.array("images", 20), (req, res) => {
  imageController.uploadImages(req, res);
});

router.get("/", (req, res) => {
  imageController.listImages(req, res);
});

router.get("/:id", (req, res) => {
  imageController.getImageById(req, res);
});

router.delete("/:id", (req, res) => {
  imageController.deleteImage(req, res);
});

router.post("/:id/crop", upload.single("image"), (req, res) => {
  imageController.cropImage(req, res);
});

router.post("/seed/demo", (req, res) => {
  imageController.seedDemoImages(req, res);
});

export const imageRoutes = router;

import { Router } from "express";
import { imageController } from "../controllers/imageController";
const { upload } = require("../middlewares/multerMiddlewares");
const cloudinary = require("../services/imageServices");
import MulterRequest from "multer";
import multer from "multer";

const router = Router();

router.post("/image", upload.single("image"), function (req, res) {
  if (!req.file) {
    return;
  }
  cloudinary.uploader.upload(req.file.path, function (err: Error, result: any) {
    if (err) {
      console.log(err);
      return res.status(500).json({
        success: false,
        message: "Error",
      });
    }

    res.status(200).json({
      success: true,
      message: "Uploaded!",
      data: result,
    });
  });
});

export default router;

import { Request, Response } from "express";
import { imageServices } from "../services/imageServices";

const multer = require("multer");

interface MulterRequest extends Request {
  file?: any;
}

export class imageController {
  static async uploadImage(req: Request, res: Response): Promise<void> {
    try {
      const message = await imageServices.uploadImage(req);
    } catch (error) {
      console.log(error);
      res.status(500).json({
        message:
          error instanceof Error ? error.message : "An unknown error occurred",
      });
    }
  }
}

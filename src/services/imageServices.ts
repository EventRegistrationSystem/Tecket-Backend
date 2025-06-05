const cloudinary = require("cloudinary").v2;

export class imageServices {
  static async uploadImage(req: any) {
    const res = await cloudinary.uploader.upload(req.file.path, {
      resource_type: "auto",
    });
    return res;
  }
}

cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  secure: true,
  api_key: process.env.CLOUD_API_KEY,
  api_secret: process.env.CLOUD_API_SECRET,
});

module.exports = cloudinary;

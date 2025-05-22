import { Router } from "express";
import { EmailController } from "../controllers/emailController";

const router = Router();

router.post("/email", EmailController.sendRegi);
export default router;

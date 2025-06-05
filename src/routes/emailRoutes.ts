import { Router } from "express";
import { EmailController } from "../controllers/emailController";

const router = Router();

router.post("/email", EmailController.sendRegi);
router.post("/email/invoice", EmailController.sendConfirmation);

export default router;

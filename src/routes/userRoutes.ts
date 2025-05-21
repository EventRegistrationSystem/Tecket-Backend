import { Router } from "express";
import { UserController } from "../controllers/userController";
import { authenticate, authorize } from "../middlewares/authMiddlewares";
import { validateRequest } from "../middlewares/authMiddlewares";
import {
    userUpdateSchema,
    updatePasswordSchema,
} from "../validation/userValidation";
import { registerSchema } from "../validation/authValidation";
import { AuthController } from "../controllers/authController";

const router = Router();

// ----- User functionality -----
// All routes require authentication
router.get("/profile", authenticate, UserController.getUserProfile);
router.put(
    "/profile",
    authenticate,
    validateRequest(userUpdateSchema),
    UserController.updateUserProfile
);
router.post(
    "/change-password",
    authenticate,
    validateRequest(updatePasswordSchema),
    UserController.updateUserPassword
);

// ----- Admin functionality -----
router.get(
    "/users",
    authenticate,
    authorize("ADMIN"),
    UserController.getAllUsers
);

router.get("/:id", UserController.getUserById);
router.put("/:id", authenticate, UserController.updateUserProfile);
router.delete(
    "/:id",
    authenticate,
    authorize("ADMIN"),
    UserController.deleteUser
);
router.post("/", authenticate, authorize("ADMIN"), UserController.createUser);
export default router;
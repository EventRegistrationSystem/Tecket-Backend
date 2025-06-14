import { prisma } from "../config/prisma";
import { CreateUserDTO, UserUpdateDto } from "../types/userTypes";
import { ValidationError } from "../utils/errors";
import bcrypt from "bcrypt";

export class UserService {
    // ------- User functionalities --------
    // 01 - Get user profile by ID
    static async getUserProfile(userId: number) {
        // Check if user exists
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            throw new ValidationError("User not found");
        }

        // Remove password from user object
        const { password, ...userWithoutPassword } = user;
        return userWithoutPassword;
    }

    // 02 - Update user profile
    static async updateUserProfile(userId: number, data: UserUpdateDto) {
        // Check if user exists
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            throw new ValidationError("User not found");
        }

        // If email is being updated, check if the new email is already taken
        if (data.email && data.email !== user.email) {
            const existingUser = await prisma.user.findUnique({
                where: {
                    email: data.email,
                },
            });
            if (existingUser) {
                throw new ValidationError("Email already registered");
            }
        }

        // Update user data
        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: data, // Keep only one data line
        });

        // Remove password from the *updated* user object
        const { password, ...userWithoutPassword } = updatedUser;
        return userWithoutPassword;
    }

    // 03 - Update user password
    static async updateUserPassword(
        userId: number,
        currentPassword: string,
        newPassword: string
    ) {
        // Check if user exists
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            throw new ValidationError("User not found");
        }

        // Verify current password after hashing
        const passwordMatch = await bcrypt.compare(currentPassword, user.password);
        if (!passwordMatch) {
            throw new ValidationError("Current passeword is incorrect");
        }

        // Hash the new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update user password
        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: { password: hashedPassword },
        });

        return { success: true };
    }

    // ------- Admin funcitonalities --------
    // 04 - Get all user profile
    static async getAllUsers() {
        const usersData = await prisma.user.findMany();

        var userWithoutPasswordList = [];
        // Remove password from user object
        for (var index in usersData) {
            const user = usersData[index];
            const { password, ...userWithoutPassword } = user;
            userWithoutPasswordList.push(userWithoutPassword);
        }

        return userWithoutPasswordList;
    }

    // 05 - Delete User
    static async deleteUser(userId: number) {
        // Use Prisma's delete method
        await prisma.user.delete({
            where: {
                id: userId,
            },
        });

        const successMessage = `User with ID ${userId} deleted successfully.`;
        return successMessage;
    }

    // 06 - Create User
    static async createUser(userData: CreateUserDTO) {
        const { firstName, lastName, phoneNo, email, role, password } = userData;

        // Check if user already exists
        const existingUser = await prisma.user.findUnique({
            where: {
                email,
            },
        });
        if (existingUser) {
            throw new ValidationError("Email already registered");
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        // If data passed all validation
        const newUser = await prisma.user.create({
            data: {
                ...userData,
                password: hashedPassword,
            },
        });

        return newUser;
    }
}

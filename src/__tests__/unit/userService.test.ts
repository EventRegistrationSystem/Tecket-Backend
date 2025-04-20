import { UserService } from '../../services/userServices';
import { prisma } from '../../config/prisma';
import { ValidationError } from '../../utils/errors';
import bcrypt from 'bcrypt';

// Mock Prisma client
jest.mock('../../config/prisma', () => ({
    prisma: {
        user: {
            findUnique: jest.fn(),
            update: jest.fn(),
        }
    }
}));

// Mock bcrypt
jest.mock('bcrypt', () => ({
    compare: jest.fn(),
    hash: jest.fn(),
}));

describe('UserService', () => {
    beforeEach(() => {
        // Clear all mocks before each test
        jest.clearAllMocks();
    });

    // --- Test Suite for getUserProfile ---
    describe('getUserProfile', () => {
        const userId = 1;
        const mockUser = {
            id: userId,
            firstName: 'Test',
            lastName: 'User',
            email: 'test@example.com',
            password: 'hashedPassword', // Include password for removal check
            role: 'PARTICIPANT',
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        it('should return user profile without password if user exists', async () => {
            (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

            const result = await UserService.getUserProfile(userId);

            expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: userId } });
            expect(result).toBeDefined();
            expect(result.id).toBe(userId);
            expect(result.email).toBe(mockUser.email);
            expect((result as any).password).toBeUndefined(); // Ensure password is removed
        });

        it('should throw ValidationError if user does not exist', async () => {
            (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

            await expect(UserService.getUserProfile(userId))
                .rejects.toThrow(ValidationError);
            await expect(UserService.getUserProfile(userId))
                .rejects.toThrow('User not found');
        });
    });

    // --- Test Suite for updateUserProfile ---
    describe('updateUserProfile', () => {
        const userId = 1;
        const updateData = {
            firstName: 'Updated',
            phoneNo: '1234567890',
        };
        const mockUser = {
            id: userId,
            firstName: 'Test',
            lastName: 'User',
            email: 'test@example.com',
            password: 'hashedPassword',
            role: 'PARTICIPANT',
            createdAt: new Date(),
            updatedAt: new Date(),
        };
        const mockUpdatedUser = {
            ...mockUser,
            ...updateData,
            updatedAt: new Date(), // Simulate update timestamp
        };

        it('should update user profile and return updated data without password', async () => {
            (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
            (prisma.user.update as jest.Mock).mockResolvedValue(mockUpdatedUser);

            const result = await UserService.updateUserProfile(userId, updateData);

            expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: userId } });
            expect(prisma.user.update).toHaveBeenCalledWith({
                where: { id: userId },
                data: updateData,
            });
            expect(result).toBeDefined();
            expect(result.id).toBe(userId);
            expect(result.firstName).toBe(updateData.firstName);
            expect(result.phoneNo).toBe(updateData.phoneNo);
            expect((result as any).password).toBeUndefined(); // Ensure password is removed
        });

        it('should throw ValidationError if user does not exist', async () => {
            (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

            await expect(UserService.updateUserProfile(userId, updateData))
                .rejects.toThrow(ValidationError);
            await expect(UserService.updateUserProfile(userId, updateData))
                .rejects.toThrow('User not found');
        });
    });

    // --- Test Suite for updateUserPassword ---
    describe('updateUserPassword', () => {
        const userId = 1;
        const currentPassword = 'oldPassword123';
        const newPassword = 'newStrongPassword456';
        const mockUser = {
            id: userId,
            email: 'test@example.com',
            password: 'hashedOldPassword', // Stored hash
            role: 'PARTICIPANT',
        };
        const hashedNewPassword = 'hashedNewPassword';

        it('should update password successfully if current password matches', async () => {
            (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
            (bcrypt.compare as jest.Mock).mockResolvedValue(true); // Current password matches
            (bcrypt.hash as jest.Mock).mockResolvedValue(hashedNewPassword);
            (prisma.user.update as jest.Mock).mockResolvedValue({ ...mockUser, password: hashedNewPassword });

            const result = await UserService.updateUserPassword(userId, currentPassword, newPassword);

            expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: userId } });
            expect(bcrypt.compare).toHaveBeenCalledWith(currentPassword, mockUser.password);
            expect(bcrypt.hash).toHaveBeenCalledWith(newPassword, 10);
            expect(prisma.user.update).toHaveBeenCalledWith({
                where: { id: userId },
                data: { password: hashedNewPassword },
            });
            expect(result).toEqual({ success: true });
        });

        it('should throw ValidationError if user does not exist', async () => {
            (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

            await expect(UserService.updateUserPassword(userId, currentPassword, newPassword))
                .rejects.toThrow(ValidationError);
            await expect(UserService.updateUserPassword(userId, currentPassword, newPassword))
                .rejects.toThrow('User not found');
        });

        it('should throw ValidationError if current password does not match', async () => {
            (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
            (bcrypt.compare as jest.Mock).mockResolvedValue(false); // Current password does NOT match

            await expect(UserService.updateUserPassword(userId, currentPassword, newPassword))
                .rejects.toThrow(ValidationError);
            await expect(UserService.updateUserPassword(userId, currentPassword, newPassword))
                .rejects.toThrow('Current passeword is incorrect'); // Note: Typo in original service error message
            expect(bcrypt.hash).not.toHaveBeenCalled();
            expect(prisma.user.update).not.toHaveBeenCalled();
        });
    });
});

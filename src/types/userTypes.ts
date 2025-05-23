export interface UserUpdateDto {
    firstName?: string;
    lastName?: string;
    email?: string;
    phoneNo?: string;
}

export interface UpdatePasswordDto {
    currentPassword: string;
    newPassword: string;
}


//DTO for creating new user
export interface CreateUserDTO {
    firstName: string;
    lastName: string;
    phoneNo?: string;
    email: string;
    role: "ADMIN" | "ORGANIZER" | "PARTICIPANT";
    password: string;
    createdAt: Date | string;
    updateAt: Date | string;
}
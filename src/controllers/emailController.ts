import { Request, Response } from "express";
import { EmailService } from "../services/emailServices";

export class EmailController {
  static async sendRegi(req: Request, res: Response): Promise<void> {
    const {
      email,
      registrationID,
      eventName,
      startDateTime,
      endDateTime,
      location,
      type,
    } = req.body;
    await EmailService.sendRegi(
      email,
      registrationID,
      eventName,
      startDateTime,
      endDateTime,
      location,
      type
    );
  }
}

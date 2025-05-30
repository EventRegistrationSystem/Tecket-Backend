// controllers/report.controller.ts
import { Request, Response } from 'express';
import { ReportService } from '../services/reportServices';
import { AppError, AuthorizationError, ValidationError, NotFoundError } from '../utils/errors';


export class ReportController {
  static async generateReport(req: Request, res: Response): Promise<void> {
    try {
        const eventId = Number(req.params.eventId);

        if (isNaN(eventId)) {
            res.status(400).json({ success: false, message: 'Invalid event ID' });
            return;
        }
        
        const report = await ReportService.generateReport(eventId); // build your report here  
        res.status(200).json(report);
    }
    catch (error: any) {
        console.error('Error creating Generating Report:', error);
        if (error instanceof NotFoundError) {
            res.status(404).json({ success: false, message: error.message });
        } else if (error instanceof AuthorizationError) {
            res.status(403).json({ success: false, message: error.message });
        } else if (error instanceof ValidationError) {
            res.status(400).json({ success: false, message: error.message });
        }
        else {
            res.status(500).json({
                success: false,
                message: 'An unexpected error occurred while creating the ticket.'
            });
        }
    }
  }
}

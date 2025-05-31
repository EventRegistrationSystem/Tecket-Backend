import { Request, Response } from 'express';
import { ReportService } from '../services/reportServices';
import { AppError, AuthorizationError, ValidationError, NotFoundError } from '../utils/errors';

/**
 * Controller for handling report generation requests.
 */
export class ReportController {
  /**
   * Handles the request to generate a report for a specific event.
   * @param req - The Express request object, containing the eventId as a URL parameter.
   * @param res - The Express response object.
   */
  static async generateReport(req: Request, res: Response): Promise<void> {
    try {
        const eventId = Number(req.params.eventId);

        // Validate that eventId is a number
        if (isNaN(eventId)) {
            res.status(400).json({ success: false, message: 'Invalid event ID' });
            return;
        }
        
        // Call the ReportService to generate the report data
        const report = await ReportService.generateReport(eventId); 
        res.status(200).json(report); // Send the generated report as a JSON response
    }
    catch (error: any) {
        console.error('Error generating report:', error); // Log the error for debugging
        // Handle specific known errors with appropriate HTTP status codes
        if (error instanceof NotFoundError) {
            res.status(404).json({ success: false, message: error.message });
        } else if (error instanceof AuthorizationError) {
            res.status(403).json({ success: false, message: error.message });
        } else if (error instanceof ValidationError) {
            res.status(400).json({ success: false, message: error.message });
        }
        // Handle any other unexpected errors with a generic 500 status code
        else {
            res.status(500).json({
                success: false,
                message: 'An unexpected error occurred while generating the report.'
            });
        }
    }
  }
}

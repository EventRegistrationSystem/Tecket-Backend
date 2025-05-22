import nodemailer from "nodemailer";

let transporter: nodemailer.Transporter | null = null;

export class EmailService {
  static async sendRegi(
    userEmail: string,
    registrationId: string,
    eventName: string,
    startDateTime: Date | string,
    endDateTime: Date | string,
    location: string,
    type: "SPORTS" | "MUSICAL" | "SOCIAL" | "VOLUNTEERING"
  ) {
    const mess = await transporter?.sendMail({
      from: process.env.SMTP_USER, // sender address
      to: userEmail, // list of receivers
      subject: "Registration Information", // Subject line
      html: `<h1 class="section-title">REVIEW YOUR REGISTRATION</h1>

      
      <div class="card custom-card mb-4">
        <h2 class="card-header review-header">Event Details</h2>
        <div class="card-body">
          <h3 class="card-title">${ eventName }</h3>
          <p class="card-text">
            <strong>Date:</strong> ${ startDateTime } - ${ endDateTime} <br />
            <strong>Location:</strong> ${location} <br />
            <strong>Type:</strong> ${type}
          </p>
        </div>
      </div>
      <h1 style="color: red;">Your registration ID is: ${registrationId}</h1>
      <h4>Please contact organizer for further details!</h4>`,
    });

    const successMessage = `Sent email to ${mess.accepted}`;
    return successMessage;
  }
}

export async function initializeEmailTransporter() {
  // Create a transporter for SMTP
  transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  await transporter.verify();
  console.log("Server is ready to take our messages");
}

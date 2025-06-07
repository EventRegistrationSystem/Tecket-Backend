import nodemailer from "nodemailer";
import { prisma } from "../config/prisma";

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
          <h3 class="card-title">${eventName}</h3>
          <p class="card-text">
            <strong>Date:</strong> ${startDateTime} - ${endDateTime} <br />
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

  static async sendConfirmationEmail(
    userEmail: string,
    registrationId: string,
    eventName: string,
    startDateTime: Date | string,
    endDateTime: Date | string,
    location: string
  ) {
    const registration = await prisma.registration.findUnique({
      where: { id: Number(registrationId) },
      include: {
        participant: true,
        purchase: {
          include: {
            items: {
              include: {
                ticket: true,
              },
            },
          },
        },
      },
    });

    if (!registration) {
      throw new Error("Registration not found");
    }

    const formattedStartDate = new Date(startDateTime).toLocaleString('en-AU', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    const formattedEndDate = new Date(endDateTime).toLocaleString('en-AU', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    const ticketDetails = registration.purchase?.items.map(item => `
      <tr>
        <td>${item.ticket?.name}</td>
        <td>${item.quantity}</td>
        <td>$${Number(item.unitPrice).toFixed(2)}</td>
        <td>$${(item.quantity * Number(item.unitPrice)).toFixed(2)}</td>
      </tr>
    `).join('');

    const info = await transporter?.sendMail({
      from: process.env.SMTP_USER,
      to: userEmail,
      subject: "Registration Invoice",
      html: `<h1>Your Registration is Confirmed!</h1>
         <div class="card custom-card mb-4">
           <h2 class="card-header">Event Details</h2>
           <div class="card-body">
             <h3 class="card-title">${eventName}</h3>
             <p><strong>Date:</strong> ${formattedStartDate} - ${formattedEndDate}</p>
             <p><strong>Location:</strong> ${location}</p>
             <p><strong>Registration ID:</strong> ${registrationId}</p>
           </div>
         </div>
         <h2>Invoice</h2>
         <table border="1" cellpadding="5" cellspacing="0" style="width:100%; border-collapse: collapse;">
           <thead>
             <tr>
               <th>Ticket</th>
               <th>Quantity</th>
               <th>Price</th>
               <th>Total</th>
             </tr>
           </thead>
           <tbody>
             ${ticketDetails}
           </tbody>
           <tfoot>
             <tr>
               <th colspan="3" style="text-align:right;">Total Paid:</th>
               <th>$${Number(registration.purchase?.totalPrice).toFixed(2)}</th>
             </tr>
           </tfoot>
         </table>
         <p>We look forward to seeing you at the event!</p>`,
    });
    return `Confirmation email sent to ${info?.accepted}`;
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

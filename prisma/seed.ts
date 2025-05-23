// prisma/seed.ts
import { PrismaClient, QuestionType } from '@prisma/client'; // Added QuestionType
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting database seeding...');

  await clearDatabase();

  // 1. Create users with different roles
  const adminUser = await createAdminUser();
  const organizer1 = await createOrganizer('John', 'Smith');
  const organizer2 = await createOrganizer('Jane', 'Doe');
  const participants = await createParticipants(5);

  // 2. Create sample events
  const musicEvent = await createEvent(organizer1.id, 'Annual Music Festival', 'MUSICAL');
  const sportEvent = await createEvent(organizer2.id, 'Marathon 2025', 'SPORTS');
  const socialEvent = await createEvent(organizer1.id, 'Networking Mixer', 'SOCIAL');
  const volunteeringEvent = await createEvent(organizer2.id, 'Community Cleanup Day', 'VOLUNTEERING');
  const workshopEvent = await createEvent(organizer1.id, 'Intro to Web Development Workshop', 'SOCIAL');

  // 3. Create tickets for each event
  await createTicketsForEvent(musicEvent.id);
  await createTicketsForEvent(sportEvent.id);
  await createTicketsForEvent(socialEvent.id);
  await createTicketsForEvent(volunteeringEvent.id); // Tickets for volunteering event
  await createTicketsForEvent(workshopEvent.id);    // Tickets for workshop event

  // 4. Create questions for events
  // For musicEvent, sportEvent, socialEvent, volunteeringEvent, workshopEvent
  // Link standard questions (t-shirt, dietary, contact method)
  await createQuestionsForEvent(musicEvent.id, false); // No extra "how did you hear"
  await createQuestionsForEvent(sportEvent.id, true);  // With extra "how did you hear"
  await createQuestionsForEvent(socialEvent.id, false);
  await createQuestionsForEvent(volunteeringEvent.id, true); // With extra "how did you hear"
  await createQuestionsForEvent(workshopEvent.id, false);


  // 5. Create some registrations and responses
  await createRegistrationsAndResponses(participants, musicEvent.id, true);
  await createRegistrationsAndResponses(participants.slice(0, 2), sportEvent.id, false);
  // Optionally, add registrations for new events if desired, e.g.:
  await createRegistrationsAndResponses(participants.slice(0, 1), volunteeringEvent.id, true); // 1 registration for volunteering
  await createRegistrationsAndResponses(participants.slice(1, 3), workshopEvent.id, true); // 2 registrations for workshop

  console.log('Seeding completed successfully!');
}

// Helper functions
async function clearDatabase() {
  // Delete in correct order to maintain referential integrity
  await prisma.payment.deleteMany();
  await prisma.purchase.deleteMany();
  await prisma.response.deleteMany();
  await prisma.eventQuestions.deleteMany();
  await prisma.question.deleteMany();
  await prisma.ticket.deleteMany();
  await prisma.registration.deleteMany();
  await prisma.event.deleteMany();
  await prisma.user.deleteMany();
  await prisma.participant.deleteMany(); // Also clear participants
}

async function findOrCreateParticipantForSeed(user: { id: number; email: string; firstName: string; lastName: string; phoneNo?: string | null }, tx?: any) {
  const prismaClient = tx || prisma;
  let participantRecord = await prismaClient.participant.findUnique({
    where: { email: user.email },
  });

  if (!participantRecord) {
    // Check if a participant profile is linked via userId if email didn't match (e.g. email was updated on User but not Participant)
    // This scenario is less likely if email is the primary link, but good for robustness.
    if (user.id) {
      participantRecord = await prismaClient.participant.findFirst({
        where: { userId: user.id }
      });
    }
  }

  if (!participantRecord) {
    participantRecord = await prismaClient.participant.create({
      data: {
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phoneNumber: user.phoneNo, // Map from User.phoneNo
        userId: user.id, // Link to the User account
      },
    });
  } else if (!participantRecord.userId && user.id) {
    // If participant exists (e.g. by email from a previous guest registration) but is not linked to this user account, link them.
    participantRecord = await prismaClient.participant.update({
      where: { id: participantRecord.id },
      data: {
        userId: user.id,
        // Optionally update profile details from User if they differ and User is source of truth
        // firstName: user.firstName, 
        // lastName: user.lastName,
        // phoneNumber: user.phoneNo 
      }
    });
  }
  return participantRecord;
}

// Create users with different roles
async function createAdminUser() {
  const hashedPassword = await bcrypt.hash('Admin123!', 10);

  return prisma.user.create({
    data: {
      email: 'admin@example.com',
      firstName: 'Admin',
      lastName: 'User',
      password: hashedPassword,
      role: 'ADMIN'
    }
  });
}

async function createOrganizer(firstName: string, lastName: string) {
  const hashedPassword = await bcrypt.hash('Organizer123!', 10);

  return prisma.user.create({
    data: {
      email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.com`,
      firstName,
      lastName,
      password: hashedPassword,
      role: 'ORGANIZER'
    }
  });
}

async function createParticipants(count: number) {
  const hashedPassword = await bcrypt.hash('Participant123!', 10);
  const participants: Array<{
    id: number;
    firstName: string;
    lastName: string;
    email: string;
    phoneNo: string | null;
    role: string;
    password: string;
    createdAt: Date;
    updatedAt: Date
  }> = [];

  for (let i = 1; i <= count; i++) {
    const participant = await prisma.user.create({
      data: {
        firstName: `Participant`,
        lastName: `${i}`,
        email: `participant${i}@example.com`,
        password: hashedPassword,
        role: 'PARTICIPANT'
      }
    });
    participants.push(participant);
  }

  return participants;
}

async function createEvent(organizerId: number, name: string, eventType: 'MUSICAL' | 'SPORTS' | 'SOCIAL' | 'VOLUNTEERING') {
  // Create dates for event
  const startDate = new Date();
  startDate.setDate(startDate.getDate() + 30); // Event starts in 30 days

  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 1); // 1-day event

  return prisma.event.create({
    data: {
      organiserId: organizerId,
      name,
      description: `This is a sample ${eventType.toLowerCase()} event for development testing.`,
      location: 'Sample Venue, Melbourne',
      capacity: 100,
      eventType,
      startDateTime: startDate,
      endDateTime: endDate,
      status: 'PUBLISHED'
    }
  });
}

async function createTicketsForEvent(eventId: number) {
  // Sale dates
  const salesStart = new Date();
  const salesEnd = new Date();
  salesEnd.setDate(salesEnd.getDate() + 25); // Sales end 5 days before event

  // General admission ticket
  await prisma.ticket.create({
    data: {
      eventId,
      name: 'General Admission',
      description: 'Standard entry ticket',
      price: 50.00,
      quantityTotal: 70,
      quantitySold: 0,
      salesStart,
      salesEnd,
      status: 'ACTIVE'
    }
  });

  // VIP ticket
  await prisma.ticket.create({
    data: {
      eventId,
      name: 'VIP',
      description: 'Premium entry with additional benefits',
      price: 120.00,
      quantityTotal: 30,
      quantitySold: 0,
      salesStart,
      salesEnd,
      status: 'ACTIVE'
    }
  });
}

async function createQuestionsForEvent(eventId: number, includeExtras = false) {
  // Create common questions
  const q1 = await prisma.question.create({
    data: {
      questionText: 'What is your t-shirt size?',
      questionType: 'DROPDOWN',
      options: {
        create: [
          { optionText: 'Small', displayOrder: 1 },
          { optionText: 'Medium', displayOrder: 2 },
          { optionText: 'Large', displayOrder: 3 },
          { optionText: 'X-Large', displayOrder: 4 },
        ],
      },
    }
  });

  const q2 = await prisma.question.create({
    data: {
      questionText: 'Do you have any dietary restrictions?',
      questionType: 'TEXT'
    }
  });

  const q_contactMethod = await prisma.question.create({
    data: {
      questionText: 'Preferred contact method?',
      questionType: QuestionType.DROPDOWN,
      options: {
        create: [
          { optionText: 'Email', displayOrder: 1 },
          { optionText: 'Phone', displayOrder: 2 },
        ],
      },
    }
  });

  // Link questions to event
  await prisma.eventQuestions.create({
    data: { eventId, questionId: q1.id, isRequired: true, displayOrder: 1 }
  });
  await prisma.eventQuestions.create({
    data: { eventId, questionId: q2.id, isRequired: false, displayOrder: 2 }
  });
  await prisma.eventQuestions.create({
    data: { eventId, questionId: q_contactMethod.id, isRequired: true, displayOrder: 3 }
  });

  // Add extra questions for some events
  if (includeExtras) { // e.g. for sportEvent
    const q3 = await prisma.question.create({
      data: {
        questionText: 'How did you hear about this event?',
        questionType: 'TEXT'
      }
    });

    await prisma.eventQuestions.create({
      data: {
        eventId,
        questionId: q3.id,
        isRequired: false,
        displayOrder: 3
      }
    });
  }
}

async function createRegistrationsAndResponses(participants: any[], eventId: number, includeAllQuestions: boolean) {
  // Get tickets for the event
  const tickets = await prisma.ticket.findMany({
    where: { eventId }
  });

  if (!tickets.length) {
    console.warn(`No tickets found for event ${eventId}. Skipping registration and response seeding for this event.`);
    return;
  }

  // Get event questions with their options
  const eventQuestions = await prisma.eventQuestions.findMany({
    where: { eventId },
    include: {
      question: {
        include: {
          options: true
        }
      }
    }
  });

  if (!eventQuestions.length) {
    console.warn(`No questions found for event ${eventId}. Skipping response seeding for this event.`);
  }

  // Create registrations for a subset of participants
  const numRegistrations = Math.min(includeAllQuestions ? 3 : 1, participants.length); // Create 3 regs if all questions, else 1
  for (let i = 0; i < numRegistrations; i++) {
    const userAccount = participants[i]; // This is a User record

    // Ensure a Participant profile record exists for this user
    const participantProfile = await findOrCreateParticipantForSeed(userAccount, prisma); // Using global prisma for seed simplicity

    // Create registration
    const registration = await prisma.registration.create({
      data: {
        userId: userAccount.id, // Link to the User model (optional on Registration, but good for seeded registered users)
        participantId: participantProfile.id, // CRITICAL: Use the ID from the Participant table
        eventId,
        status: 'CONFIRMED' // Assuming free events or already paid for simplicity in seed
      }
    });

    // Create an Attendee record for this participant and registration
    const attendee = await prisma.attendee.create({
      data: {
        registrationId: registration.id,
        participantId: participantProfile.id, // Use the ID from the Participant table
      }
    });

    // Create ticket purchase (simplified: one ticket per registration for now)
    const selectedTicket = tickets[i % tickets.length]; // Cycle through available tickets
    const purchase = await prisma.purchase.create({
      data: {
        registrationId: registration.id,
        totalPrice: selectedTicket.price // Assuming one ticket
      }
    });
    await prisma.purchaseItem.create({
      data: {
        purchaseId: purchase.id,
        ticketId: selectedTicket.id,
        quantity: 1,
        unitPrice: selectedTicket.price
      }
    });


    // Create payment (simplified)
    await prisma.payment.create({
      data: {
        purchaseId: purchase.id,
        amount: selectedTicket.price,
        currency: 'AUD', // Example currency
        paymentMethod: 'CREDIT_CARD', // Example method
        status: 'COMPLETED',
        stripePaymentIntentId: `pi_seed_${Date.now()}_${i}` // Example unique ID
      }
    });

    // Create responses to questions
    if (eventQuestions.length > 0) {
      for (const eq of eventQuestions) {
        let responseText = 'N/A'; // Default response if no specific logic matches

        if (eq.question.questionType === QuestionType.DROPDOWN) {
          if (eq.question.questionText.includes('t-shirt') && eq.question.options && eq.question.options.length > 0) {
            responseText = eq.question.options[Math.floor(Math.random() * eq.question.options.length)].optionText;
          } else if (eq.question.questionText.includes('contact method') && eq.question.options && eq.question.options.length > 0) {
            responseText = eq.question.options[Math.floor(Math.random() * eq.question.options.length)].optionText;
          }
        } else if (eq.question.questionType === QuestionType.TEXT) {
          if (eq.question.questionText.includes('dietary')) {
            const dietaryOptions = ['None', 'Vegetarian', 'Vegan', 'Gluten-free', 'Nut allergy'];
            responseText = dietaryOptions[Math.floor(Math.random() * dietaryOptions.length)];
          } else if (eq.question.questionText.includes('How did you hear')) {
            responseText = 'Social Media';
          } else {
            responseText = `Sample text response for ${eq.question.questionText}`;
          }
        }

        // Only create response if includeAllQuestions is true, or if it's not the t-shirt/contact method question
        let shouldCreateResponse = false;
        if (includeAllQuestions) {
          shouldCreateResponse = true;
        } else {
          // For the "fewer responses" case, only answer dietary and "how did you hear"
          if (eq.question.questionText.includes('dietary') || eq.question.questionText.includes('How did you hear')) {
            shouldCreateResponse = true;
          }
        }

        if (shouldCreateResponse) {
          await prisma.response.create({
            data: {
              attendeeId: attendee.id, // Link to Attendee
              eqId: eq.id,
              responseText
            }
          });
        }
      }
    }

    // Update ticket sold count
    await prisma.ticket.update({
      where: { id: selectedTicket.id },
      data: { quantitySold: { increment: 1 } }
    });
  }
}

// Execute the seeding function
main()
  .catch((e) => {
    console.error('Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

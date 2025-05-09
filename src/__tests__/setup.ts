console.log('--- JEST SETUP FILE src/__tests__/setup.ts IS BEING EXECUTED ---');

import { prisma } from '../config/prisma';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.test' });

//Connect to test db before all tests
beforeAll(async () => {
    await prisma.$connect();
    console.log('Connected to test database');
});

// Clear test data after all tests
afterAll(async () => {
    // Clean up database in an order that respects foreign key constraints
    await prisma.payment.deleteMany();       // Depends on Purchase
    await prisma.purchaseItem.deleteMany();  // Depends on Purchase, Ticket (Delete before Purchase)
    await prisma.purchase.deleteMany();      // Depends on Registration
    await prisma.response.deleteMany();      // Depends on Attendee, EventQuestions
    await prisma.attendee.deleteMany();      // Depends on Registration, Participant (Delete before Registration & Participant if direct link)
    await prisma.eventQuestions.deleteMany(); // Depends on Event, Question
    await prisma.ticket.deleteMany();        // Depends on Event
    await prisma.registration.deleteMany();  // Depends on Event, Participant, User
    await prisma.event.deleteMany();         // Depends on User (organiserId)
    await prisma.participant.deleteMany();   // Depends on User
    await prisma.question.deleteMany();      // Independent after EventQuestions deleted
    await prisma.user.deleteMany();          // Delete users last

    await prisma.$disconnect();
    console.log('Disconnected from test database');
});

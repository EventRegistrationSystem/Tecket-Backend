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
    await prisma.purchase.deleteMany();      // Depends on Registration, Ticket
    await prisma.response.deleteMany();      // Depends on Registration, EventQuestions
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

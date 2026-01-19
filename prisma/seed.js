// Seed script for D Square CRM - Populates database with test data
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Clear existing data
  await prisma.notification.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.workerLog.deleteMany();
  await prisma.material.deleteMany();
  await prisma.budgetItem.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.document.deleteMany();
  await prisma.milestone.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.project.deleteMany();
  await prisma.vendor.deleteMany();
  await prisma.user.deleteMany();

  const hashedPassword = await bcrypt.hash('password123', 10);

  // Create Super Admin
  const superAdmin = await prisma.user.create({
    data: {
      name: 'D Square Admin',
      email: 'admin@dsquare.com',
      password: hashedPassword,
      role: 'SUPER_ADMIN',
      phone: '9876543210',
      address: 'D Square Office, Chennai',
    },
  });
  console.log('✅ Created Super Admin:', superAdmin.email);

  // Create Sub-Admins
  const subAdmin1 = await prisma.user.create({
    data: {
      name: 'Rajesh Manager',
      email: 'rajesh@dsquare.com',
      password: hashedPassword,
      role: 'ADMIN',
      phone: '9876543211',
      assignedToId: superAdmin.id,
    },
  });

  const subAdmin2 = await prisma.user.create({
    data: {
      name: 'Priya Supervisor',
      email: 'priya@dsquare.com',
      password: hashedPassword,
      role: 'ADMIN',
      phone: '9876543212',
      assignedToId: superAdmin.id,
    },
  });
  console.log('✅ Created 2 Sub-Admins');

  // Create Client Users
  const client1 = await prisma.user.create({
    data: {
      name: 'Mr. Vikram Kumar',
      email: 'vikram@gmail.com',
      password: hashedPassword,
      role: 'CUSTOMER',
      phone: '9898989898',
      address: '123, Anna Nagar, Chennai',
      assignedToId: subAdmin1.id,
    },
  });

  const client2 = await prisma.user.create({
    data: {
      name: 'Mrs. Anitha Sharma',
      email: 'anitha@gmail.com',
      password: hashedPassword,
      role: 'CUSTOMER',
      phone: '9797979797',
      address: '456, T Nagar, Chennai',
      assignedToId: subAdmin2.id,
    },
  });

  const client3 = await prisma.user.create({
    data: {
      name: 'Mr. Suresh Reddy',
      email: 'suresh@gmail.com',
      password: hashedPassword,
      role: 'CUSTOMER',
      phone: '9696969696',
      address: '789, Velachery, Chennai',
      assignedToId: subAdmin1.id,
    },
  });
  console.log('✅ Created 3 Client Users');

  // Create Vendors
  const vendor1 = await prisma.vendor.create({
    data: {
      name: 'Chennai Cement Suppliers',
      contactPerson: 'Muthu',
      phone: '9111111111',
      email: 'cement@supplier.com',
      specialty: 'CEMENT',
      location: 'Ambattur',
      rating: 4.5,
    },
  });

  const vendor2 = await prisma.vendor.create({
    data: {
      name: 'Steel World',
      contactPerson: 'Ravi',
      phone: '9222222222',
      specialty: 'STEEL',
      location: 'Perungudi',
      rating: 4.0,
    },
  });
  console.log('✅ Created 2 Vendors');

  // Create Projects with Stages
  const project1 = await prisma.project.create({
    data: {
      name: 'Kumar Villa Construction',
      clientName: 'Mr. Vikram Kumar',
      clientPhone: '9898989898',
      clientAddress: '123, Anna Nagar, Chennai',
      location: 'Anna Nagar, Chennai',
      status: 'FOUNDATION',
      progress: 25,
      startDate: new Date('2024-01-15'),
      deadline: new Date('2024-12-31'),
      budget: 5000000,
      spent: 1200000,
      description: '3BHK Individual House Construction',
      clientId: client1.id,
      assignedAdminId: subAdmin1.id,
      createdById: superAdmin.id,
      stages: JSON.stringify([
        { name: 'Planning & Design', progress: 100, status: 'COMPLETED' },
        { name: 'Foundation', progress: 60, status: 'IN_PROGRESS' },
        { name: 'Structure', progress: 0, status: 'PENDING' },
        { name: 'MEP Works', progress: 0, status: 'PENDING' },
        { name: 'Finishing', progress: 0, status: 'PENDING' },
        { name: 'Handover', progress: 0, status: 'PENDING' },
      ]),
    },
  });

  const project2 = await prisma.project.create({
    data: {
      name: 'Sharma Interior Renovation',
      clientName: 'Mrs. Anitha Sharma',
      clientPhone: '9797979797',
      clientAddress: '456, T Nagar, Chennai',
      location: 'T Nagar, Chennai',
      status: 'FINISHING',
      progress: 85,
      startDate: new Date('2023-10-01'),
      deadline: new Date('2024-03-31'),
      budget: 1500000,
      spent: 1275000,
      description: 'Complete Interior Renovation - 2000 sqft',
      clientId: client2.id,
      assignedAdminId: subAdmin2.id,
      createdById: superAdmin.id,
      stages: JSON.stringify([
        { name: 'Planning & Design', progress: 100, status: 'COMPLETED' },
        { name: 'Demolition', progress: 100, status: 'COMPLETED' },
        { name: 'Electrical & Plumbing', progress: 100, status: 'COMPLETED' },
        { name: 'Flooring & Tiling', progress: 100, status: 'COMPLETED' },
        { name: 'Painting', progress: 70, status: 'IN_PROGRESS' },
        { name: 'Final Touches', progress: 0, status: 'PENDING' },
      ]),
    },
  });

  const project3 = await prisma.project.create({
    data: {
      name: 'Reddy Commercial Complex',
      clientName: 'Mr. Suresh Reddy',
      clientPhone: '9696969696',
      clientAddress: '789, Velachery, Chennai',
      location: 'Velachery, Chennai',
      status: 'COMPLETED',
      progress: 100,
      startDate: new Date('2023-01-01'),
      deadline: new Date('2023-11-30'),
      budget: 12000000,
      spent: 11500000,
      description: 'G+3 Commercial Building',
      clientId: client3.id,
      assignedAdminId: subAdmin1.id,
      createdById: superAdmin.id,
      stages: JSON.stringify([
        { name: 'Planning & Design', progress: 100, status: 'COMPLETED' },
        { name: 'Foundation', progress: 100, status: 'COMPLETED' },
        { name: 'Structure', progress: 100, status: 'COMPLETED' },
        { name: 'MEP Works', progress: 100, status: 'COMPLETED' },
        { name: 'Finishing', progress: 100, status: 'COMPLETED' },
        { name: 'Handover', progress: 100, status: 'COMPLETED' },
      ]),
    },
  });
  console.log('✅ Created 3 Projects');

  // Create Payment Milestones for Project 1
  await prisma.payment.createMany({
    data: [
      { projectId: project1.id, stageName: 'Advance', amount: 500000, status: 'PAID', paidDate: new Date('2024-01-15') },
      { projectId: project1.id, stageName: 'Foundation Complete', amount: 1000000, status: 'PENDING', dueDate: new Date('2024-03-15') },
      { projectId: project1.id, stageName: 'Structure Complete', amount: 1500000, status: 'PENDING', dueDate: new Date('2024-06-15') },
      { projectId: project1.id, stageName: 'Finishing', amount: 1000000, status: 'PENDING', dueDate: new Date('2024-10-15') },
      { projectId: project1.id, stageName: 'Final Payment', amount: 1000000, status: 'PENDING', dueDate: new Date('2024-12-31') },
    ],
  });
  console.log('✅ Created Payment Milestones');

  // Create Worker Logs
  await prisma.workerLog.createMany({
    data: [
      { projectId: project1.id, category: 'MASON', count: 5, shift: 'DAY', ratePerWorker: 800, totalWage: 4000, date: new Date() },
      { projectId: project1.id, category: 'HELPER_MALE', count: 8, shift: 'DAY', ratePerWorker: 500, totalWage: 4000, date: new Date() },
      { projectId: project1.id, category: 'HELPER_FEMALE', count: 4, shift: 'DAY', ratePerWorker: 450, totalWage: 1800, date: new Date() },
      { projectId: project1.id, category: 'BAR_BENDER', count: 3, shift: 'DAY', ratePerWorker: 900, totalWage: 2700, date: new Date() },
      { projectId: project2.id, category: 'PAINTER', count: 4, shift: 'DAY', ratePerWorker: 700, totalWage: 2800, date: new Date() },
      { projectId: project2.id, category: 'TILE_WORKER', count: 3, shift: 'DAY', ratePerWorker: 750, totalWage: 2250, date: new Date() },
    ],
  });
  console.log('✅ Created Worker Logs');

  // Create Material Orders
  await prisma.material.createMany({
    data: [
      { projectId: project1.id, vendorId: vendor1.id, item: 'OPC Cement 53 Grade', supplier: 'Chennai Cement', quantity: 100, unit: 'BAGS', unitPrice: 380, cost: 38000, status: 'DELIVERED', paymentStatus: 'PAID' },
      { projectId: project1.id, vendorId: vendor2.id, item: 'TMT Steel 12mm', supplier: 'Steel World', quantity: 2000, unit: 'KG', unitPrice: 65, cost: 130000, status: 'DELIVERED', paymentStatus: 'PARTIAL' },
      { projectId: project1.id, vendorId: vendor1.id, item: 'River Sand', supplier: 'Sand Suppliers', quantity: 5, unit: 'TRUCKS', unitPrice: 25000, cost: 125000, status: 'ORDERED', paymentStatus: 'PENDING' },
      { projectId: project2.id, item: 'Asian Paints Royale', supplier: 'Paint House', quantity: 50, unit: 'LITERS', unitPrice: 450, cost: 22500, status: 'SHIPPED', paymentStatus: 'PENDING' },
    ],
  });
  console.log('✅ Created Material Orders');

  // Create Notifications
  await prisma.notification.createMany({
    data: [
      { userId: superAdmin.id, title: 'New Lead', message: 'New inquiry from potential client', type: 'INFO' },
      { userId: superAdmin.id, projectId: project1.id, title: 'Payment Due', message: 'Foundation payment milestone is due soon', type: 'PAYMENT_REMINDER' },
      { userId: client1.id, projectId: project1.id, title: 'Project Update', message: 'Your foundation work is 60% complete!', type: 'PROJECT_UPDATE' },
    ],
  });
  console.log('✅ Created Notifications');

  console.log('\n🎉 Database seeding completed!');
  console.log('\n📝 Test Accounts:');
  console.log('   Super Admin: admin@dsquare.com / password123');
  console.log('   Sub-Admin 1: rajesh@dsquare.com / password123');
  console.log('   Sub-Admin 2: priya@dsquare.com / password123');
  console.log('   Client 1: vikram@gmail.com / password123');
  console.log('   Client 2: anitha@gmail.com / password123');
  console.log('   Client 3: suresh@gmail.com / password123');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

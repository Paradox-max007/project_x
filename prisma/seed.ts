/**
 * ASM Manpower Management System — database seed.
 * Run with: bun prisma/seed.ts
 */
import { PrismaClient } from "@prisma/client";
import { hashPassword, encryptField } from "../src/lib/crypto";

const db = new PrismaClient();

// Deterministic PRNG so seeded data is stable
let seedState = 42;
function rand(): number {
  seedState = (seedState * 1103515245 + 12345) % 2147483648;
  return seedState / 2147483648;
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}
function randInt(min: number, max: number): number {
  return Math.floor(rand() * (max - min + 1)) + min;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function utc(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day));
}
function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

async function main() {
  console.log("Seeding ASM Manpower Management System...");

  // ---- wipe (order matters for FKs) -------------------------------------
  await db.auditLog.deleteMany();
  await db.notification.deleteMany();
  await db.uniformIssueItem.deleteMany();
  await db.uniformIssue.deleteMany();
  await db.uniformItem.deleteMany();
  await db.cancellationRequest.deleteMany();
  await db.fine.deleteMany();
  await db.warning.deleteMany();
  await db.leaveRequest.deleteMany();
  await db.attendance.deleteMany();
  await db.employeeSiteHistory.deleteMany();
  await db.site.deleteMany();
  await db.employee.deleteMany();
  await db.permission.deleteMany();
  await db.session.deleteMany();
  await db.adminUser.deleteMany();
  await db.systemSetting.deleteMany();

  // ---- system settings ---------------------------------------------------
  const settings: Record<string, string> = {
    companyName: "ASM Manpower Solutions",
    companyLogo: "",
    companyAddress: "King Fahd Road, Al Olaya District, Riyadh 12211, Saudi Arabia",
    companyPhone: "+966 11 234 5678",
    currency: "SAR",
    timezone: "Asia/Riyadh",
    employeeIdPrefix: "ASM",
    warningRatingPenalty: "0.5",
    fineRatingPenalty: "1",
    uniformRenewalMonths: "6",
    warningAbsenceThreshold: "3",
  };
  for (const [key, value] of Object.entries(settings)) {
    await db.systemSetting.create({ data: { key, value } });
  }

  // ---- admin users --------------------------------------------------------
  const superAdmin = await db.adminUser.create({
    data: {
      email: "superadmin@asm.com",
      passwordHash: hashPassword("SuperAdmin@123"),
      fullName: "Faisal Al-Saud",
      role: "super_admin",
      isActive: true,
    },
  });

  const hrAdmin = await db.adminUser.create({
    data: {
      email: "hr.admin@asm.com",
      passwordHash: hashPassword("Admin@123"),
      fullName: "Sara Al-Harbi",
      role: "admin",
      isActive: true,
    },
  });

  const opsAdmin = await db.adminUser.create({
    data: {
      email: "ops.admin@asm.com",
      passwordHash: hashPassword("Admin@123"),
      fullName: "Mohammed Al-Otaibi",
      role: "admin",
      isActive: true,
    },
  });

  // HR admin: employees/attendance/leave/warnings/fines/notifications allowed
  const hrPerms: [string, boolean][] = [
    ["employees", true],
    ["sites", false],
    ["attendance", true],
    ["leave_requests", true],
    ["cancellation_requests", false],
    ["warnings", true],
    ["fines", true],
    ["notifications", true],
    ["administrators", false],
    ["audit_logs", false],
    ["settings", false],
  ];
  for (const [menuKey, allowed] of hrPerms) {
    await db.permission.create({
      data: { userId: hrAdmin.id, menuKey, allowed },
    });
  }

  // Ops admin: sites/attendance/employees allowed, no fines/warnings
  const opsPerms: [string, boolean][] = [
    ["employees", true],
    ["sites", true],
    ["attendance", true],
    ["leave_requests", false],
    ["cancellation_requests", true],
    ["warnings", false],
    ["fines", false],
    ["notifications", true],
    ["administrators", false],
    ["audit_logs", false],
    ["settings", false],
  ];
  for (const [menuKey, allowed] of opsPerms) {
    await db.permission.create({
      data: { userId: opsAdmin.id, menuKey, allowed },
    });
  }

  // ---- uniform items ------------------------------------------------------
  const itemDefs: [string, string][] = [
    ["Uniform", "Standard company uniform set"],
    ["Shoes", "Standard work shoes"],
    ["Helmet", "Safety helmet"],
    ["Bottle", "Water bottle"],
    ["Safety Jacket", "High-visibility safety jacket"],
    ["Gloves", "Protective work gloves"],
    ["Safety Shoes", "Steel-toe safety shoes"],
    ["Vest", "Reflective vest"],
    ["Other", "Other PPE equipment"],
  ];
  const uniformItems: Record<string, string> = {};
  for (const [name, desc] of itemDefs) {
    const item = await db.uniformItem.create({
      data: { name, description: desc, isActive: true },
    });
    uniformItems[name] = item.id;
  }

  // ---- sites ---------------------------------------------------------------
  const siteDefs = [
    { name: "Al Noor Tower", clientName: "Al Noor Real Estate", projectName: "Residential Tower – Phase 3" },
    { name: "Jeddah Waterfront Mall", clientName: "Red Sea Retail Group", projectName: "Mall Fit-Out" },
    { name: "Dammam Industrial Complex", clientName: "Eastern Petrochem Co.", projectName: "Plant Maintenance" },
    { name: "NEOM Camp 7", clientName: "NEOM Development Co.", projectName: "Site Preparation Works" },
    { name: "KAFD Phase 2", clientName: "KAFD Authority", projectName: "Facade & Finishing" },
    { name: "Makkah Hotel Renovation", clientName: "Dar Al Tawaf Hotels", projectName: "Interior Renovation" },
  ];
  const sites: Record<string, string> = {};
  for (const s of siteDefs) {
    const site = await db.site.create({
      data: { ...s, isActive: true },
    });
    sites[s.name] = site.id;
  }
  // Makkah site is inactive
  await db.site.update({
    where: { name: "Makkah Hotel Renovation" },
    data: { isActive: false },
  });

  // ---- employees ------------------------------------------------------------
  type EmpSeed = {
    fullName: string;
    nationality: string;
    position: string;
    company: string;
    site: string | null;
    rating: number;
    phone: string;
    passport: string;
    idNumber: string;
    passportStatus: string;
    idStatus: string;
  };

  const employeesSeed: EmpSeed[] = [
    // Al Noor Tower (6 + leader)
    { fullName: "Rahul Sharma", nationality: "Indian", position: "Site Foreman", company: "ASM Manpower Solutions", site: "Al Noor Tower", rating: 4.5, phone: "+966 50 120 3001", passport: "N1234567", idNumber: "2411028765", passportStatus: "valid", idStatus: "valid" },
    { fullName: "Arjun Patel", nationality: "Indian", position: "Steel Fixer", company: "ASM Manpower Solutions", site: "Al Noor Tower", rating: 5, phone: "+966 50 120 3002", passport: "N1234568", idNumber: "2411028766", passportStatus: "valid", idStatus: "valid" },
    { fullName: "Kumar Sangakkara", nationality: "Sri Lankan", position: "Mason", company: "Gulf Services Co.", site: "Al Noor Tower", rating: 4.5, phone: "+966 50 120 3003", passport: "S7654321", idNumber: "2411028767", passportStatus: "valid", idStatus: "valid" },
    { fullName: "Ahmed Hassan", nationality: "Egyptian", position: "Electrician", company: "ASM Manpower Solutions", site: "Al Noor Tower", rating: 4, phone: "+966 50 120 3004", passport: "E9911223", idNumber: "2411028768", passportStatus: "valid", idStatus: "renewal_due" },
    { fullName: "Bimal Thapa", nationality: "Nepali", position: "Carpenter", company: "ASM Manpower Solutions", site: "Al Noor Tower", rating: 5, phone: "+966 50 120 3005", passport: "P5544332", idNumber: "2411028769", passportStatus: "valid", idStatus: "valid" },
    { fullName: "Joseph Mwangi", nationality: "Kenyan", position: "Helper", company: "Gulf Services Co.", site: "Al Noor Tower", rating: 3.5, phone: "+966 50 120 3006", passport: "K2211334", idNumber: "2411028770", passportStatus: "expiring", idStatus: "valid" },
    // Jeddah Waterfront Mall (5 + leader)
    { fullName: "Deepak Gurung", nationality: "Nepali", position: "Team Leader", company: "ASM Manpower Solutions", site: "Jeddah Waterfront Mall", rating: 4.5, phone: "+966 50 220 4001", passport: "P6677889", idNumber: "2411028771", passportStatus: "valid", idStatus: "valid" },
    { fullName: "Miguel Santos", nationality: "Filipino", position: "AC Technician", company: "ASM Manpower Solutions", site: "Jeddah Waterfront Mall", rating: 5, phone: "+966 50 220 4002", passport: "F8899001", idNumber: "2411028772", passportStatus: "valid", idStatus: "valid" },
    { fullName: "Ravi Fernando", nationality: "Sri Lankan", position: "Painter", company: "Gulf Services Co.", site: "Jeddah Waterfront Mall", rating: 4.5, phone: "+966 50 220 4003", passport: "S1122334", idNumber: "2411028773", passportStatus: "valid", idStatus: "valid" },
    { fullName: "Md. Rafiq Islam", nationality: "Bangladeshi", position: "Tile Fixer", company: "ASM Manpower Solutions", site: "Jeddah Waterfront Mall", rating: 3.5, phone: "+966 50 220 4004", passport: "B4455667", idNumber: "2411028774", passportStatus: "valid", idStatus: "valid" },
    { fullName: "Suresh Nair", nationality: "Indian", position: "Plumber", company: "ASM Manpower Solutions", site: "Jeddah Waterfront Mall", rating: 5, phone: "+966 50 220 4005", passport: "N3344556", idNumber: "2411028775", passportStatus: "valid", idStatus: "valid" },
    // Dammam Industrial Complex (4 + leader)
    { fullName: "Ibrahim Kaya", nationality: "Turkish", position: "Maintenance Supervisor", company: "ASM Manpower Solutions", site: "Dammam Industrial Complex", rating: 4.5, phone: "+966 50 330 5001", passport: "T7788990", idNumber: "2411028776", passportStatus: "valid", idStatus: "valid" },
    { fullName: "Shahid Mahmood", nationality: "Pakistani", position: "Welder", company: "Eastern Contracting", site: "Dammam Industrial Complex", rating: 4, phone: "+966 50 330 5002", passport: "P9900112", idNumber: "2411028777", passportStatus: "valid", idStatus: "valid" },
    { fullName: "Anil Kumar", nationality: "Indian", position: "Scaffolder", company: "Eastern Contracting", site: "Dammam Industrial Complex", rating: 4.5, phone: "+966 50 330 5003", passport: "N6677812", idNumber: "2411028778", passportStatus: "valid", idStatus: "valid" },
    { fullName: "Tek Bahadur", nationality: "Nepali", position: "Helper", company: "ASM Manpower Solutions", site: "Dammam Industrial Complex", rating: 3, phone: "+966 50 330 5004", passport: "P1122983", idNumber: "2411028779", passportStatus: "valid", idStatus: "valid" },
    // NEOM Camp 7 (4 + leader)
    { fullName: "Osama Farouk", nationality: "Egyptian", position: "Safety Officer", company: "ASM Manpower Solutions", site: "NEOM Camp 7", rating: 5, phone: "+966 50 440 6001", passport: "E3344112", idNumber: "2411028780", passportStatus: "valid", idStatus: "valid" },
    { fullName: "Sanjay Rai", nationality: "Nepali", position: "Steel Fixer", company: "ASM Manpower Solutions", site: "NEOM Camp 7", rating: 4, phone: "+966 50 440 6002", passport: "P5566778", idNumber: "2411028781", passportStatus: "valid", idStatus: "valid" },
    { fullName: "Dinesh Chhetri", nationality: "Nepali", position: "Mason", company: "ASM Manpower Solutions", site: "NEOM Camp 7", rating: 4.5, phone: "+966 50 440 6003", passport: "P9988776", idNumber: "2411028782", passportStatus: "valid", idStatus: "valid" },
    { fullName: "Grace Wanjiru", nationality: "Kenyan", position: "Cleaner", company: "Gulf Services Co.", site: "NEOM Camp 7", rating: 4.5, phone: "+966 50 440 6004", passport: "K1122334", idNumber: "2411028783", passportStatus: "valid", idStatus: "valid" },
    // KAFD Phase 2 (3)
    { fullName: "Vikram Singh", nationality: "Indian", position: "Glazier", company: "ASM Manpower Solutions", site: "KAFD Phase 2", rating: 4, phone: "+966 50 550 7001", passport: "N8899001", idNumber: "2411028784", passportStatus: "valid", idStatus: "valid" },
    { fullName: "Hassan Ali", nationality: "Pakistani", position: "Carpenter", company: "ASM Manpower Solutions", site: "KAFD Phase 2", rating: 4.5, phone: "+966 50 550 7002", passport: "P2233445", idNumber: "2411028785", passportStatus: "valid", idStatus: "valid" },
    { fullName: "Ronel Cruz", nationality: "Filipino", position: "Electrician", company: "Gulf Services Co.", site: "KAFD Phase 2", rating: 4, phone: "+966 50 550 7003", passport: "F6655443", idNumber: "2411028786", passportStatus: "renewal_due", idStatus: "valid" },
    // Idle (3)
    { fullName: "Anwar Hossain", nationality: "Bangladeshi", position: "Helper", company: "ASM Manpower Solutions", site: null, rating: 4.5, phone: "+966 50 660 8001", passport: "B7788990", idNumber: "2411028787", passportStatus: "valid", idStatus: "valid" },
    { fullName: "Pemba Sherpa", nationality: "Nepali", position: "Scaffolder", company: "ASM Manpower Solutions", site: null, rating: 5, phone: "+966 50 660 8002", passport: "P3344556", idNumber: "2411028788", passportStatus: "valid", idStatus: "valid" },
    { fullName: "Youssef Amr", nationality: "Egyptian", position: "Driver", company: "ASM Manpower Solutions", site: null, rating: 4, phone: "+966 50 660 8003", passport: "E5566778", idNumber: "2411028789", passportStatus: "valid", idStatus: "valid" },
  ];

  const year = new Date().getUTCFullYear();
  const employeeIds: string[] = [];
  let counter = 1;
  for (const e of employeesSeed) {
    const code = `ASM-${year}-${String(counter).padStart(3, "0")}`;
    counter += 1;
    const joinMonthsAgo = randInt(6, 36);
    const joinDate = utc(year, new Date().getUTCMonth() - joinMonthsAgo, randInt(1, 27));
    const dob = utc(randInt(1978, 2000), randInt(0, 11), randInt(1, 28));
    const emp = await db.employee.create({
      data: {
        employeeCode: code,
        fullName: e.fullName,
        nationality: e.nationality,
        dateOfBirth: dob,
        phone: e.phone,
        email: null,
        address: `${pick(["Al Batha", "Al Malaz", "Al Naseem", "Al Olaya"])} District, Riyadh`,
        emergencyContact: `+966 5${randInt(0, 5)} ${randInt(100, 999)} ${randInt(1000, 9999)}`,
        position: e.position,
        joinDate,
        companyName: e.company,
        passportNumber: encryptField(e.passport),
        passportStatus: e.passportStatus,
        idNumber: encryptField(e.idNumber),
        idStatus: e.idStatus,
        rating: e.rating,
        status: "active",
        currentSiteId: e.site ? sites[e.site] : null,
      },
    });
    employeeIds.push(emp.id);

    // site history
    if (e.site) {
      await db.employeeSiteHistory.create({
        data: {
          employeeId: emp.id,
          siteId: sites[e.site],
          startDate: joinDate > utc(year, new Date().getUTCMonth() - 12, 1)
            ? joinDate
            : utc(year, new Date().getUTCMonth() - 6, 1),
          reason: "Initial assignment",
          createdByName: "Faisal Al-Saud",
        },
      });
    }
    // idle employees may have past history
    if (!e.site && rand() > 0.5) {
      await db.employeeSiteHistory.create({
        data: {
          employeeId: emp.id,
          siteId: sites["Al Noor Tower"],
          startDate: utc(year - 1, 2, 1),
          endDate: utc(year - 1, 8, 15),
          reason: "Project completed – returned to pool",
          createdByName: "Faisal Al-Saud",
        },
      });
    }
  }

  // index → employee map for later references
  const byIdx = (i: number) => employeeIds[i];

  // ---- team leaders (one per active site) -----------------------------------
  await db.site.update({ where: { name: "Al Noor Tower" }, data: { teamLeaderId: byIdx(0) } });
  await db.site.update({ where: { name: "Jeddah Waterfront Mall" }, data: { teamLeaderId: byIdx(6) } });
  await db.site.update({ where: { name: "Dammam Industrial Complex" }, data: { teamLeaderId: byIdx(11) } });
  await db.site.update({ where: { name: "NEOM Camp 7" }, data: { teamLeaderId: byIdx(15) } });
  await db.site.update({ where: { name: "KAFD Phase 2" }, data: { teamLeaderId: byIdx(19) } });

  // ---- attendance (current month, day 1 → today) ----------------------------
  const now = new Date();
  const daysThisMonth = now.getUTCDate();
  const monthStart = utc(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const presentPool = ["present", "present", "present", "present", "present", "present", "present", "present", "overtime", "present", "present", "absent"];

  for (let i = 0; i < employeesSeed.length; i++) {
    const e = employeesSeed[i];
    for (let day = 1; day <= daysThisMonth; day++) {
      const date = utc(now.getUTCFullYear(), now.getUTCMonth(), day);
      // Friday = holiday
      if (date.getUTCDay() === 5) {
        await db.attendance.create({
          data: {
            employeeId: byIdx(i),
            siteId: e.site ? sites[e.site] : null,
            attendanceDate: date,
            status: "holiday",
            createdByName: "Sara Al-Harbi",
          },
        });
        continue;
      }
      let status: string;
      if (!e.site) {
        status = "no_site";
      } else {
        status = pick(presentPool);
      }
      await db.attendance.create({
        data: {
          employeeId: byIdx(i),
          siteId: e.site ? sites[e.site] : null,
          attendanceDate: date,
          status,
          overtimeHours: status === "overtime" ? pick([1.5, 2, 2.5, 3, 4]) : null,
          createdByName: "Sara Al-Harbi",
        },
      });
    }
  }

  // ---- leave requests ---------------------------------------------------------
  const mkLeave = async (
    empIdx: number,
    type: string,
    otherType: string | null,
    startOffset: number,
    days: number,
    status: string,
    reason: string
  ) => {
    const start = new Date(now.getTime() + startOffset * 86400000);
    const end = new Date(start.getTime() + (days - 1) * 86400000);
    await db.leaveRequest.create({
      data: {
        employeeId: byIdx(empIdx),
        leaveType: type,
        otherType,
        startDate: utc(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()),
        endDate: utc(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()),
        totalDays: days,
        reason,
        status,
        createdByName: status === "pending" ? "Sara Al-Harbi" : "Mohammed Al-Otaibi",
        reviewedByName: status === "approved" || status === "rejected" ? "Faisal Al-Saud" : null,
        reviewedAt: status === "approved" || status === "rejected" ? new Date() : null,
      },
    });
  };

  await mkLeave(2, "sick", null, -12, 3, "approved", "Fever and medical rest advised by doctor");
  await mkLeave(9, "casual", null, 3, 2, "pending", "Family matters – travelling to home country");
  await mkLeave(5, "annual", null, 7, 10, "pending", "Annual vacation as per contract");
  await mkLeave(13, "emergency", null, -5, 1, "approved", "Emergency at accommodation");
  await mkLeave(17, "marriage", null, 14, 5, "pending", "Marriage ceremony in home country");
  await mkLeave(21, "sick", null, -20, 4, "rejected", "Medical leave – no certificate provided");
  await mkLeave(4, "casual", null, -2, 1, "approved", "Personal errand");

  // approved leave for idx 2 → attendance rows become leave for those past dates
  {
    const start = new Date(now.getTime() - 12 * 86400000);
    for (let d = 0; d < 3; d++) {
      const date = utc(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + d);
      await db.attendance.upsert({
        where: {
          employeeId_attendanceDate: { employeeId: byIdx(2), attendanceDate: date },
        },
        update: { status: "leave" },
        create: {
          employeeId: byIdx(2),
          siteId: sites["Al Noor Tower"],
          attendanceDate: date,
          status: "leave",
        },
      });
    }
  }

  // ---- warnings & fines ----------------------------------------------------------
  await db.warning.create({
    data: {
      employeeId: byIdx(5),
      reason: "Repeated late arrivals to site (3 consecutive days)",
      isAutoGenerated: true,
      absentDates: JSON.stringify([ymd(new Date(now.getTime() - 6 * 86400000)), ymd(new Date(now.getTime() - 5 * 86400000)), ymd(new Date(now.getTime() - 4 * 86400000))]),
      ratingPenalty: 0.5,
      createdByName: "System",
    },
  });
  await db.warning.create({
    data: {
      employeeId: byIdx(13),
      reason: "Not following site safety instructions",
      isAutoGenerated: false,
      absentDates: null,
      ratingPenalty: 0.5,
      createdByName: "Faisal Al-Saud",
    },
  });
  await db.warning.create({
    data: {
      employeeId: byIdx(9),
      reason: "Absence without prior notice",
      isAutoGenerated: false,
      absentDates: JSON.stringify([ymd(new Date(now.getTime() - 9 * 86400000))]),
      ratingPenalty: 0.5,
      createdByName: "Sara Al-Harbi",
    },
  });

  await db.fine.create({
    data: {
      employeeId: byIdx(13),
      reason: "Damage to company equipment (angle grinder)",
      amount: 250,
      currency: "SAR",
      ratingPenalty: 1,
      createdByName: "Faisal Al-Saud",
    },
  });
  await db.fine.create({
    data: {
      employeeId: byIdx(5),
      reason: "Unauthorized absence from duty post",
      amount: 150,
      currency: "SAR",
      ratingPenalty: 1,
      createdByName: "Sara Al-Harbi",
    },
  });
  await db.fine.create({
    data: {
      employeeId: byIdx(17),
      reason: "Loss of safety helmet issued by company",
      amount: 80,
      currency: "SAR",
      ratingPenalty: 1,
      createdByName: "Mohammed Al-Otaibi",
    },
  });

  // ---- cancellation requests --------------------------------------------------------
  await db.cancellationRequest.create({
    data: {
      employeeId: byIdx(21),
      reason: "Employee requesting final exit – returning home permanently",
      status: "pending",
      requestedByName: "Sara Al-Harbi",
    },
  });
  await db.cancellationRequest.create({
    data: {
      employeeId: byIdx(22),
      reason: "Contract not renewed by client request",
      status: "pending",
      requestedByName: "Mohammed Al-Otaibi",
    },
  });
  await db.cancellationRequest.create({
    data: {
      employeeId: byIdx(23),
      reason: "Visa expired – employee departed",
      status: "rejected",
      requestedByName: "Sara Al-Harbi",
      reviewedByName: "Faisal Al-Saud",
      reviewedAt: new Date(now.getTime() - 3 * 86400000),
    },
  });

  // ---- uniform issues -----------------------------------------------------------------
  let uniformCounter = 1;
  const mkUniform = async (
    empIdx: number,
    docType: string,
    docNumber: string,
    issuedMonthsAgo: number,
    items: [string, number][],
    isRenewal = false,
    previousIssueId: string | null = null
  ) => {
    const issuedAt = addMonths(now, -issuedMonthsAgo);
    const renewalDate = addMonths(issuedAt, 6);
    const idx = String(uniformCounter).padStart(4, "0");
    uniformCounter += 1;
    const issue = await db.uniformIssue.create({
      data: {
        uniformCode: `UN-${idx}`,
        tokenNumber: `TKN-${idx}`,
        employeeId: byIdx(empIdx),
        documentType: docType,
        documentNumber: encryptField(docNumber) ?? "",
        siteId: employeesSeed[empIdx].site ? sites[employeesSeed[empIdx].site!] : null,
        teamLeaderName: null,
        isRenewal,
        previousIssueId,
        issuedAt,
        renewalDate,
        createdByName: "Sara Al-Harbi",
      },
    });
    for (const [itemName, qty] of items) {
      await db.uniformIssueItem.create({
        data: { issueId: issue.id, itemId: uniformItems[itemName], quantity: qty },
      });
    }
    return issue;
  };

  await mkUniform(0, "Iqama", "2456789012", 7, [["Uniform", 2], ["Safety Shoes", 1], ["Helmet", 1], ["Gloves", 2]]); // overdue
  await mkUniform(1, "Iqama", "2456789013", 5, [["Uniform", 2], ["Shoes", 1], ["Vest", 1]]);
  await mkUniform(2, "Passport", "N9988776", 6, [["Uniform", 2], ["Safety Jacket", 1], ["Helmet", 1]]);
  await mkUniform(4, "Iqama", "2456789015", 4, [["Uniform", 2], ["Safety Shoes", 1], ["Bottle", 1]]);
  await mkUniform(6, "Iqama", "2456789016", 6, [["Uniform", 2], ["Helmet", 1], ["Gloves", 2], ["Vest", 1]]);
  await mkUniform(7, "Passport", "F1122334", 3, [["Uniform", 2], ["Safety Shoes", 1]]);
  await mkUniform(9, "Iqama", "2456789018", 5, [["Uniform", 2], ["Helmet", 1]]);
  await mkUniform(11, "Iqama", "2456789019", 6, [["Uniform", 2], ["Safety Jacket", 1], ["Safety Shoes", 1]]);
  await mkUniform(15, "Iqama", "2456789020", 2, [["Uniform", 2], ["Gloves", 2], ["Helmet", 1]]);
  const renewed = await mkUniform(17, "Iqama", "2456789021", 8, [["Uniform", 2], ["Safety Shoes", 1], ["Helmet", 1]]);
  await mkUniform(17, "Iqama", "2456789022", 2, [["Uniform", 2], ["Safety Shoes", 1], ["Helmet", 1], ["Vest", 1]], true, renewed.id);

  // ---- notifications --------------------------------------------------------------------
  const mkNotif = async (
    recipientId: string,
    type: string,
    title: string,
    message: string,
    read: boolean,
    hoursAgo: number,
    referenceType?: string,
    referenceId?: string
  ) => {
    await db.notification.create({
      data: {
        recipientId,
        type,
        title,
        message,
        referenceType: referenceType ?? null,
        referenceId: referenceId ?? null,
        read,
        createdAt: new Date(now.getTime() - hoursAgo * 3600000),
      },
    });
  };

  const pendingLeaves = await db.leaveRequest.findMany({ where: { status: "pending" } });
  const pendingCancels = await db.cancellationRequest.findMany({ where: { status: "pending" } });

  await mkNotif(superAdmin.id, "leave_request", "New leave request", "Sara Al-Harbi submitted a leave request for Md. Rafiq Islam (2 days).", false, 2, "leave_request", pendingLeaves[0]?.id);
  await mkNotif(superAdmin.id, "leave_request", "New leave request", "Annual leave request for Suresh Nair (10 days) awaiting review.", false, 6, "leave_request", pendingLeaves[1]?.id);
  await mkNotif(superAdmin.id, "cancellation_request", "Cancellation request submitted", "Anwar Hossain is requested for deletion by HR. Super Admin review required.", false, 4, "cancellation_request", pendingCancels[0]?.id);
  await mkNotif(superAdmin.id, "warning", "Warning issued", "A warning was issued to Joseph Mwangi (auto-generated: 3 consecutive absences).", true, 26);
  await mkNotif(superAdmin.id, "fine", "Fine issued", "A fine of SAR 250 was issued to Tek Bahadur.", true, 50);
  await mkNotif(superAdmin.id, "uniform_renewal", "Uniform renewal overdue", "Rahul Sharma's uniform (TKN-0001) is due for renewal.", false, 12);
  await mkNotif(superAdmin.id, "system", "Welcome to ASM Manpower System", "The platform has been set up successfully. Review pending requests from the dashboard.", true, 72);
  await mkNotif(hrAdmin.id, "system", "Profile activated", "Your administrator account is active. You can manage employees, attendance and leave requests.", true, 72);
  await mkNotif(opsAdmin.id, "system", "Profile activated", "Your administrator account is active. You can manage sites and attendance.", true, 72);

  // ---- audit logs ------------------------------------------------------------------------
  const mkAudit = async (
    actorName: string,
    action: string,
    entity: string,
    entityId: string | null,
    before: unknown,
    after: unknown,
    hoursAgo: number
  ) => {
    await db.auditLog.create({
      data: {
        actorId: null,
        actorName,
        action,
        entity,
        entityId,
        before: before ? JSON.stringify(before) : null,
        after: after ? JSON.stringify(after) : null,
        createdAt: new Date(now.getTime() - hoursAgo * 3600000),
      },
    });
  };

  await mkAudit("Faisal Al-Saud", "site.create", "site", sites["Al Noor Tower"], null, { name: "Al Noor Tower" }, 240);
  await mkAudit("Faisal Al-Saud", "admin.create", "admin_user", hrAdmin.id, null, { email: "hr.admin@asm.com", role: "admin" }, 236);
  await mkAudit("Sara Al-Harbi", "employee.create", "employee", byIdx(0), null, { employeeCode: "ASM-" + year + "-001", fullName: "Rahul Sharma" }, 200);
  await mkAudit("Faisal Al-Saud", "employee.assign_site", "employee", byIdx(0), { site: null }, { site: "Al Noor Tower" }, 198);
  await mkAudit("Sara Al-Harbi", "attendance.bulk_mark", "attendance", null, null, { site: "Al Noor Tower", status: "present" }, 30);
  await mkAudit("Faisal Al-Saud", "leave.approve", "leave_request", pendingLeaves[1]?.id ?? null, { status: "pending" }, { status: "approved" }, 26);
  await mkAudit("System", "warning.auto_create", "warning", byIdx(5), null, { reason: "3 consecutive unexplained absences" }, 26);
  await mkAudit("Sara Al-Harbi", "fine.create", "fine", byIdx(5), null, { amount: 150, currency: "SAR" }, 25);
  await mkAudit("Mohammed Al-Otaibi", "cancellation.request", "cancellation_request", pendingCancels[1]?.id ?? null, null, { employee: "Pemba Sherpa" }, 4);
  await mkAudit("Faisal Al-Saud", "site.deactivate", "site", sites["Makkah Hotel Renovation"], { isActive: true }, { isActive: false, reassignedEmployees: 0 }, 48);

  console.log("Seed complete.");
  console.log("  Super Admin : superadmin@asm.com / SuperAdmin@123");
  console.log("  HR Admin    : hr.admin@asm.com / Admin@123");
  console.log("  Ops Admin   : ops.admin@asm.com / Admin@123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());

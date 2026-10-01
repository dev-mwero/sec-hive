/**
 * DEVELOPMENT-ONLY DUMMY DATA.
 *
 * Typed against the real domain types in `src/types/domain.ts`, not against a loose shape, so a
 * screen built on this data takes exactly the same props it will take from a service call. That
 * is the whole point of building UI first: the swap to real data is invisible at the component
 * boundary.
 *
 * Rules for this directory:
 * - Never imported from `src/server/**`. Dummy data must not be able to reach a route handler.
 * - Fake records only. No real-looking phone numbers, emails or person data.
 * - Deterministic ids (`org-1`, `guard-3`, `station-2`) so links and filters stay coherent.
 *
 * The moment a screen reads from a service, its entry here becomes dead and is deleted — no
 * `if (isDev) return dummyData` branches in production code paths.
 */

import type {
  AssignmentStatus,
  CoverageStatus,
  Role,
} from "@/constants/domain";
import {
  formatShiftWindow,
  materialiseShiftWindow,
  minutesToTime,
  shiftCrossesMidnight,
  timeToMinutes,
} from "@/lib/time";
import type {
  AttendanceRecord,
  Client,
  DeploymentRow,
  Guard,
  Notification,
  Shift,
  Site,
  Station,
  User,
} from "@/types/domain";

export const DUMMY = {
  organization: {
    id: "org-1",
    name: "SecureGuard Kenya Ltd",
    slug: "secureguard-ke",
    logoUrl: null,
    phone: "+254 700 000 000",
    email: "operations@secureguard.co.ke",
    address: "Kenyatta Avenue, Nairobi",
    status: "active",
    gracePeriodMinutes: 5,
  },
  users: [
    {
      id: "user-admin",
      organizationId: "org-1",
      email: "amina@secureguard.co.ke",
      firstName: "Amina",
      lastName: "Otieno",
      phone: "+254 700 000 001",
      role: "security_company_admin" as Role,
      status: "active" as const,
      clientId: null,
      lastLoginAt: new Date("2026-09-30T06:12:00Z"),
    },
    {
      id: "user-supervisor",
      organizationId: "org-1",
      email: "otieno@secureguard.co.ke",
      firstName: "Daniel",
      lastName: "Otieno",
      phone: "+254 700 000 002",
      role: "supervisor" as Role,
      status: "active" as const,
      clientId: null,
      lastLoginAt: new Date("2026-09-30T05:48:00Z"),
    },
    {
      id: "user-clientadmin",
      organizationId: "org-1",
      email: "facilities@abcmfg.co.ke",
      firstName: "Sarah",
      lastName: "Njeri",
      phone: "+254 700 000 003",
      role: "client_admin" as Role,
      status: "active" as const,
      clientId: "client-1",
      lastLoginAt: new Date("2026-09-29T16:30:00Z"),
    },
    {
      id: "user-guard-1",
      organizationId: "org-1",
      email: "j.mwangi@secureguard.co.ke",
      firstName: "John",
      lastName: "Mwangi",
      phone: "+254 700 000 004",
      role: "guard" as Role,
      status: "active" as const,
      clientId: null,
      lastLoginAt: new Date("2026-09-30T05:57:00Z"),
    },
  ] satisfies User[],

  guards: [
    guard("guard-1", "SG-014", "John", null, "Mwangi", "2019-03-11"),
    guard("guard-2", "SG-021", "Peter", null, "Kamau", "2020-07-02"),
    guard("guard-3", "SG-033", "David", "Otieno", "Otieno", "2021-01-18"),
    guard("guard-4", "SG-047", "James", null, "Achieng", "2021-09-05"),
    guard("guard-5", "SG-052", "Hassan", null, "Ali", "2022-02-14"),
    guard("guard-6", "SG-068", "Mercy", "Wanjiku", "Wanjiku", "2022-06-20"),
    guard("guard-7", "SG-071", "Brian", null, "Kiplagat", "2022-11-08"),
    guard("guard-8", "SG-090", "Faith", null, "Njeri", "2023-04-03"),
  ],

  clients: [
    {
      id: "client-1",
      organizationId: "org-1",
      name: "ABC Manufacturing",
      clientType: "factory" as const,
      contactPerson: "Sarah Njeri",
      phone: "+254 700 100 001",
      email: "facilities@abcmfg.co.ke",
      address: "Industrial Area, Nairobi",
      status: "active" as const,
    },
    {
      id: "client-2",
      organizationId: "org-1",
      name: "Mombasa International School",
      clientType: "school" as const,
      contactPerson: "Halima Yusuf",
      phone: "+254 700 100 002",
      email: "admin@mis.ac.ke",
      address: "Nyali Road, Mombasa",
      status: "active" as const,
    },
  ],

  sites: [
    site("site-1", "client-1", "ABC Headquarters", "HQ", ["user-supervisor"]),
    site("site-2", "client-1", "ABC Warehouse", "WH", ["user-supervisor"]),
    site("site-3", "client-2", "MIS Main Campus", "CAMPUS", [
      "user-supervisor",
    ]),
  ],

  stations: [
    station("station-1", "site-1", "Main Gate", "MG-01", 2),
    station("station-2", "site-1", "Rear Gate", "RG-01", 1),
    station("station-3", "site-1", "Reception", "RC-01", 1),
    station("station-4", "site-2", "Loading Bay", "LB-01", 2),
    station("station-5", "site-2", "Perimeter Patrol Post", "PP-01", 1),
    station("station-6", "site-3", "Gate A", "GA-01", 1),
    station("station-7", "site-3", "Dormitory", "DM-01", 2),
    station("station-8", "site-3", "CCTV Room", "CCTV", 1),
  ],

  shifts: [
    shift("shift-day", "Day Shift", "06:00", "18:00"),
    shift("shift-night", "Night Shift", "18:00", "06:00"),
    shift("shift-day-short", "Day Shift (08–16)", "08:00", "16:00"),
  ],
} satisfies {
  organization: unknown;
  users: User[];
  guards: Guard[];
  clients: Client[];
  sites: Site[];
  stations: Station[];
  shifts: Shift[];
};

// ---------------------------------------------------------------------------
// Live deployment
// ---------------------------------------------------------------------------

/**
 * The Live Deployment board, as it would look mid-morning.
 *
 * Deliberately includes every status that matters — on duty, late, absent, scheduled,
 * checked out, cancelled — plus a deliberately uncovered station, because a demo that only shows
 * the happy path hides the reason the product exists.
 */
const deploymentSpec: {
  stationId: string;
  guardId: string;
  shiftId: string;
  status: AssignmentStatus;
  checkInMinutes?: number;
  checkOutMinutes?: number;
}[] = [
  // ABC Headquarters — healthy
  {
    stationId: "station-1",
    guardId: "guard-1",
    shiftId: "shift-day",
    status: "on_duty",
    checkInMinutes: 357,
  },
  {
    stationId: "station-1",
    guardId: "guard-3",
    shiftId: "shift-day",
    status: "on_duty",
    checkInMinutes: 369,
  },
  {
    stationId: "station-2",
    guardId: "guard-2",
    shiftId: "shift-day",
    status: "late",
    checkInMinutes: 391,
  },
  {
    stationId: "station-3",
    guardId: "guard-6",
    shiftId: "shift-day",
    status: "on_duty",
    checkInMinutes: 352,
  },
  // ABC Warehouse — one post uncovered, one guard absent
  {
    stationId: "station-4",
    guardId: "guard-4",
    shiftId: "shift-day",
    status: "on_duty",
    checkInMinutes: 345,
  },
  {
    stationId: "station-5",
    guardId: "guard-5",
    shiftId: "shift-day",
    status: "absent",
  },
  // MIS Main Campus — night shift handover, mostly dark right now
  {
    stationId: "station-6",
    guardId: "guard-7",
    shiftId: "shift-night",
    status: "on_duty",
    checkInMinutes: 1097,
  },
  {
    stationId: "station-7",
    guardId: "guard-8",
    shiftId: "shift-day",
    status: "scheduled",
  },
  {
    stationId: "station-8",
    guardId: "guard-4",
    shiftId: "shift-day",
    status: "checked_out",
    checkInMinutes: 361,
    checkOutMinutes: 700,
  },
];

export const dummyDeployment: DeploymentRow[] = buildDeployment();

function buildDeployment(): DeploymentRow[] {
  const date = today();

  // Presence per station, derived from the same spec so the occupancy figures on a row agree
  // with the rows beneath it — a mismatch here would be a lie the UI tells the operator.
  const presenceByStation = new Map<string, number>();
  for (const row of deploymentSpec) {
    if (row.status === "on_duty" || row.status === "late") {
      presenceByStation.set(
        row.stationId,
        (presenceByStation.get(row.stationId) ?? 0) + 1,
      );
    }
  }

  return deploymentSpec.map((spec, index) => {
    const station = lookup(DUMMY.stations, spec.stationId, "station");
    const site = lookup(DUMMY.sites, station.siteId, "site");
    const client = lookup(DUMMY.clients, site.clientId, "client");
    const guard = lookup(DUMMY.guards, spec.guardId, "guard");
    const shift = lookup(DUMMY.shifts, spec.shiftId, "shift");

    const startMin = timeToMinutes(shift.startTime);
    const endMin = timeToMinutes(shift.endTime);
    const { scheduledStart, scheduledEnd, crossesMidnight } =
      materialiseShiftWindow(date, startMin, endMin);

    const withMinutes = (base: Date, minutes: number) =>
      new Date(base.getTime() + (minutes - startMin) * 60_000);

    return {
      assignmentId: `assign-${index + 1}`,
      clientId: client.id,
      client: client.name,
      siteId: site.id,
      site: site.name,
      stationId: station.id,
      station: station.name,
      guardId: guard.id,
      guard: `${guard.firstName} ${guard.lastName}`,
      employeeNumber: guard.employeeNumber,
      shiftId: shift.id,
      shift: shift.name,
      shiftWindow: formatShiftWindow(startMin, endMin, crossesMidnight),
      supervisorId: site.supervisorIds[0] ?? null,
      supervisor: "Daniel Otieno",
      scheduledStart,
      scheduledEnd,
      actualCheckIn: spec.checkInMinutes
        ? withMinutes(scheduledStart, spec.checkInMinutes)
        : null,
      actualCheckOut: spec.checkOutMinutes
        ? withMinutes(scheduledStart, spec.checkOutMinutes)
        : null,
      status: spec.status,
      statusLabel: ASSIGNMENT_LABELS[spec.status],
      stationRequiredCount: station.requiredGuardCount,
      stationPresentCount: presenceByStation.get(station.id) ?? 0,
    };
  });
}

/**
 * Coverage rollup per station.
 *
 * `assigned` counts non-cancelled bookings; `present` counts guards physically at the post. The
 * gap between the two is what a supervisor acts on, so it is modelled explicitly rather than
 * derived away.
 */
export const dummyCoverage: {
  stationId: string;
  station: string;
  siteId: string;
  site: string;
  clientId: string;
  client: string;
  required: number;
  assigned: number;
  present: number;
  coverageStatus: CoverageStatus;
  guards: {
    id: string;
    name: string;
    status: AssignmentStatus;
    statusLabel: string;
  }[];
}[] = buildCoverage();

function buildCoverage() {
  const byStation = new Map<string, (typeof deploymentSpec)[number][]>();

  for (const spec of deploymentSpec) {
    const list = byStation.get(spec.stationId) ?? [];
    list.push(spec);
    byStation.set(spec.stationId, list);
  }

  return DUMMY.stations.map((station) => {
    const site = lookup(DUMMY.sites, station.siteId, "site");
    const client = lookup(DUMMY.clients, site.clientId, "client");
    const specs = byStation.get(station.id) ?? [];

    const assigned = specs.filter((s) => s.status !== "cancelled").length;
    const present = specs.filter(
      (s) => s.status === "on_duty" || s.status === "late",
    ).length;
    const required = station.requiredGuardCount;

    const coverageStatus: CoverageStatus =
      required <= 0
        ? "covered"
        : present <= 0
          ? "uncovered"
          : present < required
            ? "partially_covered"
            : "covered";

    return {
      stationId: station.id,
      station: station.name,
      siteId: site.id,
      site: site.name,
      clientId: client.id,
      client: client.name,
      required,
      assigned,
      present,
      coverageStatus,
      guards: specs.map((s) => {
        const g = lookup(DUMMY.guards, s.guardId, "guard");
        return {
          id: g.id,
          name: `${g.firstName} ${g.lastName}`,
          status: s.status,
          statusLabel: ASSIGNMENT_LABELS[s.status],
        };
      }),
    };
  });
}

// ---------------------------------------------------------------------------
// Guard duty, attendance, notifications
// ---------------------------------------------------------------------------

export const dummyGuardDuty: {
  assignment: DeploymentRow;
  attendance: AttendanceRecord | null;
  canCheckIn: boolean;
  canCheckOut: boolean;
}[] = [
  {
    assignment: dummyDeployment[0],
    attendance: null,
    canCheckIn: true,
    canCheckOut: false,
  },
  {
    assignment: dummyDeployment[7],
    attendance: null,
    canCheckIn: true,
    canCheckOut: false,
  },
  {
    assignment: dummyDeployment[4],
    attendance: {
      id: "att-1",
      organizationId: "org-1",
      assignmentId: "assign-5",
      guardId: "guard-4",
      clientId: "client-1",
      siteId: "site-2",
      stationId: "station-4",
      scheduledStart: dummyDeployment[4].scheduledStart,
      scheduledEnd: dummyDeployment[4].scheduledEnd,
      actualCheckIn: dummyDeployment[4].actualCheckIn,
      actualCheckOut: null,
      status: "present",
      notes: null,
      recordedBy: "guard-4",
    },
    canCheckIn: false,
    canCheckOut: true,
  },
];

export const dummyNotifications: Notification[] = [
  {
    id: "note-1",
    recipientId: "user-supervisor",
    type: "attendance.absent",
    title: "Guard absent at ABC Warehouse",
    body: "Hassan Ali has not reported for the Day Shift at Loading Bay.",
    data: { stationId: "station-4" },
    readAt: null,
    createdAt: new Date(Date.now() - 22 * 60_000),
  },
  {
    id: "note-2",
    recipientId: "user-supervisor",
    type: "assignment.upcoming",
    title: "Night Shift begins in 2 hours",
    body: "Brian Kiplagat reports to Gate A, MIS Main Campus at 18:00.",
    data: { assignmentId: "assign-7" },
    readAt: null,
    createdAt: new Date(Date.now() - 41 * 60_000),
  },
  {
    id: "note-3",
    recipientId: "user-admin",
    type: "station.uncovered",
    title: "Perimeter Patrol Post uncovered",
    body: "ABC Warehouse requires 1 guard and none are present.",
    data: { stationId: "station-5" },
    readAt: new Date(Date.now() - 60 * 60_000),
    createdAt: new Date(Date.now() - 3 * 60 * 60_000),
  },
];

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

/**
 * Referential lookup that throws on a miss.
 *
 * A missing fixture record is a bug in the fixture, not a runtime condition, so it must fail at
 * module load rather than silently render a blank cell on an operations screen. The `!`
 * non-null assertion would have hidden exactly that.
 */
function lookup<T extends { id: string }>(
  collection: T[],
  id: string,
  label: string,
): T {
  const found = collection.find((item) => item.id === id);
  if (!found) {
    throw new Error(
      `[dummy] No ${label} with id "${id}". The dummy dataset is inconsistent.`,
    );
  }
  return found;
}

let guardSequence = 0;

function guard(
  id: string,
  employeeNumber: string,
  firstName: string,
  middleName: string | null,
  lastName: string,
  dateJoined: string,
): Guard {
  guardSequence += 1;
  return {
    id,
    organizationId: "org-1",
    // Only the first guard has a login in the demo set, so the guard experience has a subject.
    userId: id === "guard-1" ? "user-guard-1" : null,
    employeeNumber,
    firstName,
    middleName,
    lastName,
    phone: `+254 700 200 ${String(guardSequence).padStart(3, "0")}`,
    email: null,
    profilePhotoUrl: null,
    employmentStatus: "active",
    dateJoined,
    onDuty: false,
  };
}

function site(
  id: string,
  clientId: string,
  name: string,
  code: string,
  supervisorIds: string[],
): Site {
  return {
    id,
    organizationId: "org-1",
    clientId,
    name,
    code,
    address: null,
    description: null,
    supervisorIds,
    status: "active",
  };
}

function station(
  id: string,
  siteId: string,
  name: string,
  code: string,
  requiredGuardCount: number,
): Station {
  return {
    id,
    organizationId: "org-1",
    siteId,
    name,
    code,
    description: null,
    requiredGuardCount,
    status: "active",
  };
}

function shift(id: string, name: string, start: string, end: string): Shift {
  const startMinutes = timeToMinutes(start);
  const endMinutes = timeToMinutes(end);
  return {
    id,
    organizationId: "org-1",
    name,
    startTime: minutesToTime(startMinutes),
    endTime: minutesToTime(endMinutes),
    crossesMidnight: shiftCrossesMidnight(startMinutes, endMinutes),
    status: "active",
  };
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const ASSIGNMENT_LABELS: Record<AssignmentStatus, string> = {
  scheduled: "SCHEDULED",
  on_duty: "ON DUTY",
  late: "LATE",
  absent: "ABSENT",
  checked_out: "CHECKED OUT",
  completed: "COMPLETED",
  cancelled: "CANCELLED",
};

/** Demo credentials shown on the login screen during development. */
export const DUMMY_CREDENTIALS = [
  { role: "Company Admin", email: "amina@secureguard.co.ke" },
  { role: "Supervisor", email: "otieno@secureguard.co.ke" },
  { role: "Client Admin", email: "facilities@abcmfg.co.ke" },
  { role: "Guard", email: "j.mwangi@secureguard.co.ke" },
] as const;

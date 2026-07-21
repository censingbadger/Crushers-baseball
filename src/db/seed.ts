/*
 * Seeds a demo team so the app is explorable out of the box.
 * All names here are fictional — real roster data enters through
 * the Import page, never through the repository.
 *
 * Run: npm run seed   (re-run after deleting .data/ to reset)
 */
import bcrypt from "bcryptjs";
import { getDb, tables } from "./index";
import { STARTER_DRILLS } from "../lib/drills";

const DEMO_COACH = { email: "coach@demo.crushersblue.example", password: "dugout-demo" };
const DEMO_PARENT = { email: "parent@demo.crushersblue.example", password: "family-demo" };

const PLAYERS: {
  first: string;
  last: string;
  jersey: number | null;
  positions: string;
  status: "full" | "practice" | "hopeful";
}[] = [
  { first: "Milo", last: "Vance", jersey: 2, positions: "P, SS", status: "full" },
  { first: "Theo", last: "Ramos", jersey: 5, positions: "C, 1B", status: "full" },
  { first: "Jax", last: "Turner", jersey: 7, positions: "CF, P", status: "full" },
  { first: "Eli", last: "Brooks", jersey: 9, positions: "2B, SS", status: "full" },
  { first: "Sam", last: "Whitfield", jersey: 11, positions: "3B, P", status: "full" },
  { first: "Leo", last: "Castillo", jersey: 13, positions: "LF, RF", status: "full" },
  { first: "Max", last: "Porter", jersey: 17, positions: "1B, 3B", status: "full" },
  { first: "Finn", last: "Delgado", jersey: 21, positions: "RF, CF", status: "full" },
  { first: "Nate", last: "Sherman", jersey: 24, positions: "C, 2B", status: "full" },
  { first: "Cole", last: "Bryant", jersey: 33, positions: "P, LF", status: "full" },
  { first: "Ryder", last: "Quinn", jersey: null, positions: "OF", status: "practice" },
  { first: "Sky", last: "Nolan", jersey: null, positions: "2B", status: "hopeful" },
];

const POSITIONS = ["P", "C", "1B", "2B", "SS", "3B", "LF", "CF", "RF"] as const;

function at(daysFromNow: number, hour: number, minute = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function isoDay(daysFromNow: number): string {
  const d = at(daysFromNow, 12);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

async function main() {
  const db = await getDb();

  const existing = await db.select().from(tables.teams).limit(1);
  if (existing.length > 0) {
    console.log("Already seeded — delete .data/ to reset, then re-run.");
    return;
  }

  const [team] = await db
    .insert(tables.teams)
    .values({ name: "Crushers Blue", slug: "crushers-blue" })
    .returning();

  const [season] = await db
    .insert(tables.seasons)
    .values({
      teamId: team.id,
      year: new Date().getFullYear(),
      term: "summer",
      ageGroup: "11U",
      name: `Crushers Blue ${new Date().getFullYear()} Summer`,
      isActive: true,
    })
    .returning();

  const [coachUser] = await db
    .insert(tables.users)
    .values({
      email: DEMO_COACH.email,
      passwordHash: bcrypt.hashSync(DEMO_COACH.password, 10),
      displayName: "Coach Demo",
      role: "coach",
    })
    .returning();

  const playerIds: string[] = [];
  for (const p of PLAYERS) {
    const [player] = await db
      .insert(tables.players)
      .values({ teamId: team.id, firstName: p.first, lastName: p.last })
      .returning();
    playerIds.push(player.id);
    await db.insert(tables.rosterEntries).values({
      seasonId: season.id,
      playerId: player.id,
      jerseyNumber: p.jersey,
      status: p.status,
      positions: p.positions,
    });
  }

  // One demo parent family attached to the first player.
  const [guardian] = await db
    .insert(tables.guardians)
    .values({
      teamId: team.id,
      firstName: "Perry",
      lastName: "Vance",
      email: DEMO_PARENT.email,
      phone: "555-0100",
    })
    .returning();
  await db.insert(tables.playerGuardians).values({
    playerId: playerIds[0],
    guardianId: guardian.id,
  });
  await db.insert(tables.users).values({
    email: DEMO_PARENT.email,
    passwordHash: bcrypt.hashSync(DEMO_PARENT.password, 10),
    displayName: "Perry Vance",
    role: "parent",
    guardianId: guardian.id,
  });
  // A guardian with an email but no login yet — the Families page's
  // "generate logins" flow picks this one up.
  const [pendingGuardian] = await db
    .insert(tables.guardians)
    .values({
      teamId: team.id,
      firstName: "Dana",
      lastName: "Ramos",
      email: "dana@demo.crushersblue.example",
      phone: "555-0101",
    })
    .returning();
  await db.insert(tables.playerGuardians).values({
    playerId: playerIds[1],
    guardianId: pendingGuardian.id,
  });

  const [pastPractice] = await db
    .insert(tables.events)
    .values({
      seasonId: season.id,
      type: "practice",
      startsAt: at(-3, 17, 30),
      endsAt: at(-3, 19, 0),
      location: "White Cross",
    })
    .returning();
  const [practice1] = await db
    .insert(tables.events)
    .values({
      seasonId: season.id,
      type: "practice",
      startsAt: at(2, 17, 30),
      endsAt: at(2, 19, 0),
      location: "White Cross",
    })
    .returning();
  await db.insert(tables.events).values({
    seasonId: season.id,
    type: "practice",
    startsAt: at(7, 17, 30),
    endsAt: at(7, 19, 0),
    location: "White Cross",
  });
  await db.insert(tables.events).values({
    seasonId: season.id,
    type: "tournament",
    title: "Summer Slam Classic",
    startsAt: at(12, 8, 0),
    endsAt: at(14, 18, 0),
    location: "Riverside Park",
    notes: "Four-game guarantee. Arrival 45 minutes before first pitch.",
  });

  // A believable spread of RSVPs for the next practice.
  const answers = ["yes", "yes", "yes", "no", "maybe", "yes", "yes", "no", "yes", "yes", "maybe", "yes"] as const;
  for (let i = 0; i < playerIds.length; i++) {
    await db.insert(tables.rsvps).values({
      eventId: practice1.id,
      playerId: playerIds[i],
      status: answers[i % answers.length],
    });
    await db.insert(tables.rsvps).values({
      eventId: pastPractice.id,
      playerId: playerIds[i],
      status: i % 3 === 0 ? "no" : "yes",
    });
  }

  await db.insert(tables.signups).values({
    eventId: practice1.id,
    kind: "helper",
    guardianName: "Perry Vance",
    note: "bringing a glove",
  });

  // Two demo coaches' position ratings so the matrix has life. "CD" is
  // the demo coach who logs in, so his rows carry his user id — that's
  // his identity everywhere (getCurrentRatings/quick entry key on
  // rater+user, so a same-initials coworker can't overwrite him). "AB"
  // is a fictional coach with no login, left unowned.
  for (const [raterIdx, rater] of ["AB", "CD"].entries()) {
    for (let i = 0; i < playerIds.length; i++) {
      for (let j = 0; j < POSITIONS.length; j++) {
        await db.insert(tables.positionRatings).values({
          seasonId: season.id,
          playerId: playerIds[i],
          position: POSITIONS[j],
          rating: ((i * 3 + j * 5 + raterIdx) % 9) + 1,
          rater,
          createdByUserId: rater === "CD" ? coachUser.id : null,
        });
      }
    }
  }

  // A first pass of BARS feedback so the Performance pages (feedback,
  // reports, homework) have life: a few below-standard levels create
  // homework gaps. Fictional demo players only, as always.
  // Indexes follow PLAYERS order: 0 Milo, 2 Jax, 3 Eli, 4 Sam. Eli gets
  // the fielding/self-regulation gaps the smoke walks through; Jax and
  // Sam share a throwing gap so the team-focus panel has a real theme.
  const barsSeed: [number, import("@/lib/bars").BarsKey, number, string][] = [
    [0, "d1", 4, "CD"],
    [0, "d5", 3, "CD"],
    [0, "d8", 3, "AB"],
    [3, "d1", 3, "CD"],
    [3, "d3", 2, "CD"],
    [3, "d6", 2, "AB"],
    [3, "d8", 2, "CD"],
    [2, "d2", 2, "CD"],
    [2, "d7", 3, "CD"],
    [4, "d2", 2, "CD"],
    [4, "d4", 2, "AB"],
    [4, "d9", 3, "CD"],
  ];
  for (const [idx, dimension, level, rater] of barsSeed) {
    await db.insert(tables.barsRatings).values({
      seasonId: season.id,
      playerId: playerIds[idx],
      dimension,
      rater,
      level,
      day: isoDay(-2),
      createdByUserId: rater === "CD" ? coachUser.id : null,
    });
  }

  // Tournament-weekend availability for two future weekends.
  for (const offset of [19, 20, 21, 26, 27, 28]) {
    for (let i = 0; i < playerIds.length; i++) {
      await db.insert(tables.availabilityDays).values({
        seasonId: season.id,
        playerId: playerIds[i],
        day: isoDay(offset),
        status: (i + offset) % 4 === 0 ? "no" : (i + offset) % 7 === 0 ? "maybe" : "yes",
      });
    }
  }

  // The drill library ships loaded so the guided workout works out of
  // the box for the demo team.
  for (const drill of STARTER_DRILLS) {
    await db.insert(tables.drills).values(drill);
  }

  // Player-page life for Milo: an avatar, a look, and a week of effort.
  await db.insert(tables.playerPages).values({
    playerId: playerIds[0],
    avatarConfig: JSON.stringify({
      skin: "s2",
      hairStyle: "curly",
      hairColor: "h1",
      cap: "blue",
      eyes: "game",
      extra: "eyeblack",
    }),
    bgColor: "columbia",
    borderColor: "orange",
    font: "sporty",
    wallpaper: "stitches",
  });
  for (const [offset, minutes] of [
    [-1, 20],
    [-3, 15],
    [-8, 25],
  ] as const) {
    await db.insert(tables.workoutLogs).values({
      playerId: playerIds[0],
      day: isoDay(offset),
      totalMinutes: minutes,
      source: "manual",
      note: "long toss + tee work",
    });
  }

  console.log("Seeded demo data.");
  console.log(`  Coach login:  ${DEMO_COACH.email} / ${DEMO_COACH.password}`);
  console.log(`  Parent login: ${DEMO_PARENT.email} / ${DEMO_PARENT.password}`);
}

main().then(() => process.exit(0));

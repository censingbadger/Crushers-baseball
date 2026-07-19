import { requireCoach } from "@/lib/auth";
import { ImportForm } from "./ImportForm";
import {
  importCues,
  importPracticeGrid,
  importRoster,
  importTournamentGrid,
} from "./actions";

export default async function ImportPage() {
  await requireCoach();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Import from the organizing Sheet</h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-700">
          Export each tab of the Google Sheet as CSV (File → Download →
          Comma Separated Values with the tab open), then upload it here.
          Imports are idempotent — running one twice updates rather than
          duplicates.
        </p>
      </div>

      <ImportForm
        title="1 · Roster tab"
        description="Players, jersey numbers, birthdays, schools, and both parents/guardians with emails and phones. Creates parent login accounts for new guardian emails."
        action={importRoster}
      />
      <ImportForm
        title="2 · Practice RSVP tab"
        description="Creates the practice events (date, time, location) and imports every player's Yes/No/TBD answers. Import the roster first so names match."
        action={importPracticeGrid}
      />
      <ImportForm
        title="3 · Tournament Availability tab"
        description="Imports family availability for potential tournament weekends into the Availability page. Import the roster first so names match."
        action={importTournamentGrid}
      />
      <ImportForm
        title="4 · Pitching cues (optional)"
        description={'CSV rows of "Player,Tendency,Cue" (no header needed). Loads the tendency→cue pairs coaches keep — coach-only until shared from a player’s page.'}
        action={importCues}
      />
    </div>
  );
}

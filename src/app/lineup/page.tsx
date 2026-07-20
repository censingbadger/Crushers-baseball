import { redirect } from "next/navigation";

// The Lineup lab merged into Game day: the dugout's ⚡ Auto-arrange button
// runs the same solver over the players actually in the game.
export default function LineupPage() {
  redirect("/games");
}

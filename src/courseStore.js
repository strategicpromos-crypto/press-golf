// ── PRESS GOLF — COURSE LIBRARY STORE ────────────────────────────────────────
// Bridges the built-in COURSES (golf.js) with the shared course library saved
// in Supabase (public.courses). Saved courses are merged INTO the COURSES
// object at runtime, so every screen that reads COURSES[courseId] — picker,
// captain view, spectator view, skins — resolves library courses with no
// changes to those screens.
//
// Flow: module load → initCourses() merges (1) localStorage cache instantly,
// then (2) the Supabase library (authoritative). If the courses table doesn't
// exist yet (SQL not run), the app simply runs on built-ins, as before.
//
// Imports search OpenGolfAPI (free, keyless, ODbL — course data
// © OpenStreetMap contributors). The import-check screen (CourseSearch.jsx)
// always shows the fetched card for a human eyeball before anything saves —
// free data is usually right (Giant Oak matched its paper card exactly) but
// not always (its city field said "Mansfield").

import { COURSES, holesHaveFullHdcp } from "./golf.js";
import { sb } from "./supabase.js";

const API_BASE = "https://api.opengolfapi.org/api/v1";
const CACHE_KEY = "pg_course_library";

// Snapshot of built-in ids at load — a library course may not shadow these.
const BUILTIN_IDS = new Set(Object.keys(COURSES));

export function slugifyCourseId(name) {
  return (name || "course")
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "course";
}

function uniqueId(base) {
  if (!BUILTIN_IDS.has(base) && !COURSES[base]) return base;
  let i = 2;
  while (COURSES[`${base}-${i}`] || BUILTIN_IDS.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}

function mergeCourse(id, course) {
  if (!id || !course || !Array.isArray(course.holes)) return;
  COURSES[id] = {
    name: course.name || id,
    city: course.city || "",
    par: course.par || course.holes.reduce((a, h) => a + (h.par || 0), 0),
    holes: course.holes,
  };
}

function cacheLibrary() {
  try {
    const lib = {};
    Object.keys(COURSES).forEach(id => { if (!BUILTIN_IDS.has(id)) lib[id] = COURSES[id]; });
    localStorage.setItem(CACHE_KEY, JSON.stringify(lib));
  } catch { /* storage full/blocked — library still lives in Supabase */ }
}

// Call once at app start. onUpdate fires whenever new courses land, so the
// root can re-render and every lookup below it sees the merged library.
export async function initCourses(onUpdate) {
  // 1) Instant: local cache from previous sessions.
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const lib = JSON.parse(raw);
      Object.entries(lib).forEach(([id, c]) => mergeCourse(id, c));
      onUpdate && onUpdate();
    }
  } catch { /* ignore */ }

  // 2) Authoritative: Supabase library.
  try {
    const { data, error } = await sb.from("courses").select("*").order("name");
    if (error) throw error;
    (data || []).forEach(row => mergeCourse(row.id, row));
    cacheLibrary();
    onUpdate && onUpdate();
  } catch (e) {
    // Table missing (SQL not run yet) or offline — built-ins carry the app.
    console.warn("Course library unavailable:", e?.message || e);
  }
}

// Saved (non-built-in) courses, for the edit list in CourseSearch. Built-ins
// are code-owned and never edited from the app.
export function getLibraryCourses() {
  return Object.entries(COURSES)
    .filter(([id]) => !BUILTIN_IDS.has(id))
    .map(([id, c]) => ({ id, name: c.name || id, city: c.city || "", hdcpOk: holesHaveFullHdcp(c.holes) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function getLibraryCourse(id) {
  if (!id || BUILTIN_IDS.has(id)) return null;
  return COURSES[id] || null;
}

// True for imported library courses, false for built-ins (code-owned) and
// unknown ids. The setup list only offers the red ✕ on library courses.
export function isLibraryCourse(id) {
  return !!COURSES[id] && !BUILTIN_IDS.has(id);
}

// Rewrite a saved course's card under the SAME id (edit flow). Only the card
// fields are sent, so source/api_id/created_by already on the row are kept.
export async function updateCourse(id, course) {
  if (!id || !course || !Array.isArray(course.holes)) throw new Error("bad course");
  mergeCourse(id, course);
  cacheLibrary();
  const { error } = await sb.from("courses").upsert({
    id,
    name: course.name,
    city: course.city || "",
    par: course.par,
    holes: course.holes,
  }, { onConflict: "id" });
  if (error) throw error;
  return id;
}

// Tournaments that reference a saved course (team_tournaments rows carry
// course_id). Deleting a course in use would strand those tournaments'
// scorecards, so callers block the delete and name the tournaments instead.
export async function courseUsage(id) {
  const { data, error } = await sb.from("team_tournaments").select("id,name,status").eq("course_id", id);
  if (error) throw error;
  return data || [];
}

// Delete a saved library course: server row + local merge + local cache.
// Built-ins can't be deleted (they're code, not library rows) — callers only
// offer delete for getLibraryCourses() entries. Requires a signed-in
// director: the courses table grants DELETE to authenticated only.
export async function deleteCourse(id) {
  const { error } = await sb.from("courses").delete().eq("id", id);
  if (error) throw error;
  delete COURSES[id];
  cacheLibrary();
}

// ── OpenGolfAPI ──────────────────────────────────────────────────────────────

export async function searchCourseAPI(query) {
  const q = (query || "").trim();
  if (q.length < 3) return { results: [], error: null };
  try {
    const res = await fetch(`${API_BASE}/courses/search?q=${encodeURIComponent(q)}`);
    if (!res.ok) throw new Error(`Search failed (${res.status})`);
    const json = await res.json();
    const results = (json.courses || []).map(c => ({
      apiId: c.id,
      name: c.course_name || c.name,
      city: c.city || "",
      state: c.state || "",
      par: c.par || null,
    }));
    return { results, error: null };
  } catch (e) {
    return { results: [], error: e.message || "Search failed" };
  }
}

// Fetch a full scorecard and convert it to the app's course shape.
// Holes 1–9 = "front", 10–18 = "back" (app convention). The result is a
// DRAFT for the import-check screen — nothing saves until the user confirms.
export async function fetchCourseFromAPI(apiId) {
  const res = await fetch(`${API_BASE}/courses/${apiId}`);
  if (!res.ok) throw new Error(`Course fetch failed (${res.status})`);
  const c = await res.json();
  const holes = (c.holes_data || [])
    .slice()
    .sort((a, b) => a.number - b.number)
    .map(h => ({
      hole: h.number,
      par: h.par,
      hdcp: h.handicap_index,
      side: h.number <= 9 ? "front" : "back",
    }));
  return {
    name: c.course_name || c.club_name || "",
    city: [c.city, c.state].filter(Boolean).join(", "),
    par: c.par || holes.reduce((a, h) => a + (h.par || 0), 0),
    holes,
  };
}

// Save a confirmed course to the shared library. Returns the course id the
// app should select. Merges locally first so the picker updates instantly;
// the Supabase upsert makes it permanent and visible to everyone.
export async function saveCourse(course, apiId) {
  const id = uniqueId(slugifyCourseId(course.name));
  mergeCourse(id, course);
  cacheLibrary();
  let userId = null;
  try { userId = (await sb.auth.getUser())?.data?.user?.id || null; } catch { /* anon */ }
  const { error } = await sb.from("courses").upsert({
    id,
    name: course.name,
    city: course.city || "",
    par: course.par,
    holes: course.holes,
    source: apiId ? "api" : "manual",
    api_id: apiId || null,
    created_by: userId,
  }, { onConflict: "id" });
  if (error) throw error;
  return id;
}
